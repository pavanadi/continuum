import { randomUUID } from 'node:crypto';
import type { RawTreeTransport } from '../tools/rawtree.ts';

export type FlightType = 'RUN_RESUMED' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_FAILED' |
  'SOURCE_SEARCH_STARTED' | 'SOURCE_SEARCH_COMPLETED' | 'SOURCE_SEARCH_FAILED' |
  'EXTRACTION_STARTED' | 'EXTRACTION_COMPLETED' | 'EXTRACTION_FAILED' |
  'PREFLIGHT_STARTED' | 'PREFLIGHT_PASSED' | 'PREFLIGHT_DENIED' |
  'RETRY_DECIDED' | 'RETRY_DEFERRED' |
  'PAGE_FETCH_STARTED' | 'PAGE_FETCH_COMPLETED' | 'PAGE_FETCH_FAILED' |
  'FOLLOW_UP_PLANNED' | 'REVERIFY_PLANNED' |
  'GENERATION_STARTED' | 'GENERATION_COMPLETED' | 'GENERATION_FAILED';

export type PreflightCode = 'local_cap' | 'free_quota' | 'pricing_unverified' |
  'key_limit' | 'account_balance' | 'credit_status_unavailable' | 'other';

/** Deliberately stores a bounded code rather than an upstream error body. */
export function preflightCode(error: unknown): PreflightCode {
  const message = error instanceof Error ? error.message : '';
  if (/local daily.*cap/i.test(message)) return 'local_cap';
  if (/free request quota/i.test(message)) return 'free_quota';
  if (/pricing|:free model/i.test(message)) return 'pricing_unverified';
  if (/key credit limit/i.test(message)) return 'key_limit';
  if (/account balance/i.test(message)) return 'account_balance';
  if (/check.*(key limits|model pricing)|fetch failed|timed out/i.test(message)) return 'credit_status_unavailable';
  return 'other';
}

export interface FlightEvent {
  schema_version: 1;
  event_id: string;
  run_id: string;
  session_id: string;
  task_id: string;
  recorded_at: string;
  type: FlightType;
  payload_json: string;
}

export interface FlightSink {
  record(type: FlightType, taskId: string, payload?: Record<string, unknown>): Promise<void>;
  latestAttempt?(taskId: string): Promise<FlightEvent | null>;
}

/** Append-only activity journal. One sequential writer per run, as with checkpoints. */
export class RawTreeFlight implements FlightSink {
  readonly sessionId = randomUUID();
  private transport: RawTreeTransport;
  private runId: string;
  private table: string;
  private uncertain = false;
  private lastMs = 0;
  private sequence = 0;
  private initialized = false;

  constructor(transport: RawTreeTransport, runId: string,
    table = 'continuum_flight_v1') {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(runId)) throw new Error('Invalid RawTree run ID');
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(table)) throw new Error('Invalid RawTree flight table');
    this.transport = transport;
    this.runId = runId;
    this.table = table;
  }

  async record(type: FlightType, taskId: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (this.uncertain) throw new Error('Previous flight write outcome uncertain; inspect RawTree before restarting');
    if (!/^[A-Za-z0-9_.:-]{0,128}$/.test(taskId)) throw new Error('Invalid task ID for flight event');
    if (!this.initialized) {
      const latest = (await this.history(1))[0];
      if (latest) {
        const [millis, ordinal] = latest.event_id.split('-');
        this.lastMs = Number(millis);
        this.sequence = Number(ordinal);
      }
      this.initialized = true;
    }
    // Fixed-width timestamp and per-process counter give deterministic order for a sequential worker.
    const ms = Math.max(Date.now(), this.lastMs + (this.sequence >= 99_999 ? 1 : 0));
    this.sequence = ms === this.lastMs ? this.sequence + 1 : 0;
    this.lastMs = ms;
    const event: FlightEvent = {
      schema_version: 1, run_id: this.runId, session_id: this.sessionId, task_id: taskId,
      event_id: `${String(ms).padStart(13, '0')}-${String(this.sequence).padStart(5, '0')}-${randomUUID()}`,
      recorded_at: new Date(ms).toISOString(), type, payload_json: JSON.stringify(payload),
    };
    this.uncertain = true;
    let insertionError: unknown;
    try { await this.transport.insert(this.table, { ...event }); }
    catch (error) { insertionError = error; }
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
      try {
        const rows = await this.transport.query(
          `SELECT DISTINCT event_id, run_id, type, payload_json FROM ${this.table} WHERE event_id = '${event.event_id}' LIMIT 2`,
        );
        if (rows.length === 1 && rows[0].event_id === event.event_id &&
            rows[0].run_id === this.runId && rows[0].type === type &&
            rows[0].payload_json === event.payload_json) {
          this.uncertain = false;
          return;
        }
      } catch { /* An unconfirmed insert must not be retried blindly. */ }
    }
    throw new Error('RawTree flight write could not be confirmed; stop and inspect before restarting', { cause: insertionError });
  }

  async history(limit = 100, beforeEventId?: string): Promise<FlightEvent[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Flight history limit must be 1–100');
    if (beforeEventId && !/^[0-9]{13}-[0-9]{5}-[0-9a-f-]{36}$/.test(beforeEventId)) {
      throw new Error('Invalid flight history cursor');
    }
    if (!await this.transport.hasTable(this.table)) return [];
    const cursor = beforeEventId ? ` AND event_id < '${beforeEventId}'` : '';
    const rows = await this.transport.query(
      `SELECT DISTINCT schema_version, event_id, run_id, session_id, task_id, recorded_at, type, payload_json FROM ${this.table} WHERE run_id = '${this.runId}'${cursor} ORDER BY event_id DESC LIMIT ${limit}`,
    );
    return rows.map(row => {
      if (Number(row.schema_version) !== 1 || row.run_id !== this.runId ||
          typeof row.event_id !== 'string' || typeof row.payload_json !== 'string' ||
          typeof row.type !== 'string') throw new Error('Malformed RawTree flight event');
      JSON.parse(row.payload_json);
      return row as unknown as FlightEvent;
    });
  }

  async latestAttempt(taskId: string): Promise<FlightEvent | null> {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(taskId)) throw new Error('Invalid task ID for flight query');
    if (!await this.transport.hasTable(this.table)) return null;
    // RawTree infers Dynamic columns; IN requires an explicit cast (plain = comparisons work).
    const rows = await this.transport.query(
      `SELECT DISTINCT schema_version, event_id, run_id, session_id, task_id, recorded_at, type, payload_json FROM ${this.table} WHERE run_id = '${this.runId}' AND task_id = '${taskId}' AND toString(type) IN ('TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED') ORDER BY event_id DESC LIMIT 1`,
    );
    if (!rows.length) return null;
    const row = rows[0];
    if (Number(row.schema_version) !== 1 || row.run_id !== this.runId || row.task_id !== taskId ||
        typeof row.event_id !== 'string' || typeof row.payload_json !== 'string' ||
        !['TASK_STARTED', 'TASK_FAILED', 'TASK_COMPLETED', 'PREFLIGHT_DENIED'].includes(String(row.type))) {
      throw new Error('Malformed RawTree task attempt');
    }
    JSON.parse(row.payload_json);
    return row as unknown as FlightEvent;
  }
}
