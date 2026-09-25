# Continuum hackathon plan and progress

Updated 2026-09-25. This is the execution plan for the product described in [continuum_hackathon_handoff.md](../continuum_hackathon_handoff.md). Keep this checklist current after each milestone; record the decision and evidence in [SESSION_HISTORY.md](SESSION_HISTORY.md), and refresh [CURRENT_HANDOFF.md](CURRENT_HANDOFF.md) before switching coding agents.

**Demo promise:** Continuum researches a claim, preserves evidence and decisions, survives a process restart, shows what happened and what remains uncertain, and explains its conclusion. Nimble supplies live sources, Liquid extracts grounded observations through OpenRouter, RawTree holds durable state and events, and FLUX may produce the final visual brief.

Status key: `[x]` implemented and verified at the stated scope; `[ ]` remaining. A fixture test is not a live partner integration. Do not mark an entire phase complete just because its first slice works.

## 1. Foundation and product-agent loop — working starter

- [x] TypeScript/Node CLI with sequential Orchestrator, Researcher, Skeptic, and Verifier roles. Evidence and task completion are committed together. See `src/agent/` and `tests/agents.test.ts`.
- [x] Local fixture memory and repeatable restart demo; separate processes resume and preserve conflicting observations.
- [x] Caller-supplied claim keys create a bounded three-role task sequence.
- [x] Real goal chosen (2026-09-25): small open-weight model buyer's sheet. `goals/small-models-v1.json` covers 5 models × 4 attributes = 20 claims; `goals/small-models-pilot.json` covers context length only (5 claims). The live CLI runs a goal file with a bounded step count, and `report` renders the entity × attribute matrix (`src/goal.ts`, `src/report/matrix.ts`, `tests/goal.test.ts`). Fixture-verified; no live goal run yet.
- [ ] Decompose a broader user goal into claim-specific tasks with priorities and completion criteria. Keep task generation bounded by a run budget. (Goal files are a manual `entities × attributes` decomposition; model-driven decomposition and priorities remain.)
- [x] Normalize comparable values before verification (for example `32K` vs `32,768 tokens`, `3.8B` vs `3.8 billion`). Keep raw values and quotes. Done in `src/agent/normalize.ts` with `tests/normalize.test.ts` (pilot values as fixtures): tokens/parameters within 5%, license names, year-month dates, text fallback. The verifier stores `groups` on new decisions; `report` shows ≈ for older unresolved decisions that differ only in spelling.
- [x] Add follow-up tasks when evidence conflicts: one bounded round per unresolved claim (`resolve` search with the disagreeing values, then re-verification), and a `qualified` verdict when one quote states the values under different conditions. Live-trialled on the pilot's Qwen3-4B claim (official card found; type-gate fix makes it ◐ qualified; 55/55 tests). Follow-ups for *insufficient* claims (e.g. Phi's missing official source) remain open.

## 2. RawTree durable memory and flight recorder — partially complete

- [x] Live credentialed RawTree checkpoint storage and process restart, with append-only snapshots, state-change batches, and exact-checkpoint write reconciliation. See `docs/rawtree.md`.
- [x] Separate append-only event journal in `src/memory/flight.ts` for new task starts, completions, failures, resumes, and hosted search/extraction stages. Fixture HTTP and failure/restart tests pass.
- [x] Cursor-based event retrieval in pages of up to 100, exposed through the `flight` CLI action.
- [x] Journal OpenRouter credit-preflight starts/passes/denials before live search; classify denial without storing upstream bodies. Journal retry/defer decisions for pending tasks from prior recorded attempts, with run/session/task and prior-event references. See `src/usage/preflight.ts` and `tests/flight.test.ts`.
- [ ] Capture all remaining pre-task failure modes and request IDs for failed provider attempts where available; correlate ledger receipts with the product flight event without exposing secrets or raw responses.
- [x] Validate `continuum_flight_v1` live. Done during the `small-models-pilot-1` run (2026-09-25); found and fixed the `Dynamic`-column `IN` query bug.
- [x] Stop automatic task re-execution when the last attempt has a start but no terminal task event; write `RETRY_DEFERRED` and require inspection. A recorded `TASK_FAILED` or `PREFLIGHT_DENIED` may be retried on a later invocation with `RETRY_DECIDED`.
- [ ] Add an operator reconciliation path for a completed checkpoint with a missing terminal flight event, and for a provider response whose completion event was lost. Do not claim exactly-once execution.
- [ ] Add bounded state projection/context retrieval so the latest checkpoint and model context do not grow without limit. Keep historical revisions intact. (Request-volume reduction is deprioritized: the user states RawTree usage is unlimited. Snapshot growth still matters for very long runs.)
- [ ] Decide whether old product runs need a clearly labeled checkpoint-derived historical view. Do not fabricate unrecorded tool activity.

