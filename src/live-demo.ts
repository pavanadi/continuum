import { Orchestrator } from './agent/orchestrator.ts';
import { RawTreeMemory } from './memory/rawtree.ts';
import { RawTreeFlight } from './memory/flight.ts';
import { loadReplay, renderReplay } from './replay/replay.ts';
import { ask, renderAnswer, retrieve } from './memory/ask.ts';
import { RawTreeHttp } from './tools/rawtree.ts';
import { extractorFromEnv, LiquidResearchProvider } from './tools/liquid.ts';
import { NimbleSearch, CachedSources, NimblePages, CachedPages } from './tools/nimble.ts';
import { OpenRouterBudget, getCreditStatus, enforceFreeBudget } from './usage/openrouter.ts';
import { dailyUsage, recordRawTreeUsage } from './usage/ledger.ts';
import { runPreflight } from './usage/preflight.ts';
import { claimsFor, loadGoal, type GoalSpec } from './goal.ts';
import { buildMatrix, renderMatrix } from './report/matrix.ts';

const runId = process.argv[2];
const target = process.argv[3];
const action = process.argv[4] ?? 'step';
if (!runId || !target || !['step', 'inspect', 'history', 'flight', 'replay', 'replay:json', 'report', 'report:json', 'ask', 'ask:json', 'follow-up', 'reverify'].includes(action)) {
  throw new Error('Usage: npm run demo:live -- <run-id> "<entity> | <attribute>"|<goal.json> ' +
    '[step [count]|inspect|history|flight|replay|replay:json|report|report:json|ask "<question>"|follow-up|reverify]');
}
// A goal file expands to many claims; a bare claim keeps the original single-claim run identity.
const spec: GoalSpec = target.endsWith('.json') ? await loadGoal(target) : (() => {
  const [entity, attribute] = target.split('|').map(part => part.trim());
  return { id: runId, goal: `Research ${target} with Nimble and Liquid`, entities: [entity], attributes: [attribute] };
})();
const claimKeys = target.endsWith('.json') ? claimsFor(spec) : [target];

const transport = new RawTreeHttp({
  apiKey: process.env.RAWTREE_API_KEY ?? '', baseUrl: process.env.RAWTREE_BASE_URL,
  database: process.env.RAWTREE_DATABASE ?? 'default', onUsage: recordRawTreeUsage,
});
const memory = new RawTreeMemory(transport, runId, process.env.RAWTREE_TABLE ?? 'continuum_checkpoints_v1');
const flight = new RawTreeFlight(transport, runId, process.env.RAWTREE_FLIGHT_TABLE ?? 'continuum_flight_v1');

