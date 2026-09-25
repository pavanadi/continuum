# Continuum

A research agent with persistent, inspectable memory. Continuum researches claims on the live web (Nimble), extracts grounded observations with a Liquid model (hosted on OpenRouter or local), and stores every observation, decision and event in RawTree. It survives process restarts, keeps disagreements instead of hiding them, and can answer "Why did you conclude X?" with citations checked against stored rows.

Built from [the hackathon handoff](continuum_hackathon_handoff.md). MIT licensed.

## Quick start

Requires Node 22.18 or newer. There are no npm dependencies.

```sh
npm test                 # fixture tests, no provider calls
npm run demo             # offline restart demo; run it three times
cp .env.example .env     # then add RAWTREE_API_KEY, NIMBLE_API_KEY, OPENROUTER_API_KEY (or LIQUID_BASE_URL for a local model)
npm run credits          # check quotas before any live run
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json step 15
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json report
npm run inspector        # http://127.0.0.1:4700
```

See the [tracked hackathon plan](docs/NEXT_STEPS.md) for completed work, remaining milestones, and the immediate work order.

## Implemented roles

- **Orchestrator:** creates research, challenge, and verification tasks for each supplied claim key; loads saved state before every step and commits outcomes with task completion.
- **Researcher:** asks the research provider for supporting observations.
- **Skeptic:** asks the provider for challenging observations.
- **Verifier:** compares stored observations, preserves disagreements, and records evidence IDs and a concise reason. Agreement from two distinct source hosts is marked `supported`; this alone does not establish truth or publisher independence.

Researcher and Skeptic can now use hosted Liquid extraction through OpenRouter. Orchestration and verification remain deterministic. Goal decomposition currently requires caller-supplied claim keys. The workflow runs Researcher → Skeptic → Verifier so verification sees both sets of observations.

## Run the restart demo

Requires Node 22.18+ with native TypeScript support; no package installation needed.

```sh
npm run demo
npm run demo
npm run demo
npm test
```

Each demo invocation executes one pending task and exits. State lives in `.continuum/demo.json`. After the third invocation, fictional $49/$79 pricing evidence remains recorded and the verifier reports `unresolved`. Subsequent invocations leave the completed run unchanged. To start another fixture run, supply a new file: `npm run demo -- .continuum/another.json 3`.

The tests use separate processes to check resume and a failing provider to check recoverability. They do not yet test abrupt termination during a storage write.

## Integration boundaries and current limits

`src/agent/types.ts` defines the research-provider contract. `src/agent/orchestrator.ts` defines the memory contract. `src/memory/file.ts` is an atomic local fixture adapter. `src/memory/rawtree.ts` adds append-only RawTree checkpoints, task/evidence/decision event batches, history queries, and write visibility checks. Both adapters support one worker per run.

`src/memory/flight.ts` adds a separate append-only RawTree activity journal. Step runs record resume, task start/completion/failure, and, on the hosted Liquid path, source-search and extraction start/completion/failure. Acknowledgment loss is reconciled by querying the exact event ID; an unconfirmed write stops the run. The journal stores bounded metadata, not raw provider bodies or secret values. Use `flight` to read newest events and pass `nextCursor` to page backward:

The live CLI also records credit-preflight starts, passes, and denials before a Nimble search. On resume, a prior recorded failure produces a `RETRY_DECIDED` event; a task start without a terminal outcome produces `RETRY_DEFERRED` and stops before repeating a potentially billable call. This is a conservative recovery rule for one sequential worker, not automatic resolution of an ambiguous provider outcome.

```sh
npm run demo:rawtree -- my-run flight
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length" flight
```

### Goal files and the comparison matrix

The live CLI accepts a versioned goal file in place of a single claim. A goal file expands `entities × attributes` into `entity | attribute` claims, capped at 40 per goal. `goals/small-models-v1.json` compares five small open-weight models (LFM2.5-2.6B, Gemma-3-4B, Qwen3-4B, Phi-4-mini, Llama-3.2-3B) on context length, parameter count, license, and release date: 20 claims and 60 tasks. `goals/small-models-pilot.json` covers context length only (5 claims).

```sh
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json step 15   # up to 15 steps in this process
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json report    # entity × attribute matrix
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json replay    # evidence, quotes, timeline
```

