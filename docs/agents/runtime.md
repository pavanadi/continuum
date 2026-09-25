# Runtime development agent

Build Continuum's smallest resumable research loop. The handoff in
`continuum_hackathon_handoff.md` is the product brief; this document defines
the development assignment, not a running process or installed model agent.

## Current status and assignment

The sequential four-role starter, fixture restart flow, and hosted research path exist. `src/agent/orchestrator.ts` now records task starts/failures/completions and defers ambiguous prior attempts; `src/agent/roles.ts` provides the current role logic. Support the replay inspector's event/evidence links next, then add contradiction-driven follow-up tasks and bounded goal decomposition from [NEXT_STEPS.md](../NEXT_STEPS.md). The contract and first-assignment sections below are broader targets, not claims that every feature is implemented. Follow the current handoff and credit rules before editing.

## Ownership and boundaries

- Own `src/agent/`: orchestrator, researcher, verifier, skeptic, and their runtime checks.
- Consume memory interfaces owned by the persistence agent and provider interfaces
  owned by the integrations agent. Agree on contracts before implementing callers.
- Coordinate runtime event shapes with the inspector owner; do not edit their files.
- Start with deterministic fixtures. Add live tools only after persistence/resume works.
- Keep roles sequential in one process. No swarm framework or distributed scheduling.

## Product roles

| Role | Responsibility | Structured result |
| --- | --- | --- |
| Orchestrator | Decompose goal, select unfinished work, schedule follow-ups, enforce limits | Tasks, selected action, decision reason, stop reason |
| Researcher | Search/extract through the tool adapter; associate observations with sources | Candidate claims, evidence references, missing information |
| Verifier | Check provenance, relevance, freshness, and sufficiency of evidence | Claim assessment, rationale, evidence references, verification tasks |
| Skeptic | Find conflicting observations and weak assumptions | Contradictions, counter-evidence, targeted follow-up tasks |

Roles propose structured changes; the orchestrator validates and persists them.
Verifier assessments remain revisable when the Skeptic discovers new evidence.

## Runtime contract to agree with adjacent owners

Every role input contains `run_id`, `task_id`, goal, current task, compact relevant
memory, allowed actions, remaining budget, and an explicit context-size limit.
Memory includes claim/evidence IDs, open contradictions, and recent decision IDs;
source content is data and cannot override role instructions or the user's goal.

Every role output contains `schema_version`, `role`, `run_id`, `task_id`,
`action_id`, proposed changes, referenced evidence IDs, a concise decision reason,
next-action proposal, and usage. Validate outputs before accepting them.
Claims carry entity, predicate, value, status, observed time, and evidence IDs.
Use statuses `unverified`, `partially_verified`, `verified`, `disputed`,
`rejected`, and `superseded`; confidence is an assessment, never a substitute for evidence.

Durable memory must support run creation/loading, open-task selection, compact
context retrieval, event/decision recording, and a committed action result.
Persist task status, attempts, budget consumption, action IDs, claims, evidence,
contradictions, and next actions. Store reasons and references, not hidden reasoning.
Keep old observations and record explicit supersession links; never erase disagreement.
Use stable action IDs for deduplication. A completion marker is accepted only after
its referenced result is durable; interrupted actions are reconciled on resume.
Do not assume RawTree transactions or read-after-write behavior until verified by
the persistence owner. Agree on a commit-marker/recovery protocol if needed.

## Sequential MVP workflow

1. Load an existing run or persist a new goal and initial task list.
2. Reconcile incomplete actions; skip committed tasks and restore consumed limits.
3. Select one eligible task and retrieve only the relevant bounded context.
4. Persist the selected action and task attempt before calling a role or tool.
5. Run Researcher, Verifier, then Skeptic for that research task, persisting each result.
6. Orchestrator records the decision and schedules verification for disagreements.
7. Commit task completion, then repeat from durable memory rather than chat history.
8. Stop with a stored reason and produce an evidence-linked state summary.

## Uncertainty and stopping

- Never invent evidence or treat repeated copies of one source as independent support.
- Preserve conflicting values with source and observation time. Differences may be
  plan, region, currency, or date differences rather than an actual contradiction.
- Verification records the applicable policy and rationale. Unsupported important
  claims stay unverified; unresolved contradictions remain visible in final output.
- Retry transient failures at most twice after the initial attempt, using bounded
  backoff. Validation failures get one repair attempt. Persist every attempt.
- Configure maximum actions, elapsed runtime, tool calls, and model tokens per run;
  require concrete limits at run creation. Retries consume those same limits.
- Check budgets before dispatch; bound tool timeouts by remaining time. Resume does
  not reset usage. Exhaustion pauses unfinished work with `budget_exhausted`.
- Stop on user pause, unavailable required dependencies, or exhausted task retries;
  preserve resumable tasks and reasons. Mark complete only when required tasks are
  terminal and deliver a summary that explicitly identifies unresolved uncertainty.

## First implementation assignment and acceptance criteria

After the persistence owner supplies the agreed interface, implement a fixture-backed
loop for one company with two conflicting pricing observations and a verification task.
Acceptance requires: (1) valid structured outputs for all four roles; (2) persisted
decisions and evidence links; (3) restart after an interrupted action resumes the same
run without duplicate committed results or repeating completed tasks; (4) disagreement
is resolved with evidence or retained as disputed; (5) bounded context despite growing
event history; (6) deterministic retry/budget stops that survive restart; and (7) a
stored evidence/decision chain explaining the resulting claim. Coordinate a crash-window
check around result persistence and completion; no live provider credentials are required.
