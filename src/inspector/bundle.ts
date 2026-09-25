import type { Decision, Evidence, State } from '../agent/types.ts';
import type { Replay, TaskView } from '../replay/replay.ts';
import { groupValues, namedGroups } from '../agent/normalize.ts';

/** Read-only view of one run for the inspector UI. Built from stored state and replay; never from a model. */
export interface ClaimView {
  claimKey: string;
  entity: string;
  attribute: string;
  status: Decision['status'] | 'pending';
  value: string | null;
  groups: { label: string; values: string[] }[];
  hosts: string[];
  decisions: (Decision & { revision: number | null })[];
  evidence: (Evidence & { host: string; via: string })[];
  /** Evidence IDs that voted in the latest decision; other stored items were excluded by later rules. */
  voting: string[];
  tasks: TaskView[];
}

export interface Bundle {
  schema: 'continuum-inspector-v1';
  runId: string;
  goal: string | null;
  generatedAt: string;
  latestRevision: number;
  totals: Record<ClaimView['status'], number>;
  entities: string[];
  attributes: string[];
  claims: ClaimView[];
  sessions: Replay['sessions'];
  pending: string[];
  findings: Replay['findings'];
  revisions: Replay['revisions'];
  timeline: Replay['timeline'];
  truncated: Replay['truncated'];
}

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const via = (e: Evidence) => e.retrieval?.sourceKind === 'page-extract' ? 'full page'
  : e.retrieval?.sourceKind === 'search-result' ? 'search snippet' : 'unspecified';

export function buildBundle(state: State | null, replay: Replay): Bundle {
  const claimKeys = [...new Set((state?.tasks ?? []).map(t => t.claimKey))];
  const split = (claimKey: string) => {
    const [entity, attribute] = claimKey.includes('|') ? claimKey.split('|').map(p => p.trim()) : [claimKey, 'claim'];
    return { entity, attribute };
  };
  const totals = { supported: 0, qualified: 0, unresolved: 0, insufficient: 0, pending: 0 };
  const claims = claimKeys.map(claimKey => {
    const decisions = replay.decisions.filter(d => d.claimKey === claimKey)
      .map(({ evidence: _e, valuesInDisagreement: _v, ...d }) => d);
    const latest = decisions.at(-1);
    const evidence = (state?.evidence ?? []).filter(e => e.claimKey === claimKey)
      .map(e => ({ ...e, host: host(e.sourceUrl), via: via(e) }));
    const voting = latest ? evidence.filter(e => latest.evidenceIds.includes(e.id)) : evidence;
    const groups = latest?.status === 'qualified' ? namedGroups(claimKey, groupValues(claimKey, voting.map(e => e.value)))
      : groupValues(claimKey, voting.map(e => e.value));
    const status = latest?.status ?? 'pending';
    totals[status]++;
    return { claimKey, ...split(claimKey), status, value: latest?.value ?? null,
      groups: groups.map(({ label, values }) => ({ label, values })),
      hosts: [...new Set(voting.map(e => e.host))], decisions, evidence, voting: voting.map(e => e.id),
      tasks: replay.tasks.filter(t => t.claimKey === claimKey) };
  });
  return {
    schema: 'continuum-inspector-v1', runId: replay.runId, goal: replay.goal, generatedAt: new Date().toISOString(),
    latestRevision: replay.latestRevision, totals,
    entities: [...new Set(claims.map(c => c.entity))], attributes: [...new Set(claims.map(c => c.attribute))],
    claims, sessions: replay.sessions, pending: replay.pending, findings: replay.findings,
    revisions: replay.revisions, timeline: replay.timeline, truncated: replay.truncated,
  };
}