## 3. Live research and reasoning — integrated, quality work remains

- [x] Nimble lite search with bounded snippets, URL/source metadata, entity filtering, task cache, local attempt cap, and list-price estimate. Two searches in the documented initial run were live; see `docs/nimble.md`.
- [x] Hosted Liquid extraction through OpenRouter's free model with structured output, exact-quote grounding, token/cost metadata, credit preflight, and no paid fallback. See `docs/liquid.md`.
- [x] Verifier preserves disagreement and requires distinct source hosts for a `supported` status; it does not claim publisher independence or truth.
- [x] Fetch full pages when snippets are inadequate: Nimble Extract fallback with focused excerpts and `page-extract` provenance, validated live (`page-fetch-check-3`: Gemma-3-4B ✓ 128K from model card plus llm-stats). Includes a type gate and variant guard for off-type values. Remaining: verifying authoritative sources specifically (the vendor host), and Phi's missing official result.
- [ ] Improve entity and variant matching, semantic claim relevance, source independence, and temporal change handling. Add fixtures for known false-positive cases before spending on live searches.
- [x] Local Liquid inference via `LIQUID_BASE_URL` (llama.cpp/Ollama, localhost only, model-identity check). Validated with the user's llama.cpp server (`local-liquid-1`, about 15–18 s per extraction on an M4). Quality on real snippets versus hosted is not yet compared.
- [ ] Add explicit Liquid use for a bounded planning or verification decision if it improves the demo, while keeping final evidence checks deterministic.

## 4. Replay and inspector — next demo-critical deliverable

- [x] Build a joined replay projection from flight events, checkpoint revisions, tasks, evidence IDs, and decisions. Show event order, sessions, provider stages, errors, and unmatched attempts. See `src/replay/replay.ts`, `tests/replay.test.ts`, and the `replay` / `replay:json` CLI actions. Fixture-verified; not yet run against live RawTree.
- [x] "Ask the memory" (`ask "<question>"`): code retrieval from RawTree, local Liquid answer, code verification of citations and numbers (`src/memory/ask.ts`, `tests/ask.test.ts`). Verified live on why/unresolved/failure questions; a verified answer is still not an entailment proof.
- [ ] Add an inspect command that answers: what was investigated, what is pending, why a decision was made, what evidence disagrees, and what changed between revisions. Include source links and timestamps. *Partial:* `replay` answers all of these for the whole run (per-revision change lists, decision reason, cited evidence with URLs/timestamps/quotes, disagreeing values). Remaining: focused queries (`why <claim>`, `diff <revA> <revB>`) and inclusion of provider request IDs from search/extraction events in the decision view.
- [x] Add a minimal read-only inspector UI: `npm run inspector` (127.0.0.1:4700), built live from RawTree, with matrix, claim detail, decision history, evidence and quotes, findings, timeline with restart boundaries, ask, export/open JSON, and Open brief.
- [ ] Demonstrate a restart, a contradiction, a “why?” explanation, and a “what changed?” replay using one coherent run. *Mostly available:* `small-models-v1-run-1` (live sources) has 6 sessions, retries, 3 follow-ups, a ◐ qualified and a ⚠ unresolved claim, verified `ask` answers, and re-verification decisions. Remaining: the scripted demo walkthrough (section 6).