if (action === 'replay' || action === 'replay:json') {
  const replay = await loadReplay(runId, { memory, flight });
  console.log(action === 'replay' ? renderReplay(replay) : JSON.stringify(replay, null, 2));
} else if (action === 'report' || action === 'report:json') {
  const matrix = buildMatrix(spec, await memory.load());
  console.log(action === 'report' ? renderMatrix(matrix) : JSON.stringify(matrix, null, 2));
} else if (action === 'ask' || action === 'ask:json') {
  const question = process.argv[5] ?? '';
  const retrieved = retrieve(question, await memory.load(), await loadReplay(runId, { memory, flight }));
  const model = extractorFromEnv(process.env, flight, key =>
    new OpenRouterBudget(key, '.continuum/usage.jsonl', Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10)));
  const answer = await ask(retrieved, model);
  console.log(action === 'ask' ? renderAnswer(retrieved, answer)
    : JSON.stringify({ ...retrieved, aliases: Object.fromEntries(retrieved.aliases), answer }, null, 2));
} else if (action === 'reverify') {
  // Appends new verifier decisions where current rules disagree with recorded ones. No provider call.
  const runner = new Orchestrator(memory, { async search() { throw new Error('re-verification makes no research call'); } }, flight);
  const { added } = await runner.planReverify();
  for (let i = 0; i < added.length; i++) await runner.step();
  const state = await memory.load();
  console.log(JSON.stringify({ mode: 'live', reverified: added.map(t => {
    const d = state!.decisions.findLast(x => x.claimKey === t.claimKey)!;
    return { task: t.id, claimKey: t.claimKey, status: d.status, value: d.value ?? null };
  }) }, null, 2));
} else if (action === 'follow-up') {
  // Plans follow-ups on a stored run; `step` then runs them. No provider call here.
  const planner = new Orchestrator(memory, { async search() { throw new Error('planning makes no research call'); } }, flight,
    { maxFollowUps: Number(process.env.CONTINUUM_MAX_FOLLOW_UPS ?? 3) });
  const { added } = await planner.planFollowUps();
  console.log(JSON.stringify({ mode: 'live', planned: added.map(({ id, claimKey, focus }) => ({ id, claimKey, focus })) }, null, 2));
} else if (action === 'history') {
  console.log(JSON.stringify({ mode: 'live', checkpoints: await memory.history() }, null, 2));
} else if (action === 'flight') {
  const events = await flight.history(100, process.argv[5]);
  console.log(JSON.stringify({ mode: 'live', events,
    nextCursor: events.length === 100 ? events.at(-1)!.event_id : null }, null, 2));
} else if (action === 'inspect') {
  console.log(JSON.stringify({ mode: 'live', state: await memory.load() }, null, 2));
} else {
  const steps = Number(process.argv[5] ?? 1);
  if (!Number.isInteger(steps) || steps < 1 || steps > 120) throw new Error('Step count must be an integer from 1 to 120');
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const extractor = extractorFromEnv(process.env, flight, key =>
    new OpenRouterBudget(key, '.continuum/usage.jsonl', Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10)));
  const nimble = { apiKey: process.env.NIMBLE_API_KEY ?? '',
    dailyRequestCap: Number(process.env.NIMBLE_DAILY_REQUEST_CAP ?? 4),
    dailyCostCapUsd: Number(process.env.NIMBLE_DAILY_COST_CAP_USD ?? 0.02),
  };
  const source = new CachedSources(new NimbleSearch(nimble), runId);
  // Full-page fallback when snippets carry no value; shares the Nimble caps. NIMBLE_PAGES_PER_TASK=0 disables it.
  const pages = new CachedPages(new NimblePages(nimble), runId);
  const research = new LiquidResearchProvider(source, extractor, flight, pages, Number(process.env.NIMBLE_PAGES_PER_TASK ?? 1));
  // Each follow-up round costs about one Nimble search (plus a page if snippets are empty).
  const runner = new Orchestrator(memory, research, flight, { maxFollowUps: Number(process.env.CONTINUUM_MAX_FOLLOW_UPS ?? 3) });
  let state = await runner.start(runId, spec.goal, claimKeys);
  let stepsRun = 0;
  for (; stepsRun < steps; stepsRun++) {
    const next = state.tasks.find(t => t.status === 'pending');
    if (!next) break;
    // A cheap read-only credit check avoids a billable search when no model call can follow.
    // A local model has no provider credit to check.
    if (next.role !== 'verifier' && !extractor.local) {
      await runPreflight(flight, next.id, extractor.model, async () => {
        const usage = await dailyUsage();
        const status = await getCreditStatus(openrouterKey, extractor.model);
        const cap = Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10);
        enforceFreeBudget(status, usage.openrouterAttempts, cap);
        return {
          localAttempts: usage.openrouterAttempts,
          localCap: cap,
          providerFreeRemaining: status.freeRequests?.remaining ?? null,
        };
      });
    }
    state = await runner.step();
    console.error(`step ${stepsRun + 1}: ${next.id} ${next.role} [${next.claimKey}] completed`);
  }
  console.log(JSON.stringify({ mode: 'live', stepsRun,
    completedTasks: state.tasks.filter(t => t.status === 'completed').length, totalTasks: state.tasks.length,
    nextTask: state.tasks.find(t => t.status === 'pending') ?? null,
    decisions: state.decisions.map(({ claimKey, status, value }) => ({ claimKey, status, value })) }, null, 2));
}
