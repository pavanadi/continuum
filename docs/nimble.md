# Nimble live source integration

The `NimbleSearch` provider uses `POST https://sdk.nimbleway.com/v2/search` with bearer authentication, `search_depth: "lite"`, and at most three results. These fields and the response shape come from [Nimble's Search guide](https://docs.nimbleway.com/nimble-sdk/web-tools/search). Its [depth guidance](https://docs.nimbleway.com/nimble-sdk/web-tools/search-depth) recommends lite search when snippets can answer a small question. The adapter does not fetch full pages by default.

Every source stores the result URL, a bounded text excerpt, search query, request ID, and observation time. Liquid's exact quote checks operate on the returned search text; they do not establish that the page itself still contains the quote. Source URLs are not fetched separately. The first live run was also checked against the [relevant model documentation](https://docs.liquid.ai/lfm/models/lfm25-2.6b).

The live CLI requires a claim of the form `entity | attribute`. It makes an official-documentation query for Researcher and an independent-review query for Skeptic. It drops results whose title or URL does not contain the named entity. This is a conservative text filter, not semantic entity resolution. The initial broad claim `liquid:lfm2.5_context_window` preceded this requirement and mixed model variants; its unresolved decision should not be interpreted as a factual contradiction about one model.

## Cost and quota

At validation time, Nimble's [published pricing](https://docs.nimbleway.com/nimble-sdk/admin/pricing) listed lite search at $1.10 per 1,000 inputs, or $0.0011 per successful search. Two live search attempts succeeded: public list-price estimate **$0.0022**. Actual account-specific billing and remaining balance could not be read through a documented API, so both remain unknown. The [account guide](https://docs.nimbleway.com/nimble-sdk/admin/account-management) points to the dashboard's Billing section for account data.

The CLI reserves an attempt in `.continuum/usage.jsonl` before each Nimble request. Default local caps are four search attempts and $0.02 of list-price estimate per UTC day. Failed HTTP requests record zero estimated bill per the published successful-request rule; ambiguous timeouts keep cost unknown. Search results are cached by run, claim, and role to avoid a second Nimble call if Liquid later fails. Limits apply to one workspace and are not an account-wide quota.

The live integration run `continuum-web-1790363697511` used two Nimble searches, two free Liquid calls with $0 reported model cost, and a final deterministic verification step. It stored three quoted search observations and an unresolved decision in RawTree. Follow-up model-specific filtering was verified with fixture tests; no additional paid search was used for that check.
