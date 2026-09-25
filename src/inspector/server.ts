import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { RawTreeHttp, type RawTreeTransport } from '../tools/rawtree.ts';
import { RawTreeMemory } from '../memory/rawtree.ts';
import { RawTreeFlight } from '../memory/flight.ts';
import { loadReplay } from '../replay/replay.ts';
import { ask, retrieve } from '../memory/ask.ts';
import { extractorFromEnv } from '../tools/liquid.ts';
import { OpenRouterBudget } from '../usage/openrouter.ts';
import { recordRawTreeUsage } from '../usage/ledger.ts';
import { buildBundle, type Bundle } from './bundle.ts';

/** Read-only local inspector: serves the UI, lists runs, builds bundles from RawTree, and answers `ask`. */
const RUN_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const tables = () => ({ checkpoints: process.env.RAWTREE_TABLE ?? 'continuum_checkpoints_v1',
  flight: process.env.RAWTREE_FLIGHT_TABLE ?? 'continuum_flight_v1' });

export async function listRuns(transport: RawTreeTransport): Promise<{ runId: string; revision: number; updated: string }[]> {
  const { checkpoints } = tables();
  if (!await transport.hasTable(checkpoints)) return [];
  // RawTree columns are Dynamic; explicit casts keep aggregates well-typed.
  const rows = await transport.query(`SELECT toString(run_id) AS run_id, max(toInt64(revision)) AS revision, ` +
    `max(toString(recorded_at)) AS updated FROM ${checkpoints} GROUP BY run_id ORDER BY updated DESC LIMIT 200`);
  return rows.filter(r => typeof r.run_id === 'string' && RUN_ID.test(r.run_id))
    .map(r => ({ runId: String(r.run_id), revision: Number(r.revision), updated: String(r.updated) }));
}

export async function runBundle(transport: RawTreeTransport, runId: string): Promise<Bundle> {
  if (!RUN_ID.test(runId)) throw new Error('Invalid run ID');
  const { checkpoints, flight } = tables();
  const memory = new RawTreeMemory(transport, runId, checkpoints);
  const journal = new RawTreeFlight(transport, runId, flight);
  const replay = await loadReplay(runId, { memory, flight: journal });
  return buildBundle(await memory.load(), replay);
}

async function answer(transport: RawTreeTransport, runId: string, question: string) {
  if (!RUN_ID.test(runId)) throw new Error('Invalid run ID');
  const { checkpoints, flight } = tables();
  const memory = new RawTreeMemory(transport, runId, checkpoints);
  const journal = new RawTreeFlight(transport, runId, flight);
  const retrieved = retrieve(question, await memory.load(), await loadReplay(runId, { memory, flight: journal }));
  const model = extractorFromEnv(process.env, journal, key =>
    new OpenRouterBudget(key, '.continuum/usage.jsonl', Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10)));
  const result = await ask(retrieved, model);
  return { question, scope: retrieved.scope, intent: retrieved.intent, packet: retrieved.packet, answer: result };
}

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of request) { text += chunk; if (text.length > 10_000) throw new Error('Request too large'); }
  const value: unknown = JSON.parse(text || '{}');
  if (typeof value !== 'object' || value === null) throw new Error('Expected a JSON object');
  return value as Record<string, unknown>;
}

export function inspectorServer(transport: RawTreeTransport, html: () => Promise<string>) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/') return send(response, 200, await html(), 'text/html; charset=utf-8');
      if (request.method === 'GET' && url.pathname === '/api/runs') return send(response, 200, await listRuns(transport));
      // Generated briefs and their media, served read-only from exports/ with a strict name check.
      const brief = url.pathname.match(/^\/briefs\/((?:media\/)?[A-Za-z0-9_.:-]+\.(html|mp4|jpg|png|webp))$/);
      if (request.method === 'GET' && brief) {
        const types: Record<string, string> = { html: 'text/html; charset=utf-8', mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        try { response.writeHead(200, { 'Content-Type': types[brief[2]], 'Cache-Control': 'no-store' }).end(await readFile(`exports/${brief[1]}`)); }
        catch { send(response, 404, { error: 'Brief not generated yet: npm run brief -- <run-id>' }); }
        return;
      }
      const run = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (request.method === 'GET' && run) return send(response, 200, await runBundle(transport, decodeURIComponent(run[1])));
      if (request.method === 'POST' && url.pathname === '/api/ask') {
        const { runId, question } = await body(request);
        if (typeof runId !== 'string' || typeof question !== 'string') return send(response, 400, { error: 'runId and question are required' });
        return send(response, 200, await answer(transport, runId, question));
      }
      send(response, 404, { error: 'Not found' });
    } catch (error) {
      // Messages are local and bounded; provider bodies are never included upstream.
      send(response, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}

// import.meta.main is unavailable on older supported Node releases.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const transport = new RawTreeHttp({ apiKey: process.env.RAWTREE_API_KEY ?? '', baseUrl: process.env.RAWTREE_BASE_URL,
    database: process.env.RAWTREE_DATABASE ?? 'default', onUsage: recordRawTreeUsage });
  const [command, runId] = process.argv.slice(2);
  if (command === 'export') {
    if (!runId) throw new Error('Usage: npm run inspector -- export <run-id>');
    const bundle = await runBundle(transport, runId);
    await mkdir('exports', { recursive: true });
    await writeFile(`exports/${runId}.json`, JSON.stringify(bundle, null, 2) + '\n');
    console.log(`Wrote exports/${runId}.json (open it in the inspector with "Open JSON")`);
  } else {
    const port = Number(process.env.INSPECTOR_PORT ?? 4700);
    const htmlPath = new URL('../../inspector/index.html', import.meta.url);
    inspectorServer(transport, () => readFile(htmlPath, 'utf8')).listen(port, '127.0.0.1', () => {
      console.log(`Continuum inspector: http://127.0.0.1:${port}  (reads RawTree; ask uses ${process.env.LIQUID_BASE_URL ? 'local Liquid' : 'OpenRouter Liquid'})`);
    });
  }
}
