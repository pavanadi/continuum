import type { Decision, Evidence, State } from '../agent/types.ts';
import type { FlightEvent } from '../memory/flight.ts';
import type { MemoryEvent } from '../memory/rawtree.ts';
import { groupValues } from '../agent/normalize.ts';

/** Read-only projection over stored checkpoints and flight events. It never infers unrecorded activity. */
export interface CheckpointRow {
  revision: number;
  checkpoint_id: string;
  recorded_at: string;
  events: MemoryEvent[];
}

export type Finding = {
  kind: 'preflight_denied' | 'retry_decided' | 'retry_deferred' | 'unmatched_start' |
    'completed_without_terminal_event' | 'terminal_event_without_checkpoint' | 'unjournaled_task' | 'failed_attempt';
  taskId: string;
  eventId?: string;
  revision?: number;
  detail: string;
};

export interface TimelineEntry {
  at: string;
  source: 'checkpoint' | 'flight';
  session?: number;
  taskId?: string;
  label: string;
  ref: string;
}

export interface TaskView {
  id: string;
  role: string;
  claimKey: string;
  status: 'pending' | 'completed';
  completedAtRevision: number | null;
  attempts: number;
  lastFlightType: string | null;
}

export interface DecisionView extends Decision {
  revision: number | null;
  evidence: Pick<Evidence, 'id' | 'value' | 'sourceUrl' | 'observedAt' | 'quote'>[];
  valuesInDisagreement: string[];
}

export interface Replay {
  runId: string;
  goal: string | null;
  latestRevision: number;
  sessions: { index: number; sessionId: string; firstEventAt: string; eventCount: number }[];
  tasks: TaskView[];
  pending: string[];
  decisions: DecisionView[];
  findings: Finding[];
  revisions: { revision: number; at: string; changes: string[] }[];
  timeline: TimelineEntry[];
  truncated: { checkpoints: boolean; flight: boolean };
}

const TERMINAL = new Set(['TASK_COMPLETED', 'TASK_FAILED', 'PREFLIGHT_DENIED']);

function payload(event: FlightEvent): Record<string, unknown> {
  return JSON.parse(event.payload_json) as Record<string, unknown>;
}

function describeChange(event: MemoryEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'RUN_CREATED': return `run created: ${String(p.goal)}`;
    case 'TASK_CREATED': return `task ${String(p.id)} created (${String(p.role)})`;
    case 'TASK_COMPLETED': return `task ${String(p.id)} completed`;
    case 'EVIDENCE_RECORDED': return `evidence ${String(p.id)} = ${JSON.stringify(p.value)} from ${String(p.sourceUrl)}`;
    case 'DECISION_RECORDED': return `decision ${String(p.claimKey)} → ${String(p.status)}`;
    case 'CONTRADICTION_FOUND': return `contradiction on ${String(p.claimKey)}`;
    default: return event.type;
  }
}

function describeFlight(event: FlightEvent): string {
  const p = payload(event);
  switch (event.type) {
    case 'RUN_RESUMED': return `run resumed with ${String(p.pendingTasks)} pending task(s)`;
    case 'PREFLIGHT_DENIED': return `preflight denied (${String(p.code)}, ${String(p.stage)})`;
    case 'RETRY_DECIDED': return `retry decided after ${String(p.priorType)}`;
    case 'RETRY_DEFERRED': return `retry deferred: ${String(p.reason)} after ${String(p.priorType)}`;
    case 'TASK_FAILED': return `task failed (${String(p.errorClass)})`;
    case 'SOURCE_SEARCH_COMPLETED': return `source search returned ${String(p.count)} document(s)`;
    case 'GENERATION_COMPLETED': return `FLUX ${String(p.kind)} generated (${String(p.model)}, reported $${p.reportedCostUsd ?? '?'})`;
    case 'GENERATION_FAILED': return `FLUX ${String(p.kind)} generation failed (${String(p.errorClass)})`;
    case 'REVERIFY_PLANNED': return `re-verification planned: ${String(p.from)} → ${String(p.to)} under current rules`;
    case 'FOLLOW_UP_PLANNED': return `follow-up planned: ${String(p.researchTask)} searching "${String(p.focus)}"`;
    case 'PAGE_FETCH_COMPLETED': return `page fetched: ${String(p.url)} (${String(p.focusedChars)} focused chars)`;
    case 'PAGE_FETCH_FAILED': return `page fetch failed for ${String(p.url)} (${String(p.errorClass)}${p.continued ? '; skipped' : ''})`;
    case 'EXTRACTION_COMPLETED': return `extraction produced ${(p.evidenceIds as unknown[] | undefined)?.length ?? 0} evidence item(s)`;
    default: return event.type.toLowerCase().replaceAll('_', ' ');
  }
}

