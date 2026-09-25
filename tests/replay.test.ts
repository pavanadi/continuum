import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { RawTreeMemory } from '../src/memory/rawtree.ts';
import { RawTreeFlight, type FlightEvent } from '../src/memory/flight.ts';
import { fixtureResearch } from '../src/tools/fixture.ts';
import { buildReplay, loadReplay, renderReplay } from '../src/replay/replay.ts';
import type { RawTreeTransport } from '../src/tools/rawtree.ts';
import type { State } from '../src/agent/types.ts';
import { runPreflight } from '../src/usage/preflight.ts';

/** One fixture database holding both the checkpoint and flight tables. */
function fixtureDatabase() {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rows = (table: string) => tables.get(table) ?? tables.set(table, []).get(table)!;
  const transport: RawTreeTransport = {
    async hasTable(table) { return rows(table).length > 0; },
    async insert(table, row) { rows(table).push(structuredClone(row)); },
    async query(sql) {
      if (/[^(]type IN/.test(sql)) throw new Error('RawTree rejects IN on a Dynamic column without a cast');
      const table = sql.match(/FROM (\w+)/)![1];
      const limit = Number(sql.match(/LIMIT (\d+)$/)?.[1]);
      const eventId = sql.match(/WHERE event_id = '([^']+)'/)?.[1];
      const runId = sql.match(/WHERE run_id = '([^']+)'/)?.[1];
      const taskId = sql.match(/AND task_id = '([^']+)'/)?.[1];
      const before = sql.match(/AND event_id < '([^']+)'/)?.[1];
      if (table === 'continuum_checkpoints_v1') {
        return structuredClone(rows(table).filter(row => row.run_id === runId)
          .sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, limit));
      }
      return structuredClone(rows(table).filter(row => eventId ? row.event_id === eventId :
        row.run_id === runId && (!before || String(row.event_id) < before) &&
        (!taskId || row.task_id === taskId &&
          ['TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED'].includes(String(row.type))))
        .sort((a, b) => String(b.event_id).localeCompare(String(a.event_id))).slice(0, limit));
    },
  };
  return { transport, rows };
}

const session = (db: ReturnType<typeof fixtureDatabase>, runId: string) => ({
  memory: new RawTreeMemory(db.transport, runId), flight: new RawTreeFlight(db.transport, runId),
});

test('replay joins a failure, retry, restart, and contradiction into one evidence-linked view', async () => {
  const db = fixtureDatabase();
  const failing = { async search(): Promise<never> { throw new Error('fixture outage'); } };
  const first = session(db, 'replay-run');
  const runner = new Orchestrator(first.memory, failing, first.flight);
  await runner.start('replay-run', 'Investigate fictional Acme pricing', ['acme:pricing']);
  await assert.rejects(runner.step(), /fixture outage/);
  for (let i = 0; i < 3; i++) {
    const next = session(db, 'replay-run');
    const resumed = new Orchestrator(next.memory, fixtureResearch, next.flight);
    await resumed.start('replay-run', 'Investigate fictional Acme pricing', ['acme:pricing']);
    await resumed.step();
  }

  const replay = await loadReplay('replay-run', session(db, 'replay-run'));
  assert.equal(replay.latestRevision, 4);
  assert.equal(replay.sessions.length, 4);
  assert.deepEqual(replay.pending, []);
  assert.deepEqual(replay.findings.map(f => f.kind), ['failed_attempt', 'retry_decided']);
  assert.equal(replay.tasks[0].attempts, 2);
  assert.equal(replay.tasks[0].completedAtRevision, 2);
  const [decision] = replay.decisions;
  assert.equal(decision.status, 'unresolved');
  assert.equal(decision.revision, 4);
  assert.deepEqual(decision.valuesInDisagreement, ['$49/month', '$79/month']);
  assert.deepEqual(decision.evidence.map(e => e.sourceUrl),
    ['https://fixture.example/support', 'https://fixture.example/challenge']);
  assert.ok(replay.revisions[3].changes.includes('contradiction on acme:pricing'));
  assert.equal(replay.truncated.flight, false);

  // A checkpoint commit is placed between the task start and its terminal event.
  const labels = replay.timeline.map(e => e.label);
  const r2 = labels.findIndex(l => l.startsWith('revision 2'));
  assert.ok(labels.lastIndexOf('task started', r2) < r2 && labels.indexOf('task completed', r2) > r2);
  const text = renderReplay(replay);
  assert.match(text, /restart boundary/);
  assert.match(text, /disagreeing values: \$49\/month vs \$79\/month/);
  assert.match(text, /retry_decided 0:researcher/);
});

test('replay flags an unmatched start and its deferred retry while the task stays pending', async () => {
  const db = fixtureDatabase();
  const first = session(db, 'ambiguous-run');
  const runner = new Orchestrator(first.memory, fixtureResearch, first.flight);
  await runner.start('ambiguous-run', 'Pricing', ['price']);
  await first.flight.record('TASK_STARTED', '0:researcher', { role: 'researcher' });
  const second = session(db, 'ambiguous-run');
  await assert.rejects(new Orchestrator(second.memory, fixtureResearch, second.flight).step(), /unconfirmed/);

  const replay = await loadReplay('ambiguous-run', session(db, 'ambiguous-run'));
  // RETRY_DEFERRED does not close the attempt, so the unclosed start remains a finding until reconciled.
  assert.deepEqual(replay.findings.map(f => f.kind), ['retry_deferred', 'unmatched_start']);
  assert.equal(replay.tasks[0].lastFlightType, 'TASK_STARTED');
  assert.equal(replay.pending.length, 3);
});

test('replay distinguishes crash gaps, unjournaled tasks, and preflight denials without inventing events', async () => {
  const db = fixtureDatabase();
  const flight = new RawTreeFlight(db.transport, 'gap-run');
  await flight.record('TASK_STARTED', '0:researcher', { role: 'researcher' });
  await assert.rejects(runPreflight(flight, '0:skeptic', 'liquid/model:free', async () => {
    throw new Error('Local daily OpenRouter request cap reached');
  }));
  const state: State = { runId: 'gap-run', goal: 'Pricing', evidence: [], decisions: [], tasks: [
    { id: '0:researcher', role: 'researcher', claimKey: 'price', status: 'completed' },
    { id: '0:skeptic', role: 'skeptic', claimKey: 'price', status: 'pending' },
    { id: '1:researcher', role: 'researcher', claimKey: 'other', status: 'completed' },
  ] };
  const events: FlightEvent[] = await flight.history();
  const replay = buildReplay('gap-run', state, [
    { revision: 2, checkpoint_id: 'c2', recorded_at: '2026-09-25T00:00:00.000Z',
      events: [{ type: 'TASK_COMPLETED', payload: state.tasks[0] }] },
  ], events);
  assert.deepEqual(replay.findings.map(f => [f.kind, f.taskId]), [
    ['preflight_denied', '0:skeptic'],
    ['completed_without_terminal_event', '0:researcher'],
    ['unjournaled_task', '1:researcher'],
  ]);
  assert.equal(replay.findings[1].revision, 2);
  assert.match(replay.findings[0].detail, /local_cap/);
  assert.equal(replay.timeline.filter(e => e.source === 'flight').length, events.length);
});
