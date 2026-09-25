import { Orchestrator } from './agent/orchestrator.ts';
import { RawTreeMemory } from './memory/rawtree.ts';
import { RawTreeFlight } from './memory/flight.ts';
import { loadReplay, renderReplay } from './replay/replay.ts';
import { ask, renderAnswer, retrieve } from './memory/ask.ts';
import { RawTreeHttp } from './tools/rawtree.ts';
import { extractorFromEnv, LiquidResearchProvider } from './tools/liquid.ts';
import { fixtureSources } from './tools/fixture.ts';
import { OpenRouterBudget } from './usage/openrouter.ts';
import { recordRawTreeUsage } from './usage/ledger.ts';

const runId = process.argv[2] ?? 'continuum-liquid-demo';
const action = process.argv[3] ?? 'step';
if (!['step', 'inspect', 'history', 'flight', 'replay', 'replay:json', 'ask', 'ask:json'].includes(action)) throw new Error('Use step, inspect, history, flight, replay, replay:json, or ask "<question>"');
const transport = new RawTreeHttp({
  apiKey: process.env.RAWTREE_API_KEY ?? '', baseUrl: process.env.RAWTREE_BASE_URL,
  database: process.env.RAWTREE_DATABASE ?? 'default',
  onUsage: recordRawTreeUsage,
});
const memory = new RawTreeMemory(transport, runId, process.env.RAWTREE_TABLE ?? 'continuum_checkpoints_v1');
const flight = new RawTreeFlight(transport, runId, process.env.RAWTREE_FLIGHT_TABLE ?? 'continuum_flight_v1');

if (action === 'replay' || action === 'replay:json') {
  const replay = await loadReplay(runId, { memory, flight });
  console.log(action === 'replay' ? renderReplay(replay) : JSON.stringify(replay, null, 2));
} else if (action === 'ask' || action === 'ask:json') {
  const question = process.argv[4] ?? '';
  const retrieved = retrieve(question, await memory.load(), await loadReplay(runId, { memory, flight }));
  const model = extractorFromEnv(process.env, flight, key =>
    new OpenRouterBudget(key, '.continuum/usage.jsonl', Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10)));
  const answer = await ask(retrieved, model);
  console.log(action === 'ask' ? renderAnswer(retrieved, answer)
    : JSON.stringify({ ...retrieved, aliases: Object.fromEntries(retrieved.aliases), answer }, null, 2));
} else if (action === 'history') {
  console.log(JSON.stringify({ storage: 'RawTree', sources: 'fixture', checkpoints: await memory.history() }, null, 2));
} else if (action === 'flight') {
  const events = await flight.history(100, process.argv[4]);
  console.log(JSON.stringify({ storage: 'RawTree', sources: 'fixture', events,
    nextCursor: events.length === 100 ? events.at(-1)!.event_id : null }, null, 2));
} else if (action === 'inspect') {
  console.log(JSON.stringify({ storage: 'RawTree', sources: 'fixture', state: await memory.load() }, null, 2));
} else {
  const extractor = extractorFromEnv(process.env, flight, key =>
    new OpenRouterBudget(key, '.continuum/usage.jsonl', Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10)));
  const runner = new Orchestrator(memory, new LiquidResearchProvider(fixtureSources, extractor, flight), flight);
  await runner.start(runId, 'Extract fictional Acme pricing with hosted Liquid', ['acme:pricing']);
  const state = await runner.step();
  console.log(JSON.stringify({ storage: 'RawTree', sources: 'fixture', extraction: extractor.local ? 'Liquid on a local server' : 'Liquid via OpenRouter',
    requestedModel: extractor.model, state, nextTask: state.tasks.find(t => t.status === 'pending') ?? null }, null, 2));
}
