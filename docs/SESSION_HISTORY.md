# Continuum development session history

This is the append-only record of **coding work and decisions** for handoff between Codex, Claude, Copilot, or another assistant. It is separate from the product's RawTree flight recorder. Read the latest state in [CURRENT_HANDOFF.md](CURRENT_HANDOFF.md), then use this log for the rationale. Entries before this logging convention were reconstructed from repository documentation and the known working session; they are not a complete transcript. Exact times, unrecorded failed calls, and unlogged reasoning cannot be recovered.

## 2026-09-25 — Retrospective: product scope and starter architecture

- **Activity:** Built a TypeScript/Node starter for Continuum from `continuum_hackathon_handoff.md`. Implemented sequential Orchestrator, Researcher, Skeptic, and Verifier roles, a local fixture memory adapter, and restart tests.
- **Decision:** Keep orchestration and verification deterministic while using hosted Liquid for bounded extraction. Caller supplies claim keys; automatic goal decomposition is not implemented.
- **Evidence:** `src/agent/`, `src/memory/file.ts`, `tests/agents.test.ts`, and the root `README.md`.
- **Credit impact:** Fixture runs use no provider credits.

## 2026-09-25 — Retrospective: RawTree persistence

- **Activity:** Added append-only state checkpoints in `continuum_checkpoints_v1`, each with a state snapshot and event batch. Validated credentialed HTTP restart across separate processes and historical revision queries.
- **Decision:** One sequential writer per run. Ambiguous writes stop for reconciliation instead of blind retry. The latest snapshot restores state; historical revisions remain queryable.
- **Evidence:** `src/memory/rawtree.ts`, `src/tools/rawtree.ts`, `tests/rawtree.test.ts`, and `docs/rawtree.md`. A live run is documented there.
- **Limit:** Checkpoint event batches cover successful state changes, not every tool attempt, failure, or session resume. This is not yet the full product flight recorder. Earlier RawTree requests before the local ledger began cannot be reconstructed.
- **Credit impact:** RawTree request counts are tracked locally from ledger introduction; monetary balance/cost is unknown.

## 2026-09-25 — Retrospective: hosted Liquid through OpenRouter

- **Activity:** Switched from local inference to OpenRouter's hosted Liquid model; added quote grounding, bounded structured extraction, credit preflight, free-model guard, and a local attempt/cost ledger.
- **Decision:** Default to `liquid/lfm-2.5-2.6b:free`; no automatic paid fallback or retry. A failed attempt still counts toward the local daily request cap.
- **Evidence:** `src/tools/liquid.ts`, `src/usage/`, `tests/liquid.test.ts`, and `docs/liquid.md`.
- **Credit impact:** The documented initial live Liquid run used two calls with provider-reported $0. Later live research used two more free calls. Those observations are historical, not a current balance.

## 2026-09-25 — Retrospective: Nimble live search

- **Activity:** Integrated two live Nimble lite searches with cached snippets and two Liquid extractions across separate process invocations. Added a local cap of four search attempts and $0.02 list-price estimate per UTC day.
- **Decision:** Require `entity | attribute` and filter source title/URL by the named entity after an initial broad model-family query mixed variants. Require distinct source hosts for verifier support.
- **Evidence:** `src/tools/nimble.ts`, `src/live-demo.ts`, `tests/nimble.test.ts`, and `docs/nimble.md`.
- **Limit:** The original broad LFM2.5 result remained unresolved; it is not evidence of a factual model-specific contradiction. Search snippets are not full-page verification.
- **Credit impact:** Two documented successful Nimble searches had a public list-price estimate of $0.0022 total. Actual account billing and remaining balance are unknown. No additional paid search was used for the filtering tests.

## 2026-09-25 — Cross-agent continuity added

- **Activity:** Added this append-only development log, a current handoff, and tool-specific entry points for Claude and Copilot. Added shared handoff rules in `AGENTS.md`.
- **Decision:** Coding-agent continuity lives in versionable repository documents. Product run events remain a separate RawTree implementation task. Record critical changes and decisions at the time they occur; use clearly marked retrospective entries for earlier work.
- **Evidence:** `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/CURRENT_HANDOFF.md`, and this file.
- **Credit impact:** Documentation work made no provider calls.
- **Next:** Complete the product flight recorder for tool starts/results/failures, retries, and session resumes; then add full replay/inspector retrieval without repeating paid Nimble searches.

## 2026-09-25 — Cross-agent handoff verification

- **Activity:** Checked that all handoff entry points and links exist; ran the automated suite after the documentation changes.
- **Evidence:** `npm test` passed 25/25 tests. No product code changed in this session.
- **Credit impact:** Tests used fixtures; no live Nimble, OpenRouter inference, or RawTree calls were made for this check.
- **Limit:** Instructions and files cannot automatically capture another assistant's private chat or actions outside this workspace. Each coding assistant must append critical updates during its session.

## 2026-09-25 — Product flight journal, first implementation

- **Activity:** Added `src/memory/flight.ts`, a separate append-only RawTree event table (`continuum_flight_v1`) with run, session, task, and event IDs; deterministic order for one sequential writer; exact-ID acknowledgment reconciliation; and cursor-based history. Integrated task lifecycle events into the orchestrator and source-search/extraction lifecycle events into the hosted Liquid provider. Exposed a pageable `flight` CLI action in RawTree fixture and live demos.
- **Decision:** Preserve checkpoint snapshots as the resumable state authority. Store bounded operational metadata in the flight table and keep provider bodies and credentials out. Unconfirmed event writes stop execution instead of automatic reinsertion.
- **Evidence:** `src/memory/flight.ts`, `src/agent/orchestrator.ts`, `src/tools/liquid.ts`, `src/rawtree-demo.ts`, `src/live-demo.ts`, `tests/flight.test.ts`, and the fixture HTTP integration in `tests/rawtree.test.ts`. `npm test` passed 28/28 tests, including failed-task resume, lost acknowledgment, event paging, and sanitized provider-error coverage.
- **Credit impact:** Fixture tests only; no live Nimble, OpenRouter inference, or RawTree requests were made in this implementation session. Live RawTree validation of the new table remains outstanding, with monetary cost unknown.
- **Limit / next:** Earlier product runs were not backfilled. Provider preflight denials, explicit retry decisions, crash gaps, and a joined replay/inspector remain. Complete those before claiming an entire product flight history.

