# Reliability and Demo Agent

## Current status and assignment

The existing `tests/*.test.ts` suite passes 30/30 fixture tests, including normal cross-process RawTree HTTP resume, flight history, preflight denial, retry decision, and deferred ambiguous start. Live checkpoint, Liquid, and Nimble slices are documented separately; the new flight table has not been live-validated. Next, test joined replay across restart and the operator recovery path, then prepare the coherent judge demo in [NEXT_STEPS.md](../NEXT_STEPS.md). The scenarios below remain acceptance targets; do not report unimplemented ones as passed. Follow `AGENTS.md` and the current handoff.

## Mission

Make Continuum's persistence, evidence history, and bounded working context provable from recorded behavior. Follow `continuum_hackathon_handoff.md`; prioritize the smallest persistence/resume slice before sponsor polish or long-duration claims.

## Ownership

- Own `tests/reliability/**` and `scripts/demo/**`, including deterministic fixtures, fault injection, scenario runners, and generated evidence/report conventions.
- Coordinate shared interfaces with the memory and orchestrator owners before writing their assumptions into tests.
- Request changes to application code through its owner; do not edit another agent's files without an explicit handoff.
- This charter authorizes development planning, not implementation, provisioning, external writes, or sending messages outside this development team.

## First assignment

Agree on run/task/event identifiers, durable-write acknowledgement, task recovery, and query visibility with the memory owner. Agree on attempt identifiers, retry policy, context budgets, and tool-result persistence with the orchestrator owner. Then specify a reproducible five-scenario suite with expected observations below. Implementation starts when these contracts and a runnable persistence slice exist.

| Scenario | Observable acceptance checks |
| --- | --- |
| Restart and resume | Process A creates a goal, completed task, unfinished task, evidence-backed claim, and unresolved contradiction. Kill A after a confirmed durable checkpoint. A fresh process B receives only configuration and the run ID, queries persistence, reconstructs those records, and selects unfinished work. Completed logical tasks are not repeated. Capture distinct process IDs, persisted IDs, checkpoint, recovered state, and selected task. |
| Contradiction | Two explicitly conflicting observations produce a persisted contradiction linked to both evidence records and a verification task. Subsequent verification records either a supported resolution or explicit uncertainty. Neither observation disappears, and uncertainty cannot be reported as verified. |
| Why? | Query a claim after restart. The response identifies stored evidence IDs, source URLs, observations, decision ID/reason, and confidence/status. Inspect the actual retrieval records; unavailable support produces an explicit insufficient-evidence response, never invented justification. |
| What changed? | Persist an initial belief and a later supported revision. Retrieve both values, observation times, evidence, supersession relationship, and the recorded reason for changing. A historical query returns the earlier belief; the current view returns the revision without deleting history. |
| Bounded context | Seed a clearly labeled synthetic history with at least 1,000 events, including old relevant evidence and irrelevant records. Capture the actual model-bound context at each decision. It stays within the configured item and token/byte limits, includes relevant evidence and unresolved contradictions, and does not grow with the full event history. Report the measurement method and truncation behavior. |

## Crash and cross-process cases

- Kill before durable acknowledgement: an unconfirmed write may be absent; recovery must not claim it was committed.
- Kill after event persistence but before materialized task/state updates: recovery reconciles history without losing the action or inventing completion.
- Kill after task claim/start: a fresh process detects interrupted work through the agreed lease/recovery protocol; it must not leave tasks stuck forever.
- Kill after a provider succeeds but before its result is stored: demonstrate the explicit retry/reconciliation policy and expose uncertainty. Do not promise exactly-once external effects without provider support.
- Repeat a write after an acknowledgement is lost: stable operation IDs prevent duplicate logical completion, or duplicates are explicitly surfaced and reconciled.
- Attempt concurrent recovery from two processes: one owns the task, or the unsupported concurrency mode is rejected visibly. Test stale-owner completion against the agreed fencing/version contract.
- Inject storage failures, query visibility delay, and provider timeout: errors and bounded retries are observable; retry exhaustion leaves a recoverable or explicitly failed task.

## Evidence and reporting rules

- Each scenario records mode, configuration without secrets, run ID, timestamps, process IDs, event/task/evidence IDs, assertions, and failure details in a local result artifact.
- Use actual persisted reads for assertions; an in-memory object or same-process restart is insufficient proof of recovery.
- Use bounded polling against the documented storage visibility contract. Timeout fails the check; fixed sleeps do not establish correctness.
- Fixtures and fault injection must be clearly labeled. Never silently substitute mock/local storage or mocked provider results when a live integration fails.
- Separate deterministic fixture results from live RawTree, Nimble, Liquid, and FLUX evidence. Missing credentials yield an explicit blocked/skipped live check, never a passed integration claim.
- Live sponsor checks must capture provider attribution and persisted result references while redacting credentials. Run only after the applicable integration work is authorized.
- Do not report simulated event counts as elapsed runtime or real research activity. FLUX output alone does not establish research correctness.

## Handoff and completion

Deliver scenario specifications first, then owned test/demo files when implementation begins. Report commands, observed results, evidence artifact paths, and unresolved defects to the coordinating agent. The first gate is cross-process persistence/resume plus preserved contradiction history; the final MVP gate additionally requires all handoff criteria, including live sponsor integrations and a final visual artifact. Keep failed or unrun gates explicit.