Each research claim uses about two Nimble searches and two free Liquid calls. Raise `NIMBLE_DAILY_REQUEST_CAP`, `NIMBLE_DAILY_COST_CAP_USD`, and `OPENROUTER_DAILY_REQUEST_CAP` deliberately for a run, and check `npm run credits` first. The run stops at the first failure, denial, or cap; completed steps stay saved, so rerun the same command to resume. `report` reads stored decisions only. Two agreeing hosts show as ✓; disagreeing values show as ⚠. The verifier groups equivalent spellings before comparing (`src/agent/normalize.ts`): token counts and parameter counts within 5% (`128K` = `131,072`), license names (`Apache 2.0` = `Apache License 2.0`), and dates at year-month precision. Unparseable or ambiguous values fall back to case- and whitespace-insensitive text. Raw values and quotes are stored unchanged. Decisions recorded before normalization are not rewritten; `report` marks spelling-only cases with ≈.

### Evidence brief with FLUX illustration

```sh
npm run brief -- small-models-v1-run-1                        # brief only, no FLUX call
FLUX_IMAGE_BUDGET_USD=0.25 npm run brief -- small-models-v1-run-1 --cover
FLUX_IMAGE_BUDGET_USD=0.25 FLUX_VIDEO_BUDGET_USD=0.50 npm run brief -- small-models-v1-run-1 --cover --video
```

Writes `exports/<run>-brief.html`, a self-contained page. It has a FLUX.2 cover with the title overlaid as HTML text, verdict counts, the exact entity × attribute matrix, "what is uncertain, and why" callouts with quotes and source links, a "how we know" section (sources, snippet vs full page, sessions, failures, retries, follow-ups, skipped pages), and a provenance section. The inspector's **Open brief** button serves it at `/briefs/<run>-brief.html`.

**FLUX never carries facts.** Prompts are built by code from the goal's shape only (`src/brief/prompts.ts`): no model names, values, verdicts, or text. Every fact in the brief is rendered by code from RawTree. The cover is labelled as an AI illustration. (The first cover drew three chips for a five-model goal, which is harmless as illustration and is why pixels never carry data.)

`src/tools/flux.ts` submits to `https://api.bfl.ai/v1/<model>` with `x-key`, polls only the returned `polling_url` (https on `*.bfl.ai`), downloads the result without the key, hashes and caches it under `.continuum/media/<request-hash>/`, and never resubmits after a timeout, moderation, or error. Local UTC-day budgets per media kind (`FLUX_IMAGE_BUDGET_USD` default 0.25, `FLUX_VIDEO_BUDGET_USD` default 0) count provider-reported cost, or the estimate when the outcome is unknown. Generations are journaled in the run's flight table (`GENERATION_*`: model, request ID, prompt hash, seed, reported cost, file hashes). The video is a FLUX 3 draft (6 s, HD, ambient audio, no speech or text).

### Inspector UI

```sh
npm run inspector                                    # http://127.0.0.1:4700 (INSPECTOR_PORT to change)
npm run inspector -- export small-models-v1-run-1    # writes exports/<run>.json for offline viewing
```

A read-only local page (bound to 127.0.0.1) that builds each view live from RawTree. It shows a run picker, a summary with verdict counts, the entity × attribute matrix, and a detail panel for the selected claim (append-only decision history, evidence with exact quotes, source links, snippet or full page, extraction model, and tasks with attempts). Tabs cover **Ask the memory** (the same retrieve → Liquid → verify pipeline as `ask`, with a verified or withheld verdict and citations), **Findings**, and the **Timeline** with restart boundaries. "Export JSON" downloads the current bundle; "Open JSON" loads an export offline, read-only with ask disabled. Web-sourced text is rendered as text only, never as HTML, and links are limited to http(s). No dependencies: `inspector/index.html` plus `src/inspector/server.ts` and `bundle.ts`.

### Contradiction-driven follow-ups

When the verifier returns `unresolved` and the values still differ after normalization, the orchestrator adds a follow-up research task and a re-verification task to the same checkpoint as the decision. The research task searches in `resolve` mode with a query naming the disagreeing values (for example `Qwen3-4B context length 32K tokens 128K tokens native extended`). The follow-up verifier re-checks all evidence for the claim. If one quote states every disagreeing value, as in "32,768 natively and 131,072 tokens with YaRN", the decision becomes **qualified**: the values differ by a stated condition. Otherwise the claim stays `unresolved`. Earlier decisions are preserved; the matrix shows the latest.

Rules: one follow-up round per claim, at most `CONTINUUM_MAX_FOLLOW_UPS` per run (live default 3, fixture/library default 0), spelling-only differences are skipped, and each round costs about one Nimble search (plus a page extract if snippets are empty). For a run that finished before follow-ups existed, `follow-up` plans them without any provider call; `step` then runs them:

```sh
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json follow-up
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json step 2
```

### Ask the memory

`ask` answers a question about a run from what RawTree stores, not from model memory:

```sh
npm run demo:live -- page-fetch-check-3 goals/page-fetch-check.json ask "Why did you conclude Gemma-3-4B has a 128K context window?"
npm run demo:live -- small-models-pilot-1 goals/small-models-pilot.json ask "What failed during this run, and was it retried?"
```

1. **Retrieve (code):** load the latest checkpoint and the replay (checkpoints plus flight events) from RawTree, and select claims whose model name or attribute appears in the question (otherwise all claims, up to 8). Build a packet with short aliases: decisions `D#`, evidence `E#` (value, quote, host, URL, observation time, snippet or full page), notable events `F#`. Process questions (fail, retry, resume, pending…) get code-computed task outcomes `T#` instead of source evidence.
2. **Answer (Liquid, local or OpenRouter):** a schema-constrained answer from the packet only, citing aliases.
3. **Verify (code):** every cited alias must exist in the packet, at least one must be cited, and every number in the answer must appear in the retrieved records. A failing answer is withheld and the stored records are printed instead. `ask:json` returns the packet, alias map, and verdict.

Verification proves the answer cites and quotes real stored records. It does not prove the model's reasoning about them is correct; the citations are printed so a reader can check.

### Full-page fallback

When a research task's search snippets yield no grounded value, the live CLI fetches the top-ranked result page through Nimble Extract (`POST /v2/extract`, static markdown, $1.00 per 1,000 URLs list price). It keeps the lines that name the attribute plus two neighbouring lines on each side, with link targets and images removed (`src/tools/focus.ts`), and runs extraction again on that excerpt. Evidence from this path has `retrieval.sourceKind: "page-extract"`; quotes are exact excerpts of the focused page text. Page fetches share the Nimble daily attempt and cost caps, are cached per run under `.continuum/page-cache/`, and are journaled as `PAGE_FETCH_*` events. `NIMBLE_PAGES_PER_TASK` sets the page count (default 1, max 2, 0 disables).

### Replay inspector

`replay` joins stored checkpoint revisions with flight events into one read-only view: tasks and attempts, pending work, each decision with its reason, cited evidence (source URL, observation time, quote), disagreeing values, per-revision changes, and a timeline with process-restart boundaries. It also flags preflight denials, failed attempts, retry decisions, deferred retries, unmatched task starts, checkpoints committed without a journaled completion, and completed tasks with no flight events (for example, runs that predate the journal). `replay:json` prints the same projection as JSON.

```sh
npm run demo:rawtree -- my-run replay
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length" replay:json
```

Replay only reads RawTree (checkpoints, then flight pages); it makes no Nimble or model call. It reads the newest 100 revisions and up to 1,000 flight events, and it reports truncation when those limits are reached. Flight events are ordered by event ID. A checkpoint is placed just before its task's journaled completion, or by timestamp when no completion was journaled. Replay never fabricates events that were not recorded.

## RawTree demo

Copy `.env.example` to `.env` and provide a read/write key for your intended RawTree cluster. Keys stay local and `.env` is ignored. The selected database must already exist; the checkpoint table is created on first insert.

```sh
npm run demo:rawtree -- my-run
npm run demo:rawtree -- my-run
npm run demo:rawtree -- my-run
npm run demo:rawtree -- my-run inspect
npm run demo:rawtree -- my-run history
```

Each `step` invocation executes one pending task. Research remains explicitly fictional; persistence uses the real HTTP API. Old checkpoints retain evidence and decision history. A write whose visibility cannot be established stops the adapter: inspect the latest server checkpoint before restarting. Automatic write retries and multi-worker locking are not implemented.

Tests cover the HTTP adapter using a local fixture server and separate CLI processes. A credentialed live HTTP run also passed across three standalone CLI processes, retaining all four checkpoints; see [RawTree validation notes](docs/rawtree.md) for the exact scope.

## Liquid through OpenRouter

Set `OPENROUTER_API_KEY` in `.env`; keep the existing RawTree settings. `LIQUID_MODEL` defaults to `liquid/lfm-2.5-2.6b:free` and can be changed to another Liquid model supporting structured outputs. No local model or additional package is required.