## 2026-09-25 — Local usage reconciliation

- **Activity:** Read the existing local usage ledger without making a provider request. It reports 5 OpenRouter attempts, 3 Nimble attempts, and 46 RawTree HTTP requests for the UTC day.
- **Decision:** Use these ledger figures for current local planning; keep older run-specific counts as historical observations. The Nimble list-price estimate is $0.0033 across the three recorded outcomes, and OpenRouter reports $0 cost across five outcomes.
- **Limit:** Ledger counts do not reveal account-wide activity, Nimble balance, custom billing, or RawTree monetary cost. No additional live RawTree validation was run for the flight table in this session.

## 2026-09-25 — Tracked hackathon plan created

- **Activity:** Added `docs/NEXT_STEPS.md` with status checkboxes, acceptance scope, a demo-critical work order, and the latest known validation/usage snapshot. Linked it from the README, current handoff, and the shared Codex/Claude/Copilot instructions.
- **Decision:** Mark a capability complete only at its verified scope: the RawTree checkpoint and live research slices are validated, while the full flight recorder, replay inspector, contradiction follow-ups, and FLUX output remain open. Prioritize replay and recovery over visual polish.
- **Evidence:** `docs/NEXT_STEPS.md` cross-checks the original handoff against code, prior integration notes, and the 28 passing fixture tests. Documentation-only update; no provider requests or new tests were needed.
- **Next:** Implement the missing preflight/failure/retry flight events, then join events with checkpoints for replay.

## 2026-09-25 — Preflight and retry-decision flight coverage

- **Activity:** Added `PREFLIGHT_STARTED/PASSED/DENIED` events around the live OpenRouter credit gate before Nimble search. The internal inference guard also journals denial. Added a last-attempt query and `RETRY_DECIDED/RETRY_DEFERRED` events: a recorded terminal failure can retry on a later invocation; an unmatched start stops before another provider call.
- **Decision:** Treat a pending task with an unclosed prior start as ambiguous, even if the checkpoint is pending. A provider may have completed a billable call before the process stopped. Record a safe denial code instead of upstream error text.
- **Evidence:** `src/memory/flight.ts`, `src/usage/preflight.ts`, `src/agent/orchestrator.ts`, `src/tools/liquid.ts`, `src/live-demo.ts`, `src/liquid-demo.ts`, `tests/flight.test.ts`, and the fixture HTTP server in `tests/rawtree.test.ts`. `npm test` passed 30/30 tests.
- **Credit impact:** Fixture tests only; no live Nimble, OpenRouter inference, or RawTree requests were made.
- **Limit / next:** Receipt/cost correlation and operator reconciliation of ambiguous outcomes remain. The new flight table has not yet been validated against live RawTree. Build the joined replay inspector next.

## 2026-09-25 — Coding-agent brief synchronization

- **Activity:** Confirmed `CLAUDE.md` and `.github/copilot-instructions.md` both direct assistants to the shared rules, current handoff, tracked plan, and append-only history. Updated all four files in `docs/agents/` so their current assignments reflect the implemented starter and do not send another assistant back to the historical first milestone.
- **Decision:** Keep the longer agent briefs as target specifications while clearly marking what is already verified and what remains. The tracked plan is the status source of truth across Codex, Claude, and Copilot.
- **Evidence:** `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/agents/README.md`, `docs/agents/memory.md`, `docs/agents/runtime.md`, and `docs/agents/reliability.md`.
- **Credit impact:** Documentation-only change; no provider calls.
- **Next:** Joined replay inspector from RawTree checkpoints and flight events.

## 2026-09-25 — Joined replay inspector (Claude Code)

- **Activity:** Added `src/replay/replay.ts`, a read-only projection that joins checkpoint revisions (the state authority) with flight events (the activity authority). The output covers sessions, per-task attempts and completion revisions, pending tasks, decisions with reason, cited evidence and disagreeing values, per-revision change lists, a merged timeline, and findings. Findings cover `preflight_denied`, `failed_attempt`, `retry_decided`, `retry_deferred`, `unmatched_start`, `completed_without_terminal_event` (crash gap between checkpoint save and journal write), `terminal_event_without_checkpoint`, and `unjournaled_task`. Added `replay` (terminal view) and `replay:json` actions to the RawTree fixture, Liquid, and live CLIs.
- **Decision:** Order the timeline by flight event ID. Anchor each checkpoint immediately before its task's journaled `TASK_COMPLETED`; fall back to timestamp only when no completion was journaled. Pure timestamp ordering interleaved sessions incorrectly when events shared a millisecond. A `RETRY_DEFERRED` does not close an unmatched start, so both findings stay visible until an operator reconciles them. Completed tasks with no flight events are labeled as possibly predating the journal rather than as crash gaps. Reads are bounded (100 revisions and 10 × 100 flight events), and truncation is reported.
- **Evidence:** `tests/replay.test.ts` (3 tests: failure→retry→restart→contradiction; unmatched start with deferred retry; crash gap, unjournaled task, and preflight denial) plus a `replay:json` assertion in the multi-process fixture HTTP CLI test in `tests/rawtree.test.ts`. `npm test` passed 33/33.
- **Credit impact:** Fixture tests only; no live Nimble, OpenRouter, or RawTree requests.
- **Limit / next:** The replay read path has not been exercised against live RawTree. There are no focused `why <claim>` or `diff` queries yet. Search/extraction request IDs are in the timeline events but not joined into the decision view. Next: operator reconciliation for unmatched starts and crash gaps, then a small live RawTree-only validation of the flight table and replay after checking usage.

## 2026-09-25 — Real goal chosen: small open-model buyer's sheet (Claude Code)

