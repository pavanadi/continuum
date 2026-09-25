import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RawTreeMemory } from '../src/memory/rawtree.ts';
import { RawTreeHttp } from '../src/tools/rawtree.ts';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { fixtureResearch } from '../src/tools/fixture.ts';
import type { RawTreeTransport } from '../src/tools/rawtree.ts';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

function database() {
  const rows: Record<string, unknown>[] = [];
  let loseAcknowledgment = false;
  const transport: RawTreeTransport = {
    async hasTable() { return rows.length > 0; },
    async insert(_table, record) {
      rows.push(structuredClone(record));
      if (loseAcknowledgment) { loseAcknowledgment = false; throw new Error('Connection lost after commit'); }
    },
    async query(sql) {
      assert.match(sql, /WHERE run_id = 'test-run' ORDER BY revision DESC LIMIT \d+$/);
      return structuredClone([...rows].sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, 2));
    },
  };
  return { transport, rows, loseNextAcknowledgment() { loseAcknowledgment = true; } };
}

test('new adapter reconstructs tasks and preserves evidence and event history', async () => {
  const db = database();
  const memory = new RawTreeMemory(db.transport, 'test-run');
  const first = new Orchestrator(memory, fixtureResearch);
  await first.start('test-run', 'Pricing', ['acme:pricing']);
  await first.step();
  const resumed = new Orchestrator(new RawTreeMemory(db.transport, 'test-run'), fixtureResearch);
  await resumed.step();
  const state = await resumed.step();
  assert.equal(state.decisions[0].status, 'unresolved');
  assert.equal(state.evidence.length, 2);
  assert.equal(db.rows.length, 4);
  assert.equal(JSON.parse(String(db.rows[1].state_json)).tasks[1].status, 'pending');
  assert.ok(JSON.parse(String(db.rows[3].events_json)).some(e => e.type === 'CONTRADICTION_FOUND'));
  await resumed.step();
  assert.equal(db.rows.length, 4);
});

test('ambiguous acknowledgement is reconciled without a second insert', async () => {
  const db = database();
  db.loseNextAcknowledgment();
  const runner = new Orchestrator(new RawTreeMemory(db.transport, 'test-run'), fixtureResearch);
  await runner.start('test-run', 'Pricing', ['price']);
  assert.equal(db.rows.length, 1);
});

test('unconfirmed write stops the adapter without blind retries', async () => {
  let inserts = 0;
  const transport: RawTreeTransport = {
    async hasTable() { return false; },
    async insert() { inserts++; throw new Error('timeout'); },
    async query() { return []; },
  };
  const memory = new RawTreeMemory(transport, 'test-run');
  const runner = new Orchestrator(memory, fixtureResearch);
  await assert.rejects(runner.start('test-run', 'Pricing', ['price']), /could not be confirmed/);
  await assert.rejects(memory.load(), /outcome uncertain/);
  assert.equal(inserts, 1);
});

test('saved evidence and completed tasks cannot be silently overwritten', async () => {
  const db = database();
  const memory = new RawTreeMemory(db.transport, 'test-run');
  const runner = new Orchestrator(memory, fixtureResearch);
  await runner.start('test-run', 'Pricing', ['price']);
  const state = await runner.step();
  state.evidence[0].value = 'replacement';
  await assert.rejects(memory.save(state), /evidence cannot/);
  const original = await memory.load();
  original!.tasks[0].status = 'pending';
  await assert.rejects(memory.save(original!), /reopened/);
});

test('malformed data and competing checkpoint revisions fail closed', async () => {
  const db = database();
  const runner = new Orchestrator(new RawTreeMemory(db.transport, 'test-run'), fixtureResearch);
  await runner.start('test-run', 'Pricing', ['price']);
  db.rows.push({ ...db.rows[0], checkpoint_id: 'other-writer' });
  await assert.rejects(new RawTreeMemory(db.transport, 'test-run').load(), /multiple writers/);
  db.rows.pop();
  db.rows[0].state_json = '{}';
  await assert.rejects(new RawTreeMemory(db.transport, 'test-run').load(), /Malformed state/);
  assert.throws(() => new RawTreeMemory(db.transport, "injection'"), /Invalid/);
});