```sh
npm run demo:liquid -- liquid-run-1
npm run demo:liquid -- liquid-run-1
npm run demo:liquid -- liquid-run-1
npm run demo:liquid -- liquid-run-1 inspect
npm run demo:liquid -- liquid-run-1 history
```

The first two invocations each call Liquid to extract observations from fictional source text. The third runs the deterministic verifier. Evidence includes exact source quotes, model/request identity, prompt version, and token usage when returned by OpenRouter. These fields persist in RawTree and survive restart. Completed tasks do not make additional model calls.

Model inputs are limited to six documents and 20,000 source-text characters per task. Invalid JSON, invented quotes, unknown sources, incomplete responses, and API errors leave the task pending. Quote checks establish text provenance, not the truth of a source or the relevance of an extracted claim. See [Liquid integration notes](docs/liquid.md) for configuration and validation status.

## Local Liquid model (optional)

Set `LIQUID_BASE_URL` to use a local OpenAI-compatible server instead of OpenRouter. Localhost only. The official GGUF build of the same model is [`LiquidAI/LFM2.5-2.6B-GGUF`](https://huggingface.co/LiquidAI/LFM2.5-2.6B-GGUF). With llama.cpp on macOS:

```sh
brew install llama.cpp
llama-server -hf LiquidAI/LFM2.5-2.6B-GGUF:Q4_K_M --alias LFM2.5-2.6B-Q4_K_M -c 16384 --port 8080 --jinja
# in .env:
LIQUID_BASE_URL=http://127.0.0.1:8080/v1
LIQUID_MODEL=LFM2.5-2.6B-Q4_K_M
```

`LIQUID_MODEL` must contain "LFM" and must equal the model name the server returns. A mismatch fails the task rather than recording another model's output as Liquid evidence. Local mode skips OpenRouter credit checks and quotas; evidence records `extraction.provider: "local"`. The same structured-output request, exact-quote grounding, and failure rules apply. Nimble searches still cost money and keep their caps. Remove `LIQUID_BASE_URL` to return to OpenRouter.

## Credits and request budgets

Run `npm run credits` for current OpenRouter account credit, key spending cap, free-request quota, and local usage. Account credit and key limits are reported separately. Balances not available from a provider remain explicitly unknown.

The Liquid demo checks credits, quota, and current model pricing before every inference. It permits only a `:free` model with verified zero pricing and caps local inference attempts at 10 per UTC day (`OPENROUTER_DAILY_REQUEST_CAP`). Failed attempts count too; there is no paid fallback or automatic model retry. Quota estimates account for local attempts when provider counters lag.

`.continuum/usage.jsonl` records inference attempts and provider-reported costs, including invalid completions. It also counts live RawTree HTTP requests and Nimble searches; fixture-server requests are excluded from totals. RawTree monetary cost remains unknown. Nimble cost is an estimate from public list pricing; actual account balance and custom rates are unknown. This ledger began with the Liquid integration and does not reconstruct earlier RawTree traffic. Use one worker per workspace; local caps are not account-wide distributed spending limits. FLUX usage checks will be added with that integration.

## Live web research with Nimble

Set `NIMBLE_API_KEY` in `.env`. The live workflow uses two Nimble `lite` searches and two free Liquid calls across three process invocations. Give the claim a precise entity and attribute separated by `|`, for example:

```sh
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length"
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length"
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length"
npm run demo:live -- model-research-1 "LFM2.5-2.6B | context length" history
```

Nimble returns up to three result snippets per search; Liquid extracts quoted observations and the verifier records support, conflict, or insufficient evidence. Model or product variants that do not match the named entity in a result title or URL are excluded. Sources are cached per run and task, so a Liquid failure after retrieval can reuse the same search results. The default local Nimble caps are four attempts and a $0.02 list-price estimate per UTC day. There is no automatic paid fallback or repeat search on timeout.

The first live integration run used a broad LFM2.5 family label. It collected snippets from different variants and therefore ended `unresolved`; this is not evidence that one model's published context length changed. The entity filter was added after that run and verified with focused tests. See [Nimble notes](docs/nimble.md).

Next: add explicit contradiction/reverification tasks, durable retry budgets, and an inspector replay before FLUX output. Checkpoints include the full state; the separate flight journal now covers key task/tool lifecycle stages and credit-preflight decisions for new runs. Older runs were not backfilled. A crash between a provider response and its completion event can still leave an unmatched start that requires inspection. This is the integration starter, not the complete long-running agent MVP.

Development ownership briefs are in [docs/agents](docs/agents/README.md); these describe future implementation work, not installed product configuration.
