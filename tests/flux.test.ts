import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FluxClient, fluxSpend } from '../src/tools/flux.ts';
import { coverRequest, videoRequest } from '../src/brief/prompts.ts';
import { renderBrief } from '../src/brief/brief.ts';
import type { Bundle } from '../src/inspector/bundle.ts';

const bundle = (quote = 'Context: 131K tokens'): Bundle => ({
  schema: 'continuum-inspector-v1', runId: 'brief-run', goal: 'Choose a small model', generatedAt: '2026-09-25T00:00:00Z', latestRevision: 9,
  totals: { supported: 1, qualified: 0, unresolved: 1, insufficient: 0, pending: 0 }, entities: ['Qwen3-4B', 'Gemma-3-4B'], attributes: ['context length'],
  claims: [
    { claimKey: 'Qwen3-4B | context length', entity: 'Qwen3-4B', attribute: 'context length', status: 'unresolved', value: null,
      groups: [{ label: '128K tokens', values: ['131K tokens'] }, { label: '32K tokens', values: ['32k'] }], hosts: ['benchable.ai'],
      decisions: [{ claimKey: 'Qwen3-4B | context length', status: 'unresolved', evidenceIds: ['e1'], reason: 'Stored observations disagree.', revision: 9 }],
      evidence: [{ id: 'e1', claimKey: 'Qwen3-4B | context length', value: '131K tokens', quote, sourceUrl: 'https://benchable.ai/q', observedAt: 'x', host: 'benchable.ai', via: 'search snippet' }],
      voting: ['e1'], tasks: [] },
    { claimKey: 'Gemma-3-4B | context length', entity: 'Gemma-3-4B', attribute: 'context length', status: 'supported', value: '128K context window',
      groups: [], hosts: ['huggingface.co', 'llm-stats.com'], decisions: [], evidence: [], voting: [], tasks: [] },
  ],
  sessions: [{ index: 1, sessionId: 's', firstEventAt: 'x', eventCount: 1 }], pending: [], findings: [], revisions: [], timeline: [],
  truncated: { checkpoints: false, flight: false },
});

function fakeBfl(statuses: string[], opts: { reportCost?: number } = {}) {
  const calls: { url: string; key: string | null; body?: unknown }[] = [];
  let polls = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, key: new Headers(init?.headers).get('x-key'), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === 'https://api.bfl.ai/v1/flux-2-pro' || url === 'https://api.bfl.ai/v1/flux-3-video') {
      return Response.json({ id: 'req-1', polling_url: 'https://api.us1.bfl.ai/v1/get_result?id=req-1', cost: opts.reportCost ?? null });
    }
    if (url.startsWith('https://api.us1.bfl.ai/v1/get_result')) {
      const status = statuses[Math.min(polls++, statuses.length - 1)];
      return Response.json({ id: 'req-1', status, result: status === 'Ready' ? { sample: 'https://delivery.example-cdn.net/out.jpg' } : null });
    }
    if (url === 'https://delivery.example-cdn.net/out.jpg') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('nope', { status: 404 });
  };
  return { calls, fetchFn };
}

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-flux-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('generation submits, polls the returned URL, downloads without the key, records cost, and caches', () => withDir(async dir => {
  const { calls, fetchFn } = fakeBfl(['Pending', 'Generating', 'Ready'], { reportCost: 3 });
  const events: string[] = [];
  const client = () => new FluxClient({ apiKey: 'secret', budgets: { image: 0.25, video: 0 }, fetch: fetchFn,
    ledgerPath: join(dir, 'usage.jsonl'), mediaDir: join(dir, 'media'), pollIntervalMs: { image: 1, video: 1 },
    flight: { async record(type) { events.push(type); } } });
  const request = coverRequest(bundle());
  const generation = await client().generate(request);
  assert.equal(generation.requestId, 'req-1');
  assert.equal(generation.reportedCostUsd, 0.03);
  assert.equal(generation.files[0].bytes, 3);
  assert.equal(calls.find(c => c.url.includes('delivery'))!.key, null, 'the API key never goes to the download host');
  assert.ok(calls.filter(c => c.url.includes('bfl.ai')).every(c => c.key === 'secret'));
  assert.deepEqual(events, ['GENERATION_STARTED', 'GENERATION_COMPLETED']);
  assert.equal((await fluxSpend(join(dir, 'usage.jsonl'), 'image')).committedUsd, 0.03);
  const before = calls.length;
  assert.equal((await client().generate(request)).cached, true);
  assert.equal(calls.length, before, 'a cached generation makes no request');
}));

