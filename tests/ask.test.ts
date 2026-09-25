import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask, retrieve, selectClaims, verify, renderAnswer } from '../src/memory/ask.ts';
import { buildReplay } from '../src/replay/replay.ts';
import { LiquidExtractor } from '../src/tools/liquid.ts';
import type { FlightEvent } from '../src/memory/flight.ts';
import type { State } from '../src/agent/types.ts';

const claims = ['Qwen3-4B | context length', 'Gemma-3-4B | context length', 'Gemma-3-4B | license'];
const state: State = { runId: 'ask-run', goal: 'Compare models', tasks: claims.flatMap((claimKey, i) =>
  (['researcher', 'skeptic', 'verifier'] as const).map(role => ({ id: `${i}:${role}`, role, claimKey, status: 'completed' as const }))),
  evidence: [
    { id: 'e-apx', claimKey: claims[0], value: '131K tokens', sourceUrl: 'https://apxml.com/q', observedAt: '2026-09-25T00:00:00Z', quote: 'Context: 131K tokens' },
    { id: 'e-dev', claimKey: claims[0], value: '32k-token context length', sourceUrl: 'https://dev.co/q', observedAt: '2026-09-25T00:00:00Z', quote: 'with support for 32k-token context length' },
  ],
  decisions: [{ claimKey: claims[0], status: 'unresolved', evidenceIds: ['e-apx', 'e-dev'], reason: 'Stored observations disagree.' }] };
