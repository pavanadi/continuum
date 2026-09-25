import { getCreditStatus } from './usage/openrouter.ts';
import { DEFAULT_LIQUID_MODEL } from './tools/liquid.ts';
import { dailyUsage } from './usage/ledger.ts';

const status = await getCreditStatus(process.env.OPENROUTER_API_KEY ?? '', process.env.LIQUID_MODEL || DEFAULT_LIQUID_MODEL);
const localUsage = await dailyUsage();
const cap = Number(process.env.OPENROUTER_DAILY_REQUEST_CAP ?? 10);
console.log(JSON.stringify({ openrouter: status, localUsage,
  planning: {
    localDailyCap: cap,
    localRequestsRemaining: Math.max(0, cap - localUsage.openrouterAttempts),
    freeRequestsRemainingEstimate: status.freeRequests
      ? Math.max(0, Math.min(status.freeRequests.remaining, status.freeRequests.limit - localUsage.openrouterAttempts)) : null,
    note: 'Provider counters may lag; estimates also account for local attempts. Other clients are outside this ledger.',
  },
  rawtree: { balance: 'unknown', note: 'No credit-balance endpoint identified in the public API; request counts are not monetary costs.' },
  nimble: { balance: 'unknown',
    localDailyRequestCap: Number(process.env.NIMBLE_DAILY_REQUEST_CAP ?? 4),
    localDailyListPriceEstimateCapUsd: Number(process.env.NIMBLE_DAILY_COST_CAP_USD ?? 0.02),
    listPriceEstimatePerLiteSearchUsd: 0.0011,
    note: 'Balance is available in the Nimble dashboard; no balance API was identified. Estimates may differ from account-specific rates.' },
  flux: { balance: 'unknown', note: 'Not integrated yet' },
}, null, 2));
