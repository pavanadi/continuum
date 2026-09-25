import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { coversAllGroups, followUpFocus, groupValues } from '../src/agent/normalize.ts';
import { fixtureResearch } from '../src/tools/fixture.ts';
import { NimbleSearch, CachedSources } from '../src/tools/nimble.ts';
import { buildMatrix, renderMatrix } from '../src/report/matrix.ts';
import type { FlightSink, FlightType } from '../src/memory/flight.ts';
import type { Evidence, ResearchProvider, State } from '../src/agent/types.ts';

function memory() {
  let stored: State | null = null;
  return { async load() { return structuredClone(stored); }, async save(s: State) { stored = structuredClone(s); },
    get state() { return stored!; } };
}
const journal = () => {
  const events: [FlightType, string, Record<string, unknown>][] = [];
  const sink: FlightSink = { async record(type, task, payload = {}) { events.push([type, task, payload]); } };
  return { events, sink };
};

test('an unresolved verdict plans one focused follow-up round in the same checkpoint, then qualifies by condition', async () => {
  const mem = memory();
  const { events, sink } = journal();
  const runner = new Orchestrator(mem, fixtureResearch, sink, { maxFollowUps: 1 });
  await runner.start('fu-run', 'Investigate fictional Acme pricing', ['acme | pricing']);
  for (let i = 0; i < 3; i++) await runner.step();
  assert.equal(mem.state.decisions[0].status, 'unresolved');
  assert.deepEqual(mem.state.tasks.slice(3).map(t => [t.id, t.role, t.status, t.focus ?? null]), [
    ['0:followup-researcher', 'researcher', 'pending', '$49/month $79/month'],
    ['0:followup-verifier', 'verifier', 'pending', null]]);
  assert.deepEqual(events.find(e => e[0] === 'FOLLOW_UP_PLANNED')?.[2].researchTask, '0:followup-researcher');
  await runner.step();
  const final = await runner.step();
  const decision = final.decisions.at(-1)!;
  assert.equal(decision.status, 'qualified');
  assert.match(decision.reason, /fixture-faq\.example states them together: "Fictional Acme pricing FAQ: Basic costs \$49\/month billed annually or \$79\/month billed monthly\."/);
  assert.equal(final.decisions.length, 2, 'the original unresolved decision is preserved');
  // One round per claim: the follow-up verifier never plans another follow-up.
  assert.equal(final.tasks.length, 5);
  assert.equal(final.tasks.every(t => t.status === 'completed'), true);
  const spec = { id: 'fu', goal: 'g', entities: ['acme'], attributes: ['pricing'] };
  assert.match(renderMatrix(buildMatrix(spec, final)), /◐ \$49\/month \/ \$79\/month \/ \$…[\s\S]*◐ qualified 1/);
});

test('follow-ups respect the run cap and skip claims whose values differ only in spelling', async () => {
  const table: Record<string, [string, string]> = {
    'A | context length:support': ['128K context window', 'https://a.example/1'],
    'A | context length:challenge': ['131,072-token context length', 'https://b.example/1'],
    'B | context length:support': ['32K tokens', 'https://a.example/2'],
    'B | context length:challenge': ['128K tokens', 'https://b.example/2'],
    'C | context length:support': ['8K tokens', 'https://a.example/3'],
    'C | context length:challenge': ['32K tokens', 'https://b.example/3'],
  };
  let resolveCalls = 0;
  const provider: ResearchProvider = { async search(claimKey, mode) {
    if (mode === 'resolve') { resolveCalls++; return []; }
    const [value, sourceUrl] = table[`${claimKey}:${mode}`];
    return [{ id: `${claimKey}:${mode}`, claimKey, value, sourceUrl, observedAt: '2026-09-25T00:00:00Z' } satisfies Evidence];
  } };
  const mem = memory();
  const claims = ['A | context length', 'B | context length', 'C | context length'];
  const before = new Orchestrator(mem, provider);  // a run completed before follow-ups existed
  await before.start('cap-run', 'Compare', claims);
  for (let i = 0; i < 9; i++) await before.step();
  assert.equal(mem.state.tasks.length, 9);
  const { sink, events } = journal();
  const planner = new Orchestrator(mem, provider, sink, { maxFollowUps: 1 });
  const { added } = await planner.planFollowUps();
  // A is recorded unresolved but is spelling-only now; B is the first real disagreement; C exceeds the cap.
  assert.deepEqual(added.map(t => t.id), ['1:followup-researcher', '1:followup-verifier']);
  assert.equal(added[0].focus, '32K tokens 128K tokens native extended');
  assert.equal(events.filter(e => e[0] === 'FOLLOW_UP_PLANNED').length, 1);
  assert.equal((await planner.planFollowUps()).added.length, 0, 'planning is idempotent');
  await planner.step();
  const final = await planner.step();
  assert.equal(resolveCalls, 1);
  assert.equal(final.decisions.at(-1)!.status, 'unresolved', 'no new evidence leaves the disagreement open');
});