/**
 * Join checkpoint revisions (state authority) with flight events (activity authority).
 * Cross-table order uses recorded timestamps, which come from one sequential worker's clock.
 */
export function buildReplay(runId: string, state: State | null, checkpoints: CheckpointRow[],
  flight: FlightEvent[], truncated = { checkpoints: false, flight: false }): Replay {
  const revisions = [...checkpoints].sort((a, b) => a.revision - b.revision);
  const events = [...flight].sort((a, b) => a.event_id.localeCompare(b.event_id));

  const sessionIndex = new Map<string, number>();
  const sessions: Replay['sessions'] = [];
  for (const event of events) {
    if (!sessionIndex.has(event.session_id)) {
      sessionIndex.set(event.session_id, sessions.length + 1);
      sessions.push({ index: sessions.length + 1, sessionId: event.session_id, firstEventAt: event.recorded_at, eventCount: 0 });
    }
    sessions[sessionIndex.get(event.session_id)! - 1].eventCount++;
  }

  const completedAt = new Map<string, number>();
  const decisionAt = new Map<string, number[]>();
  for (const row of revisions) {
    for (const change of row.events) {
      const p = change.payload as Record<string, unknown>;
      if (change.type === 'TASK_COMPLETED') completedAt.set(String(p.id), row.revision);
      if (change.type === 'DECISION_RECORDED') {
        decisionAt.set(String(p.claimKey), [...decisionAt.get(String(p.claimKey)) ?? [], row.revision]);
      }
    }
  }

  const findings: Finding[] = [];
  const byTask = new Map<string, FlightEvent[]>();
  for (const event of events) {
    if (event.task_id) byTask.set(event.task_id, [...byTask.get(event.task_id) ?? [], event]);
    const p = payload(event);
    if (event.type === 'PREFLIGHT_DENIED') findings.push({ kind: 'preflight_denied', taskId: event.task_id,
      eventId: event.event_id, detail: `${String(p.provider)} ${String(p.stage)}: ${String(p.code)}` });
    if (event.type === 'RETRY_DECIDED') findings.push({ kind: 'retry_decided', taskId: event.task_id,
      eventId: event.event_id, detail: `retried after ${String(p.priorType)} (${String(p.priorEventId)})` });
    if (event.type === 'RETRY_DEFERRED') findings.push({ kind: 'retry_deferred', taskId: event.task_id,
      eventId: event.event_id, detail: `${String(p.reason)} after ${String(p.priorType)} (${String(p.priorEventId)})` });
    if (event.type === 'TASK_FAILED') findings.push({ kind: 'failed_attempt', taskId: event.task_id,
      eventId: event.event_id, detail: `error class ${String(p.errorClass)}` });
  }

  const tasks: TaskView[] = (state?.tasks ?? []).map(task => {
    const own = byTask.get(task.id) ?? [];
    const attempts = own.filter(e => TERMINAL.has(e.type) || e.type === 'TASK_STARTED');
    const last = attempts.at(-1) ?? null;
    const revision = completedAt.get(task.id) ?? null;
    if (!own.length && task.status === 'completed') {
      findings.push({ kind: 'unjournaled_task', taskId: task.id, revision: revision ?? undefined,
        detail: 'checkpoint shows completion but no flight events exist (may predate the journal)' });
    } else if (last?.type === 'TASK_STARTED' && task.status === 'completed') {
      findings.push({ kind: 'completed_without_terminal_event', taskId: task.id, eventId: last.event_id,
        revision: revision ?? undefined, detail: 'checkpoint committed but TASK_COMPLETED was never journaled' });
    } else if (last?.type === 'TASK_STARTED') {
      findings.push({ kind: 'unmatched_start', taskId: task.id, eventId: last.event_id,
        detail: 'started with no terminal event; provider outcome unknown, retry requires inspection' });
    } else if (last?.type === 'TASK_COMPLETED' && task.status === 'pending') {
      findings.push({ kind: 'terminal_event_without_checkpoint', taskId: task.id, eventId: last.event_id,
        detail: 'TASK_COMPLETED journaled but the latest checkpoint still shows the task pending' });
    }
    return { id: task.id, role: task.role, claimKey: task.claimKey, status: task.status,
      completedAtRevision: revision, attempts: own.filter(e => e.type === 'TASK_STARTED').length,
      lastFlightType: last?.type ?? null };
  });

  const evidence = new Map((state?.evidence ?? []).map(e => [e.id, e]));
  const seenDecision = new Map<string, number>();
  const decisions: DecisionView[] = (state?.decisions ?? []).map(decision => {
    const nth = seenDecision.get(decision.claimKey) ?? 0;
    seenDecision.set(decision.claimKey, nth + 1);
    const cited = decision.evidenceIds.map(id => evidence.get(id)!).map(e =>
      ({ id: e.id, value: e.value, sourceUrl: e.sourceUrl, observedAt: e.observedAt, quote: e.quote }));
    // Spelling variants of one value (grouped by the verifier) are not a disagreement.
    const groups = decision.groups ?? groupValues(decision.claimKey, cited.map(e => e.value));
    return { ...decision, revision: decisionAt.get(decision.claimKey)?.[nth] ?? null, evidence: cited,
      valuesInDisagreement: groups.length > 1 ? groups.map(g => g.values.join(' / ')) : [] };
  });

  // Flight order is authoritative (event IDs). A checkpoint that completed a task is placed just before
  // that task's journaled TASK_COMPLETED; other checkpoints fall back to their recorded timestamp.
  const timeline: TimelineEntry[] = events.map(event => ({ at: event.recorded_at, source: 'flight' as const,
    session: sessionIndex.get(event.session_id), taskId: event.task_id || undefined,
    label: describeFlight(event), ref: event.event_id }));
  const completionRef = new Map(events.filter(e => e.type === 'TASK_COMPLETED').map(e => [e.task_id, e.event_id]));
  for (const row of revisions) {
    const entry: TimelineEntry = { at: row.recorded_at, source: 'checkpoint',
      label: `revision ${row.revision}: ${row.events.map(describeChange).join('; ') || 'no changes'}`,
      ref: row.checkpoint_id };
    const anchor = row.events.filter(c => c.type === 'TASK_COMPLETED')
      .map(c => completionRef.get(String((c.payload as Record<string, unknown>).id))).find(Boolean);
    let index = anchor ? timeline.findIndex(e => e.ref === anchor) : -1;
    if (index < 0) {
      // Keep checkpoint order monotonic: never place a later revision before an earlier one.
      const floor = timeline.findLastIndex(e => e.source === 'checkpoint') + 1;
      index = timeline.findIndex((e, i) => i >= floor && e.source === 'flight' && e.at >= row.recorded_at);
    }
    timeline.splice(index < 0 ? timeline.length : index, 0, entry);
  }

  return {
    runId, goal: state?.goal ?? null, latestRevision: revisions.at(-1)?.revision ?? 0,
    sessions, tasks, pending: tasks.filter(t => t.status === 'pending').map(t => t.id), decisions, findings,
    revisions: revisions.map(row => ({ revision: row.revision, at: row.recorded_at, changes: row.events.map(describeChange) })),
    timeline, truncated,
  };
}

