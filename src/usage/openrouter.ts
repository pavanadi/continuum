import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CreditStatus {
  checkedAt: string;
  model: string;
  keyRemainingUsd: number | null;
  keyLimitUsd: number | null;
  keyUsageUsd: number | null;
  accountRemainingUsd: number | null;
  accountBalanceStatus: string;
  freeRequests: { remaining: number; limit: number; used: number } | null;
  pricing: Record<string, string | number> | null;
}

const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export async function getCreditStatus(apiKey: string, model: string, request: typeof fetch = fetch): Promise<CreditStatus> {
  if (!apiKey.trim()) throw new Error('OPENROUTER_API_KEY is required');
  async function get(path: string, authenticated = true) {
    const response = await request(`https://openrouter.ai/api/v1/${path}`, {
      headers: authenticated ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) return { status: response.status, data: null };
    return { status: response.status, data: (await response.json()).data };
  }
  const [key, credits, models] = await Promise.all([get('key'), get('credits'), get('models', false)]);
  if (key.status !== 200 || !key.data || typeof key.data !== 'object') throw new Error(`Cannot check OpenRouter key limits (HTTP ${key.status})`);
  if (models.status !== 200 || !Array.isArray(models.data)) throw new Error('Cannot check current OpenRouter model pricing');
  const pricing = models.data.find((item: { id: string }) => item.id === model)?.pricing ?? null;
  const quota = key.data.free_model_daily_requests;
  const accountKnown = number(credits.data?.total_credits) && number(credits.data?.total_usage);
  return {
    checkedAt: new Date().toISOString(), model,
    keyRemainingUsd: number(key.data.limit_remaining) ? key.data.limit_remaining : null,
    keyLimitUsd: number(key.data.limit) ? key.data.limit : null,
    keyUsageUsd: number(key.data.usage) ? key.data.usage : null,
    accountRemainingUsd: accountKnown ? credits.data.total_credits - credits.data.total_usage : null,
    accountBalanceStatus: accountKnown ? 'available' : `unavailable (HTTP ${credits.status}; a management key may be required)`,
    freeRequests: quota && ['remaining', 'limit', 'used'].every(k => number(quota[k])) ? {
      remaining: quota.remaining, limit: quota.limit, used: quota.used,
    } : null,
    pricing,
  };
}

export function enforceFreeBudget(status: CreditStatus, attempts: number, dailyCap: number): void {
  if (!Number.isSafeInteger(dailyCap) || dailyCap < 1 || dailyCap > 1000) throw new Error('OPENROUTER_DAILY_REQUEST_CAP must be 1–1000');
  if (attempts >= dailyCap) throw new Error('Local daily OpenRouter request cap reached');
  const pricing = status.pricing;
  if (!status.model.endsWith(':free') || !pricing || !('prompt' in pricing) || !('completion' in pricing) ||
      !Object.values(pricing).every(value => (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '' && Number(value) === 0)) {
    throw new Error('Credit guard permits only a :free model with verified zero pricing; paid/unknown pricing is blocked');
  }
  if (status.freeRequests && Math.min(status.freeRequests.remaining, status.freeRequests.limit - attempts) < 1) {
    throw new Error('OpenRouter free request quota exhausted');
  }
  if (status.accountRemainingUsd !== null && status.accountRemainingUsd < 0) throw new Error('OpenRouter account balance is negative');
  if (status.keyRemainingUsd === 0 && status.keyLimitUsd !== null) throw new Error('OpenRouter key credit limit exhausted');
}

export interface UsageOutcome {
  model: string;
  httpStatus?: number;
  response?: unknown;
  error?: string;
}

export interface InferenceMonitor {
  before(model: string): Promise<void>;
  after(outcome: UsageOutcome): Promise<void>;
}

/** Single-worker ledger: records attempts before network calls, including unknown outcomes. */
export class OpenRouterBudget implements InferenceMonitor {
  private apiKey: string;
  private path: string;
  private cap: number;
  private request: typeof fetch;
  constructor(apiKey: string, path = '.continuum/usage.jsonl', cap = 10, request: typeof fetch = fetch) {
    this.apiKey = apiKey; this.path = path; this.cap = cap; this.request = request;
  }
  async before(model: string): Promise<void> {
    const status = await getCreditStatus(this.apiKey, model, this.request);
    let lines = '';
    try { lines = await readFile(this.path, 'utf8'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const today = new Date().toISOString().slice(0, 10);
    const attempts = lines.split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(row => row.provider === 'openrouter' && row.type === 'attempt' && row.at.startsWith(today)).length;
    enforceFreeBudget(status, attempts, this.cap);
    await this.record({ provider: 'openrouter', type: 'attempt', model, status });
    console.error(JSON.stringify({ creditCheck: status, localDailyRequests: attempts + 1, localDailyCap: this.cap }));
  }
  async after(outcome: UsageOutcome): Promise<void> {
    const result = outcome.response as { id?: unknown; usage?: Record<string, unknown> } | undefined;
    const usage = result?.usage;
    const costUsd = number(usage?.cost) ? usage.cost : null;
    const receipt = {
      provider: 'openrouter', type: 'outcome', model: outcome.model,
      httpStatus: outcome.httpStatus ?? null, error: outcome.error ?? null,
      requestId: typeof result?.id === 'string' ? result.id : null, costUsd,
      promptTokens: number(usage?.prompt_tokens) ? usage.prompt_tokens : null,
      completionTokens: number(usage?.completion_tokens) ? usage.completion_tokens : null,
    };
    await this.record(receipt);
    console.error(JSON.stringify({ inferenceUsage: receipt }));
  }
  private async record(value: Record<string, unknown>) {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n', { mode: 0o600 });
  }
}