- **Activity:** The user chose, from five discussed use cases, a buyer's comparison of small open-weight models. Added versioned goal files (`goals/small-models-v1.json`: 5 models × 4 attributes = 20 claims; `goals/small-models-pilot.json`: context length only). Added `src/goal.ts` (validation and expansion, max 40 claims) and `src/report/matrix.ts` (entity × attribute matrix from stored decisions). `src/live-demo.ts` now accepts a goal file in place of a single claim, runs `step <count>` with a credit preflight before every research step, and adds `report` / `report:json`.
- **Decision:** Compare 2.6–4B variants so the comparison is fair. Write entity names as hyphenated model IDs so Nimble's compact title/URL entity filter matches typical model-card URLs; a test checks this for all five entities. Keep the single-claim invocation and its goal text unchanged so existing runs still resume. Recommend a 5-claim pilot before the full run.
- **Evidence:** `tests/goal.test.ts` (3 tests); `npm test` passed 36/36. `npm run credits` (read-only, no inference) at 2026-09-25 20:18 UTC reported 45/50 OpenRouter free requests remaining, $0 account credit, and free model pricing verified at $0. The local ledger showed 5 OpenRouter attempts, 3 Nimble attempts ($0.0033 list estimate), and 46 RawTree requests today.
- **Credit impact:** One OpenRouter credit/key status read; no inference, no Nimble search, no RawTree requests.
- **Limit / next:** No live goal run yet; it waits for user budget approval. The verifier's exact-string comparison will turn format variants (`32K` vs `32,768`) into false contradictions, so add normalization before the 20-claim run. The full run needs 40 free calls against a 50/day free quota.

## 2026-09-25 — Live pilot `small-models-pilot-1` (Claude Code)

- **Activity:** With user approval, ran `goals/small-models-pilot.json` live (5 claims, 15 tasks) using per-command caps of 14 Nimble attempts / $0.02 list estimate / 16 OpenRouter attempts; `.env` unchanged. Completed across four process invocations: two bug fixes and one rate-limit stop.
- **Bug 1, first live flight-table use:** RawTree infers `Dynamic` columns and rejects `IN (...)` on them (ClickHouse code 43). `latestAttempt` failed before any provider call. Fixed with `toString(type) IN`; the fixture transports and fixture HTTP server now reject an uncast `type IN`. This is the first live validation of `continuum_flight_v1`: inserts, exact-ID confirmation, history paging, and replay all work live.
- **Bug 2, extraction all-or-nothing:** one ungrounded Liquid quote rejected the whole batch, so deterministic (temperature 0) retries would burn quota. Changed to drop and count ungrounded observations (`rejectedObservations` in `EXTRACTION_COMPLETED`), tolerating only whitespace differences. Malformed output still fails the task, and nothing ungrounded is stored.
- **Rate limit:** one OpenRouter HTTP 429 (free model). The task stayed pending, was journaled as `TASK_FAILED`, and was retried on the next invocation with `RETRY_DECIDED`. No automatic retry loop.
- **Results:** LFM2.5-2.6B unresolved: `128K` (docs.liquid.ai) vs `131,072-token` (aimodels.fyi), a format-only false contradiction. Qwen3-4B unresolved: `131K` (apxml.com, benchable.ai) vs `32k` (dev.co, describing the base model); likely a genuine native-vs-extended context nuance worth showing in the demo, not verified here. Llama-3.2-3B insufficient: `128K tokens` from one host. Gemma-3-4B and Phi-4-mini insufficient: the correct pages were found, but snippets contained no values.
- **Evidence:** `npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json report|replay`. `npm test` passed 36/36 after both fixes.
- **Credit impact (local ledger, UTC day totals after run):** OpenRouter 16 attempts (11 in this pilot, including one 429 and the grounding failure), $0 reported, 1 unknown-cost outcome (the 429); provider free counter showed 36/50 remaining. Nimble 13 attempts (10 in this pilot), $0.0143 list estimate ($0.011 pilot); actual balance unknown. RawTree 449 requests (~400 in this pilot, about 27 per step because of confirmation queries and repeated table listings); monetary cost unknown.
- **Next:** (1) value normalization for token counts so `128K` = `131,072` agree while `32K` vs `131K` stays unresolved; (2) full-page fetch when snippets carry no value (Gemma, Phi); (3) cut RawTree requests per step (cache `hasTable`, fewer confirmation reads); (4) then the 20-claim run on a fresh UTC day.

## 2026-09-25 — Local Liquid inference mode (Claude Code)

- **Activity:** At the user's request, added an optional local mode to `LiquidExtractor`. When `LIQUID_BASE_URL` points to a localhost OpenAI-compatible server (llama.cpp `llama-server` or Ollama), extraction calls that server with no auth header and no OpenRouter `provider` field, a 300 s timeout, and no OpenRouter credit monitor or preflight. Added `extractorFromEnv` for the live and Liquid demos. Evidence records `extraction.provider: 'local'`.
- **Decision:** Localhost only, so evidence text is never sent to an arbitrary HTTP host. Require `LIQUID_MODEL` to contain "LFM" and to equal the model identity the server returns, so another model's output is not recorded as Liquid evidence. Strip a leading `<think>` block because LFM2.5-2.6B is a reasoning model. Recommend llama.cpp over Ollama because its JSON-schema constrained output is documented by Liquid; Ollama's structured-output support for this model was not verified.
- **Evidence:** New local-mode test in `tests/liquid.test.ts`; `npm test` passed 37/37. Model availability was checked from the official Hugging Face repo `LiquidAI/LFM2.5-2.6B-GGUF` (Q4_K_M 1.59 GB) and Liquid's llama.cpp/Ollama docs. The user's machine has Homebrew, Apple M4, and 16 GB; llama.cpp and Ollama were not installed. The user will do the setup.
- **Credit impact:** No provider calls; two public web page reads for setup documentation.
- **Limit:** Not yet run against a real local server. Extraction quality and speed of the Q4 local build versus hosted are unmeasured. JSON-schema grammar may suppress the model's thinking and change quality. First real use should be `npm run demo:liquid` on fixture sources, which needs no Nimble spend.

## 2026-09-25 — Local Liquid validated (user setup, Claude Code verification)