export function renderReplay(replay: Replay): string {
  const lines = [`Run ${replay.runId} — ${replay.goal ?? '(no checkpoint)'}`,
    `Latest revision ${replay.latestRevision}; ${replay.sessions.length} journaled session(s); ${replay.pending.length} pending task(s)`];
  if (replay.truncated.checkpoints || replay.truncated.flight) {
    lines.push(`WARNING: history truncated (checkpoints: ${replay.truncated.checkpoints}, flight: ${replay.truncated.flight})`);
  }
  lines.push('', 'Tasks');
  for (const t of replay.tasks) {
    lines.push(`  ${t.status === 'completed' ? '✓' : '·'} ${t.id} ${t.role} [${t.claimKey}] attempts=${t.attempts}` +
      (t.completedAtRevision ? ` completed@r${t.completedAtRevision}` : '') + (t.lastFlightType ? ` last=${t.lastFlightType}` : ''));
  }
  lines.push('', 'Decisions');
  if (!replay.decisions.length) lines.push('  (none yet)');
  for (const d of replay.decisions) {
    lines.push(`  ${d.claimKey}: ${d.status.toUpperCase()}${d.value ? ` = ${d.value}` : ''}${d.revision ? ` (r${d.revision})` : ''}`,
      `    why: ${d.reason}`);
    if (d.valuesInDisagreement.length) lines.push(`    disagreeing values: ${d.valuesInDisagreement.join(' vs ')}`);
    for (const e of d.evidence) {
      lines.push(`    - ${e.id}: ${e.value} — ${e.sourceUrl} (observed ${e.observedAt})` + (e.quote ? `\n      "${e.quote}"` : ''));
    }
  }
  lines.push('', 'Findings needing attention');
  if (!replay.findings.length) lines.push('  (none)');
  for (const f of replay.findings) lines.push(`  ! ${f.kind} ${f.taskId || '(run)'}: ${f.detail}${f.eventId ? ` [${f.eventId}]` : ''}`);
  lines.push('', 'Timeline (flight event order; checkpoints anchored to task completions, else by timestamp)');
  let session = 0;
  for (const entry of replay.timeline) {
    if (entry.session && entry.session > session) {
      if (session) lines.push('  ── restart boundary: new process session ──');
      session = entry.session;
    }
    lines.push(`  ${entry.at} ${entry.source === 'checkpoint' ? 'CKPT ' : `S${entry.session}   `}` +
      `${entry.taskId ? `${entry.taskId} ` : ''}${entry.label}`);
  }
  return lines.join('\n');
}