const event = (n: number, type: FlightEvent['type'], task: string, payload = {}): FlightEvent => ({ schema_version: 1,
  event_id: `${String(1790000000000 + n).padStart(13, '0')}-00000-00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  run_id: 'ask-run', session_id: n < 3 ? 's1' : 's2', task_id: task, recorded_at: new Date(1790000000000 + n).toISOString(),
  type, payload_json: JSON.stringify(payload) });
const events = [event(1, 'TASK_STARTED', '0:researcher'), event(2, 'TASK_FAILED', '0:researcher', { errorClass: 'Error' }),
  event(3, 'RETRY_DECIDED', '0:researcher', { priorType: 'TASK_FAILED' }), event(4, 'TASK_STARTED', '0:researcher'),
  event(5, 'TASK_COMPLETED', '0:researcher')];
const replay = buildReplay('ask-run', state, [], events);

test('claim selection matches model names and attributes deterministically, else falls back to all claims', () => {
  assert.deepEqual(selectClaims('Why is the Qwen3-4B context length unresolved?', claims), { claims: [claims[0]], scope: 'matched' });
  assert.deepEqual(selectClaims('What license does Gemma use?', claims).claims, [claims[2]]);
  assert.deepEqual(selectClaims('What happened overall?', claims), { claims, scope: 'all' });
});

test('fact questions carry evidence; process questions carry code-computed task outcomes instead', () => {
  const facts = retrieve('Why is Qwen3-4B unresolved?', state, replay);
  assert.equal(facts.intent, 'facts');
  assert.deepEqual(facts.packet.claims[0].evidence.map(e => e.alias), ['E1', 'E2']);
  assert.equal(facts.packet.tasks.length, 0);
  const process = retrieve('What failed and was it retried?', state, replay);
  assert.equal(process.intent, 'process');
  assert.equal(process.packet.claims.every(c => c.evidence.length === 0), true);
  assert.match(process.packet.tasks[0].outcome, /completed.*2 attempt\(s\); 1 failed attempt\(s\); retried 1 time\(s\) after failure/);
});

test('verification rejects unknown aliases, uncited claims, and numbers absent from memory', () => {
  const r = retrieve('Why is Qwen3-4B unresolved?', state, replay);
  assert.deepEqual(verify('Sources disagree: 131K [E1] vs 32k [E2] [D1].', ['E1'], r), []);
  assert.deepEqual(verify('Cited as "[E1] - 1" and bare E2.', ['[E1] - 1'], r), []);
  assert.match(verify('It is 128K [E9].', [], r).join(), /not in the retrieved memory: E9/);
  assert.match(verify('It is 128,000 tokens [E1].', [], r).join(), /numbers not found.*128,000/);
  assert.match(verify('The sources disagree.', [], r).join(), /without citing/);
  assert.deepEqual(verify('Not recorded in memory.', [], r), []);
  assert.match(verify('See https://huggingface.co/Qwen/Qwen3-4B-Base/blob/main/LICENSE [E1].', [], r).join(), /URLs not in stored records/);
  assert.deepEqual(verify('Source https://apxml.com/q says 131K [E1].', [], r), []);
  assert.match(verify('At 22:01:43 it failed [E1].', [], r).join(), /times not in stored records: 22:01:43/);
});

test('ask sends only the packet to the model and withholds a rejected answer', async () => {
  const reply = (answer: string, citations: string[]) => new LiquidExtractor({ apiKey: '', baseUrl: 'http://127.0.0.1:4625/v1',
    model: 'LFM2.5-test', fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.response_format.json_schema.name, 'memory_answer');
      assert.deepEqual(Object.keys(JSON.parse(body.messages[1].content)), ['question', 'memory']);
      return Response.json({ id: 'a', model: 'LFM2.5-test',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answer, citations }) } }] });
    } });
  const r = retrieve('Why is Qwen3-4B unresolved?', state, replay);
  const good = await ask(r, reply('Two sources say 131K [E1]; dev.co says 32k [E2].', ['E1', 'E2']));
  assert.equal(good.status, 'verified');
  assert.deepEqual(good.citations.map(c => c.id), ['e-apx', 'e-dev']);
  const bad = await ask(r, reply('The official answer is 256K [E1].', ['E1']));
  assert.equal(bad.status, 'rejected');
  const text = renderAnswer(r, bad);
  assert.match(text, /REJECTED: states numbers not found in stored records: 256K/);
  assert.doesNotMatch(text, /official answer is 256K/);
  assert.match(text, /\[E2\] 32k-token context length — https:\/\/dev\.co\/q/);
});

test('broad process questions retrieve the claims where failures happened and carry run-wide finding counts', () => {
  const many = Array.from({ length: 10 }, (_, i) => `M${i} | license`);
  const wide: State = { runId: 'ask-run', goal: 'g', evidence: [], decisions: many.map(claimKey => ({ claimKey, status: 'supported' as const, value: 'MIT', evidenceIds: [], reason: 'r' })),
    tasks: many.flatMap((claimKey, i) => (['researcher', 'skeptic', 'verifier'] as const).map(role => ({ id: `${i}:${role}`, role, claimKey, status: 'completed' as const }))) };
  // The failure happens on the last claim, which a status-ordered top-8 selection would drop.
  wide.decisions[9].status = 'insufficient'; delete wide.decisions[9].value;
  const failing = [event(1, 'TASK_STARTED', '9:skeptic'), event(2, 'TASK_FAILED', '9:skeptic', { errorClass: 'Error' }),
    event(3, 'RETRY_DECIDED', '9:skeptic', { priorType: 'TASK_FAILED' }), event(4, 'TASK_STARTED', '9:skeptic'), event(5, 'TASK_COMPLETED', '9:skeptic')];
  const r = retrieve('What failed during this run, and was it retried?', wide, buildReplay('ask-run', wide, [], failing));
  assert.equal(r.packet.claims[0].claim, 'M9 | license');
  assert.equal(r.packet.run.findings.failed_attempt, 1);
  assert.equal(r.packet.run.findings.retry_decided, 1);
  assert.equal(r.packet.tasks[0].task, '9:skeptic', 'failures are presented first');
  assert.match(r.packet.tasks[0].outcome, /1 failed attempt\(s\); retried 1 time\(s\) after failure/);
  assert.equal(r.packet.tasks[0].alias, 'T1');
});

test('attribution check rejects a time or citation assigned to the wrong model', () => {
  const multi: State = { runId: 'ask-run', goal: 'g', evidence: [], decisions: [],
    tasks: [{ id: '0:skeptic', role: 'skeptic', claimKey: 'Phi-4-mini | license', status: 'completed' },
      { id: '1:skeptic', role: 'skeptic', claimKey: 'Gemma-3-4B | context length', status: 'completed' }] };
  const evs = [event(1, 'TASK_STARTED', '0:skeptic'), event(2, 'TASK_FAILED', '0:skeptic', { errorClass: 'Error' }),
    event(3, 'RETRY_DECIDED', '0:skeptic', { priorType: 'TASK_FAILED' })];
  const r = retrieve('What failed, and was it retried?', multi, buildReplay('ask-run', multi, [], evs));
  const failed = r.packet.events.find(e => /task failed/.test(e.what))!;
  const time = failed.at.slice(11, 23);
  assert.deepEqual(verify(`Phi-4-mini's license task failed at ${time} [${failed.alias}].`, [], r), []);
  assert.match(verify(`Gemma-3-4B's context length failed at ${time}.`, [], r).join(), /attributes .* to Gemma-3-4B but the stored record belongs to Phi-4-mini/);
  assert.match(verify(`Gemma-3-4B failed [${failed.alias}].`, [], r).join(), /belongs to Phi-4-mini/);
});
