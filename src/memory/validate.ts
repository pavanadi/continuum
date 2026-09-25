import type { State } from '../agent/types.ts';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const string = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function assertState(value: unknown): asserts value is State {
  if (!object(value) || !string(value.runId) || !string(value.goal) ||
      !Array.isArray(value.tasks) || !Array.isArray(value.evidence) || !Array.isArray(value.decisions)) {
    throw new Error('Malformed state: expected runId, goal, tasks, evidence, and decisions');
  }
  for (const t of value.tasks) {
    if (!object(t) || !string(t.id) || !string(t.claimKey) ||
        !['researcher', 'skeptic', 'verifier'].includes(String(t.role)) ||
        !['pending', 'completed'].includes(String(t.status))) throw new Error('Malformed task');
  }
  const evidenceIds = new Set<string>();
  for (const e of value.evidence) {
    if (!object(e) || !['id', 'claimKey', 'value', 'sourceUrl', 'observedAt'].every(k => string(e[k])) ||
        evidenceIds.has(e.id as string)) throw new Error('Malformed or duplicate evidence');
    evidenceIds.add(e.id as string);
  }
  if (new Set(value.tasks.map(t => t.id)).size !== value.tasks.length) throw new Error('Duplicate task IDs');
  for (const d of value.decisions) {
    if (!object(d) || !string(d.claimKey) || !string(d.reason) ||
        !['supported', 'unresolved', 'insufficient', 'qualified'].includes(String(d.status)) ||
        (d.status === 'supported' && !string(d.value)) ||
        !Array.isArray(d.evidenceIds) || d.evidenceIds.some(id => !string(id) || !evidenceIds.has(id))) {
      throw new Error('Malformed decision or missing evidence reference');
    }
  }
}
