import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NimblePages, NimbleSearch, CachedPages, type PageFetcher } from '../src/tools/nimble.ts';
import { focusPage } from '../src/tools/focus.ts';
import { LiquidExtractor, LiquidResearchProvider, DEFAULT_LIQUID_MODEL } from '../src/tools/liquid.ts';
import type { FlightSink, FlightType } from '../src/memory/flight.ts';
import type { SourceProvider } from '../src/agent/types.ts';

const CARD = `# google/gemma-3-4b-it
![banner](https://huggingface.co/banner.png)
Model page: [Gemma](https://ai.google.dev/gemma)

## Model Information
Summary description and brief definition of inputs and outputs.

### Inputs and outputs
- Input: Text string, such as a question
- Total input context of 128K tokens for the 4B, 12B, and 27B sizes, and 32K tokens for the 1B size

## Usage
pip install -U transformers
${'Unrelated installation notes.\n'.repeat(400)}
## Citation
@article{gemma_2025}`;

test('focusing keeps the attribute passage with neighbours, drops link targets, and stays within budget', () => {
  const text = focusPage(CARD, 'Gemma-3-4B | context length', 2_000);
  assert.match(text, /Total input context of 128K tokens for the 4B/);
  assert.match(text, /Input: Text string/);
  assert.doesNotMatch(text, /https:\/\/|Unrelated installation/);
  assert.ok(text.length <= 2_000);
  // No attribute match: the page head is used, still bounded.
  assert.ok(focusPage('plain words\n'.repeat(5_000), 'X | license', 500).length <= 500);
});

test('page extract posts one static markdown request, records list price, and hides failure bodies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-pages-'));
  try {
    const ledgerPath = join(dir, 'usage.jsonl');
    let body: Record<string, unknown> | undefined;
    const pages = new NimblePages({ apiKey: 'key', ledgerPath, dailyRequestCap: 3, fetch: async (url, init) => {
      assert.equal(String(url), 'https://sdk.nimbleway.com/v2/extract');
      body = JSON.parse(String(init?.body));
      return Response.json({ task_id: 'extract-1', status: 'success', data: { markdown: CARD } });
    } });
    const page = await pages.fetch('https://huggingface.co/google/gemma-3-4b-it');
    assert.deepEqual(body, { url: 'https://huggingface.co/google/gemma-3-4b-it', render: false, formats: ['markdown'] });
    assert.equal(page.requestId, 'extract-1');
    const failing = new NimblePages({ apiKey: 'key', ledgerPath, dailyRequestCap: 3,
      fetch: async () => new Response('private upstream details', { status: 500 }) });
    await assert.rejects(failing.fetch('https://example.com/x'),
      error => /HTTP 500/.test(String(error)) && !String(error).includes('private'));
    const rows = (await readFile(ledgerPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(rows.filter(r => r.type === 'outcome').map(r => r.estimatedCostUsd), [0.001, 0]);
    // Search and extract share the attempt cap: 2 used of 3, so one more request is allowed and then blocked.
    const search = new NimbleSearch({ apiKey: 'key', ledgerPath, dailyRequestCap: 3,
      fetch: async () => Response.json({ request_id: 'r', results: [] }) });
    await search.search('Acme | pricing', 'support');
    await assert.rejects(pages.fetch('https://example.com/y'), /page extract budget reached/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cached pages avoid a second paid extract within a run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-page-cache-'));
  try {
    let calls = 0;
    const inner: PageFetcher = { async fetch(url) { calls++; return { url, markdown: 'x', requestId: 'r', observedAt: '2026-09-25T00:00:00Z' }; } };
    await new CachedPages(inner, 'run-1', dir).fetch('https://example.com/a');
    await new CachedPages(inner, 'run-1', dir).fetch('https://example.com/a');
    await new CachedPages(inner, 'run-2', dir).fetch('https://example.com/a');
    assert.equal(calls, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('research escalates to the top page only when snippets yield nothing, and labels page evidence', async () => {
  const snippet = { id: 'nimble-1', url: 'https://huggingface.co/google/gemma-3-4b-it', observedAt: '2026-09-25T00:00:00Z',
    text: "google/gemma-3-4b-it · Hugging Face\nWe're on a journey to advance and democratize artificial intelligence.",
    retrieval: { provider: 'nimble' as const, requestId: 's-1', query: 'Gemma-3-4B context length official documentation',
      depth: 'lite' as const, sourceKind: 'search-result' as const } };
  const sources: SourceProvider = { async search() { return [snippet, { ...snippet, id: 'nimble-2', url: 'https://other.example/g' }]; } };
  const fetched: string[] = [];
  const pages: PageFetcher = { async fetch(url) { fetched.push(url); return { url, markdown: CARD, requestId: 'extract-1', observedAt: '2026-09-25T01:00:00Z' }; } };
  const quote = 'Total input context of 128K tokens for the 4B, 12B, and 27B sizes';
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async (_url, init) => {
    const docs = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).documents as { sourceId: string }[];
    const observations = docs[0].sourceId === 'page-1' ? [{ sourceId: 'page-1', value: '128K tokens', quote }] : [];
    return Response.json({ id: 'gen', model: DEFAULT_LIQUID_MODEL,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ observations }) } }] });
  } });
  const events: [FlightType, Record<string, unknown>][] = [];
  const flight: FlightSink = { async record(type, _task, payload = {}) { events.push([type, payload]); } };
  const evidence = await new LiquidResearchProvider(sources, extractor, flight, pages, 1)
    .search('Gemma-3-4B | context length', 'support', '1:researcher');
  assert.deepEqual(fetched, ['https://huggingface.co/google/gemma-3-4b-it']);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].retrieval?.sourceKind, 'page-extract');
  assert.equal(evidence[0].retrieval?.requestId, 'extract-1');
  assert.equal(evidence[0].sourceUrl, snippet.url);
  assert.deepEqual(events.map(e => e[0]), ['SOURCE_SEARCH_STARTED', 'SOURCE_SEARCH_COMPLETED', 'EXTRACTION_STARTED',
    'EXTRACTION_COMPLETED', 'PAGE_FETCH_STARTED', 'PAGE_FETCH_COMPLETED', 'EXTRACTION_STARTED', 'EXTRACTION_COMPLETED']);
  assert.equal(events[6][1].stage, 'pages');

  // A zero page budget never triggers a paid extract.
  fetched.length = 0;
  await new LiquidResearchProvider(sources, extractor, undefined, pages, 0).search('Gemma-3-4B | context length', 'support');
  assert.equal(fetched.length, 0);
});

