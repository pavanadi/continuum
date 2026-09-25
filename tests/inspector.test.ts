import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { RawTreeMemory } from '../src/memory/rawtree.ts';
import { RawTreeFlight } from '../src/memory/flight.ts';
import { fixtureResearch } from '../src/tools/fixture.ts';
import { inspectorServer, runBundle } from '../src/inspector/server.ts';
import type { RawTreeTransport } from '../src/tools/rawtree.ts';

/** Fixture RawTree holding both tables, plus the run-listing aggregate the inspector uses. */
function fixtureDatabase() {
  const tables = new Map<string, Record<string, unknown>[]>();
  const rows = (t: string) => tables.get(t) ?? tables.set(t, []).get(t)!;
  const transport: RawTreeTransport = {
    async hasTable(t) { return rows(t).length > 0; },
    async insert(t, row) { rows(t).push(structuredClone(row)); },
    async query(sql) {
      if (/GROUP BY run_id/.test(sql)) {
        const runs = new Map<string, Record<string, unknown>>();
        for (const r of rows('continuum_checkpoints_v1')) {
          const prev = runs.get(String(r.run_id));
          if (!prev || Number(r.revision) > Number(prev.revision)) runs.set(String(r.run_id), { run_id: r.run_id, revision: r.revision, updated: r.recorded_at });
        }
        return [...runs.values()];
      }
      const table = sql.match(/FROM (\w+)/)![1];
      const limit = Number(sql.match(/LIMIT (\d+)$/)?.[1]);
      const eventId = sql.match(/WHERE event_id = '([^']+)'/)?.[1];
      const runId = sql.match(/WHERE run_id = '([^']+)'/)?.[1];
      const taskId = sql.match(/AND task_id = '([^']+)'/)?.[1];
      if (table === 'continuum_checkpoints_v1') {
        return structuredClone(rows(table).filter(r => r.run_id === runId).sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, limit));
      }
      return structuredClone(rows(table).filter(r => eventId ? r.event_id === eventId : r.run_id === runId &&
        (!taskId || r.task_id === taskId && ['TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED'].includes(String(r.type))))
        .sort((a, b) => String(b.event_id).localeCompare(String(a.event_id))).slice(0, limit));
    },
  };
  return transport;
}

async function seededRun(transport: RawTreeTransport) {
  const runner = new Orchestrator(new RawTreeMemory(transport, 'ui-run'), fixtureResearch,
    new RawTreeFlight(transport, 'ui-run'), { maxFollowUps: 1 });
  await runner.start('ui-run', 'Investigate fictional Acme pricing', ['Acme | pricing']);
  for (let i = 0; i < 5; i++) await runner.step();
}

test('bundle groups claims into an entity × attribute view with append-only decision history', async () => {
  const transport = fixtureDatabase();
  await seededRun(transport);
  const bundle = await runBundle(transport, 'ui-run');
  assert.equal(bundle.schema, 'continuum-inspector-v1');
  assert.deepEqual([bundle.entities, bundle.attributes], [['Acme'], ['pricing']]);
  const [claim] = bundle.claims;
  assert.equal(claim.status, 'qualified');
  assert.deepEqual(claim.decisions.map(d => d.status), ['unresolved', 'qualified']);
  assert.deepEqual(claim.hosts, ['fixture.example', 'fixture-faq.example']);
  assert.equal(claim.tasks.length, 5);
  assert.equal(bundle.totals.qualified, 1);
  assert.ok(bundle.timeline.some(e => /follow-up planned/.test(e.label)));
  await assert.rejects(runBundle(transport, "bad'id"), /Invalid run ID/);
});

test('server serves the page, lists runs, returns bundles, and rejects bad input without leaking internals', async () => {
  const transport = fixtureDatabase();
  await seededRun(transport);
  const server = inspectorServer(transport, async () => '<!doctype html><title>Continuum Inspector</title>');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const page = await fetch(base + '/');
    assert.match(page.headers.get('content-type')!, /text\/html/);
    assert.match(await page.text(), /Continuum Inspector/);
    assert.deepEqual((await (await fetch(base + '/api/runs')).json()).map((r: { runId: string }) => r.runId), ['ui-run']);
    const bundle = await (await fetch(base + '/api/runs/ui-run')).json();
    assert.equal(bundle.claims[0].status, 'qualified');
    assert.equal((await fetch(base + '/api/runs/bad%27id')).status, 500);
    assert.equal((await fetch(base + '/api/ask', { method: 'POST', body: '{"runId":1}' })).status, 400);
    assert.equal((await fetch(base + '/nope')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