## 5. Credit discipline and reliability — ongoing

- [x] Local `.continuum/usage.jsonl` records OpenRouter attempts and reported costs, Nimble attempts and estimates, and live RawTree request counts. `npm run credits` checks OpenRouter's current available credit/quota before inference.
- [x] Default local caps: 10 free OpenRouter attempts/day, four Nimble search attempts/day, and $0.02 Nimble list-price estimate/day. No automatic paid fallback or repeated search on timeout.
- [x] Record OpenRouter preflight budget denials in the product flight history before a live Nimble search; no paid call is made after a denial.
- [ ] Join provider receipts and unknown-cost outcomes to flight events, distinguishing provider-reported costs from list-price estimates.
- [ ] Test interrupted runs and ambiguous writes end to end; add a documented operator recovery path for uncertain writes.
- [ ] Before each live validation, inspect current local usage and available provider balances. Batch fixture tests and reuse cached results. Report unknown balances as unknown.

## 6. Final artifact and delivery — in progress

- [x] Build a concise, evidence-linked brief: `npm run brief -- <run> [--cover] [--video]` writes `exports/<run>-brief.html` with the exact matrix, uncertainty callouts with quotes, how-we-know, and provenance.
- [x] FLUX: evaluated and integrated as illustration only (never data). FLUX.2 [pro] cover (reported $0.03) and FLUX 3 draft pitch clip (6 s, reported $0.36), under user-approved $0.25 image and $0.50 video caps. The clip's audio and full frames still need a human check.
- [x] Prepare the judge demo script and seeded run: `docs/DEMO_SCRIPT.md` (6 min, rehearsed) over `small-models-v1-run-1`, plus a live fixture restart beat. Remaining: a human rehearsal and an audio check of the clips.
- [ ] Run final automated checks, one bounded live end-to-end validation if credits permit, and document exact commands, observed results, limits, and remaining gaps.

## Immediate work order

0. ~~Pilot~~ done live (`small-models-pilot-1`). **Now:** ~~value normalization~~ (done), full-page fetch for snippet-only misses, then RawTree request reduction, then the 20-claim run on a fresh UTC day with renewed budget approval.
1. ~~Build the joined replay/inspector in section 4.~~ Done at fixture scope (`replay`). Next: focused `why`/`diff` queries if the demo needs them.
2. Add operator reconciliation for unmatched starts and the remaining provider receipt/cost correlation in sections 2 and 5.
3. Add contradiction-driven follow-up tasks and improve the evidence chain in sections 1 and 3.
4. Validate the new flight table against live RawTree with a small fixture run after reviewing usage. Avoid a new Nimble/Liquid run until it tests behavior that fixtures cannot.
5. Produce the final brief, then decide whether FLUX adds enough value within the remaining credits.

## Current validation and budget snapshot

`npm test` passed **55/55** fixture tests after the follow-up live trial (54/54 at contradiction follow-ups (50/50 after ask-the-memory (46/46 after page fallback validation fixes (44/44 at page fallback (40/40 after normalization; 36/36 after goal files and the matrix report were added (33/33 after the replay inspector ; 30/30 after preflight and retry-decision coverage). OpenRouter credit check on 2026-09-25 20:18 UTC: 45 of 50 free requests left, $0 account credit. The latest local ledger read on 2026-09-25 showed five OpenRouter attempts with $0 provider-reported cost, three Nimble attempts with a $0.0033 public list-price estimate, and 46 live RawTree HTTP requests that UTC day. These are local historical counts, not current provider balances or account-wide usage. Nimble actual balance/rate and RawTree monetary cost remain unknown. The new flight table and the replay read path have fixture coverage but no live RawTree validation yet.
