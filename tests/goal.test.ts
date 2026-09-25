import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertGoal, claimsFor, loadGoal, type GoalSpec } from '../src/goal.ts';
import { buildMatrix, renderMatrix } from '../src/report/matrix.ts';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { NimbleSearch } from '../src/tools/nimble.ts';
import type { Evidence, ResearchProvider, State } from '../src/agent/types.ts';

const spec: GoalSpec = { id: 'fixture-goal', goal: 'Compare fictional models', entities: ['ModelA', 'ModelB'],
  attributes: ['context length', 'license'] };

test('goal files expand to bounded entity | attribute claims and reject malformed specs', async () => {
  assert.deepEqual(claimsFor(spec), ['ModelA | context length', 'ModelA | license', 'ModelB | context length', 'ModelB | license']);
  assert.throws(() => assertGoal({ ...spec, entities: ['A|B'] }), /without "\|"/);
  assert.throws(() => assertGoal({ ...spec, entities: ['A', 'A'] }), /unique/);
  assert.throws(() => assertGoal({ ...spec, entities: Array.from({ length: 11 }, (_, i) => `M${i}`),
    attributes: ['a', 'b', 'c', 'd'] }), /44 claims/);
  for (const path of ['goals/small-models-v1.json', 'goals/small-models-pilot.json']) {
    const goal = await loadGoal(path);
    assert.ok(claimsFor(goal).length <= 20);
  }
});

test('shipped goal entities survive the Nimble entity filter for typical model-page URLs', async () => {
  const goal = await loadGoal('goals/small-models-v1.json');
  const urls: Record<string, string> = {
    'LFM2.5-2.6B': 'https://docs.liquid.ai/lfm/models/lfm25-2.6b',
    'Gemma-3-4B': 'https://huggingface.co/google/gemma-3-4b-it',
    'Qwen3-4B': 'https://huggingface.co/Qwen/Qwen3-4B',
    'Phi-4-mini': 'https://huggingface.co/microsoft/Phi-4-mini-instruct',
    'Llama-3.2-3B': 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct',
  };
  const dir = await mkdtemp(join(tmpdir(), 'continuum-goal-'));
  try {
    for (const entity of goal.entities) {
      const search = new NimbleSearch({ apiKey: 'test-key', ledgerPath: join(dir, `${entity}.jsonl`),
        fetch: async () => Response.json({ request_id: 'r', results: [
          { title: 'Model card', url: urls[entity], description: 'Context length: 32K tokens.' },
          { title: 'Unrelated', url: 'https://example.com/other-model', description: 'Context length: 8K tokens.' },
        ] }) });
      const docs = await search.search(`${entity} | context length`, 'support');
      assert.deepEqual(docs.map(d => d.url), [urls[entity]], entity);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('matrix shows supported, disagreeing, single-host, and pending cells from stored state only', async () => {
  // Fictional observations: A/context agrees on two hosts, A/license disagrees, B/context has one host.
  const table: Record<string, [string, string][]> = {
    'ModelA | context length:support': [['32K tokens', 'https://a.example/card']],
    'ModelA | context length:challenge': [['32K tokens', 'https://b.example/review']],
    'ModelA | license:support': [['Apache 2.0', 'https://a.example/card']],
    'ModelA | license:challenge': [['custom license', 'https://b.example/review']],
    'ModelB | context length:support': [['128K tokens', 'https://c.example/card']],
    'ModelB | context length:challenge': [],
  };
  const provider: ResearchProvider = { async search(claimKey, mode) {
    return (table[`${claimKey}:${mode}`] ?? []).map(([value, sourceUrl]): Evidence =>
      ({ id: `${claimKey}:${mode}:${sourceUrl}`, claimKey, value, sourceUrl, observedAt: '2026-09-25T00:00:00Z' }));
  } };
  let stored: State | null = null;
  const memory = { async load() { return structuredClone(stored); }, async save(s: State) { stored = structuredClone(s); } };
  const runner = new Orchestrator(memory, provider);
  await runner.start('fixture-goal', spec.goal, claimsFor(spec));
  for (let i = 0; i < 9; i++) await runner.step();

  const matrix = buildMatrix(spec, stored);
  const cells = Object.fromEntries(matrix.rows.flatMap(r => r.cells).map(c => [c.claimKey, c]));
  assert.equal(cells['ModelA | context length'].status, 'supported');
  assert.equal(cells['ModelA | context length'].value, '32K tokens');
  assert.deepEqual(cells['ModelA | license'].values, ['Apache 2.0', 'custom license']);
  assert.equal(cells['ModelB | context length'].status, 'insufficient');
  assert.equal(cells['ModelB | license'].status, 'pending');
  assert.deepEqual(matrix.totals, { supported: 1, qualified: 0, unresolved: 1, insufficient: 1, pending: 1 });
  const text = renderMatrix(matrix);
  assert.match(text, /✓ 32K tokens/);
  assert.match(text, /⚠ Apache-2\.0 vs custom lice…/);
  assert.match(text, /\? 128K tokens \(1 host\)/);
  assert.match(text, /⚠ ModelA \| license: Apache-2\.0 ← Apache 2\.0  vs  custom license ← custom license — hosts: a\.example, b\.example/);
  assert.throws(() => buildMatrix({ ...spec, entities: ['Other'] }, stored), /does not match/);
});
