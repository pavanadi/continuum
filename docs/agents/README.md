# Continuum agent team

Product vision: [project handoff](../../continuum_hackathon_handoff.md). Current status and priorities: [NEXT_STEPS.md](../NEXT_STEPS.md) and [CURRENT_HANDOFF.md](../CURRENT_HANDOFF.md). Coding-agent rules: [AGENTS.md](../../AGENTS.md).

These are reusable development-agent briefs, not installed Codex agent configuration. The user's requested product agents are implemented in `src/agent/`; see the root README for their current scope. The "first assignment" sections below are historical design targets, not instructions to redo completed work. Follow the tracked plan for the next task.

## Development team

| Agent | Brief / ownership | Current assignment |
| --- | --- | --- |
| Coordinator | This file; shared contracts and integration | Keep the tracked plan, handoff, and credit ledger accurate; integrate the replay inspector |
| Persistence engineer | [memory.md](memory.md); `src/memory/` | Join flight events with checkpoints and support operator reconciliation of ambiguous attempts |
| Runtime engineer | [runtime.md](runtime.md); `src/agent/` | Add contradiction-driven follow-up tasks and bounded goal decomposition after replay |
| Reliability engineer | [reliability.md](reliability.md); `tests/` | Test replay across restart, denial, retry, and ambiguous attempt; maintain the judge demo |

The starter already has live RawTree checkpoints, hosted Liquid extraction, and Nimble search. The new flight table has fixture coverage but awaits live RawTree validation. Replay/inspector is next; FLUX remains last. Do not repeat provider calls solely to reprove existing behavior.

## Current verified slice

- `npm test` passed 30/30 fixture tests after preflight/retry-decision coverage.
- RawTree checkpoint resume, hosted Liquid, and Nimble each have documented live validation in `docs/rawtree.md`, `docs/liquid.md`, and `docs/nimble.md` at their stated scope.
- New flight events cover task/tool stages, OpenRouter preflight decisions, and retry/defer decisions. They do not yet provide joined replay, full receipt correlation, or operator reconciliation.

## Shared working rules

- Read the handoff and your brief before editing. Stay within assigned files; propose shared contract changes to the coordinator.
- Use TypeScript for the initial implementation unless verified provider constraints justify a change.
- Verify current provider documentation before implementing integrations; record exact documentation URLs and unresolved API questions.
- Keep provider credentials in environment variables. Never log credentials or commit local secret files.
- Label fixture and live modes explicitly. A fixture demonstration does not prove a sponsor integration.
- All roles reconstruct bounded working context from durable state. Process memory and chat history are not authoritative.
- Persist evidence references and concise decision reasons, not private model reasoning transcripts.
- Preserve prior observations and decisions. Conflicting evidence must not silently replace a fact.
- Use one sequential worker for the first demo. Distributed scheduling and concurrent leases are outside the initial slice.
- Report changed files, checks run, remaining limitations, and the next dependency at handoff.

## Historical target contract and remaining gaps

Use stable `run_id`, `task_id`, `event_id`, `claim_id`, and `evidence_id` references. Each event carries its kind, timestamp, actor, schema version, and flexible JSON payload. Specify deterministic event ordering and duplicate handling after checking the storage guarantees.

The memory interface must support creating/loading runs, recording events, task transitions, evidence and claim observations, contradictions, decisions, unfinished-task lookup, and bounded relevant-context retrieval. Method names and TypeScript signatures are agreed by the persistence and runtime owners before either implements against them.

Task outcomes distinguish success, retryable failure, permanent failure, and unresolved evidence. A task is complete only when the durable result is recoverable. Read-only external calls may repeat after a crash; the memory projection must not duplicate their logical outcomes. Do not promise exactly-once execution.

## First implementation milestone (historical)

1. Inspect official RawTree documentation and available connection details. Capture ingestion, query, visibility, ordering, and retry constraints.
2. Scaffold the smallest TypeScript CLI and memory adapter. Clearly identify any local test adapter.
3. Create a run, tasks, evidence-backed observation, conflicting observation, and contradiction.
4. Reconstruct a compact context with the next unfinished task.
5. Stop the process. A second invocation loads the same run and continues without losing prior evidence or repeating completed logical work.
6. Deliver commands and observed results for the restart demo, with fixture/live status stated.

Only then connect Nimble, add Liquid reasoning, build the inspector, and produce FLUX visuals in the handoff's order. Sponsor integration completion requires live verification, not merely an interface or mock.

## Starting an agent

Use this task template with the appropriate brief:

> Read `AGENTS.md`, `docs/CURRENT_HANDOFF.md`, `docs/NEXT_STEPS.md`, `docs/SESSION_HISTORY.md`, `docs/agents/README.md`, and your assigned brief. Take the highest-priority uncompleted item within your ownership; do not redo historical first milestones. Coordinate interface changes before editing shared files. Return changed files, validation evidence, credits used, remaining limits, and the next dependency. Update the plan, history, and handoff.