interface ReplaySources {
  memory: { load(): Promise<State | null>; history(limit?: number): Promise<Record<string, unknown>[]> };
  flight: { history(limit?: number, beforeEventId?: string): Promise<FlightEvent[]> };
}

/** Bounded read: the newest 100 checkpoint revisions and up to `maxFlightPages` pages of events. */
export async function loadReplay(runId: string, { memory, flight }: ReplaySources, maxFlightPages = 10): Promise<Replay> {
  const state = await memory.load();
  const rows = await memory.history(100);
  const checkpoints = rows.map(row => {
    const events: unknown = JSON.parse(String(row.events_json));
    if (!Array.isArray(events)) throw new Error('Malformed checkpoint event batch');
    return { revision: Number(row.revision), checkpoint_id: String(row.checkpoint_id),
      recorded_at: String(row.recorded_at), events: events as MemoryEvent[] };
  });
  const events: FlightEvent[] = [];
  let cursor: string | undefined;
  let flightTruncated = false;
  for (let page = 0; page < maxFlightPages; page++) {
    const batch = await flight.history(100, cursor);
    events.push(...batch);
    if (batch.length < 100) break;
    cursor = batch.at(-1)!.event_id;
    flightTruncated = page === maxFlightPages - 1;
  }
  return buildReplay(runId, state, checkpoints, events,
    { checkpoints: rows.length === 100, flight: flightTruncated });
}
