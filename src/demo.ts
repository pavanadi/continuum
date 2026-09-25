import { FileMemory } from './memory/file.ts';
import { Orchestrator } from './agent/orchestrator.ts';
import { fixtureResearch } from './tools/fixture.ts';
const path = process.argv[2] ?? '.continuum/demo.json';
const steps = Number(process.argv[3] ?? 1);
if (!Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('Steps must be an integer from 1 to 100');
const runner = new Orchestrator(new FileMemory(path), fixtureResearch);
let state = await runner.start('fixture-demo', 'Investigate fictional Acme pricing', ['acme:pricing']);
for (let i = 0; i < steps && state.tasks.some(t => t.status === 'pending'); i++) state = await runner.step();
console.log(JSON.stringify({ mode: 'fixture; local file persistence', ...state,
  nextTask: state.tasks.find(t => t.status === 'pending') ?? null }, null, 2));
