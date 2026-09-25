import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import type { State } from '../src/agent/types.ts';
import { Verifier } from '../src/agent/roles.ts';

test('verification requires distinct sources and filters unrelated evidence', () => {
  const task = { id: 'v', claimKey: 'pricing', role: 'verifier' as const, status: 'pending' as const };
  const first = { id: 'a', claimKey: 'pricing', value: '$49', sourceUrl: 'https://a.example', observedAt: '2026-09-25' };
  const verifier = new Verifier();
  assert.equal(verifier.run(task, []).status, 'insufficient');
  assert.equal(verifier.run(task, [first, { ...first, id: 'b' }]).status, 'insufficient');
  assert.equal(verifier.run(task, [first, { ...first, id: 'c', sourceUrl: 'https://b.example' }]).status, 'supported');
  assert.equal(verifier.run(task, [first, { ...first, id: 'same-host', sourceUrl: 'https://a.example/other' }]).status, 'insufficient');
  assert.equal(verifier.run(task, [first, { ...first, id: 'd', claimKey: 'other', value: '$99' }]).status, 'insufficient');
});

test('separate processes resume, retain conflicts, and do not repeat completed work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-'));
  try {
    const run = (steps: number) => JSON.parse(execFileSync(process.execPath,
      ['src/demo.ts', join(dir, 'state.json'), String(steps)], { encoding: 'utf8' }));
    const first = run(1);
    assert.equal(first.nextTask.role, 'skeptic');
    const second = run(2);
    assert.equal(second.nextTask, null);
    assert.equal(second.evidence.length, 2);
    assert.equal(second.decisions[0].status, 'unresolved');
    assert.equal(second.decisions[0].evidenceIds.length, 2);
    assert.deepEqual(run(3), second);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('provider failure leaves task pending and recoverable', async () => {
  let stored: State | null = null;
  const memory = { async load() { return structuredClone(stored); },
    async save(s: State) { stored = structuredClone(s); } };
  const runner = new Orchestrator(memory, { async search() { throw new Error('timeout'); } });
  await runner.start('test', 'Research', ['pricing']);
  await assert.rejects(runner.step(), /timeout/);
  const state = await memory.load();
  assert.equal(state?.tasks[0].status, 'pending');
  assert.equal(state?.evidence.length, 0);
});
