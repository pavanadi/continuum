# Continuum working preferences

## Cross-agent handoff (Codex, Claude, Copilot, and other coding assistants)

- Before changing code, read `docs/CURRENT_HANDOFF.md`, `docs/NEXT_STEPS.md`, `docs/SESSION_HISTORY.md`, this file, and the relevant implementation docs. Treat repository files and test results as authoritative over any assistant's chat memory.
- After every material implementation, design, provider-use, validation, or blocker decision, append a dated entry to `docs/SESSION_HISTORY.md`. State what happened, why, the evidence, files touched, credit impact, and remaining uncertainty. Never rewrite or delete an earlier entry; append a correction if it was wrong.
- Before ending a work session or switching assistants, update `docs/CURRENT_HANDOFF.md` with the current working state, exact next action, tests run, known limits, and provider usage. Keep it concise and link to the detailed log. A receiving assistant should be able to proceed without this chat.
- Update the checkboxes and validation snapshot in `docs/NEXT_STEPS.md` when a milestone changes status. Leave incomplete slices unchecked and state what remains.
- Do not claim a complete historical transcript: early work predates this log. Mark retrospective entries as reconstructed from repository artifacts or known session notes. Never invent tool calls, costs, timestamps, or decisions.
- Keep secrets, raw `.env` values, private account data, and unnecessary provider response bodies out of handoff files.

- Track provider credits, request quotas, and actual usage whenever running live queries. Check current balances/limits first where the provider exposes them; report unknown balances as unknown, never zero or unlimited.
- Prefer free Liquid models on OpenRouter, bounded inputs/outputs, fixture tests, and resuming existing runs. Do not repeat successful calls just to demonstrate them again.
- Record provider-reported costs separately from estimates. Free inference still consumes request quota.
- Keep paid model use disabled until an explicit spending budget is set. Stop on exhausted limits and do not add automatic paid fallback or retry loops.
- Apply the same usage/budget discipline when adding Nimble and FLUX. Do not claim their balances are monitored before those integrations exist.
- Never print API keys or read `.env` into tool output. Check presence without displaying secret values.
