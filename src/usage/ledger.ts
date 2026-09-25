import { appendFile, mkdir, readFile } from 'node:fs/promises';

export async function recordRawTreeUsage(event: Record<string, unknown>): Promise<void> {
  await mkdir('.continuum', { recursive: true });
  await appendFile('.continuum/usage.jsonl', JSON.stringify({ at: new Date().toISOString(), provider: 'rawtree',
    ...event, costUsd: null }) + '\n', { mode: 0o600 });
}

export async function dailyUsage(path = '.continuum/usage.jsonl') {
  let content: string;
  try { content = await readFile(path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    content = '';
  }
  const day = new Date().toISOString().slice(0, 10);
  const rows = content.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.at.startsWith(day) && row.mode !== 'fixture');
  const inference = rows.filter(row => row.provider === 'openrouter' && row.type === 'outcome');
  const attempts = rows.filter(row => row.provider === 'openrouter' && row.type === 'attempt').length;
  const nimbleAttempts = rows.filter(row => row.provider === 'nimble' && row.type === 'attempt').length;
  const nimbleOutcomes = rows.filter(row => row.provider === 'nimble' && row.type === 'outcome');
  return { utcDay: day,
    openrouterAttempts: attempts,
    openrouterUnfinishedAttempts: Math.max(0, attempts - inference.length),
    openrouterOutcomes: inference.length,
    openrouterReportedCostUsd: inference.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
    openrouterUnknownCostOutcomes: inference.filter(row => row.costUsd === null).length,
    rawtreeRequests: rows.filter(row => row.provider === 'rawtree' && row.type === 'attempt').length,
    rawtreeCostUsd: null,
    nimbleAttempts,
    nimbleOutcomes: nimbleOutcomes.length,
    nimbleEstimatedListCostUsd: nimbleOutcomes.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0),
    nimbleUnknownCostOutcomes: nimbleOutcomes.filter(row => row.estimatedCostUsd === null).length,
    nimbleUnfinishedAttempts: Math.max(0, nimbleAttempts - nimbleOutcomes.length),
  };
}
