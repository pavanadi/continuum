import { Orchestrator } from './agent/orchestrator.ts';
import { RawTreeMemory } from './memory/rawtree.ts';
import { RawTreeFlight } from './memory/flight.ts';
import { loadReplay, renderReplay } from './replay/replay.ts';
import { RawTreeHttp } from './tools/rawtree.ts';
import { fixtureResearch } from './tools/fixture.ts';
import { recordRawTreeUsage } from './usage/ledger.ts';

const runId = process.argv[2] ?? 'continuum-fixture-demo';
const action = process.argv[3] ?? 'step';
if (!['step', 'inspect', 'history', 'flight', 'replay', 'replay:json'].includes(action)) throw new Error('Use step, inspect, history, flight, replay, or replay:json');
const transport = new RawTreeHttp({
  apiKey: process.env.RAWTREE_API_KEY ?? '',
  baseUrl: process.env.RAWTREE_BASE_URL,
  database: process.env.RAWTREE_DATABASE ?? 'default',
  onUsage: recordRawTreeUsage,
});
const memory = new RawTreeMemory(transport, runId, process.env.RAWTREE_TABLE ?? 'continuum_checkpoints_v1');
const flight = new RawTreeFlight(transport, runId, process.env.RAWTREE_FLIGHT_TABLE ?? 'continuum_flight_v1');
if (action === 'replay' || action === 'replay:json') {
  const replay = await loadReplay(runId, { memory, flight });
  console.log(action === 'replay' ? renderReplay(replay) : JSON.stringify(replay, null, 2));
} else if (action === 'history') {
  const checkpoints = await memory.history();
  console.log(JSON.stringify({ storage: 'RawTree', research: 'fixture', checkpoints }, null, 2));
} else if (action === 'flight') {
  const events = await flight.history(100, process.argv[4]);
  console.log(JSON.stringify({ storage: 'RawTree', research: 'fixture', events,
    nextCursor: events.length === 100 ? events.at(-1)!.event_id : null }, null, 2));
} else {
  const runner = new Orchestrator(memory, fixtureResearch, action === 'step' ? flight : undefined);
  if (action === 'step') await runner.start(runId, 'Investigate fictional Acme pricing', ['acme:pricing']);
  const state = action === 'step' ? await runner.step() : await memory.load();
  console.log(JSON.stringify({ storage: 'RawTree', research: 'fixture', state,
    nextTask: state?.tasks.find(t => t.status === 'pending') ?? null }, null, 2));
}
