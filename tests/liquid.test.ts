import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiquidExtractor, LiquidResearchProvider, DEFAULT_LIQUID_MODEL } from '../src/tools/liquid.ts';
import { Orchestrator } from '../src/agent/orchestrator.ts';
import { RawTreeMemory } from '../src/memory/rawtree.ts';
import type { State, SourceDocument } from '../src/agent/types.ts';
import { fixtureSources } from '../src/tools/fixture.ts';

const doc: SourceDocument = { id: 'pricing', url: 'https://example.com/pricing',
  observedAt: '2026-09-25T00:00:00Z', text: 'The Basic subscription costs $49/month.' };
const observation = { sourceId: doc.id, value: '$49/month', quote: doc.text };
function completion(observations: unknown = [observation], extra: Record<string, unknown> = {}) {
  return { id: 'gen-test', model: DEFAULT_LIQUID_MODEL,
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ observations }) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, ...extra };
}

test('hosted extraction uses explicit Liquid model and grounded quotes with provenance', async () => {
  let body: Record<string, any>;
  const extractor = new LiquidExtractor({ apiKey: 'test-key', fetch: async (url, init) => {
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    body = JSON.parse(String(init?.body));
    return Response.json(completion());
  } });
  const evidence = await extractor.extract('acme:pricing', [doc]);
  assert.equal(body!.model, DEFAULT_LIQUID_MODEL);
  assert.equal(body!.response_format.type, 'json_schema');
  assert.equal(body!.provider.require_parameters, true);
  assert.equal(body!.messages.length, 2);
  assert.equal(body!.max_tokens, 2048);
  assert.equal(evidence[0].quote, doc.text);
  assert.equal(evidence[0].sourceUrl, doc.url);
  assert.equal(evidence[0].observedAt, doc.observedAt);
  assert.equal(evidence[0].extraction?.requestId, 'gen-test');
  assert.equal(evidence[0].extraction?.usage?.totalTokens, 150);
});

test('ungrounded observations are dropped and counted; malformed ones still fail the task', async () => {
  for (const candidate of [
    { ...observation, sourceId: 'invented' },
    { ...observation, quote: 'The Basic subscription costs $99/month.' },
    { ...observation, value: '$99/month' },
  ]) {
    const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => Response.json(completion([observation, candidate])) });
    const result = await extractor.extractDetailed('pricing', [doc]);
    assert.deepEqual(result.evidence.map(e => e.value), ['$49/month']);
    assert.equal(result.rejected, 1);
  }
  for (const candidate of [{ ...observation, value: '' }, { ...observation, sourceUrl: 'https://invented.example' }]) {
    const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => Response.json(completion([candidate])) });
    await assert.rejects(extractor.extract('pricing', [doc]), /Invalid Liquid observation/);
  }
  // Only whitespace differences are tolerated.
  const spaced = { ...observation, quote: 'The Basic  subscription\ncosts $49/month.' };
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => Response.json(completion([spaced])) });
  assert.equal((await extractor.extractDetailed('pricing', [doc])).evidence.length, 1);
});

test('bounded context fails before a network call and empty sources need no inference', async () => {
  let calls = 0;
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => { calls++; return Response.json(completion()); } });
  await assert.rejects(extractor.extract('pricing', [{ ...doc, text: 'x'.repeat(20_001) }]), /Invalid Liquid source/);
  await assert.rejects(extractor.extract('pricing', [doc, doc]), /Duplicate source/);
  await assert.rejects(extractor.extract('pricing', Array.from({ length: 7 }, (_, i) => ({ ...doc, id: String(i) }))), /at most 6/);
  assert.deepEqual(await extractor.extract('pricing', []), []);
  assert.equal(calls, 0);
  assert.throws(() => new LiquidExtractor({ apiKey: 'key', model: 'other/model' }), /liquid\//);
});

test('malformed, truncated, and API error responses cannot become evidence', async () => {
  const responses = [
    completion([], { choices: [{ finish_reason: 'length', message: { content: '{"observations":[]}' } }] }),
    completion([], { choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }),
    completion([], { error: { message: 'upstream failure' } }),
    completion([], { model: 'other/model' }),
  ];
  for (const payload of responses) {
    const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => Response.json(payload) });
    await assert.rejects(extractor.extract('pricing', [doc]));
  }
});