test('budget, moderation, and timeouts fail closed without resubmitting', () => withDir(async dir => {
  const ledgerPath = join(dir, 'usage.jsonl');
  const make = (statuses: string[], budgets = { image: 0.25, video: 0 }, timeout = 1_000) => {
    const bfl = fakeBfl(statuses);
    return { bfl, client: new FluxClient({ apiKey: 'k', budgets, fetch: bfl.fetchFn, ledgerPath, mediaDir: join(dir, 'm'),
      pollIntervalMs: { image: 1, video: 1 }, timeoutMs: { image: timeout, video: timeout } }) };
  };
  await assert.rejects(make(['Ready']).client.generate(videoRequest()), /video budget reached/);
  const moderated = make(['Pending', 'Content Moderated']);
  await assert.rejects(moderated.client.generate(coverRequest(bundle(), 1)), /status "Content Moderated"/);
  const slow = make(['Pending'], undefined, 20);
  await assert.rejects(slow.client.generate(coverRequest(bundle(), 2)), /did not finish/);
  assert.equal(slow.bfl.calls.filter(c => c.url.endsWith('flux-2-pro')).length, 1, 'no automatic resubmission');
  // Unknown outcomes count at their estimate: two failed $0.05 attempts leave $0.15 of $0.25.
  assert.equal((await fluxSpend(ledgerPath, 'image')).committedUsd.toFixed(2), '0.10');
}));

test('prompts carry no run facts, and the brief escapes web text and labels the illustration', () => {
  const cover = coverRequest(bundle());
  const prompt = String(cover.body.prompt);
  assert.doesNotMatch(prompt, /Qwen|Gemma|128K|32K|unresolved|\d/);
  assert.match(prompt, /No text|no text/i);
  assert.equal(String(videoRequest().body.prompt).match(/\d/), null);
  assert.equal(videoRequest().body.draft, true);
  const html = renderBrief(bundle('<script>alert(1)</script> Context: 131K'), {
    cover: { dataUri: 'data:image/jpeg;base64,AAA', generation: { kind: 'image', model: 'flux-2-pro', requestId: 'req-1', promptSha256: 'p',
      seed: 4625, reportedCostUsd: 0.03, estimateUsd: 0.05, files: [{ path: 'x', sha256: 'abcdef0123456789ff', bytes: 3, contentType: 'image/jpeg' }], createdAt: 'x' } } });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /AI-generated illustration \(FLUX\)\. All data below is rendered from stored evidence/);
  assert.match(html, /⚠<\/span> 128K tokens vs 32K tokens/);
  assert.match(html, /completed in one process session/);
  assert.match(html, /flux-2-pro · request req-1 · seed 4625 · reported cost \$0\.030/);
});

test('model cards and the HD clip carry no names or numbers; the draft clip cache key is unchanged', async () => {
  const { cardRequests, pitchVideoRequest } = await import('../src/brief/prompts.ts');
  const b = bundle();
  const cards = cardRequests(b);
  assert.deepEqual(cards.map(c => c.entity), ['Qwen3-4B', 'Gemma-3-4B']);
  for (const { request } of cards) {
    assert.equal(request.model, 'flux-2-klein-9b');
    assert.doesNotMatch(String(request.body.prompt), /Qwen|Gemma|\d/);
  }
  assert.notEqual(cards[0].request.body.prompt, cards[1].request.body.prompt, 'each card gets its own motif');
  const hd = pitchVideoRequest();
  assert.equal(hd.body.draft, false);
  assert.equal(hd.body.duration, 12);
  assert.equal(String(hd.body.prompt).match(/\d/), null);
  const client = new FluxClient({ apiKey: 'k', budgets: { image: 0, video: 0 } });
  // The 6 s draft generated earlier stays cached: its request body must not drift.
  assert.equal(client.cacheKey(videoRequest()), '2ed798b73491ee4c96a2cbd3');
  assert.notEqual(client.cacheKey(hd), client.cacheKey(videoRequest()));
  const gen = { kind: 'image' as const, model: 'flux-2-klein-9b', requestId: 'r', promptSha256: 'p', seed: 4625, reportedCostUsd: 0.015,
    estimateUsd: 0.02, files: [{ path: 'x', sha256: '0123456789abcdef00', bytes: 1, contentType: 'image/jpeg' }], createdAt: 'x' };
  const html = renderBrief(b, { cards: [{ entity: 'Qwen3-4B', dataUri: 'data:image/jpeg;base64,AAA', generation: gen }] });
  assert.match(html, /<figcaption>Qwen3-4B<\/figcaption>/);
  assert.match(html, /Emblem for Qwen3-4B: flux-2-klein-9b/);
  assert.match(html, /carry no information about the models/);
});
