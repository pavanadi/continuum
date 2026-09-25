import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FlightSink } from '../memory/flight.ts';

/**
 * Black Forest Labs (FLUX) client: submit, poll the returned polling_url, download, hash, cache.
 * FLUX output is illustration only; no fact in a brief is ever carried by generated pixels.
 */
const API = 'https://api.bfl.ai/v1/';

export type MediaKind = 'image' | 'video';

export interface GenerationRequest {
  kind: MediaKind;
  model: string;               // endpoint name, e.g. flux-2-pro or flux-3-video
  body: Record<string, unknown>;
  estimateUsd: number;         // conservative pre-call estimate used for the local budget check
}

export interface MediaFile { path: string; sha256: string; bytes: number; contentType: string }

export interface Generation {
  kind: MediaKind;
  model: string;
  requestId: string;
  promptSha256: string;
  seed: number | null;
  reportedCostUsd: number | null;  // from the provider (credits / 100); null when not reported
  estimateUsd: number;
  files: MediaFile[];
  createdAt: string;
  cached?: boolean;
}

export interface FluxOptions {
  apiKey: string;
  budgets: Record<MediaKind, number>;   // local UTC-day caps in USD, per media kind
  fetch?: typeof fetch;
  ledgerPath?: string;
  mediaDir?: string;
  flight?: FlightSink;
  pollIntervalMs?: Record<MediaKind, number>;
  timeoutMs?: Record<MediaKind, number>;
}

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const allowedHost = (url: URL) => url.protocol === 'https:' && (url.hostname === 'bfl.ai' || url.hostname.endsWith('.bfl.ai'));

/** Collect result URLs wherever the provider puts them (result.sample, result.video, nested objects). */
function resultUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string' && /^https:\/\//.test(value)) found.push(value);
  else if (Array.isArray(value)) value.forEach(v => resultUrls(v, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => resultUrls(v, found));
  return found;
}

