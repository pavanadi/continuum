import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCreditStatus, enforceFreeBudget, OpenRouterBudget } from '../src/usage/openrouter.ts';
import { LiquidExtractor, DEFAULT_LIQUID_MODEL } from '../src/tools/liquid.ts';
import { dailyUsage } from '../src/usage/ledger.ts';
import { writeFile } from 'node:fs/promises';

const request: typeof fetch = async url => {
  const path = String(url).split('/').pop();
  return Response.json({ data: path === 'models' ? [{ id: DEFAULT_LIQUID_MODEL, pricing: { prompt: '0', completion: '0' } }] :
    path === 'credits' ? { total_credits: 0, total_usage: 0 } :
    { limit: 100, limit_remaining: 100, usage: 0, free_model_daily_requests: { remaining: 50, limit: 50, used: 0 } } });
};

test('account credit and key spending cap remain distinct; free usage works with zero balance', async () => {
  const status = await getCreditStatus('key', DEFAULT_LIQUID_MODEL, request);
  assert.equal(status.accountRemainingUsd, 0);
  assert.equal(status.keyRemainingUsd, 100);
  assert.doesNotThrow(() => enforceFreeBudget(status, 0, 10));
  assert.throws(() => enforceFreeBudget({ ...status, pricing: { prompt: '0.01', completion: '0' } }, 0, 10), /verified zero/);
  assert.throws(() => enforceFreeBudget({ ...status, freeRequests: { remaining: 0, limit: 50, used: 50 } }, 0, 10), /quota exhausted/);
  assert.throws(() => enforceFreeBudget(status, 10, 10), /cap reached/);
  assert.throws(() => enforceFreeBudget(status, 50, 100), /quota exhausted/);
  assert.throws(() => enforceFreeBudget({ ...status, pricing: null }, 0, 10), /verified zero/);
});

test('usage summary excludes fixture requests and distinguishes unfinished/unknown costs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-ledger-'));
  try {
    const path = join(dir, 'usage.jsonl');
    const at = new Date().toISOString();
    const rows = [
      { at, provider: 'rawtree', type: 'attempt', mode: 'fixture' },
      { at, provider: 'rawtree', type: 'attempt', mode: 'live' },
      { at, provider: 'openrouter', type: 'attempt' },
      { at, provider: 'openrouter', type: 'attempt' },
      { at, provider: 'openrouter', type: 'outcome', costUsd: null },
    ];
    await writeFile(path, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    const summary = await dailyUsage(path);
    assert.equal(summary.rawtreeRequests, 1);
    assert.equal(summary.openrouterUnfinishedAttempts, 1);
    assert.equal(summary.openrouterUnknownCostOutcomes, 1);
    assert.equal(summary.rawtreeCostUsd, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unavailable account balance is explicitly unknown, not inferred from key limit', async () => {
  const status = await getCreditStatus('key', DEFAULT_LIQUID_MODEL, async (url, init) =>
    String(url).endsWith('/credits') ? new Response('', { status: 403 }) : request(url, init));
  assert.equal(status.accountRemainingUsd, null);
  assert.match(status.accountBalanceStatus, /unavailable/);
});

test('attempt cap survives monitor recreation and missing cost stays unknown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuum-credits-'));
  try {
    const path = join(dir, 'usage.jsonl');
    const monitor = new OpenRouterBudget('key', path, 1, request);
    await monitor.before(DEFAULT_LIQUID_MODEL);
    await monitor.after({ model: DEFAULT_LIQUID_MODEL, error: 'network_or_timeout' });
    await assert.rejects(new OpenRouterBudget('key', path, 1, request).before(DEFAULT_LIQUID_MODEL), /cap reached/);
    const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert.equal(rows[1].costUsd, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('budget denial prevents inference and invalid completions still report usage', async () => {
  let calls = 0;
  const doc = { id: 'a', url: 'https://example.com', text: 'Costs $49.', observedAt: '2026-09-25' };
  const denied = new LiquidExtractor({ apiKey: 'key', fetch: async () => { calls++; return Response.json({}); },
    monitor: { async before() { throw new Error('budget exhausted'); }, async after() {} } });
  await assert.rejects(denied.extract('pricing', [doc]), /budget exhausted/);
  assert.equal(calls, 0);
  let recorded: unknown;
  const extractor = new LiquidExtractor({ apiKey: 'key', fetch: async () => Response.json({ usage: { cost: 0 }, choices: [] }),
    monitor: { async before() {}, async after(outcome) { recorded = outcome; } } });
  await assert.rejects(extractor.extract('pricing', [doc]), /Malformed/);
  assert.deepEqual((recorded as any).response.usage, { cost: 0 });
});