- **Activity:** The user installed llama.cpp and serves `LFM2.5-2.6B-Q4_K_M` on `127.0.0.1:4625`, with `LIQUID_BASE_URL`/`LIQUID_MODEL` in `.env`. The user ran `npm run demo:liquid -- local-liquid-1` to completion. Claude verified that `/v1/models` reports the alias (2.70B params, n_ctx 16384) and that Node resolves the local settings. `.env` contains two `LIQUID_MODEL` lines; the later local one wins, and the user was advised to comment out the earlier one.
- **Evidence:** Replay of `local-liquid-1`: both evidence items have `extraction.provider = local` and model `LFM2.5-2.6B-Q4_K_M` with exact quotes; decision unresolved ($49 vs $79, fictional); no findings. Local extraction took 18.0 s (researcher) and 14.6 s (skeptic) on an Apple M4. The local ledger added 0 OpenRouter attempts during verification.
- **Credit impact:** No Nimble or OpenRouter calls by Claude; a few RawTree requests for the no-op re-runs and replay.
- **Next:** Local mode removes the OpenRouter daily-quota constraint for the 20-claim run; only Nimble spend (~$0.044 list) remains, and it still needs user approval. Local extraction quality on real snippets has not been compared with hosted; the pilot's cached sources allow that comparison with no new Nimble spend.

## 2026-09-25 — Value normalization in the verifier (Claude Code)

- **Activity:** Added `src/agent/normalize.ts`. The attribute in the claim key selects a comparator: token counts (K = 1,000, M = 1,000,000, snapped to a power of two within 5%) and parameter counts (B/billion, M/million) compare numerically within a 5% tolerance; licenses by a normalized name; dates at year-month precision, with a year-only value compatible with a month in that year; everything else as case- and whitespace-insensitive text. Values containing several different quantities fall back to text. Digits glued to letters (`LFM2.5`, `Qwen3`) are not read as quantities. `Verifier` now groups values and is unresolved only when more than one group exists; new decisions store `groups`, and supported reasons list the equivalent spellings. `report` uses group labels and marks older unresolved decisions whose values now form a single group with ≈. Recorded decisions are not rewritten.
- **Decision:** A 5% tolerance absorbs 128K = 128,000 vs 131,072 and nominal-vs-actual rounding (2.6B vs 2.7B) while keeping neighbouring model sizes (roughly 2× apart) distinct. The trade-off: 2.6B and 2.7B are treated as the same claim. Normalization is deterministic code; no model decides equivalence.
- **Evidence:** `tests/normalize.test.ts` (3 tests using pilot values); `npm test` passed 40/40. Pilot `report` (RawTree read only): LFM2.5-2.6B ≈ 128K tokens (recorded ⚠); Qwen3-4B ⚠ 128K vs 32K.
- **Credit impact:** No provider calls; a few RawTree reads for `report`.
- **Next:** Full-page fetch for snippet-only misses (Gemma, Phi), RawTree request reduction, then the 20-claim run with user budget approval (Nimble only now that Liquid is local).

## 2026-09-25 — Full-page fallback via Nimble Extract (Claude Code)

- **Activity:** Added `NimblePages` (`POST https://sdk.nimbleway.com/v2/extract`, `render: false`, `formats: ['markdown']`, from Nimble's Extract docs) and `CachedPages` (per-run cache), plus `src/tools/focus.ts`, which excerpts the lines naming the attribute with ±2 neighbouring lines, strips link targets and images, and applies an 8,000-character budget. `LiquidResearchProvider` escalates only when snippet extraction yields zero evidence: it fetches the top `maxPages` result URLs (default 1, max 2) and runs a second extraction stage. Evidence is labelled `sourceKind: 'page-extract'` with the extract task ID; flight events are `PAGE_FETCH_STARTED/COMPLETED/FAILED`, and extraction events carry a `stage`. Search and extract now share one reservation function: one attempt cap, with a cost cap based on recorded estimates plus unfinished attempts at the highest list price.
- **Decision:** Use Nimble Extract rather than a direct HTTP fetch, which keeps page retrieval in the partner stack and gives JS-render capability later. List price $1.00/1K URLs per Nimble's pricing page. Use static rendering to avoid unverified render pricing. A page fetch failure leaves the task pending (retry later), consistent with other provider failures.
- **Evidence:** `tests/pages.test.ts` (4 tests); `npm test` passed 44/44. Prepared `goals/page-fetch-check.json` (Gemma-3-4B and Phi-4-mini context length) and seeded run `page-fetch-check-1` with copies of the pilot's four cached Nimble search results, so live validation needs only page extracts (expected 3: Gemma support/challenge, Phi challenge; Phi support had no filtered search results) and local Liquid.
- **Credit impact:** No provider calls yet; two public docs reads (Nimble pricing, Extract API).
- **Limit / next:** Live validation awaits user approval (about $0.003 list estimate). Phi's support search had zero entity-filtered results, which page fetch cannot fix; this would need a query or filter change.

## 2026-09-25 — Page fallback validated live; local thinking budget, type gate, variant guard (Claude Code)

- **Activity:** With user approval (~$0.003), ran `page-fetch-check-1` (Gemma-3-4B, Phi-4-mini context length; search cache seeded from the pilot). Three fixes followed, each re-validated from cached searches and pages as `page-fetch-check-2` and `-3`:
  1. **Local reasoning budget:** local LFM2.5 spent all 2,048 output tokens reasoning (7,199 chars of `reasoning_content`, `finish_reason: length`, 41 s) and returned no answer. `chat_template_kwargs.enable_thinking=false` and `reasoning_budget=0` were ignored by the user's llama.cpp build; `thinking_budget_tokens: 0` worked (7.5 s, grounded JSON). Local mode now sends `thinking_budget_tokens` (env `LIQUID_THINKING_BUDGET`, default 0, max 1536), and a reasoning-only `length` reply fails with an actionable message.
  2. **Type gate** (`admissible` in `src/agent/normalize.ts`): grounded but off-type values were being stored (output limit 8192, "14 trillion tokens" of training data, "140 languages", page titles). Observations must now match the attribute's type: tokens 256–10M and not from an output/generation-only sentence; parameters 1M–10T; parseable dates; license-like names. Off-type values are counted (`offTypeObservations`), not stored. Also fixed years being parsed as token counts ("2026" → "2K tokens"). Extraction prompt bumped to `evidence-extraction-v2`, telling the model to ignore other quantities and page titles.
  3. **Variant guard:** a value naming a different model size than the entity ("32K tokens for the 1B size" for Gemma-3-4B) is rejected. `replay` now uses value groups, so spelling variants are no longer shown as disagreements.
- **Result (`page-fetch-check-3`):** Gemma-3-4B **supported**, 128K (huggingface.co model card via page extract: "128K context window"; llm-stats.com: "131,072 tokens"). Phi-4-mini **insufficient**: "128K token context length" from llm-stats.com only, because its official-docs search had no entity-filtered results. Page extract returned 38,405 chars for the Gemma card, focused to 5,114.
- **Evidence:** `npm test` passed 46/46 (new tests for the thinking budget, type gate, variant guard, and years).
- **Credit impact:** 3 Nimble extracts in total (2 in run 1, 1 in run 2 for the Phi page, which run 1 had not escalated to), $0.003 list estimate. Local Liquid only; no OpenRouter. Day totals from the local ledger: Nimble 16 attempts / $0.0173 estimate; OpenRouter 16; RawTree 1,018 requests (cost unknown; request volume is now a real concern).
- **Limit / next:** The type gate and variant guard are heuristics tuned on model-spec pages; new attributes need their own rules. Phi's missing official source needs a query or filter change (e.g. an `official` query that also tries the vendor's model-card host). Next: "ask the memory" over RawTree, RawTree request reduction, then the 20-claim run.

