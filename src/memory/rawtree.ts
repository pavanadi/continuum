import { createHash } from 'node:crypto';
import type { State } from '../agent/types.ts';
import type { RawTreeTransport } from '../tools/rawtree.ts';
import { assertState } from './validate.ts';

export interface MemoryEvent {
  type: string;
  payload: unknown;
}
export interface Checkpoint {
  schema_version: 1;
  run_id: string;
  revision: number;
  checkpoint_id: string;
  recorded_at: string;
  state_json: string;
  events_json: string;
}

function changes(previous: State | null, state: State): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  if (!previous) events.push({ type: 'RUN_CREATED', payload: { goal: state.goal } });
  for (const task of state.tasks) {
    const old = previous?.tasks.find(t => t.id === task.id);
    if (!old || old.status !== task.status) events.push({
      type: old ? 'TASK_COMPLETED' : 'TASK_CREATED', payload: task,
    });
  }
  for (const e of state.evidence) {
    if (!previous?.evidence.some(old => old.id === e.id)) events.push({ type: 'EVIDENCE_RECORDED', payload: e });
  }
  for (const decision of state.decisions.slice(previous?.decisions.length ?? 0)) {
    events.push({ type: 'DECISION_RECORDED', payload: decision });
    if (decision.status === 'unresolved') events.push({ type: 'CONTRADICTION_FOUND', payload: decision });
  }
  return events;
}

/** One append-only row commits a snapshot and its event batch together. */
export function makeCheckpoint(previous: State | null, state: State, revision: number): Checkpoint {
  assertState(state);
  const state_json = JSON.stringify(state);
  return {
    schema_version: 1, run_id: state.runId, revision,
    checkpoint_id: createHash('sha256').update(`${state.runId}:${revision}:${state_json}`).digest('hex'),
    recorded_at: new Date().toISOString(), state_json,
    events_json: JSON.stringify(changes(previous, state)),
  };
}

export class RawTreeMemory {
  private transport: RawTreeTransport;
  private runId: string;
  private table: string;
  private previous: State | null = null;
  private revision = 0;
  private loaded = false;
  private uncertain = false;
  private tableKnown = false;

  constructor(transport: RawTreeTransport, runId: string, table = 'continuum_checkpoints_v1') {
    // Restrict SQL interpolations; the RawTree API accepts SQL, not bound parameters.
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(runId)) throw new Error('Invalid RawTree run ID');
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(table)) throw new Error('Invalid RawTree table');
    this.transport = transport;
    this.runId = runId;
    this.table = table;
  }

  private async latest(): Promise<Checkpoint | null> {
    const rows = await this.transport.query(
      `SELECT DISTINCT schema_version, run_id, revision, checkpoint_id, recorded_at, state_json, events_json FROM ${this.table} WHERE run_id = '${this.runId}' ORDER BY revision DESC LIMIT 2`,
    );
    if (!rows.length) return null;
    const row = rows[0];
    const revision = Number(row.revision);
    if (Number(row.schema_version) !== 1 || row.run_id !== this.runId ||
        !Number.isSafeInteger(revision) || revision < 1 || typeof row.state_json !== 'string' ||
        typeof row.checkpoint_id !== 'string' || typeof row.events_json !== 'string') {
      throw new Error('Malformed RawTree checkpoint');
    }
    if (rows[1] && Number(rows[1].revision) === revision && rows[1].checkpoint_id !== row.checkpoint_id) {
      throw new Error('Conflicting checkpoint revisions: multiple writers are unsupported');
    }
    const state: unknown = JSON.parse(row.state_json);
    assertState(state);
    if (state.runId !== this.runId || makeCheckpoint(null, state, revision).checkpoint_id !== row.checkpoint_id) {
      throw new Error('Checkpoint identity or content hash mismatch');
    }
    return { ...row, revision } as unknown as Checkpoint;
  }

  async load(): Promise<State | null> {
    if (this.uncertain) throw new Error('Previous write outcome uncertain; inspect RawTree before restarting');
    this.tableKnown = this.tableKnown || await this.transport.hasTable(this.table);
    const checkpoint = this.tableKnown ? await this.latest() : null;
    if (this.loaded && (checkpoint?.revision ?? 0) < this.revision) throw new Error('RawTree returned stale state');
    this.previous = checkpoint ? JSON.parse(checkpoint.state_json) : null;
    this.revision = checkpoint?.revision ?? 0;
    this.loaded = true;
    return structuredClone(this.previous);
  }

  async save(state: State): Promise<void> {
    if (this.uncertain) throw new Error('Previous write outcome uncertain; inspect RawTree before restarting');
    if (!this.loaded) throw new Error('Load state before saving');
    assertState(state);
    if (state.runId !== this.runId) throw new Error('Run ID mismatch');
    if (this.previous) {
      if (state.goal !== this.previous.goal) throw new Error('Run goal cannot be overwritten');
      for (const old of this.previous.evidence) {
        if (JSON.stringify(state.evidence.find(e => e.id === old.id)) !== JSON.stringify(old)) {
          throw new Error('Existing evidence cannot be deleted or overwritten');
        }
      }
      for (const [index, old] of this.previous.decisions.entries()) {
        if (JSON.stringify(state.decisions[index]) !== JSON.stringify(old)) {
          throw new Error('Existing decisions cannot be deleted or overwritten');
        }
      }
      for (const old of this.previous.tasks) {
        const task = state.tasks.find(t => t.id === old.id);
        if (!task || task.claimKey !== old.claimKey || task.role !== old.role ||
            (old.status === 'completed' && task.status !== 'completed')) {
          throw new Error('Existing tasks cannot be removed, reassigned, or reopened');
        }
      }
    }
    if (JSON.stringify(state) === JSON.stringify(this.previous)) return;
    const checkpoint = makeCheckpoint(this.previous, state, this.revision + 1);
    // A timeout can occur after the server commits. Reconcile visibility, never blindly reinsert.
    this.uncertain = true;
    let insertionError: unknown;
    try { await this.transport.insert(this.table, { ...checkpoint }); }
    catch (error) { insertionError = error; }
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
      try {
        const visible = await this.latest();
        if (visible?.checkpoint_id === checkpoint.checkpoint_id) {
          this.previous = structuredClone(state);
          this.revision = checkpoint.revision;
          this.uncertain = false;
          this.tableKnown = true;
          return;
        }
      } catch { /* Keep the outcome uncertain until the exact checkpoint is visible. */ }
    }
    throw new Error('RawTree write could not be confirmed; stop and inspect before restarting', { cause: insertionError });
  }

  async history(limit = 20): Promise<Record<string, unknown>[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('History limit must be 1–100');
    if (!await this.transport.hasTable(this.table)) return [];
    return this.transport.query(
      `SELECT DISTINCT revision, checkpoint_id, recorded_at, events_json FROM ${this.table} WHERE run_id = '${this.runId}' ORDER BY revision DESC LIMIT ${limit}`,
    );
  }
}