export async function fluxSpend(ledgerPath: string, kind: MediaKind): Promise<{ attempts: number; committedUsd: number }> {
  let text = '';
  try { text = await readFile(ledgerPath, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const day = new Date().toISOString().slice(0, 10);
  const rows = text.split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(r => r.provider === 'bfl' && r.kind === kind && String(r.at).startsWith(day));
  const attempts = rows.filter(r => r.type === 'attempt');
  const outcomes = new Map(rows.filter(r => r.type === 'outcome').map(r => [r.attemptId, r]));
  // Reported cost when known, otherwise the pre-call estimate (unknown outcomes are never assumed free).
  const committedUsd = attempts.reduce((sum, a) => {
    const o = outcomes.get(a.attemptId);
    return sum + (typeof o?.reportedCostUsd === 'number' ? o.reportedCostUsd : a.estimateUsd);
  }, 0);
  return { attempts: attempts.length, committedUsd };
}

export class FluxClient {
  private options: FluxOptions;
  constructor(options: FluxOptions) {
    if (!options.apiKey.trim()) throw new Error('Set BFL_API_KEY in .env to generate FLUX media');
    for (const kind of ['image', 'video'] as const) {
      const cap = options.budgets[kind];
      if (!Number.isFinite(cap) || cap < 0 || cap > 5) throw new Error(`Invalid FLUX ${kind} budget`);
    }
    this.options = options;
  }

  private async ledger(row: Record<string, unknown>): Promise<void> {
    const path = this.options.ledgerPath ?? '.continuum/usage.jsonl';
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify({ at: new Date().toISOString(), provider: 'bfl', ...row }) + '\n', { mode: 0o600 });
  }

  private async call(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await (this.options.fetch ?? fetch)(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { 'x-key': this.options.apiKey, 'Content-Type': 'application/json', accept: 'application/json' } });
    // Provider bodies are not echoed: they may contain request details.
    if (!response.ok) throw new Error(`BFL request failed (HTTP ${response.status})`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new Error('Malformed BFL response');
    return data as Record<string, unknown>;
  }

  /** Same request → same cache key → no second charge. Different seed or prompt → new generation. */
  cacheKey(request: GenerationRequest): string {
    return sha(JSON.stringify([request.model, request.body])).slice(0, 24);
  }

  async generate(request: GenerationRequest, taskId = 'brief'): Promise<Generation> {
    const key = this.cacheKey(request);
    const dir = join(this.options.mediaDir ?? '.continuum/media', key);
    try { return { ...JSON.parse(await readFile(join(dir, 'generation.json'), 'utf8')), cached: true }; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!/^flux-[a-z0-9.-]+$/.test(request.model)) throw new Error('Invalid FLUX model endpoint');
    const prompt = String(request.body.prompt ?? '');
    if (!prompt.trim() || prompt.length > 2_000) throw new Error('FLUX prompt must be 1–2000 characters');
    const ledgerPath = this.options.ledgerPath ?? '.continuum/usage.jsonl';
    const spend = await fluxSpend(ledgerPath, request.kind);
    if (spend.committedUsd + request.estimateUsd > this.options.budgets[request.kind] + 1e-9) {
      throw new Error(`Local FLUX ${request.kind} budget reached ($${spend.committedUsd.toFixed(3)} committed of $${this.options.budgets[request.kind]})`);
    }
    const attemptId = key + '-' + Date.now();
    const promptSha256 = sha(prompt);
    const seed = typeof request.body.seed === 'number' ? request.body.seed : null;
    await this.ledger({ type: 'attempt', attemptId, kind: request.kind, model: request.model, estimateUsd: request.estimateUsd, promptSha256 });
    await this.options.flight?.record('GENERATION_STARTED', taskId, { kind: request.kind, model: request.model, promptSha256, seed, estimateUsd: request.estimateUsd });
    let requestId = '';
    let reportedCostUsd: number | null = null;
    try {
      const submitted = await this.call(API + request.model, { method: 'POST', body: JSON.stringify(request.body) });
      requestId = typeof submitted.id === 'string' ? submitted.id : '';
      if (typeof submitted.cost === 'number') reportedCostUsd = submitted.cost / 100;
      const polling = new URL(String(submitted.polling_url ?? ''));
      if (!requestId || !allowedHost(polling)) throw new Error('BFL response lacks a valid id or polling_url');
      const interval = this.options.pollIntervalMs?.[request.kind] ?? (request.kind === 'video' ? 5_000 : 1_500);
      const deadline = Date.now() + (this.options.timeoutMs?.[request.kind] ?? (request.kind === 'video' ? 900_000 : 300_000));
      let result: Record<string, unknown> | null = null;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, interval));
        const polled = await this.call(polling.href);
        if (typeof polled.cost === 'number') reportedCostUsd = polled.cost / 100;
        const status = String(polled.status ?? '');
        if (status === 'Ready') { result = polled; break; }
        if (!['Pending', 'Reasoning', 'Generating', 'Queued'].includes(status)) throw new Error(`BFL generation ended with status "${status}"`);
      }
      // A timeout is ambiguous (the provider may still finish and charge); never resubmit automatically.
      if (!result) throw new Error('BFL generation did not finish before the local timeout; inspect before retrying');
      // Signed delivery URLs may live on a CDN host; downloads never carry the API key.
      const urls = resultUrls(result.result);
      if (!urls.length) throw new Error('BFL result contained no downloadable URL');
      await mkdir(dir, { recursive: true });
      const files: MediaFile[] = [];
      for (const [index, url] of urls.slice(0, 4).entries()) {
        const response = await (this.options.fetch ?? fetch)(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Downloading generated media failed (HTTP ${response.status})`);
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const bytes = new Uint8Array(await response.arrayBuffer());
        const ext = contentType.includes('video') ? 'mp4' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp'
          : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'bin';
        const path = join(dir, `${request.kind}-${index + 1}.${ext}`);
        await writeFile(path, bytes);
        files.push({ path, sha256: sha(bytes), bytes: bytes.length, contentType });
      }
      const generation: Generation = { kind: request.kind, model: request.model, requestId, promptSha256, seed, reportedCostUsd,
        estimateUsd: request.estimateUsd, files, createdAt: new Date().toISOString() };
      await writeFile(join(dir, 'generation.json'), JSON.stringify({ ...generation, prompt }, null, 2));
      await this.ledger({ type: 'outcome', attemptId, kind: request.kind, requestId, status: 'ready', reportedCostUsd });
      await this.options.flight?.record('GENERATION_COMPLETED', taskId, { kind: request.kind, model: request.model, requestId,
        promptSha256, seed, reportedCostUsd, files: files.map(f => ({ sha256: f.sha256, bytes: f.bytes, contentType: f.contentType })) });
      return generation;
    } catch (error) {
      await this.ledger({ type: 'outcome', attemptId, kind: request.kind, requestId: requestId || null, status: 'failed', reportedCostUsd });
      await this.options.flight?.record('GENERATION_FAILED', taskId, { kind: request.kind, model: request.model, requestId: requestId || null,
        errorClass: error instanceof Error ? error.name : 'unknown', reportedCostUsd });
      throw error;
    }
  }
}
