import { Researcher, Skeptic, Verifier } from './roles.ts';
import type { State, ResearchProvider, Task } from './types.ts';
import { admittedGroups, followUpFocus } from './normalize.ts';
import type { FlightSink } from '../memory/flight.ts';

export interface Memory {
  load(): Promise<State | null>;
  save(state: State): Promise<void>;
}

export interface OrchestratorOptions {
  /** Follow-up rounds allowed per run for real disagreements (each costs searches). Default 0. */
  maxFollowUps?: number;
}

/** Sequential fixture runtime. Completed tasks and their outcomes commit together. */
export class Orchestrator {
  private memory: Memory;
  private provider: ResearchProvider;
  private flight?: FlightSink;
  private maxFollowUps: number;
  constructor(memory: Memory, provider: ResearchProvider, flight?: FlightSink, options: OrchestratorOptions = {}) {
    const max = options.maxFollowUps ?? 0;
    if (!Number.isInteger(max) || max < 0 || max > 40) throw new Error('maxFollowUps must be an integer from 0 to 40');
    this.memory = memory;
    this.provider = provider;
    this.flight = flight;
    this.maxFollowUps = max;
  }

  /**
   * One follow-up round per claim whose stored evidence still disagrees after normalization: a focused
   * research task naming the disagreeing values, then a re-verification over all evidence for the claim.
   */
  private addFollowUps(state: State, claimKeys: string[]): Task[] {
    const added: Task[] = [];
    let used = state.tasks.filter(t => t.followUp && t.role === 'researcher').length;
    for (const claimKey of claimKeys) {
      if (used >= this.maxFollowUps) break;
      if (state.tasks.some(t => t.followUp && t.claimKey === claimKey)) continue;
      if (state.decisions.findLast(d => d.claimKey === claimKey)?.status !== 'unresolved') continue;
      const groups = admittedGroups(claimKey, state.evidence.filter(e => e.claimKey === claimKey));
      if (groups.length < 2) continue;
      const prefix = state.tasks.find(t => t.claimKey === claimKey)!.id.split(':')[0];
      added.push(
        { id: `${prefix}:followup-researcher`, role: 'researcher', claimKey, status: 'pending', followUp: true,
          focus: followUpFocus(claimKey, groups) },
        { id: `${prefix}:followup-verifier`, role: 'verifier', claimKey, status: 'pending', followUp: true });
      used++;
    }
    state.tasks.push(...added);
    return added;
  }

  private async journalFollowUps(added: Task[]): Promise<void> {
    for (const task of added.filter(t => t.role === 'researcher')) {
      await this.flight?.record('FOLLOW_UP_PLANNED', task.id, { claimKey: task.claimKey, focus: task.focus,
        researchTask: task.id, verifyTask: task.id.replace('researcher', 'verifier') });
    }
  }

  /**
   * Re-verification after rule changes: where today's Verifier would decide a claim differently from its latest
   * recorded decision, queue a verifier task so a new decision is appended. Nothing is rewritten; no provider call.
   */
  async planReverify(): Promise<{ state: State; added: Task[] }> {
    const state = await this.memory.load();
    if (!state) throw new Error('Start a run first');
    const added: Task[] = [];
    const planned: { task: Task; from: string; to: string }[] = [];
    for (const claimKey of [...new Set(state.tasks.map(t => t.claimKey))]) {
      if (state.tasks.some(t => t.claimKey === claimKey && t.status === 'pending')) continue;
      const latest = state.decisions.findLast(d => d.claimKey === claimKey);
      if (!latest) continue;
      const now = new Verifier().run({ id: 'check', role: 'verifier', claimKey, status: 'pending' }, state.evidence);
      const labels = (d: typeof latest) => JSON.stringify((d.groups ?? []).map(g => g.label));
      // Which evidence votes matters too: an excluded identifier changes what a cell displays even if the status holds.
      const ids = (d: typeof latest) => JSON.stringify([...d.evidenceIds].sort());
      if (now.status === latest.status && now.value === latest.value && labels(now) === labels(latest) && ids(now) === ids(latest)) continue;
      const prefix = state.tasks.find(t => t.claimKey === claimKey)!.id.split(':')[0];
      const n = state.tasks.filter(t => t.id.startsWith(`${prefix}:reverify-`)).length + 1;
      const task: Task = { id: `${prefix}:reverify-${n}`, role: 'verifier', claimKey, status: 'pending', followUp: true };
      added.push(task);
      planned.push({ task, from: `${latest.status}${latest.value ? ' ' + latest.value : ''}`, to: `${now.status}${now.value ? ' ' + now.value : ''}` });
    }
    if (added.length) {
      state.tasks.push(...added);
      await this.memory.save(state);
      for (const p of planned) await this.flight?.record('REVERIFY_PLANNED', p.task.id, { claimKey: p.task.claimKey, from: p.from, to: p.to });
    }
    return { state, added };
  }

