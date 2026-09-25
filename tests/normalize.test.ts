import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupValues, kindFor } from '../src/agent/normalize.ts';
import { Verifier } from '../src/agent/roles.ts';
import type { Evidence, Task } from '../src/agent/types.ts';

const labels = (claimKey: string, values: string[]) => groupValues(claimKey, values).map(g => [g.label, g.values]);

test('token counts: spelling variants agree, genuinely different sizes stay apart (pilot values)', () => {
  assert.deepEqual(labels('LFM2.5-2.6B | context length', ['128K context window', '131,072-token context length']),
    [['128K tokens', ['128K context window', '131,072-token context length']]]);
  assert.deepEqual(labels('Qwen3-4B | context length', ['131K token context window', '32k-token context length', '131K tokens']),
    [['128K tokens', ['131K token context window', '131K tokens']], ['32K tokens', ['32k-token context length']]]);
  assert.deepEqual(labels('X | context length', ['32K', '32,768 tokens', '8K']).map(g => g[0]), ['32K tokens', '8K tokens']);
  // Digits inside a model name are not quantities.
  assert.deepEqual(labels('LFM2.5-2.6B | context length', ['LFM2.5 supports 128K tokens']).map(g => g[0]), ['128K tokens']);
  // Two different quantities in one value are ambiguous, so it falls back to text comparison.
  assert.equal(groupValues('X | context length', ['32K native, 128K extended'])[0].label, '32K native, 128K extended');
});

test('parameters, licenses, and dates normalize conservatively; unknown attributes compare as text', () => {
  assert.deepEqual(labels('X | parameter count', ['2.6B', '2.6 billion parameters', '3.8B']).map(g => g[0]), ['2.6B', '3.8B']);
  assert.deepEqual(labels('X | license', ['Apache 2.0', 'Apache License 2.0', 'apache-2.0', 'MIT']).map(g => g[1].length), [3, 1]);
  assert.deepEqual(labels('X | release date', ['September 25, 2024', '2024-09-25', 'Sep 2024', 'October 2024']).map(g => g[0]),
    ['2024-09', '2024-10']);
  assert.deepEqual(labels('Acme | pricing', ['$49/month', '$49/Month', '$79/month']).map(g => g[1]),
    [['$49/month', '$49/Month'], ['$79/month']]);
  assert.equal(kindFor('Gemma-3-4B | context length'), 'tokens');
  assert.equal(kindFor('acme:pricing'), 'text');
});

test('verifier supports spelling-only differences across hosts and keeps real disagreements unresolved', () => {
  const task: Task = { id: '0:verifier', role: 'verifier', claimKey: 'LFM2.5-2.6B | context length', status: 'pending' };
  const item = (id: string, value: string, sourceUrl: string): Evidence =>
    ({ id, claimKey: task.claimKey, value, sourceUrl, observedAt: '2026-09-25T00:00:00Z' });
  const agreed = new Verifier().run(task, [item('a', '128K context window', 'https://docs.liquid.ai/x'),
    item('b', '131,072-token context length', 'https://www.aimodels.fyi/y')]);
  assert.equal(agreed.status, 'supported');
  assert.equal(agreed.value, '128K context window');
  assert.match(agreed.reason, /Equivalent spellings normalized as 128K tokens/);
  const split = new Verifier().run({ ...task, claimKey: 'Qwen3-4B | context length' }, [
    { ...item('a', '131K tokens', 'https://apxml.com/q'), claimKey: 'Qwen3-4B | context length' },
    { ...item('b', '32k-token context length', 'https://dev.co/q'), claimKey: 'Qwen3-4B | context length' }]);
  assert.equal(split.status, 'unresolved');
  assert.match(split.reason, /128K tokens vs 32K tokens/);
  assert.equal(split.groups?.length, 2);
});