test('a failed page is journaled and skipped; the next result is tried and the task never blocks on one URL', async () => {
  const doc = (id: string, url: string) => ({ id, url, observedAt: '2026-09-25T00:00:00Z', text: 'Nothing useful here.' });
  const sources: SourceProvider = { async search() { return [doc('nimble-1', 'https://www.capterra.com/p/1/Phi-4-mini/'),
    doc('nimble-2', 'https://llm-stats.com/models/phi-4-mini'), doc('nimble-3', 'https://third.example/x')]; } };
  const tried: string[] = [];
  const pages = (failAll: boolean): PageFetcher => ({ async fetch(url) {
    tried.push(url);
    if (failAll || url.includes('capterra')) throw new Error('Nimble page extract failed (HTTP 500); task remains pending');
    return { url, markdown: 'License: MIT License for Phi-4-mini.', requestId: 'x', observedAt: '2026-09-25T00:00:00Z' };
  } });
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async (_u, init) => {
    const docs = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).documents as { sourceId: string }[];
    const observations = docs[0].sourceId === 'page-1'
      ? [{ sourceId: 'page-1', value: 'MIT License', quote: 'License: MIT License for Phi-4-mini.' }] : [];
    return Response.json({ id: 'g', model: DEFAULT_LIQUID_MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ observations }) } }] });
  } });
  const events: FlightType[] = [];
  const flight: FlightSink = { async record(type) { events.push(type); } };
  const found = await new LiquidResearchProvider(sources, extractor, flight, pages(false), 1).search('Phi-4-mini | license', 'challenge', 't');
  assert.deepEqual(tried, ['https://www.capterra.com/p/1/Phi-4-mini/', 'https://llm-stats.com/models/phi-4-mini']);
  assert.deepEqual(found.map(e => e.value), ['MIT License']);
  assert.ok(events.includes('PAGE_FETCH_FAILED') && events.includes('PAGE_FETCH_COMPLETED'));
  tried.length = 0;
  assert.deepEqual(await new LiquidResearchProvider(sources, extractor, undefined, pages(true), 1).search('Phi-4-mini | license', 'challenge'), []);
  assert.equal(tried.length, 2, 'at most one extra attempt');
  const broke: PageFetcher = { async fetch() { throw new Error('Local Nimble page extract budget reached'); } };
  await assert.rejects(new LiquidResearchProvider(sources, extractor, undefined, broke, 1).search('Phi-4-mini | license', 'challenge'), /budget reached/);
});
