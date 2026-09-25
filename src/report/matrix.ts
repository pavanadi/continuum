import type { Decision, State } from '../agent/types.ts';
import { claimsFor, type GoalSpec } from '../goal.ts';
import { groupValues, namedGroups } from '../agent/normalize.ts';

/** Entity × attribute view of stored decisions. Reads state only; never adds a verdict. */
export interface MatrixCell {
  claimKey: string;
  status: Decision['status'] | 'pending';
  value: string | null;
  values: string[];
  evidenceCount: number;
  hosts: string[];
  /** Current normalization of the stored values; may be newer than the recorded decision. */
  groups: { label: string; values: string[] }[];
  /** Recorded as unresolved, but today's normalizer finds only spelling differences. */
  spellingOnly: boolean;
}

export interface Matrix {
  goalId: string;
  goal: string;
  attributes: string[];
  rows: { entity: string; cells: MatrixCell[] }[];
  totals: Record<MatrixCell['status'], number>;
  spellingOnly: number;
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function buildMatrix(spec: GoalSpec, state: State | null): Matrix {
  const totals = { supported: 0, qualified: 0, unresolved: 0, insufficient: 0, pending: 0 };
  const claims = new Set(claimsFor(spec));
  if (state && state.tasks.some(t => !claims.has(t.claimKey))) throw new Error('Stored run does not match this goal file');
  const rows = spec.entities.map(entity => ({ entity, cells: spec.attributes.map(attribute => {
    const claimKey = `${entity} | ${attribute}`;
    const decision = state?.decisions.findLast(d => d.claimKey === claimKey);
    // Label cells from the evidence that voted in the latest decision (re-verification may exclude items).
    const stored = (state?.evidence ?? []).filter(e => e.claimKey === claimKey);
    const evidence = decision ? stored.filter(e => decision.evidenceIds.includes(e.id)) : stored;
    const cell: MatrixCell = { claimKey, status: decision?.status ?? 'pending', value: decision?.value ?? null,
      values: [...new Set(evidence.map(e => e.value))], evidenceCount: evidence.length,
      hosts: [...new Set(evidence.map(e => host(e.sourceUrl)))],
      groups: groupValues(claimKey, evidence.map(e => e.value)), spellingOnly: false };
    cell.spellingOnly = cell.status === 'unresolved' && cell.groups.length === 1;
    totals[cell.status]++;
    return cell;
  }) }));
  const spellingOnly = rows.flatMap(r => r.cells).filter(c => c.spellingOnly).length;
  return { goalId: spec.id, goal: spec.goal, attributes: spec.attributes, rows, totals, spellingOnly };
}

const clip = (text: string, width: number) => text.length > width ? text.slice(0, width - 1) + '…' : text;

function label(cell: MatrixCell): string {
  switch (cell.status) {
    case 'supported': return `✓ ${cell.value}`;
    case 'unresolved': return cell.spellingOnly ? `≈ ${cell.groups[0].label} (recorded ⚠)` : `⚠ ${cell.groups.map(g => g.label).join(' vs ')}`;
    case 'qualified': return `◐ ${namedGroups(cell.claimKey, cell.groups).map(g => g.label).join(' / ')} (by condition)`;
    case 'insufficient': return cell.values.length ? `? ${cell.values[0]} (1 host)` : '? no evidence';
    default: return '… pending';
  }
}

export function renderMatrix(matrix: Matrix, width = 28): string {
  const entityWidth = Math.max(6, ...matrix.rows.map(r => r.entity.length));
  const line = (cells: string[]) => cells.map((c, i) => clip(c, i ? width : entityWidth)
    .padEnd(i ? width : entityWidth)).join(' │ ');
  const out = [`${matrix.goalId}: ${matrix.goal}`, '',
    line(['Model', ...matrix.attributes]),
    ['─'.repeat(entityWidth), ...matrix.attributes.map(() => '─'.repeat(width))].join('─┼─'),
    ...matrix.rows.map(row => line([row.entity, ...row.cells.map(label)])), '',
    `✓ supported ${matrix.totals.supported} · ◐ qualified ${matrix.totals.qualified} · ⚠ unresolved ${matrix.totals.unresolved} · ` +
      `? insufficient ${matrix.totals.insufficient} · … pending ${matrix.totals.pending}`,
    '✓ = two or more distinct hosts agree (not proof of truth) · ◐ = values differ by a condition one source states · ⚠ = stored values disagree · ? = fewer than two hosts',
    ...(matrix.spellingOnly ? [`≈ = recorded as unresolved before value normalization; the values differ only in spelling (${matrix.spellingOnly} cell(s)). The recorded decision is unchanged.`] : [])];
  const flagged = matrix.rows.flatMap(r => r.cells).filter(c => c.status === 'unresolved');
  if (flagged.length) {
    out.push('', 'Disagreements (run `replay` for evidence and quotes)');
    for (const c of flagged) {
      out.push(`  ${c.spellingOnly ? '≈' : '⚠'} ${c.claimKey}: ${c.groups.map(g => `${g.label} ← ${g.values.join(' / ')}`).join('  vs  ')} — hosts: ${c.hosts.join(', ')}`);
    }
  }
  return out.join('\n');
}