test('type gate drops grounded but off-type values seen in the page-fetch check', async () => {
  const { admissible } = await import('../src/agent/normalize.ts');
  const ctx = 'Gemma-3-4B | context length';
  assert.equal(admissible(ctx, '128K tokens', 'Total input context of 128K tokens for the 4B, 12B, and 27B sizes'), true);
  assert.equal(admissible(ctx, '131,072 tokens', 'Context window: 131,072 tokens'), true);
  assert.equal(admissible(ctx, '8192 tokens', 'Total output context of 8192 tokens'), false);
  assert.equal(admissible(ctx, '14 trillion tokens', 'trained with 14 trillion tokens'), false);
  assert.equal(admissible(ctx, 'multilingual support in over 140 languages', 'multilingual support in over 140 languages'), false);
  assert.equal(admissible('Phi-4-mini | context length', 'Phi 4 vs Phi 4 Mini: Benchmarks, Pricing & Which Is Better in 2026',
    'Phi 4 vs Phi 4 Mini: Benchmarks, Pricing & Which Is Better in 2026'), false);
  assert.equal(admissible('X | parameter count', '3.8 billion parameters', 'a 3.8 billion parameters model'), true);
  assert.equal(admissible('X | parameter count', '14 trillion tokens', 'trained on 14 trillion tokens'), false);
  assert.equal(admissible('X | license', 'MIT License', 'released under the MIT License'), true);
  assert.equal(admissible('X | license', 'Benchmarks', 'Benchmarks'), false);
  assert.equal(admissible('Acme | pricing', '$49/month', 'costs $49/month'), true);
  const line = 'Total input context of 128K tokens for the 4B, 12B, and 27B sizes, and 32K tokens for the 1B size';
  assert.equal(admissible(ctx, '32K tokens for the 1B size', line), false);
  assert.equal(admissible(ctx, '128K tokens for the 4B', line), true);
  assert.equal(admissible('LFM2.5-2.6B | parameter count', '2.6B', 'a 2.6B dense model'), true);
  // Seen on the Qwen3-4B model card during the follow-up trial.
  const qwen = 'Qwen3-4B | context length';
  assert.equal(admissible(qwen, 'Context Length: 32,768 natively and 131,072 tokens with YaRN.',
    'Context Length: 32,768 natively and 131,072 tokens with YaRN.'), true);
  assert.equal(admissible(qwen, 'set to 40,960', 'The default `max_position_embeddings` in `config.json` is set to 40,960.'), false);
  assert.equal(admissible(qwen, 'output length of 32,768 tokens', 'We recommend using an output length of 32,768 tokens for most queries.'), false);
});

test('v1 run findings: identifiers are not counts, license families match, version-coded variants are excluded', async () => {
  const { admissible, admittedGroups } = await import('../src/agent/normalize.ts');
  assert.equal(admissible('Gemma-3-4B | parameter count', 'google/gemma-3-4b-it', 'google/gemma-3-4b-it · Hugging Face'), false);
  assert.equal(admissible('Qwen3-4B | parameter count', 'Qwen/Qwen3-4B', 'Qwen/Qwen3-4B · Hugging Face'), false);
  assert.equal(admissible('Qwen3-4B | parameter count', 'Qwen3-4B has 4.0B parameters', 'Qwen3-4B has 4.0B parameters'), true);
  assert.equal(admissible('LFM2.5-2.6B | parameter count', '2.6B dense model', '2.6B dense model trained for agentic workloads'), true);
  assert.equal(admissible('Phi-4-mini | parameter count', '3.8B parameters', 'a 3.8B parameters model'), true);
  assert.deepEqual(admittedGroups('Qwen3-4B | license', [{ value: 'apache-2.0' }, { value: 'Apache License' }, { value: 'apache 2.0 license' }])
    .map(g => g.values.length), [3]);
  assert.equal(admittedGroups('X | license', [{ value: 'Apache License' }, { value: 'MIT' }]).length, 2);
  assert.equal(admissible('Qwen3-4B | release date', '6 Aug 2025', 'Alibaba released Qwen3 4B 2507 Instruct on 6 Aug 2025.'), false);
  assert.equal(admissible('Qwen3-4B | release date', '28 Apr 2025', 'Alibaba released Qwen3 4B on 28 Apr 2025.'), true);
  assert.equal(admissible('Qwen3-4B | release date', '2025', 'Qwen3-4B 2025 release notes'), true, 'a year right after the name is not a version code');
});

test('verifier re-checks stored evidence and a stale follow-up skips its search', async () => {
  const { Verifier } = await import('../src/agent/roles.ts');
  const { Orchestrator } = await import('../src/agent/orchestrator.ts');
  const claimKey = 'Qwen3-4B | license';
  const ev = (id: string, value: string, url: string) => ({ id, claimKey, value, quote: value, sourceUrl: url, observedAt: 'x' });
  const evidence = [ev('a', 'apache-2.0', 'https://huggingface.co/q'), ev('b', 'Apache License', 'https://huggingface.co/q/l'),
    ev('c', 'apache 2.0 license', 'https://aitoolsatlas.ai/q')];
  const decision = new Verifier().run({ id: 'v', role: 'verifier', claimKey, status: 'pending' }, evidence);
  assert.equal(decision.status, 'supported');
  let stored = { runId: 'r', goal: 'g', evidence, decisions: [{ claimKey, status: 'unresolved' as const, evidenceIds: ['a', 'b'], reason: 'old' }],
    tasks: [{ id: '0:followup-researcher', role: 'researcher' as const, claimKey, status: 'pending' as const, followUp: true, focus: 'apache-2.0 Apache License license terms' },
      { id: '0:followup-verifier', role: 'verifier' as const, claimKey, status: 'pending' as const, followUp: true }] };
  let searches = 0;
  const runner = new Orchestrator({ async load() { return structuredClone(stored); }, async save(s) { stored = structuredClone(s); } },
    { async search() { searches++; return []; } }, undefined, { maxFollowUps: 3 });
  await runner.step();
  const final = await runner.step();
  assert.equal(searches, 0);
  assert.equal(final.decisions.at(-1)!.status, 'supported');
});
