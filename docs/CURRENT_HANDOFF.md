# Continuum current coding-agent handoff

Updated 2026-09-25 (Claude Code). The short starting point for the next coding assistant. Decision trail: [SESSION_HISTORY.md](SESSION_HISTORY.md). Plan and checkboxes: [NEXT_STEPS.md](NEXT_STEPS.md). Product vision: [continuum_hackathon_handoff.md](../continuum_hackathon_handoff.md). Commands: [README](../README.md).

## What exists and works (live-validated)

- **Goal:** small open-weight model buyer's sheet, `goals/small-models-v1.json` (LFM2.5-2.6B, Gemma-3-4B, Qwen3-4B, Phi-4-mini, Llama-3.2-3B × context length, parameter count, license, release date). **Reference run: `small-models-v1-run-1`**: complete, 66 tasks, 6 sessions, final matrix ✓7 ◐1 ⚠1 ?11.
- **Pipeline:** Nimble search, then a Nimble Extract page fallback when snippets yield nothing (best-effort, skips failed pages). Liquid LFM2.5 extracts observations with exact-quote grounding. It runs **locally via llama.cpp** (`LIQUID_BASE_URL=http://127.0.0.1:4625/v1`, `LIQUID_MODEL=LFM2.5-2.6B-Q4_K_M`, `thinking_budget_tokens: 0`) or on OpenRouter. A type gate and variant guard filter extractions. Deterministic normalization and verification produce supported / qualified / unresolved / insufficient. Contradiction follow-ups: one round per claim, cap `CONTINUUM_MAX_FOLLOW_UPS` (3). `reverify` appends decisions after rule changes. Everything is append-only in RawTree (`continuum_checkpoints_v1`, `continuum_flight_v1`).
- **Reading the memory:** `replay`, `report`, `ask "<question>"` (code retrieval → Liquid → code verification of aliases, numbers, URLs, times, and model attribution; failing answers are withheld).
- **UI:** `npm run inspector` → http://127.0.0.1:4700 (reads RawTree live; ask; Open brief; export/open JSON).
- **Brief and FLUX:** `npm run brief -- <run> [--cover] [--video]` → `exports/<run>-brief.html`. FLUX is illustration only; prompts contain no facts. Cover: FLUX.2 [pro], $0.03. Clips: FLUX 3 draft 6 s ($0.36) and **HD 12 s ($2.04, used in the brief)**, plus five FLUX.2 [klein] model cards ($0.015 each), all in `exports/media/`. Both are cached in `.continuum/media/`.

## Verification

`npm test` passed **68/68** (fixtures only, no provider calls).

## Credits (local ledger, UTC day 2026-09-25)

Nimble 77 attempts, ~$0.0796 list estimate (1 unknown-cost timeout; balance unknown). OpenRouter 16 attempts, $0 reported (free counter 35/50 left; unused since local Liquid). BFL reported $2.505 (approved: $0.25 image; video raised to $2.50 by the user's choice of the 12 s HD clip). RawTree ~3.1k requests. **The user states RawTree usage is unlimited**: log it, don't optimize it. Nimble and FLUX spending needs explicit user approval per run; pass caps on the command line (`NIMBLE_DAILY_REQUEST_CAP`, `NIMBLE_DAILY_COST_CAP_USD`, `FLUX_IMAGE_BUDGET_USD`, `FLUX_VIDEO_BUDGET_USD`). `.env` holds the keys; never print it.

## Exact next steps

1. **Human listen to both FLUX 3 clips** (audio: no speech). Frames were checked (draft: 1 frame; HD: 7 frames; no text).
2. **Videos** (see `docs/DEMO_VIDEO.md`): live demo `exports/demo/continuum-live-demo.mp4` (2:35; real inspector with live `ask` calls, captured terminal restart, Zoe (Premium) narration; rebuild with `tools/demo-live/make.sh` with the inspector running on current code) and pitch `exports/demo/continuum-pitch.mp4` (2:53). Listen to both once before sharing.
3. **Rehearse `docs/DEMO_SCRIPT.md`** (written and dry-run 2026-09-25; offline fallback export at `exports/small-models-v1-run-1.json`).
3. Optional quality: a Phi-4-mini official-source search (support query gets no entity-filtered results), Llama context/params (no admissible evidence), and `ask` entailment beyond attribution.
4. Operator reconciliation for unmatched starts and crash gaps (NEXT_STEPS §2).
5. **Git:** `tools/demo-video/` (video tooling) is git-ignored by user choice, like `exports/`. Commit and push further changes to `origin/main`.

## Known limits

One writer per run; no exactly-once external calls. Verified answers can overstate a cited source (not entailment-checked). Type-gate and variant rules are heuristics for model-spec attributes. Recorded decisions are never rewritten (use `reverify`). The workspace is a local Git repository (`main`, public and MIT-licensed at https://github.com/pavanadi/continuum, pushed 2026-09-25). `.env`, `.continuum/`, and `exports/` are ignored.
