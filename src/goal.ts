import { readFile } from 'node:fs/promises';

export interface GoalSpec {
  id: string;
  goal: string;
  entities: string[];
  attributes: string[];
}

export const MAX_GOAL_CLAIMS = 40;

/** A versioned goal file expands to `entity | attribute` claims; the run budget bounds its size. */
export function claimsFor(spec: GoalSpec): string[] {
  return spec.entities.flatMap(entity => spec.attributes.map(attribute => `${entity} | ${attribute}`));
}

export function assertGoal(value: unknown): asserts value is GoalSpec {
  const v = value as Record<string, unknown>;
  const names = (list: unknown) => Array.isArray(list) && list.length > 0 &&
    list.every(x => typeof x === 'string' && x.trim() && !x.includes('|') && x.length <= 100) &&
    new Set(list).size === list.length;
  if (typeof v !== 'object' || v === null || typeof v.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(v.id) ||
      typeof v.goal !== 'string' || !v.goal.trim() || !names(v.entities) || !names(v.attributes)) {
    throw new Error('Goal file needs id, goal, and unique non-empty entities and attributes without "|"');
  }
  const count = (v.entities as string[]).length * (v.attributes as string[]).length;
  if (count > MAX_GOAL_CLAIMS) throw new Error(`Goal expands to ${count} claims; the limit is ${MAX_GOAL_CLAIMS}`);
}

export async function loadGoal(path: string): Promise<GoalSpec> {
  const spec: unknown = JSON.parse(await readFile(path, 'utf8'));
  assertGoal(spec);
  return spec;
}
