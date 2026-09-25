# Hosted Liquid integration

Liquid runs through OpenRouter's HTTPS API. No local model server or model weights are required.

## Configuration

Set `OPENROUTER_API_KEY` in the project's ignored `.env` file. The separate RawTree key remains responsible for persistence. `LIQUID_MODEL=liquid/lfm-2.5-2.6b:free` is the default; requests always specify a Liquid model rather than inheriting an account default. The application does not switch to another model on failure.

On 2026-09-25, OpenRouter lists [LFM2.5-2.6B](https://openrouter.ai/liquid/lfm-2.5-2.6b:free) as a free model suited to extraction, with structured-output support. Its page states that prompts and outputs may be retained for Liquid training. The demo sends fictional source text. Availability and rate limits remain provider-controlled.

The adapter uses [OpenRouter's chat completions API](https://openrouter.ai/docs/api/reference/overview), requesting JSON Schema output. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) uses `require_parameters: true` so an endpoint that cannot honor requested parameters is excluded. A configured alternative must support those parameters too.

## Product flow

1. Researcher or Skeptic asks a `SourceProvider` for documents for the current claim.
2. `LiquidResearchProvider` passes those documents to `LiquidExtractor`.
3. Liquid returns source IDs, claim values, and exact quoted excerpts.
4. The adapter validates JSON and checks that each quote occurs in its supplied source and each value occurs in its quote. URLs and observation timestamps come from the source provider, not generated model text.
5. The orchestrator commits evidence plus task completion to RawTree. Successful evidence carries requested/returned model, request ID, prompt version, and token counts when available.
6. The existing verifier compares observations, retaining disagreements as unresolved.

The current `fixtureSources` supplies fictional Acme pages. Nimble will implement the same source-provider boundary. Live model inference and live web research are distinct: this integration provides the former once credentials are configured.

## Bounds and failure behavior

- Up to six documents, 20,000 aggregate source-text characters, eight observations, and 2,048 completion tokens per request.
- Oversized inputs are rejected without a call; text is not silently truncated.
- Each request has a 60-second timeout. The application does not automatically retry or repair malformed output.
- HTTP failures, invalid schema, unknown source IDs, invented quotes, and incomplete completions do not complete the task.
- Source text is marked as untrusted data in the prompt. Text matching does not prove factual truth, semantic relevance, source independence, or immunity to prompt injection.
- A process crash after inference but before persistence can cause a repeated call and charge on resume. Exactly-once inference is not promised.
- Empty source sets skip inference; an empty valid extraction produces no evidence and later verification reports insufficient evidence.
- Accepted evidence retains generation metadata and provider-reported cost. A separate local ledger records inference attempts and receipts even for empty or invalid completions. Missing cost is unknown, not zero. Prompt archives, durable retry policy, and distributed run budgets remain future work.

## Credit controls

`npm run credits` uses OpenRouter's [current-key API](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key) and [credits API](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits). It reads the public model catalogue to check current pricing. A denied balance request is reported as unavailable; key allowance is not substituted for account credit. No credentials are printed or stored in the ledger.

The CLI runs this check before inference, permits only verified zero-price `:free` models, and reserves a local attempt before the call. The default local cap is 10 attempts per UTC day across runs in this workspace, configured with `OPENROUTER_DAILY_REQUEST_CAP`. Use one worker at a time. This local cap does not govern requests made outside Continuum; provider-side limits remain authoritative. The library monitor is injectable, and the shipped CLI enables it by default.

The provider's free-request counter may lag; reports show both provider counts and local attempts. Changing to a paid model fails closed until an explicit paid-budget policy is implemented. RawTree's live request count is tracked separately with unknown monetary cost; no public balance endpoint was identified. Test-server traffic does not count as live usage.

## Validation

All 21 automated tests pass, covering extraction, grounding, resume, API failures, credit guards, durable attempt counts, and fixture/live usage separation. Network responses in these tests are fixtures.

Live validation on 2026-09-25 used run `continuum-liquid-1790363267591` across three CLI invocations. Researcher and Skeptic each used one hosted Liquid call; the verifier used no model call. Both source quotes passed grounding checks, persisted in RawTree, and resumed into an unresolved pricing decision.

OpenRouter reported $0 per call: 453 prompt tokens and 1,382 completion tokens total. Account credit was $0; the separate key cap was $100. The provider quota endpoint continued to report 50 remaining after the two calls, so local planning estimates 48 remaining and the default local cap allows eight more attempts today. These are observations at validation time, not permanently current balances. Sources were fictional throughout; inference and persistence were live.
