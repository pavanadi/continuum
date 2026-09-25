import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ResearchMode, SourceDocument, SourceProvider } from '../agent/types.ts';
import { dailyUsage } from '../usage/ledger.ts';

const LITE_LIST_PRICE_USD = 0.0011;
const EXTRACT_LIST_PRICE_USD = 0.001;
const ENDPOINT = 'https://sdk.nimbleway.com/v2/search';
const EXTRACT_ENDPOINT = 'https://sdk.nimbleway.com/v2/extract';

export interface NimbleOptions {
  apiKey: string;
  dailyRequestCap?: number;
  dailyCostCapUsd?: number;
  fetch?: typeof fetch;
  ledgerPath?: string;
}

function parseClaim(claimKey: string): { entity: string; attribute: string } {
  if (!claimKey.trim() || claimKey.length > 300) throw new Error('Invalid Nimble claim key');
  const parts = claimKey.split('|').map(part => part.trim());
  if (parts.length !== 2 || parts.some(part => !part)) {
    throw new Error('Live claims must use "entity | attribute", for example "LFM2.5-2.6B | context length"');
  }
  return { entity: parts[0], attribute: parts[1] };
}

function queryFor(claimKey: string, mode: ResearchMode, focus = ''): string {
  const { entity, attribute } = parseClaim(claimKey);
  const terms = `${entity} ${attribute}`;
  if (mode === 'resolve') return `${terms} ${focus.replace(/[^\w .:/-]/g, ' ').trim()}`.slice(0, 200);
  return mode === 'support' ? `${terms} official documentation` : `${terms} independent review comparison`;
}

function matchesEntity(entity: string, title: unknown, url: URL): boolean {
  const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = compact(entity);
  if (needle.length < 3) return false;
  return compact(typeof title === 'string' ? title : '').includes(needle) || compact(url.href).includes(needle);
}

/** Search and page extraction share one local daily attempt cap and list-price estimate cap. */
async function reserve(options: NimbleOptions, ledgerPath: string, price: number, kind: string): Promise<void> {
  const cap = options.dailyRequestCap ?? 4;
  const costCap = options.dailyCostCapUsd ?? 0.02;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1000 ||
      !Number.isFinite(costCap) || costCap < price) throw new Error('Invalid Nimble budget configuration');
  const usage = await dailyUsage(ledgerPath);
  // Unfinished attempts are charged at the highest list price because their outcome is unknown.
  const committed = usage.nimbleEstimatedListCostUsd + usage.nimbleUnfinishedAttempts * LITE_LIST_PRICE_USD;
  if (usage.nimbleAttempts >= cap || committed + price > costCap + 1e-9) {
    throw new Error(`Local Nimble ${kind} budget reached`);
  }
}

async function record(path: string, row: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const { appendFile } = await import('node:fs/promises');
  await appendFile(path, JSON.stringify({ at: new Date().toISOString(), provider: 'nimble', ...row }) + '\n', { mode: 0o600 });
}

/** One low-cost live search per task. Balances are unknown; caps use list-price estimates. */
export class NimbleSearch implements SourceProvider {
  private options: NimbleOptions;
  constructor(options: NimbleOptions) {
    if (!options.apiKey.trim()) throw new Error('Set NIMBLE_API_KEY in .env to use live search');
    this.options = options;
  }

  async search(claimKey: string, mode: ResearchMode, focus?: string): Promise<SourceDocument[]> {
    const query = queryFor(claimKey, mode, focus);
    const { entity } = parseClaim(claimKey);
    const ledgerPath = this.options.ledgerPath ?? '.continuum/usage.jsonl';
    await reserve(this.options, ledgerPath, LITE_LIST_PRICE_USD, 'search');
    await record(ledgerPath, { type: 'attempt', endpoint: '/v2/search', depth: 'lite', query,
      listPriceEstimateUsd: LITE_LIST_PRICE_USD, accountBalanceUsd: null });
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, search_depth: 'lite', max_results: 3 }),
      });
    } catch {
      await record(ledgerPath, { type: 'outcome', error: 'network_or_timeout', estimatedCostUsd: null });
      throw new Error('Nimble search failed or timed out; task remains pending');
    }
    if (!response.ok) {
      await record(ledgerPath, { type: 'outcome', httpStatus: response.status, estimatedCostUsd: 0,
        rateLimitRemaining: response.headers.get('ratelimit-remaining') });
      throw new Error(`Nimble search failed (HTTP ${response.status}); task remains pending`);
    }
    let result: unknown;
    try { result = await response.json(); } catch {
      await record(ledgerPath, { type: 'outcome', httpStatus: response.status, error: 'invalid_json', estimatedCostUsd: null });
      throw new Error('Nimble returned invalid JSON');
    }
    const payload = result as { request_id?: unknown; results?: unknown[] };
    await record(ledgerPath, { type: 'outcome', httpStatus: response.status,
      requestId: typeof payload?.request_id === 'string' ? payload.request_id : null,
      rateLimitRemaining: response.headers.get('ratelimit-remaining'),
      estimatedCostUsd: LITE_LIST_PRICE_USD, actualCostUsd: null });
    if (typeof payload?.request_id !== 'string' || !Array.isArray(payload.results)) {
      throw new Error('Malformed Nimble search response');
    }
    const observedAt = new Date().toISOString();
    const sources: SourceDocument[] = [];
    for (const entry of payload.results.slice(0, 3)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.url !== 'string') continue;
      let url: URL;
      try { url = new URL(item.url); } catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      if (!matchesEntity(entity, item.title, url)) continue;
      const text = [item.title, item.description, item.content].filter(x => typeof x === 'string' && x.trim())
        .join('\n').slice(0, 6_000);
      if (!text.trim()) continue;
      if (sources.some(source => source.url === url.href)) continue;
      sources.push({ id: `nimble-${sources.length + 1}`, url: url.href, observedAt, text,
        retrieval: { provider: 'nimble', requestId: payload.request_id, query, depth: 'lite', sourceKind: 'search-result' } });
    }
    return sources;
  }
}

