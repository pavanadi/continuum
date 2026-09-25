import { preflightCode, type FlightSink } from '../memory/flight.ts';

/** Record a gate decision before any billable research call. The check must be read-only. */
export async function runPreflight(flight: FlightSink, taskId: string, model: string,
  check: () => Promise<{ localAttempts: number; localCap: number; providerFreeRemaining: number | null }>): Promise<void> {
  await flight.record('PREFLIGHT_STARTED', taskId, { provider: 'openrouter', model });
  let result: { localAttempts: number; localCap: number; providerFreeRemaining: number | null };
  try { result = await check(); }
  catch (error) {
    await flight.record('PREFLIGHT_DENIED', taskId, {
      provider: 'openrouter', model, stage: 'before_search', code: preflightCode(error),
    });
    throw error;
  }
  await flight.record('PREFLIGHT_PASSED', taskId, { provider: 'openrouter', model, ...result });
}