test('HTTP client uses documented endpoints and explicit database and hides error bodies', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const client = new RawTreeHttp({ apiKey: 'test-secret', database: 'demo', fetch: async (url, init) => {
    requests.push({ url: String(url), init: init! });
    if (String(url).includes('/v1/query')) return Response.json({ data: [{ result: 1 }] });
    if (init?.method === 'GET') return Response.json({ tables: [{ name: 'events' }] });
    return Response.json({ inserted: 1 });
  } });
  assert.equal(await client.hasTable('events'), true);
  await client.insert('events', { value: 1 });
  assert.deepEqual(await client.query('SELECT 1'), [{ result: 1 }]);
  assert.ok(requests.every(r => new URL(r.url).searchParams.get('database') === 'demo'));
  assert.equal(requests[1].init.body, '{"value":1}');
  assert.equal(requests[2].init.body, '{"sql":"SELECT 1"}');
  const failing = new RawTreeHttp({ apiKey: 'secret', fetch: async () => new Response('private details', { status: 403 }) });
  await assert.rejects(failing.hasTable('events'), error => /HTTP 403/.test(String(error)) && !String(error).includes('private details'));
});

test('standalone CLI resumes across processes through the HTTP adapter (fixture server)', async () => {
  const rows: Record<string, unknown>[] = [];
  const flightRows: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer fixture-key') {
      response.writeHead(401).end(); return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    response.setHeader('Content-Type', 'application/json');
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/v1/tables') {
      response.end(JSON.stringify({ tables: [
        ...(rows.length ? [{ name: 'continuum_checkpoints_v1' }] : []),
        ...(flightRows.length ? [{ name: 'continuum_flight_v1' }] : []),
      ] }));
    } else if (request.method === 'POST' && path === '/v1/tables/continuum_checkpoints_v1') {
      rows.push(JSON.parse(body)); response.end('{"inserted":1}');
    } else if (request.method === 'POST' && path === '/v1/tables/continuum_flight_v1') {
      flightRows.push(JSON.parse(body)); response.end('{"inserted":1}');
    } else if (request.method === 'POST' && path === '/v1/query') {
      const { sql } = JSON.parse(body);
      if (sql.includes('continuum_flight_v1')) {
        if (/[^(]type IN/.test(sql)) { response.writeHead(400).end('{}'); return; }
        const eventId = sql.match(/WHERE event_id = '([^']+)'/)?.[1];
        const runId = sql.match(/WHERE run_id = '([^']+)'/)?.[1];
        const taskId = sql.match(/AND task_id = '([^']+)'/)?.[1];
        const limit = Number(sql.match(/LIMIT (\d+)$/)?.[1]);
        response.end(JSON.stringify({ data: flightRows.filter(row => eventId ? row.event_id === eventId : row.run_id === runId)
          .filter(row => !taskId || row.task_id === taskId &&
            ['TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED'].includes(String(row.type)))
          .sort((a, b) => String(b.event_id).localeCompare(String(a.event_id))).slice(0, limit) }));
        return;
      }
      const runId = sql.match(/WHERE run_id = '([^']+)'/)?.[1];
      const limit = Number(sql.match(/LIMIT (\d+)$/)?.[1]);
      response.end(JSON.stringify({ data: [...rows].filter(row => row.run_id === runId)
        .sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, limit) }));
    } else { response.writeHead(404).end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const env = { ...process.env, RAWTREE_API_KEY: 'fixture-key',
      RAWTREE_BASE_URL: `http://127.0.0.1:${address.port}`, RAWTREE_DATABASE: 'fixture',
      RAWTREE_TABLE: 'continuum_checkpoints_v1' };
    const run = async (action: string) => JSON.parse((await promisify(execFile)(process.execPath,
      ['src/rawtree-demo.ts', 'http-resume-test', action], { env })).stdout);
    assert.equal((await run('step')).nextTask.role, 'skeptic');
    assert.equal((await run('step')).nextTask.role, 'verifier');
    const final = await run('step');
    assert.equal(final.state.decisions[0].status, 'unresolved');
    assert.equal(final.nextTask, null);
    assert.deepEqual(await run('inspect'), final);
    assert.equal(rows.length, 4);
    assert.ok(flightRows.some(row => row.type === 'RUN_RESUMED'));
    assert.equal(flightRows.filter(row => row.type === 'TASK_COMPLETED').length, 3);
    assert.equal((await run('flight')).events.length, flightRows.length);
    const replay = await run('replay:json');
    assert.equal(replay.latestRevision, 4);
    assert.deepEqual(replay.decisions[0].valuesInDisagreement, ['$49/month', '$79/month']);
    assert.equal(replay.sessions.length, 3);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