/** Reuse retrieved results after a model failure or process restart within one run. */
export class CachedSources implements SourceProvider {
  private source: SourceProvider;
  private runId: string;
  private dir: string;
  constructor(source: SourceProvider, runId: string, dir = '.continuum/source-cache') {
    this.source = source; this.runId = runId; this.dir = dir;
  }
  async search(claimKey: string, mode: ResearchMode, focus?: string): Promise<SourceDocument[]> {
    // Keys without a focus are unchanged so existing caches stay valid.
    const id = createHash('sha256').update(JSON.stringify(focus ? [this.runId, claimKey, mode, focus] : [this.runId, claimKey, mode])).digest('hex');
    const path = join(this.dir, `${id}.json`);
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const sources = await this.source.search(claimKey, mode, focus);
    await mkdir(this.dir, { recursive: true });
    const tmp = path + `.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(sources), { mode: 0o600 });
    await rename(tmp, path);
    return sources;
  }
}

export interface FetchedPage { url: string; markdown: string; requestId: string; observedAt: string }
export interface PageFetcher { fetch(url: string): Promise<FetchedPage> }

/** Nimble Extract: one static (non-rendered) page as markdown. Bodies of failed requests are never echoed. */
export class NimblePages implements PageFetcher {
  private options: NimbleOptions;
  constructor(options: NimbleOptions) {
    if (!options.apiKey.trim()) throw new Error('Set NIMBLE_API_KEY in .env to fetch pages');
    this.options = options;
  }

  async fetch(pageUrl: string): Promise<FetchedPage> {
    const url = new URL(pageUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid page URL');
    const ledgerPath = this.options.ledgerPath ?? '.continuum/usage.jsonl';
    await reserve(this.options, ledgerPath, EXTRACT_LIST_PRICE_USD, 'page extract');
    await record(ledgerPath, { type: 'attempt', endpoint: '/v2/extract', url: url.href,
      listPriceEstimateUsd: EXTRACT_LIST_PRICE_USD, accountBalanceUsd: null });
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(EXTRACT_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.href, render: false, formats: ['markdown'] }),
      });
    } catch {
      await record(ledgerPath, { type: 'outcome', endpoint: '/v2/extract', error: 'network_or_timeout', estimatedCostUsd: null });
      throw new Error('Nimble page extract failed or timed out; task remains pending');
    }
    let result: unknown = null;
    if (response.ok) { try { result = await response.json(); } catch { /* handled below */ } }
    const payload = result as { task_id?: unknown; status?: unknown; data?: { markdown?: unknown } } | null;
    const ok = response.ok && typeof payload?.task_id === 'string' && payload.status === 'success' &&
      typeof payload.data?.markdown === 'string';
    await record(ledgerPath, { type: 'outcome', endpoint: '/v2/extract', httpStatus: response.status,
      requestId: typeof payload?.task_id === 'string' ? payload.task_id : null,
      estimatedCostUsd: response.ok ? EXTRACT_LIST_PRICE_USD : 0, actualCostUsd: null });
    if (!ok) throw new Error(`Nimble page extract failed (HTTP ${response.status}); task remains pending`);
    return { url: url.href, markdown: String(payload!.data!.markdown), requestId: String(payload!.task_id),
      observedAt: new Date().toISOString() };
  }
}

/** Reuse an extracted page after a later failure or restart within one run. */
export class CachedPages implements PageFetcher {
  private pages: PageFetcher;
  private runId: string;
  private dir: string;
  constructor(pages: PageFetcher, runId: string, dir = '.continuum/page-cache') {
    this.pages = pages; this.runId = runId; this.dir = dir;
  }
  async fetch(url: string): Promise<FetchedPage> {
    const path = join(this.dir, `${createHash('sha256').update(JSON.stringify([this.runId, url])).digest('hex')}.json`);
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const page = await this.pages.fetch(url);
    await mkdir(this.dir, { recursive: true });
    const tmp = path + `.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(page), { mode: 0o600 });
    await rename(tmp, path);
    return page;
  }
}