## 2026-09-25 — "Ask the memory" over RawTree (Claude Code)

- **Activity:** Added `src/memory/ask.ts` and `ask`/`ask:json` actions in the live and Liquid CLIs. Retrieval is code: latest checkpoint plus `loadReplay`, deterministic claim selection by model name and attribute words, a bounded packet with aliases (D/E/F/T), and a question intent (`facts` vs `process`). Answering uses a new generic `LiquidExtractor.structured()` (refactored out of extraction; same budget, identity, completeness, and thinking-budget handling). Verification is code: aliases exist, at least one citation, and every number appears in the packet.
- **Live trials (local LFM2.5-2.6B-Q4_K_M, RawTree reads only):**
  - "Why did you conclude Gemma-3-4B has a 128K context window?" (`page-fetch-check-3`): verified; cites both page-extract quotes and explains 128K = 131,072.
  - "Why is the Qwen3-4B context length unresolved?": first attempt **rejected** because the model formatted citations as "[E1] - 1". After alias normalization: verified, citing 131K (apxml, benchable) vs 32k (dev.co).
  - "What failed during this run, and was it retried?": the first attempt passed verification but was **wrong** (claimed nothing was definitively retried, garbled the Qwen values). Cause: the packet held raw events with no outcomes. Fix: process questions now receive code-computed task outcomes (`T#`) and no source evidence. After the fix, the answer correctly reports both extraction failures and their retries.
- **Decision:** Keep the model's role to phrasing and selection. Facts, outcomes, and the validity checks come from stored records and code. Show citations with the answer, because verification checks existence and numbers, not semantic correctness.
- **Evidence:** `tests/ask.test.ts` (4 tests); `npm test` passed 50/50.
- **Credit impact:** No Nimble or OpenRouter calls; local inference and RawTree reads (roughly a dozen requests per question).
- **Limit / next:** A verified answer can still misstate relationships between correctly cited facts. No semantic entailment check. RawTree timestamps come back in `YYYY-MM-DD hh:mm:ss.nnnnnnnnn` form, not ISO. Next: contradiction-driven follow-up tasks, RawTree request reduction, then the 20-claim run.

## 2026-09-25 — Contradiction-driven follow-ups and the `qualified` verdict (Claude Code)

- **Activity:** The orchestrator now plans one follow-up round (a focused researcher plus a re-verifier, `followUp: true`) when a non-follow-up verifier returns `unresolved` and `groupValues` still finds more than one group. It plans in the same checkpoint as the decision and journals `FOLLOW_UP_PLANNED`. `planFollowUps()` and the live `follow-up` action plan rounds on stored runs without provider calls. Added research mode `resolve` with a deterministic focus (`followUpFocus`: group labels plus an attribute hint such as "native extended"), a Nimble query using the focus, and a cache key including the focus (old keys unchanged). Added the Verifier outcome `qualified` when one evidence quote covers every disagreeing group (`coversAllGroups`, numeric-aware for tokens and parameters). Extraction prompt v3 asks for separate observations when one quote states several conditional values. Matrix shows ◐; validation, ask, and replay know the new status. The fixture provider's `resolve` mode returns a fictional pricing FAQ stating both prices by billing period.
- **Decision:** `qualified` explains a disagreement; it does not pick a winner and says when only one host is stored. Library and fixture default `maxFollowUps` is 0, so existing demos and tests are unchanged; the live CLI defaults to 3 via `CONTINUUM_MAX_FOLLOW_UPS`, because each round spends Nimble. Keep one round per claim to bound cost.
- **Evidence:** `tests/followup.test.ts` (4 tests: planning plus qualification, cap and spelling-only skip plus idempotent planning, quote coverage, resolve query and cache); `npm test` passed 54/54.
- **Credit impact:** None; fixtures only.
- **Next:** Live trial on `small-models-pilot-1`: `follow-up` (no provider call) should plan only Qwen3-4B (LFM2.5 is spelling-only), then `step 2` costs about one Nimble search, plus an extract if snippets are empty (~$0.001–0.002), and local Liquid. Awaiting user approval.

## 2026-09-25 — Follow-up live trial on Qwen3-4B; type-gate fixes (Claude Code)

