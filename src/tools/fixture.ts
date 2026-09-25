import type { ResearchProvider, SourceProvider } from '../agent/types.ts';

const RESOLVE_QUOTE = 'Fictional Acme pricing FAQ: Basic costs $49/month billed annually or $79/month billed monthly.';

/** Deliberately fictional research; persistence may independently be live. */
export const fixtureResearch: ResearchProvider = {
  async search(claimKey, mode) {
    if (mode === 'resolve') {
      return [{ id: `${claimKey}:resolve`, claimKey, value: '$49/month billed annually', quote: RESOLVE_QUOTE,
        sourceUrl: 'https://fixture-faq.example/pricing', observedAt: '2026-09-25T00:00:00Z' }];
    }
    return [{ id: `${claimKey}:${mode}`, claimKey,
      value: mode === 'support' ? '$49/month' : '$79/month',
      sourceUrl: `https://fixture.example/${mode}`,
      observedAt: '2026-09-25T00:00:00Z' }];
  },
};

export const fixtureSources: SourceProvider = {
  async search(_claimKey, mode) {
    return [{ id: `acme-${mode}`, url: `https://fixture.example/${mode}`,
      observedAt: '2026-09-25T00:00:00Z',
      text: mode === 'resolve' ? RESOLVE_QUOTE : mode === 'support'
        ? 'Fictional Acme pricing page: The Basic subscription costs $49/month.'
        : 'Fictional Acme alternative pricing page: The Basic subscription costs $79/month.',
    }];
  },
};