  /** Plan follow-ups on a stored run (for example one completed before follow-ups existed). No provider call. */
  async planFollowUps(): Promise<{ state: State; added: Task[] }> {
    const state = await this.memory.load();
    if (!state) throw new Error('Start a run first');
    const added = this.addFollowUps(state, [...new Set(state.tasks.map(t => t.claimKey))]);
    if (added.length) {
      await this.memory.save(state);
      await this.journalFollowUps(added);
    }
    return { state, added };
  }

  async start(runId: string, goal: string, claimKeys: string[]): Promise<State> {
    if (!runId.trim() || !goal.trim() || !claimKeys.length || claimKeys.some(k => !k.trim())) {
      throw new Error('A run ID, goal, and at least one claim key are required');
    }
    const previous = await this.memory.load();
    if (previous) {
      if (previous.runId !== runId || previous.goal !== goal ||
          JSON.stringify([...new Set(previous.tasks.map(t => t.claimKey))]) !== JSON.stringify([...new Set(claimKeys)])) {
        throw new Error('Stored run differs from requested run; choose a different state file');
      }
      const pendingTasks = previous.tasks.filter(t => t.status === 'pending').length;
      if (pendingTasks) await this.flight?.record('RUN_RESUMED', '', { pendingTasks });
      return previous;
    }
    const state: State = {
      runId, goal, evidence: [], decisions: [],
      tasks: [...new Set(claimKeys)].flatMap((claimKey, i) =>
        (['researcher', 'skeptic', 'verifier'] as const).map(role => ({
          id: `${i}:${role}`, role, claimKey, status: 'pending' as const,
        }))),
    };
    await this.memory.save(state);
    return state;
  }

  async step(): Promise<State> {
    const state = await this.memory.load();
    if (!state) throw new Error('Start a run first');
    const task = state.tasks.find(t => t.status === 'pending');
    if (!task) return state;
    const prior = await this.flight?.latestAttempt?.(task.id);
    if (prior?.type === 'TASK_STARTED' || prior?.type === 'TASK_COMPLETED') {
      await this.flight?.record('RETRY_DEFERRED', task.id, {
        priorEventId: prior.event_id, priorType: prior.type, reason: 'attempt_outcome_unknown',
      });
      throw new Error(`Task ${task.id} has an unconfirmed earlier attempt; inspect flight history before retrying`);
    }
    if (prior?.type === 'TASK_FAILED' || prior?.type === 'PREFLIGHT_DENIED') {
      await this.flight?.record('RETRY_DECIDED', task.id, {
        priorEventId: prior.event_id, priorType: prior.type, reason: 'previous_attempt_terminated',
      });
    }
    await this.flight?.record('TASK_STARTED', task.id, { role: task.role, claimKey: task.claimKey });
    let followUps: Task[] = [];
    let skipped = false;
    // Each role receives only the current claim, never the complete run history.
    try {
      if (task.role === 'verifier') {
        const relevant = state.evidence.filter(e => e.claimKey === task.claimKey);
        state.decisions.push(new Verifier().run(task, relevant));
        // Planned in the same checkpoint as the decision that motivates them.
        if (!task.followUp) followUps = this.addFollowUps(state, [task.claimKey]);
      } else {
        const role = task.role === 'researcher' ? new Researcher() : new Skeptic();
        // A follow-up whose disagreement no longer holds under current rules skips its (paid) search.
        skipped = Boolean(task.followUp) && admittedGroups(task.claimKey, state.evidence.filter(e => e.claimKey === task.claimKey)).length < 2;
        const evidence = skipped ? [] : await role.run(task, this.provider);
        for (const item of evidence) {
          const existing = state.evidence.find(e => e.id === item.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
            throw new Error(`Evidence ID collision: ${item.id}`);
          }
          if (!existing) state.evidence.push(item);
        }
      }
      task.status = 'completed';
      await this.memory.save(state);
    } catch (error) {
      await this.flight?.record('TASK_FAILED', task.id, { errorClass: error instanceof Error ? error.name : 'unknown' });
      throw error;
    }
    await this.flight?.record('TASK_COMPLETED', task.id, {
      role: task.role, evidenceCount: state.evidence.filter(e => e.claimKey === task.claimKey).length,
      ...(skipped ? { skipped: 'disagreement_resolved_by_current_rules' } : {}),
      decision: state.decisions.findLast(d => d.claimKey === task.claimKey)?.status ?? null,
    });
    await this.journalFollowUps(followUps);
    return state;
  }
}
