import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NimbleSearch, CachedSources } from '../src/tools/nimble.ts';
import { dailyUsage } from '../src/usage/ledger.ts';

test('lite search yields bounded, attributable documents and records list-price estimate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-nimble-'));
  try {
    let payload: Record<string, unknown> | undefined;
    const search = new NimbleSearch({ apiKey: 'test-key', ledgerPath: join(dir, 'usage.jsonl'), fetch: async (url, init) => {
      assert.equal(url, 'https://sdk.nimbleway.com/v2/search');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
      payload = JSON.parse(String(init?.body));
      return Response.json({ request_id: 'nimble-request-1', results: [
        { title: 'Acme pricing', url: 'https://example.com/pricing', description: 'Basic costs $49/month.', content: '' },
        { title: 'Acme duplicate', url: 'https://example.com/pricing', description: 'Repeated' },
        { title: 'bad', url: 'javascript:alert(1)', description: 'Unsafe' },
        { title: 'Alternative', url: 'https://other.example/price', description: 'Basic costs $79/month.' },
      ] });
    } });
    const docs = await search.search('Acme | pricing', 'support');
    assert.equal(payload!.search_depth, 'lite');
    assert.equal(payload!.max_results, 3);
    assert.equal(payload!.query, 'Acme pricing official documentation');
    assert.equal(docs.length, 1);
    assert.equal(docs[0].retrieval?.requestId, 'nimble-request-1');
    assert.match(docs[0].text, /\$49\/month/);
    const usage = await dailyUsage(join(dir, 'usage.jsonl'));
    assert.equal(usage.nimbleAttempts, 1);
    assert.equal(usage.nimbleEstimatedListCostUsd, 0.0011);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cached sources survive a new instance and avoid repeat web calls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-cache-'));
  try {
    let calls = 0;
    const source = { async search() { calls++; return [{ id: 'x', url: 'https://example.com', observedAt: new Date().toISOString(), text: 'A fact' }]; } };
    const first = new CachedSources(source, 'run-1', dir);
    await first.search('claim', 'support');
    const second = new CachedSources(source, 'run-1', dir);
    await second.search('claim', 'support');
    assert.equal(calls, 1);
    await second.search('claim', 'challenge');
    assert.equal(calls, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('local cap blocks new requests and failed search still consumes an attempt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-nimble-budget-'));
  try {
    let calls = 0;
    const path = join(dir, 'usage.jsonl');
    const search = new NimbleSearch({ apiKey: 'key', ledgerPath: path, dailyRequestCap: 1,
      fetch: async () => { calls++; return new Response('private details', { status: 429 }); } });
    await assert.rejects(search.search('Acme | pricing', 'support'), error => /HTTP 429/.test(String(error)) && !String(error).includes('private'));
    await assert.rejects(search.search('Acme | pricing', 'support'), /budget reached/);
    assert.equal(calls, 1);
    const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows[0].accountBalanceUsd, null);
    assert.equal(rows[1].estimatedCostUsd, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a model-specific claim excludes search hits for another model variant', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-entity-'));
  try {
    const search = new NimbleSearch({ apiKey: 'key', ledgerPath: join(dir, 'usage.jsonl'), fetch: async () =>
      Response.json({ request_id: 'one-search', results: [
        { title: 'LFM2.5-2.6B', url: 'https://docs.liquid.ai/lfm/models/lfm25-2.6b', description: '128K context' },
        { title: 'LFM2.5-8B-A1B', url: 'https://docs.liquid.ai/lfm/models/lfm25-8b-a1b', description: '128K context' },
        { title: 'LFM2.5 Encoder', url: 'https://www.liquid.ai/blog/lfm2-5-encoders', description: '8K context' },
      ] }) });
    const sources = await search.search('LFM2.5-2.6B | context length', 'support');
    assert.deepEqual(sources.map(source => source.url), ['https://docs.liquid.ai/lfm/models/lfm25-2.6b']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