test('a rate limit leaves the task pending and does not echo provider error bodies', async () => {
  let saved: State | null = null;
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => new Response('private upstream details', { status: 429 }) });
  const runner = new Orchestrator({ async load() { return structuredClone(saved); }, async save(next) { saved = structuredClone(next); } },
    new LiquidResearchProvider(fixtureSources, extractor));
  await runner.start('failed-liquid', 'Extract pricing', ['acme:pricing']);
  await assert.rejects(runner.step(), error => /HTTP 429/.test(String(error)) && !String(error).includes('private upstream'));
  assert.equal(saved!.tasks[0].status, 'pending');
  assert.equal(saved!.evidence.length, 0);
});

test('Liquid evidence and usage survive checkpoint resume; completed roles do not call the model again', async () => {
  let calls = 0;
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async (_url, init) => {
    calls++;
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    const source = input.documents[0];
    const value = source.text.includes('$49') ? '$49/month' : '$79/month';
    return Response.json(completion([{ sourceId: source.sourceId, quote: source.text, value }], { id: `gen-${calls}` }));
  } });
  const rows: Record<string, unknown>[] = [];
  const transport = {
    async hasTable() { return rows.length > 0; },
    async insert(_table: string, row: Record<string, unknown>) { rows.push(structuredClone(row)); },
    async query() { return structuredClone([...rows].reverse().slice(0, 2)); },
  };
  const provider = new LiquidResearchProvider(fixtureSources, extractor);
  const first = new Orchestrator(new RawTreeMemory(transport, 'liquid-resume'), provider);
  await first.start('liquid-resume', 'Extract pricing', ['acme:pricing']);
  await first.step();
  const next = new Orchestrator(new RawTreeMemory(transport, 'liquid-resume'), provider);
  await next.step();
  const state = await next.step();
  assert.equal(state.decisions[0].status, 'unresolved');
  assert.equal(state.evidence[0].extraction?.requestId, 'gen-1');
  assert.equal(state.evidence[1].extraction?.requestId, 'gen-2');
  assert.ok(state.evidence.every(e => e.quote && e.extraction?.usage));
  await next.step();
  assert.equal(calls, 2);
});

test('local mode calls only a localhost server, strips thinking, and verifies the served model identity', async () => {
  const model = 'LFM2.5-2.6B-Q4_K_M';
  assert.throws(() => new LiquidExtractor({ apiKey: '', baseUrl: 'https://api.example.com/v1', model }), /local http/);
  assert.throws(() => new LiquidExtractor({ apiKey: '', baseUrl: 'http://127.0.0.1:8080/v1', model: 'llama3' }), /LFM/);
  let request: { url: string; init: RequestInit } | undefined;
  const local = (served: string) => new LiquidExtractor({ apiKey: '', baseUrl: 'http://127.0.0.1:8080/v1/', model,
    fetch: async (url, init) => {
      request = { url: String(url), init: init! };
      return Response.json(completion([observation], { model: served, choices: [{ finish_reason: 'stop',
        message: { content: `<think>checking the source</think>\n${JSON.stringify({ observations: [observation] })}` } }] }));
    } });
  const [evidence] = await local(model).extract('pricing', [doc]);
  assert.equal(request!.url, 'http://127.0.0.1:8080/v1/chat/completions');
  assert.equal((request!.init.headers as Record<string, string>).Authorization, undefined);
  assert.equal(JSON.parse(String(request!.init.body)).provider, undefined);
  assert.equal(JSON.parse(String(request!.init.body)).thinking_budget_tokens, 0);
  assert.equal(evidence.extraction?.provider, 'local');
  assert.equal(evidence.extraction?.model, model);
  await assert.rejects(local('gpt-4o-mini').extract('pricing', [doc]), /unexpected model identity/);
});

test('a local reply that spent its budget reasoning fails with an actionable message', async () => {
  const extractor = new LiquidExtractor({ apiKey: '', baseUrl: 'http://127.0.0.1:4625/v1', model: 'LFM2.5-2.6B-Q4_K_M',
    fetch: async () => Response.json({ id: 'x', model: 'LFM2.5-2.6B-Q4_K_M',
      choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'thinking…' } }] }) });
  await assert.rejects(extractor.extract('pricing', [doc]), /whole output budget reasoning/);
});