- **Activity:** With user approval, ran `follow-up` on `small-models-pilot-1` (no provider call), which planned only Qwen3-4B (LFM2.5 skipped as spelling-only), focus "128K tokens 32K tokens native extended". `step 2` ran the follow-up: one Nimble resolve search found the official card `huggingface.co/Qwen/Qwen3-4B` and a community GGUF page. Snippets gave no admissible value, so the page fallback extracted the card (28,286 chars, focused to 5,564). Local extraction produced the card sentence "Context Length: 32,768 natively and 131,072 tokens with YaRN." and "max_position_embeddings … 40,960". **The type gate dropped the card sentence** (two quantities counted as ambiguous) and **kept the config default**, so the recorded follow-up verdict is `unresolved` (128K vs 32K vs 40K). That decision stays in history; the claim's one follow-up round is used.
- **Fix:** Token-count values stating 2–3 in-range limits (conditional statements) are admissible. Quotes about `max_position_embeddings`, `config.json`, or `rope_scaling` are not the advertised context length and are rejected. Qualified reasons and matrix labels name only normalized values (`namedGroups`). Replaying the local extraction on the cached card now keeps only the card sentence. Applying the current Verifier to the pilot's stored Qwen evidence plus that sentence gives **qualified**: "Values differ by stated condition (128K tokens vs 32K tokens). huggingface.co states them together: …". This is now a regression test.
- **Side check:** zero-spend run `qwen-followup-check-1` (seeded caches; Nimble cap set to the day's attempt count so no paid call was possible) ended ✓ supported 128K. The local model's quote from dev.co's snippet title ("32K Context") was not exact, so grounding dropped it and no disagreement arose. This is run-to-run model variance; it did not exercise the follow-up path.
- **Evidence:** `npm test` passed 55/55.
- **Credit impact:** 1 Nimble search plus 1 Nimble extract (~$0.0021 list); local Liquid only. Day totals from the local ledger: Nimble 18 attempts / $0.0194; rawtree 1192.
- **Limit / next:** The live follow-up path is validated end to end (planning, resolve query, official source found, page fallback, re-verification), but the *recorded* qualified verdict will first appear on a new run. Type-gate rules remain heuristics for model-spec attributes.

## 2026-09-25 — RawTree request reduction dropped (user decision)

- **Decision:** The user stated that RawTree usage is unlimited for this project and asked not to pursue request reduction. Removed it from the next-step list. Request counts stay in the local ledger for transparency but are not a budget constraint. Nimble spend still needs per-run approval.
- **Credit impact:** None.

## 2026-09-25 — Full v1 run started; inspector UI; interim fixes from v1 results (Claude Code)

- **Run:** With user approval (Nimble ≤110 attempts / $0.12 for the day), started `small-models-v1-run-1` on `goals/small-models-v1.json` (20 claims; the existing v1 goal, run for the first time). It stopped at step 43 when a Nimble page extract timed out (task left pending, outcome cost unknown, no automatic retry). 14/20 claims were decided at that point. 39 Nimble attempts (~$0.041 list) so far; local Liquid only.
- **Review of interim results against quotes** found three rule bugs: (1) parameter counts read from model identifiers ("google/gemma-3-4b-it", "Qwen/Qwen3-4B"); (2) "Apache License" vs "apache-2.0" treated as different licenses; (3) a date for "Qwen3 4B **2507** Instruct" accepted for Qwen3-4B. Real or source-faithful results left as-is: Gemma context 128K vs 32,000 (listing site; follow-up queued), Gemma release "Released in 2026" (one host, insufficient), LFM2.5 release Aug 2026 (three hosts).
- **Fixes:** Parameter values must still state a count after removing the entity name and `org/model` identifiers. Unversioned license family names are compatible with versioned ones. A quote naming the entity followed by a version code (2[1-9]xx, not a 20xx year) is excluded as another variant. The Verifier re-applies current type checks to stored evidence (excluded items remain stored and are counted in the reason). A follow-up researcher skips its paid search when the claim no longer disagrees under current rules (`skipped: disagreement_resolved_by_current_rules`). Decisions already recorded are not rewritten.
- **Inspector UI:** Added `npm run inspector` (127.0.0.1:4700) and `inspector/index.html`, with bundles built live from RawTree (`src/inspector/bundle.ts`, `server.ts`), plus export and offline open. See README.
- **Evidence:** `npm test` passed 59/59 (new inspector tests, v1 regression tests).
- **Next:** The run was resumed in the background under the same approval; then review, ask, and the FLUX decision (a recommendation was given: FLUX only for non-factual cover art in an evidence-linked brief; awaiting a BFL key and budget).

## 2026-09-25 — Page fetch made best-effort (Claude Code)

- **Problem:** The v1 run blocked twice on the same task (`14:skeptic`, Phi-4-mini license): Nimble Extract could not fetch `capterra.com/p/10132208/Phi-4-mini/` (first a timeout with unknown cost, then HTTP 500). Because page failure failed the task, one bot-protected URL stopped a 20-claim run.
- **Decision:** Page fetching is an optional enhancement to search. A page failure is journaled (`PAGE_FETCH_FAILED`, `continued: true`) and the next-ranked result is tried, with at most `maxPages + 1` attempts. If none succeeds, the task completes on snippet evidence. A local budget stop still fails the task, leaving it pending.
- **Evidence:** New test in `tests/pages.test.ts`; `npm test` passed 60/60.
- **Credit impact:** The two failed extracts were recorded (HTTP 500 at $0 estimate; the timeout at unknown cost). The run resumed under the same approval.

## 2026-09-25 — FLUX integration: evidence brief, cover, draft video (Claude Code)

- **Approval:** The user approved the brief and cover at a $0.25 image budget and FLUX 3 video ("budget approval for both flux 2 and flux 3"). Video was capped at $0.50 as proposed (draft, about 6 s).
- **API contract (from BFL docs):** `POST https://api.bfl.ai/v1/flux-2-pro` and `/v1/flux-3-video` with header `x-key`; responses carry `id`, `polling_url`, `cost` (credits, 1 = $0.01); poll `polling_url` until `Ready`; statuses include Pending/Reasoning/Generating/Request Moderated/Content Moderated/Error. FLUX 3 t2v fields: `mode`, `prompt`, `aspect_ratio`, `duration` 5–20, `resolution`, `generate_audio`, `draft`, `safety_tolerance`. No seed field, so none is sent.
- **Built:** `src/tools/flux.ts` (per-kind daily budgets, ledger rows as provider `bfl`, cache by request hash, flight `GENERATION_*` events, no resubmission, downloads never carry the key); `src/brief/prompts.ts` (code-built prompts with no names, values, or text; tests assert no digits or model names); `src/brief/brief.ts` (self-contained evidence brief; all text escaped; FLUX labelled as illustration; provenance lists request ID, seed, reported cost, and hash); `src/brief/cli.ts` (`npm run brief -- <run> [--cover] [--video]`); an inspector route `/briefs/...` and an **Open brief** button. Fixed brief wording that claimed a restart for single-session runs.
- **Live:** Cover generated with flux-2-pro, request `fd5bc5cf-2810-4685-832f-b134eda387bc`, seed 4625, **reported $0.03**, 1280×720 JPEG. Visually checked: no text; glowing threads to paper stacks with a knotted thread; empty left side for the title. It drew three chips for a five-model prompt, which is harmless for an illustration and supports the rule that pixels never carry facts. The draft video was then submitted in the background (estimate $0.36).
- **Evidence:** `tests/flux.test.ts` (3 tests); `npm test` passed 63/63.
- **Limit:** Whether FLUX 3 draft mode returns a playable MP4 or only a `draft_cache` was unknown at submission; the CLI omits the video from the brief if no playable file is returned.

## 2026-09-25 — FLUX 3 draft video generated (Claude Code)

- **Result:** flux-3-video t2v draft, request `9f8d5cdc-3ff2-441c-b301-1dc127450c85`, **reported $0.36** (estimate $0.36; within the $0.50 cap). Draft mode returned a playable MP4 (6.04 s, 1280×704, H.264 plus mono AAC audio, 2.16 MB) plus two 4 KB `.bin` draft-cache files. The MP4 was copied to `exports/media/` and embedded in the brief.
- **Check:** One thumbnail frame (via `qlmanage`; ffmpeg is not installed) shows cards settling into a stack in the blue and amber palette, with no text. The rest of the frames and the audio track (to confirm no speech) were not verifiable from the CLI; the user should watch and listen before using it in a pitch.
- **FLUX spend today:** image $0.03 + video $0.36 = $0.39 reported (approved: $0.25 image, $0.50 video).

## 2026-09-25 — v1 run complete; license identifiers; re-verification; ask attribution check; final brief (Claude Code)

- **v1 run complete:** `small-models-v1-run-1` finished 66/66 tasks (60 base plus 3 follow-up rounds) across 6 sessions, with 2 failed attempts and 2 retries (the Capterra page, before the best-effort fix). Follow-ups: Qwen3-4B context → **◐ qualified** live (aimodels.fyi: "Native context window is 32,768 tokens, expandable to 131,072 tokens using YaRN"); Qwen3-4B license → ✓ apache-2.0; Gemma-3-4B context stays ⚠ (huggingface 128K vs aimodelcomparison.org "32,000 tokens"). Nimble for this run: 59 attempts, ~$0.060 list estimate (day total 77 / $0.0796, 1 unknown-cost timeout), within the approved $0.12.
- **License values:** Replaced the word-match license gate with recognized identifiers (Apache[-2.0], MIT, Llama N Community, Gemma terms, LFM Open License vN, CC-BY, GPL) plus short "<Name> License" forms. This rejects page titles ("LICENSE · microsoft/Phi-4-mini-instruct …") and legal boilerplate ("“Licensee” or “you” means …"). Labels are canonical ("Apache-2.0", "MIT").
- **Re-verification (`reverify` action, `Orchestrator.planReverify`):** Where today's Verifier differs from a claim's latest decision (status, value, group labels, or voting evidence IDs), a verifier task is queued so a new decision is appended; journaled as `REVERIFY_PLANNED`; no provider call; idempotent. On v1 it re-verified 6 claims: Gemma and Qwen parameter counts (identifiers excluded → insufficient), Qwen license, Qwen release date (the 2507 variant excluded → insufficient, 28 Apr 2025 from one host), Phi license and Llama license (junk excluded → insufficient with an MIT / "License: llama3.2" single source). Matrix, bundle, brief, and UI now label cells from the evidence that voted in the latest decision and mark excluded evidence in the UI.
- **Final matrix:** ✓ 7, ◐ 1, ⚠ 1, ? 11. Many "?" cells are honest single-source or no-admissible-evidence results (Llama context and params had no admissible evidence).
- **Ask fixes found on v1:** (1) Broad process questions dropped the claim where failures happened (top-8 by verdict). Now claims with findings come first, task outcomes are sorted failures-first and renumbered, and the packet carries run-wide finding counts. (2) Verification now also rejects URLs and clock times not in the records, and adds a **sentence-level attribution check**: when a sentence names a model, its times, URLs, and aliases must belong to that model's records. Live: "What failed…?" is now **rejected and withheld** because the model attributed Phi's 22:08 and 22:09 page failures to Gemma. Why-questions for Qwen ◐, Gemma ⚠, and Phi 3.8B **verified**. Event labels now include the page URL and the claim.
- **Brief:** Rebuilt with final data using the cached cover and video (0 new BFL calls). Quotes are de-duplicated. Served by the restarted inspector at `/briefs/small-models-v1-run-1-brief.html` (path traversal → 404).
- **Evidence:** `npm test` passed 66/66.
- **Limits:** A verified answer can still overstate what a cited source says (e.g. a Qwen answer grouped apxml's "extensible 131K" with aimodels' native/extended sentence). Checks cover existence, numbers, URLs, times, and model attribution, not full entailment. Type-gate rules are tuned to model-spec attributes.

## 2026-09-25 — Extra FLUX media: model cards and 12 s HD pitch clip (Claude Code)

- **Approval:** The user chose options 3 and 4: per-model emblem cards (about $0.015 each) and a longer clip, then chose "12 s HD" (about $2.04) when asked. The video day cap was set to $2.50 for this command (covering the $0.36 draft already spent); the image cap stayed $0.25.
- **Cards:** `cardRequests` in `src/brief/prompts.ts` uses `flux-2-klein-9b` at 512×512, seeds 4625–4629, one deterministic colour and motif per position, and no model names or numbers in prompts (names are HTML captions in the brief's "Candidates" strip, labelled decorative). Four were generated at a reported $0.015 each. The fifth (Llama) was rejected at submission with HTTP 503 (no request ID, no task created; the ledger conservatively counts its $0.02 estimate), then generated on a deliberate manual rerun at $0.015 (the four others came from cache). Contact-sheet check: all five clean, distinct, no text. Copies are in `exports/media/*-card-*.jpg`; the cover is copied to `exports/media/small-models-v1-run-1-cover.jpg`.
- **HD clip:** `pitchVideoRequest` (flux-3-video t2v, 12 s, HD, `draft: false`, ambient audio, no speech or text; prompt tells the search → knot → untangle → lamp off/on → archive story). The brief CLI gained `--cards` and `--video-hd`; the draft request body is unchanged, so its cache key (`2ed798b7…`) stays valid. Submitted in the background.
- **Evidence:** `npm test` passed 67/67.

## 2026-09-25 — HD clip checked; judge demo script (Claude Code)

- **HD clip:** flux-3-video, 12 s full render, request `079c6b15-ca8e-4ff1-9efa-6259d2012ff4`, **reported $2.04** (as estimated). MP4 12.04 s, 1280×704, H.264 plus AAC, 3.7 MB, at `exports/media/small-models-v1-run-1-hd-video-1.mp4`; the brief now embeds it. Seven frames extracted with AVFoundation (Swift) show threads from the chip to floating pages, stacked cards, the lamp, and a pull-back to an archive of stacks. No visible text. The knot and untangle beat is not clearly visible. Audio not verified (needs a human listen). FLUX reported total today: $2.505 (cover 0.03, draft clip 0.36, cards 5 × 0.015, HD clip 2.04) plus one $0.02 estimate for the 503-rejected card submission.
- **Demo script:** `docs/DEMO_SCRIPT.md` covers a 6-minute walkthrough with exact commands, expected outputs, lines to say, a likely-questions table, fallbacks, and accuracy notes. Rehearsed: fixture RawTree restart beat (about 5 s per step; replay shows restart boundaries); `ask` "Why is the Qwen3-4B context length qualified?" verified in about 8 s; "What failed…?" withheld in about 12 s with the attribution reason, deterministic across repeats. Reference run stats used in the script: revision 74, 9 sessions, 40 observations from 18 hosts (16 full-page), 3 follow-ups, 6 re-verifications, 2 failures with 2 retries, 3 skipped page fetches. Exported `exports/small-models-v1-run-1.json` as an offline fallback.

## 2026-09-25 — Audience presentation page published (Claude Code)

- **Activity:** Built a shareable presentation page from stored data (build script reads `exports/small-models-v1-run-1.json` and captured deterministic `ask` outputs; embeds the FLUX cover and cards; ships the HD clip as a file). Sections: problem, how it works, the run (stats plus matrix), contradictions (Gemma ⚠, Qwen ◐ with decision history), ask (verified Gemma answer; withheld failure answer with attribution reasons), brief and FLUX, stack and costs, limits. Published as a private Artifact: https://claude.ai/artifact/HDMFprYhTJjkspcxSGnzbN (the owner must share it for others to open it). Offline copy at `exports/presentation/index.html` with `media/continuum-pitch.mp4`.
- **Decision:** The page and demo beat 5 use the Gemma "why" question. The Qwen answer verifies but overstates what apxml.com says (it groups apxml with aimodels.fyi's native/extended sentence), a known limit of existence-and-attribution checks; it stays as a Q&A example.
- **Credit impact:** Three local `ask` calls (free) and RawTree reads.

## 2026-09-25 — 3-minute demo video (Claude Code)

- **Decision (user):** Asked how to make the video, the user chose "Real capture + FLUX opener": a pixel-exact traversal of the presentation page, code-generated narration, and the existing FLUX HD clip as the opener, with no new spend. The alternatives offered were a new FLUX outro (~$1) and a fully FLUX-generated 3 minutes (~$10.80 draft / $30.60 HD, unable to show the real page, with a risk of misstated facts).
- **Built:** `tools/demo-video/`: `capture.mjs` (headless Chrome over CDP: dark theme, 1280 CSS px at 1.5× scale, full-page PNG plus section positions), `narration.json` (8 segments, 426 words, from stored run data), macOS `say` (Samantha, 186 wpm), `timeline.mjs` (per-frame camera plan, crossfade, clip window), `render.swift` (AVAssetWriter frames with the FLUX clip drawn into the page's player; AVMutableComposition mixing opener audio and narration), `make.sh` to rebuild. Output `exports/demo/continuum-demo.mp4`: 173.0 s, 1920×1080, 77 MB. An HEVC re-export was only 68 MB and was discarded. Script and provenance in `docs/DEMO_VIDEO.md`.
- **Checks:** AVFoundation probe (duration, size, audio track) and an 8-keyframe contact sheet reviewed. The first cut was 3:30; the script was trimmed and the rate raised to reach 2:53. Audio mix not listened to (CLI limit).
- **Credit impact:** None.

## 2026-09-25 — Repository prepared for GitHub (Claude Code)

- **Activity:** Initialised a local Git repository on `main` for a public GitHub check-in. The user chose: public repo, MIT license, keep `exports/` ignored (media is linked from the submission instead), and commit locally without pushing.
- **Changes:** Added `LICENSE` (MIT, "The Continuum authors"), a README pitch and quick start, and `.DS_Store` / `*.log` in `.gitignore`. Documented optional env vars already read by the code (`RAWTREE_FLIGHT_TABLE`, `NIMBLE_PAGES_PER_TASK`, `CONTINUUM_MAX_FOLLOW_UPS`, `LIQUID_THINKING_BUDGET`, `INSPECTOR_PORT`, `BFL_API_KEY`, FLUX budgets) in `.env.example`, with the code defaults. The video budget default is 0.
- **Checks:** Scanned files that would be committed for API-key patterns, emails, account identifiers, and absolute local paths. Nothing found except in `tools/demo-video/capture.mjs` (absolute `file:///Users/...` path). That folder is the video agent's in-progress work and was left untracked. `.env`, `.continuum/`, and `exports/` confirmed ignored. `npm test` passed 67/67.
- **Credit impact:** None (no provider calls).
- **Remaining:** Commit `tools/demo-video/` after the path fix; create the GitHub remote and push when the user approves.

## 2026-09-25 — Video tooling excluded from Git (Claude Code)

- **Decision:** The user chose to keep the demo-video tooling out of the repository. Added `tools/demo-video/` to `.gitignore`. The files stay on disk for the video agent. This also keeps the absolute local path in `capture.mjs` out of the public repo.