test('a quote states every disagreeing value only when it covers all groups', () => {
  const claim = 'Qwen3-4B | context length';
  const groups = groupValues(claim, ['131K tokens', '32k-token context length']);
  assert.equal(coversAllGroups(claim, 'Context Length: 32,768 natively and 131,072 tokens with YaRN.', groups), true);
  assert.equal(coversAllGroups(claim, 'Context: 131K tokens', groups), false);
  assert.equal(coversAllGroups(claim, 'anything', groups.slice(0, 1)), false);
  assert.equal(followUpFocus('X | license', groupValues('X | license', ['MIT', 'Apache 2.0'])), 'MIT Apache-2.0 license terms');
});

test('resolve searches use the focus in the query and a separate cache key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-resolve-'));
  try {
    const queries: string[] = [];
    const search = new NimbleSearch({ apiKey: 'key', ledgerPath: join(dir, 'usage.jsonl'), dailyRequestCap: 5,
      fetch: async (_url, init) => { queries.push(JSON.parse(String(init?.body)).query); return Response.json({ request_id: 'r', results: [] }); } });
    const cached = new CachedSources(search, 'run', join(dir, 'cache'));
    await cached.search('Qwen3-4B | context length', 'support');
    await cached.search('Qwen3-4B | context length', 'resolve', '32K tokens 128K tokens native extended');
    await cached.search('Qwen3-4B | context length', 'resolve', '32K tokens 128K tokens native extended');
    assert.deepEqual(queries, ['Qwen3-4B context length official documentation',
      'Qwen3-4B context length 32K tokens 128K tokens native extended']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('live Qwen3-4B case: the model-card sentence qualifies 32K vs 128K and the config default is excluded', async () => {
  const { Verifier } = await import('../src/agent/roles.ts');
  const { admissible } = await import('../src/agent/normalize.ts');
  const claimKey = 'Qwen3-4B | context length';
  const item = (id: string, value: string, sourceUrl: string, quote = value): Evidence =>
    ({ id, claimKey, value, quote, sourceUrl, observedAt: '2026-09-25T00:00:00Z' });
  const card = 'Context Length: 32,768 natively and 131,072 tokens with YaRN.';
  const config = 'The default `max_position_embeddings` in `config.json` is set to 40,960.';
  const candidates = [item('a', '131K token context window', 'https://apxml.com/models/qwen3-4b'),
    item('b', '32k-token context length', 'https://dev.co/ai/llms/qwen3-4b-base'),
    item('c', '131K tokens', 'https://benchable.ai/models/qwen/qwen3-4b-04-28'),
    item('d', config, 'https://huggingface.co/Qwen/Qwen3-4B'), item('e', card, 'https://huggingface.co/Qwen/Qwen3-4B')];
  const kept = candidates.filter(e => admissible(claimKey, e.value, e.quote!));
  assert.deepEqual(kept.map(e => e.id), ['a', 'b', 'c', 'e']);
  const decision = new Verifier().run({ id: '2:followup-verifier', role: 'verifier', claimKey, status: 'pending', followUp: true }, kept);
  assert.equal(decision.status, 'qualified');
  assert.match(decision.reason, /^Values differ by stated condition \(128K tokens vs 32K tokens\)\. huggingface\.co states them together/);
});

test('re-verification appends decisions only where current rules disagree, and never rewrites history', async () => {
  const claimKey = 'Gemma-3-4B | parameter count';
  const ok = 'LFM2.5-2.6B | parameter count';
  const ev = (id: string, c: string, value: string, url: string) => ({ id, claimKey: c, value, quote: value, sourceUrl: url, observedAt: 'x' });
  let stored: State = { runId: 'rv', goal: 'g',
    evidence: [ev('a', claimKey, 'google/gemma-3-4b-it', 'https://huggingface.co/g'), ev('b', ok, '2.6B dense model', 'https://a.example'),
      ev('c', ok, '2.6 billion parameters', 'https://b.example')],
    decisions: [{ claimKey, status: 'insufficient', evidenceIds: ['a'], reason: 'old rules' },
      { claimKey: ok, status: 'supported', value: '2.6B dense model', evidenceIds: ['b', 'c'], reason: 'agree',
        groups: [{ label: '2.6B', values: ['2.6B dense model', '2.6 billion parameters'], kind: 'parameters' }] }],
    tasks: [{ id: '0:verifier', role: 'verifier', claimKey, status: 'completed' }, { id: '1:verifier', role: 'verifier', claimKey: ok, status: 'completed' }] };
  const events: string[] = [];
  const runner = new Orchestrator({ async load() { return structuredClone(stored); }, async save(s: State) { stored = structuredClone(s); } },
    { async search() { throw new Error('no search'); } }, { async record(type) { events.push(type); } });
  const { added } = await runner.planReverify();
  assert.deepEqual(added.map(t => t.id), ['0:reverify-1']);
  await runner.step();
  assert.equal(stored.decisions.length, 3);
  assert.equal(stored.decisions[0].reason, 'old rules', 'the earlier decision is preserved');
  assert.match(stored.decisions[2].reason, /No evidence has been stored for this claim\. 1 stored observation\(s\) excluded by current type checks\./);
  assert.ok(events.includes('REVERIFY_PLANNED'));
  assert.equal((await runner.planReverify()).added.length, 0, 'idempotent once decisions match current rules');
});
