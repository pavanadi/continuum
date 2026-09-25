import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RawTreeFlight } from '../src/memory/flight.ts';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { fixtureResearch } from '../src/tools/fixture.ts';
import { fixtureSources } from '../src/tools/fixture.ts';
import { LiquidExtractor, LiquidResearchProvider } from '../src/tools/liquid.ts';
import type { RawTreeTransport } from '../src/tools/rawtree.ts';
import type { State } from '../src/agent/types.ts';
import { runPreflight } from '../src/usage/preflight.ts';

function fixtureTransport() {
  const rows: Record<string, unknown>[] = [];
  let loseAck = false;
  const transport: RawTreeTransport = {
    async hasTable() { return rows.length > 0; },
    async insert(_table, row) {
      rows.push(structuredClone(row));
      if (loseAck) { loseAck = false; throw new Error('lost acknowledgment'); }
    },
    async query(sql) {
      if (/[^(]type IN/.test(sql)) throw new Error('RawTree rejects IN on a Dynamic column without a cast');
      const eventId = sql.match(/WHERE event_id = '([^']+)'/)?.[1];
      const runId = sql.match(/WHERE run_id = '([^']+)'/)?.[1];
      const taskId = sql.match(/AND task_id = '([^']+)'/)?.[1];
      const before = sql.match(/AND event_id < '([^']+)'/)?.[1];
      const limit = Number(sql.match(/LIMIT (\d+)$/)?.[1]);
      return structuredClone(rows.filter(row => eventId ? row.event_id === eventId :
        row.run_id === runId && (!before || String(row.event_id) < before) &&
        (!taskId || row.task_id === taskId &&
          ['TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED'].includes(String(row.type))))
        .sort((a, b) => String(b.event_id).localeCompare(String(a.event_id))).slice(0, limit));
    },
  };
  return { rows, transport, loseNextAck() { loseAck = true; } };
}

test('flight journal reconciles a lost acknowledgment and paginates ordered events', async () => {
  const db = fixtureTransport();
  const flight = new RawTreeFlight(db.transport, 'flight-test');
  db.loseNextAck();
  await flight.record('TASK_STARTED', '0:researcher', { claimKey: 'price' });
  await flight.record('TASK_FAILED', '0:researcher', { errorClass: 'Error' });
  assert.equal(db.rows.length, 2);
  const first = await flight.history(1);
  const second = await flight.history(1, first[0].event_id);
  assert.equal(first[0].type, 'TASK_FAILED');
  assert.equal(second[0].type, 'TASK_STARTED');
  assert.deepEqual(JSON.parse(second[0].payload_json), { claimKey: 'price' });
  assert.equal(await flight.history(1, second[0].event_id).then(rows => rows.length), 0);
});

test('failed work is logged while the product task stays pending for a new session', async () => {
  const db = fixtureTransport();
  let stored: State | null = null;
  const memory = {
    async load() { return stored ? structuredClone(stored) : null; },
    async save(state: State) { stored = structuredClone(state); },
  };
  const failing = { async search(): Promise<never> { throw new Error('fixture failure'); } };
  const firstFlight = new RawTreeFlight(db.transport, 'flight-test');
  const first = new Orchestrator(memory, failing, firstFlight);
  await first.start('flight-test', 'Investigate pricing', ['price']);
  await assert.rejects(first.step(), /fixture failure/);
  assert.equal(stored!.tasks[0].status, 'pending');
  const secondFlight = new RawTreeFlight(db.transport, 'flight-test');
  const resumed = new Orchestrator(memory, fixtureResearch, secondFlight);
  await resumed.start('flight-test', 'Investigate pricing', ['price']);
  await resumed.step();
  const events = await secondFlight.history();
  assert.deepEqual(events.map(event => event.type).reverse(), [
    'TASK_STARTED', 'TASK_FAILED', 'RUN_RESUMED', 'RETRY_DECIDED', 'TASK_STARTED', 'TASK_COMPLETED',
  ]);
  assert.notEqual(events[0].session_id, events.at(-1)!.session_id);
});

test('an unmatched task start defers retry instead of repeating a provider call', async () => {
  const db = fixtureTransport();
  const flight = new RawTreeFlight(db.transport, 'flight-test');
  let stored: State | null = null;
  let calls = 0;
  const memory = {
    async load() { return stored ? structuredClone(stored) : null; },
    async save(state: State) { stored = structuredClone(state); },
  };
  const runner = new Orchestrator(memory, { async search() { calls++; return []; } }, flight);
  await runner.start('flight-test', 'Investigate pricing', ['price']);
  await flight.record('TASK_STARTED', '0:researcher', { role: 'researcher' });
  await assert.rejects(runner.step(), /unconfirmed earlier attempt/);
  assert.equal(calls, 0);
  assert.equal(stored!.tasks[0].status, 'pending');
  assert.equal((await flight.history(1))[0].type, 'RETRY_DEFERRED');
});

test('credit denial before search is durable and classified without an upstream body', async () => {
  const db = fixtureTransport();
  const first = new RawTreeFlight(db.transport, 'flight-test');
  await assert.rejects(runPreflight(first, '0:researcher', 'liquid/model:free', async () => {
    throw new Error('Local daily OpenRouter request cap reached');
  }), /cap reached/);
  const second = new RawTreeFlight(db.transport, 'flight-test');
  const events = await second.history();
  assert.deepEqual(events.map(event => event.type).reverse(), ['PREFLIGHT_STARTED', 'PREFLIGHT_DENIED']);
  assert.equal(JSON.parse(events[0].payload_json).code, 'local_cap');
  assert.equal((await second.latestAttempt('0:researcher'))?.type, 'PREFLIGHT_DENIED');
});

test('hosted research records search and extraction stages without provider response bodies', async () => {
  const db = fixtureTransport();
  const flight = new RawTreeFlight(db.transport, 'flight-test');
  const extractor = new LiquidExtractor({ apiKey: 'fixture-key',
    fetch: async () => new Response('private provider response', { status: 429 }) });
  const provider = new LiquidResearchProvider(fixtureSources, extractor, flight);
  await assert.rejects(provider.search('Acme | pricing', 'support', '0:researcher'), /HTTP 429/);
  assert.deepEqual((await flight.history()).map(event => event.type).reverse(), [
    'SOURCE_SEARCH_STARTED', 'SOURCE_SEARCH_COMPLETED', 'EXTRACTION_STARTED', 'EXTRACTION_FAILED',
  ]);
  assert.ok(db.rows.every(row => !JSON.stringify(row).includes('private provider response')));
});
