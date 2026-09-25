# Continuum: judging-round prep

Companion to [DEMO_SCRIPT.md](DEMO_SCRIPT.md). The script covers the walkthrough; this sheet covers the questions. Every number here was checked against `exports/small-models-v1-run-1.json` (the reference run's export) on 2026-09-25. Where the docs disagree, this sheet uses the export.

## The 20-second answer

> "Long-running agents break in three ways: they forget what they did, a crash throws away the work, and when you ask *why*, they make something up. Continuum writes every step, quote and decision to RawTree as append-only memory. It resumes after any restart, it keeps disagreements visible instead of picking a winner, and when you ask it *why*, it answers only from stored records. Code checks every citation before you see the answer."

**One line to repeat:** *Most agents remember the conversation. Continuum remembers the work.*

## Numbers to know cold

| | |
|---|---|
| Goal | 5 small open models × 4 facts (context length, parameters, license, release date) = **20 claims** |
| Reference run | `small-models-v1-run-1`: **72 tasks**, **9 process sessions**, **74 revisions**, 0 pending |
| Evidence | **40 quoted observations** from **18 websites**; **16** from full pages fetched when snippets had no value |
| Outcome | **✓ 7 supported · ◐ 1 qualified · ⚠ 1 unresolved · ? 11 insufficient** |
| Failures | Phi-4-mini skeptic task failed twice (bot-protected page); each failure logged, then retried; the run completed |
| Follow-ups | 3 automatic contradiction follow-ups (cap: 3), plus re-verification that appends decisions |
| Cost | Nimble ≈ **$0.08** list estimate for the whole day (77 attempts). Liquid **$0**, running locally. FLUX **$2.505** reported (almost all of it the 12 s HD clip). RawTree: about 3.1k requests, no charge applied |
| Code | About 3.6k lines of TypeScript, **no npm dependencies**, **67 tests** passing (fixtures, no live calls) |
| Repo | https://github.com/pavanadi/continuum (public, MIT) |

## How it works, in four lines

1. **Orchestrator** turns the goal into tasks; for each claim it runs **Researcher → Skeptic → Verifier** in order.
2. **Nimble** searches the web (and fetches the full page if snippets have no value). **Liquid LFM2.5-2.6B**, running locally in llama.cpp, extracts values plus the *exact quote*. A quote that isn't in the page is rejected.
3. **Verifier is deterministic code:** it normalizes values (`128K` = `131,072`) and marks a claim supported only when **two different websites** agree. It keeps both sides of a disagreement, and it schedules a follow-up search when values conflict.
4. **RawTree** stores two append-only tables: state checkpoints (one row per revision) and a flight recorder of every stage (started, succeeded, failed, retried, skipped). Replay, report, the inspector and `ask` all read from them.

---

## Likely questions and answers

### Why it matters

**"What's new here? Isn't this RAG?"**
RAG retrieves documents to answer a question. Continuum stores **the agent's own work**: tasks, evidence, decisions and failures, as a durable log. The "why" answers come from that log, not from a document store. The two new pieces are that the agent's **planning is driven by its memory** (contradictions create follow-up tasks) and that the **model can't show an answer the memory doesn't support**.

**"Who would use this?"**
Anyone who hands an agent a long job and has to trust the result: due diligence, competitive research, compliance evidence, procurement comparisons. The same design gives a **product watcher**: rerun the same goal daily and see what changed, because every run and revision is kept.

**"Why not just give the model a bigger context window?"**
Context disappears when the process stops, and it can't be audited afterwards. The reference run has 74 revisions and hundreds of flight events; resume loads only the **latest checkpoint**, not the history. The history stays queryable for replay and `ask`.

### RawTree

**"Why RawTree? Why not Postgres or a JSON file?"**
We do have a JSON-file backend, and it's used for tests and the offline demo. RawTree adds durable storage outside the machine, SQL over the whole history (ClickHouse underneath), and two tables that only ever grow, which matches an event log. That's what makes the replay and cross-run questions ordinary SQL. Honest note: we haven't benchmarked it against Postgres; we chose it for the append-only, analytics-over-events fit.

**"What happens on a crash in the middle of a call?"**
Each checkpoint row carries the state and its event batch together, so nothing is half-written. After an insert, the adapter reads back the *exact* checkpoint. If it can't confirm, it **stops** instead of reinserting. A task that recorded a start but no outcome is **not** retried automatically, because a paid call may already have happened. Replay flags it as an unmatched start for a person to check.

**"Can two agents write to the same run?"**
No, it's one writer per run. Conflicts are detected if they're visible, but there is no distributed lock or compare-and-swap. That's the first thing to add for multi-agent use.

### Liquid

**"Why a 2.6B model? Isn't it too small?"**
It's small on purpose. It runs **on-device** (about 7–18 s per call on an M4 laptop), costs nothing, and keeps the data local. We give it narrow jobs: extract a value and its exact quote, and phrase an answer from a packet of records. **Code does the judging**, so a small model's mistakes get caught rather than trusted. The same code switches to hosted Liquid on OpenRouter with one env var.

**"What does the model actually decide?"**
It extracts observations and writes `ask` answers. It does **not** decide supported, unresolved or qualified; deterministic code does. That's deliberate: every verdict can be reproduced.

### Ask the memory

**"How do you know the 'why' answer isn't hallucinated?"**
Code chooses the records, the model phrases the answer, and then code checks it. Every cited ID must exist; every number, URL and time must appear in the retrieved records; and each sentence that names a model may only use facts stored for *that* model. If any check fails, the answer is **withheld** and the raw records are shown instead. In the demo it withholds a fluent answer that blamed Gemma for Phi's failures.

**"So 'verified' means correct?"**
No. It means **grounded**: every citation, number, URL, time and model attribution matches stored records. It doesn't prove the reasoning. Example: the Qwen answer passes, but it overstates what apxml.com says. That's why citations are always shown, and why entailment checking is on our next-steps list.

### Results and quality

**"11 of 20 are '?'. Isn't that a failure?"**
It's the rule doing its job. We only show ✓ when **two different websites** agree. Of the 11: several have exactly one source (LFM2.5 license, Phi-4-mini license, Gemma release date, Qwen release date, Llama license and release date), and some had no admissible evidence at all (Llama context length and parameters, Gemma license). Filling them in would be easy if we allowed one source or the model's own knowledge. We chose to show uncertainty rather than guess. More budget (more searches, official-source queries) would move many of them.

**"Why is Llama so empty?"**
Search results didn't include pages with those values that passed our entity and type checks. Two observations were rejected as the wrong type. It shows the filters working, but it also shows retrieval is the weak link. A targeted query for the official source is the fix.

**"Is ✓ the truth?"**
It means sources agree, not that it's proven, and the UI says so. Two websites can copy each other; we don't check whether publishers are independent.

**"Qwen shows both 32K and 128K. Which is right?"**
Both. The follow-up search found *"Native context window is 32,768 tokens, expandable to 131,072 tokens using YaRN."* We label that **qualified**: both values hold, under different conditions. The earlier "unresolved" decision is still in the history.

**"Gemma: 128K vs 32K?"**
Hugging Face says 128K; a listing site says 32K (probably a different Gemma variant). The follow-up didn't settle it, so it stays ⚠ with both quotes. We don't break the tie ourselves.

### Nimble and FLUX

**"What does Nimble do?"**
Live web search, plus page extraction as a fallback when snippets have no value (16 of the 40 observations came from full pages). Pages it can't fetch are logged and skipped, not retried endlessly.

**"Is the video or image data-driven?"**
No, and on purpose. FLUX makes **illustration only**; its prompts contain no facts. Every number in the brief is drawn by code from RawTree. We asked for five chips and FLUX drew three, which is exactly why generated pixels never carry data. The artwork still has provenance: model, request ID, seed and cost.

### Build process

**"How much did AI write?"**
We built it with AI coding assistants (Claude Code and others), working from a shared handoff and an append-only session history in `docs/SESSION_HISTORY.md` that records each decision, test result and credit spent. The design choices were ours: append-only memory, code as the judge, the two-website rule, and withholding answers that fail checks. *(Adjust this answer to how you actually split the work.)*

**"What was hardest?"**
- **Values that look different but match** (`128K` vs `131,072`), which we fixed with normalization.
- **Qualifiers** like native vs extended context, which we fixed with the qualified status and follow-ups.
- **Honest failure handling**: never repeating a paid call whose outcome is unknown.
- **Catching fluent but misattributed answers**, which we fixed with a sentence-level check of which model each fact belongs to.

**"What would you build next?"**
1. Entailment checking for `ask`: does the quote actually say this?
2. Model-driven goal breakdown with a budget (goal files are hand-written today).
3. Cross-run analysis in SQL: single-source claims, websites that keep disagreeing, what changed since the last run (the product watcher).
4. A multi-writer lock.
5. Snapshot compaction as runs grow.

---

## Weak spots: own them before a judge finds them

| Weak spot | How to say it |
|---|---|
| 11/20 insufficient | "Strict on purpose: two different websites or it's a '?'. More search budget moves these." |
| Llama has almost no evidence | "Retrieval is the weak link; filters rejected wrong-type values instead of letting them in." |
| "Verified" ≠ entailed | "Grounded, not proven. Citations are always shown; entailment checking is next." |
| Goal decomposition is manual | "Goal files are entities × attributes today; model-planned decomposition is next." |
| One writer per run | "No distributed lock yet; conflicts are detected, not prevented." |
| LFM2.5 "Aug 2026" release date | Supported by two websites in this run; don't present it as independently confirmed. |
| FLUX clip audio | Not verified by a human listen; play it muted if unsure. |

## Don't say

- "It's true" or "fact-checked" for ✓. Say "two sources agree".
- "It never hallucinates." Say "it can't show an answer that cites something not in memory".
- "Exactly-once." We avoid repeating calls whose outcome is unknown; we don't guarantee exactly-once.
- That the Acme pricing in the restart demo is real. It's fictional; only the model comparison is live web data.
- That the video shows data. It's illustration.

## If a judge wants to see it live

```sh
npm test                                                           # 67 tests, no network
npm run demo:rawtree -- judge-q-1                                  # run 3×, then add "replay"
npm run demo:live -- small-models-v1-run-1 goals/small-models-v1.json report
npm run demo:live -- small-models-v1-run-1 goals/small-models-v1.json ask "Why is the Gemma-3-4B context length unresolved?"
npm run inspector                                                  # http://127.0.0.1:4700
```

`ask` needs local llama-server on port 4625. If it's down, show the replay and inspector, and describe the withheld answer from DEMO_SCRIPT.md (the output is deterministic).
