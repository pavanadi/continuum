# Persistence engineer

Read the [shared coordination brief](README.md), [current handoff](../CURRENT_HANDOFF.md), [tracked plan](../NEXT_STEPS.md), and project handoff first.

## Current status and assignment

RawTree checkpoints and normal cross-process resume are implemented and live-validated. `src/memory/flight.ts` records task/tool lifecycle, preflight, and retry decisions; its table has fixture coverage but no live RawTree validation. The next assignment is the joined replay projection and operator reconciliation for ambiguous attempts. The first-task section below documents the original design target; do not rebuild completed slices. Keep provider calls within the credit rules in `AGENTS.md`.

## Mission and ownership

Make Continuum's work durable, queryable, and reconstructable after process loss.
Own `src/memory/**` and future storage contract tests in `tests/memory/**`.
Support the reliability engineer's replay/resume scenarios without editing their owned tests.
Coordinate shared event/task/context types with the orchestration agent before implementation.
The orchestrator owns scheduling and role behavior; this agent owns their durable representation.
Do not modify another agent's files without agreeing on the change.

## First task: verify RawTree, then build one durable slice

1. Locate current official RawTree developer documentation and runnable examples.
   Record source URLs, retrieval date, supported ingestion/query mechanisms, and constraints.
2. Verify authentication, account availability, raw JSON handling, acknowledgement semantics,
   query visibility delays, ordering, duplicate handling, pagination, and update capabilities.
   These are provider-specific questions requiring verification, not assumed RawTree features.
3. Propose the smallest memory adapter contract and agree on it with orchestration.
   Handoff names such as `record_event` and `get_relevant_memory` are conceptual operations,
   not claims about an existing RawTree SDK or API.
4. Once implementation work starts, use the verified provider path to create a run and goal,
   record events, create/update tasks, and persist a fact with source evidence.
5. Persist a conflicting observation and an unresolved contradiction linked to both observations.
6. Read back compact context and identify the next unfinished task in a fresh process.

If access is unavailable, report the exact missing prerequisite. A local contract fixture may
support development, but must never be presented as proof of RawTree durability or integration.

## Event identity, order, and retries

- Use a small versioned envelope around flexible payloads: schema version, run ID, event ID,
  event type, task ID when applicable, operation ID, attempt ID, logical sequence, timestamp,
  and causal references. Allocate IDs before sending a write.
- Retrying the same event preserves its event ID and payload. A new tool attempt receives a
  new attempt ID while retaining the operation ID. Reject conflicting payloads for one event ID.
- Begin with one writer per run. Assign increasing per-run logical sequences; timestamps alone
  cannot define replay order. Keep concurrent writers out of the MVP until coordination is verified.
- Define duplicate suppression by event ID in reconstruction if provider ingestion is append-only.
  At-least-once ingestion must yield one logical effect per event.
- Treat an acknowledgement whose durability is unknown as an unresolved write; retry by stable ID
  and reconcile. Do not assume immediate query visibility after acknowledgement.
- Keep source observations and supersession links immutable. Corrections add history rather than
  overwriting the evidence that supported an earlier conclusion.

## Task and resume invariants

- The durable run stores its goal; replay derives completed, pending, failed, and interrupted work.
- A task completes only when its result and referenced evidence are durably available. Design
  one completion event containing required result data, or a verified commit protocol; do not
  assume multi-record transactions exist.
- A restart preserves completed work and surfaces started tasks without a durable completion as
  interrupted. The orchestrator chooses reconciliation or retry according to the tool's semantics.
- Persist tool intent before dispatch and tool outcome afterward. A crash between them leaves an
  uncertain outcome; durable intent alone does not prove the tool never executed.
- Persist attempt count and retry eligibility; resuming must not reset retry limits.
- Rebuild from durable events, optionally accelerated by a snapshot with its replay cursor.
  A stale/missing snapshot must not erase later events or prevent reconstruction.
- Resume requires neither previous chat messages nor an in-memory task queue.

## Compact retrieval

Return the goal, selected task, relevant current claims, evidence references/excerpts, recent
decisions, unresolved contradictions, and necessary recent tool outcomes. Enforce an explicit
item/byte budget initially and report selected/omitted counts and the replay cursor. Never load
the full event history into model context. Preserve evidence IDs so omitted detail remains
retrievable. An unresolved contradiction must remain visible when its associated claim is selected.
Scope every query by run ID; inspect/replay retrieval can fetch a longer causal chain separately.

## Acceptance criteria and handoff

- A documented, reproducible command writes the minimal slice through verified RawTree access.
- A separate process reconstructs the same goal, completed work, open contradiction, and next task.
- Replaying duplicate events produces identical state; sequence order governs out-of-order reads.
- Fault checks cover a crash before a write, after an uncertain acknowledgement, and between tool
  dispatch and outcome recording. Interrupted work is visible; completed tasks are not rerun.
- Read visibility delays do not silently produce a false complete or empty state.
- Both conflicting observations remain inspectable, and a claim's explanation follows stored
  evidence and decision references rather than generated history.
- Context output respects its budget even as unrelated stored history grows.
- Deliver adapter/type contracts, verified setup instructions with environment variable names
  but no secrets, test results, and remaining provider limitations to the orchestrator agent.
