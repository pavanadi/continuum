# Hackathon Project Handoff --- Persistent Long-Running Agents

## Hackathon Prompt

> **Build agents that stay reliable over long tasks. Explore persistent
> state, memory, and context management, and show a working project at
> the end of the day.**

## Partner Stack

The hackathon partners discussed are:

-   **Liquid AI** --- efficient/local models for reasoning, extraction,
    classification, planning, and tool use.
-   **Nimble** --- real-time web search, extraction, crawling, and
    web-data infrastructure for agents.
-   **RawTree (Tinybird)** --- schema-flexible analytical storage for
    raw events/JSON, agent memory, execution history, telemetry, and
    observability.
-   **Black Forest Labs / FLUX** --- image/video generation and editing;
    useful as the final visual communication/output layer.

------------------------------------------------------------------------

# Core Architecture

The central idea is to build an agent that can work for hours without
depending on an ever-growing chat context.

Instead, the system continuously externalizes its work into persistent
memory.

``` text
                         USER GOAL
                            |
                            v
                  +-------------------+
                  | PERSISTENT AGENT  |
                  |   ORCHESTRATOR    |
                  +---------+---------+
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
          LIQUID AI       NIMBLE        RAWTREE
          Reasoning       Live Web      Memory
          Planning        Search        State
          Extraction      Retrieve      Audit
          Decisions       Verify        Telemetry
              |             |             |
              +-------------+-------------+
                            |
                     SELF-CORRECTION
                            |
                            v
                    BLACK FOREST LABS
                            |
                            v
                       Visual Output
```

A useful shorthand:

> **Nimble gives it eyes.\
> Liquid gives it reasoning.\
> RawTree gives it memory and self-observation.\
> FLUX gives it visual communication.**

And the product-level pitch:

> **Most agents remember the conversation. Ours remembers the work.**

------------------------------------------------------------------------

# Why RawTree Matters

RawTree changes the role that Tinybird initially had in the
architecture.

Rather than treating it as just an analytics database, use RawTree as
the agent's:

-   flight recorder
-   episodic memory
-   execution history
-   state store
-   evidence store
-   contradiction history
-   observability system

Agents produce irregular and evolving data. One event may represent a
web search, another a decision, another an error, and another a newly
discovered fact.

Example:

``` json
{
  "run_id": "hackathon-001",
  "timestamp": "...",
  "type": "web_research",
  "company": "Acme AI",
  "tool": "nimble",
  "query": "...",
  "result": "...",
  "confidence": 0.72,
  "status": "needs_verification"
}
```

Another event could be:

``` json
{
  "run_id": "hackathon-001",
  "type": "agent_decision",
  "decision": "recheck_acme_pricing",
  "reason": "two sources conflict",
  "priority": 8
}
```

Another:

``` json
{
  "run_id": "hackathon-001",
  "type": "tool_failure",
  "tool": "nimble",
  "url": "...",
  "error": "timeout",
  "retry_count": 2
}
```

The important concept is that we do **not** want the agent's entire
history continually inserted into its LLM context.

Instead:

``` text
RAW EXECUTION HISTORY
████████████████████████████████████

                |
                v

       PERSISTENT MEMORY / STATE

Goal
├── completed tasks
├── current hypotheses
├── verified facts
├── rejected facts
├── unresolved questions
├── contradictions
├── next actions
└── important evidence
```

When necessary, the agent queries RawTree to reconstruct relevant
context.

------------------------------------------------------------------------

# Long-Running Agent Loop

The desired execution loop is:

``` text
1. LOAD STATE
      |
      v
   RawTree

2. DECIDE NEXT ACTION
      |
      v
   Liquid AI

3. GET NEW INFORMATION
      |
      v
   Nimble

4. VALIDATE / REASON
      |
      v
   Liquid AI

5. STORE RESULT + STATE
      |
      v
   RawTree

6. CHECK FOR CONFLICTS / UNFINISHED WORK
      |
      v
   RawTree

7. Repeat for potentially hundreds of operations

8. CREATE FINAL OUTPUT
      |
      v
   Black Forest Labs / FLUX
```

The agent should be able to ask its persistent history questions such
as:

-   What have I already investigated?
-   What claims only have one source?
-   What facts remain unverified?
-   Where are sources contradictory?
-   Which tasks did I start but never complete?
-   What did I previously believe about this entity?
-   Why did I make this decision?
-   What changed since I first researched this?
-   Which failed operations should be retried?

------------------------------------------------------------------------

# Five Project Ideas Considered

## 1. Agent Flight Recorder / Persistent Research Agent

Give the agent a substantial research objective, for example:

> Research 30--50 AI infrastructure companies. Determine their products,
> pricing, customers, competitors, and differentiators. Verify important
> claims from multiple sources and produce a final competitive
> landscape.

The interesting part is not merely research.

The agent should execute 100+ operations while retaining reliable state.

RawTree records:

-   searches
-   pages inspected
-   facts
-   evidence
-   confidence
-   decisions
-   contradictions
-   errors
-   retries
-   completed tasks
-   unfinished tasks

### Killer Demo

Stop the agent halfway through.

Restart it.

The agent loads its state from RawTree and continues rather than
starting over.

Then ask:

> "Why did you conclude X about Company Y?"

The agent reconstructs the evidence and decision history.

------------------------------------------------------------------------

## 2. Autonomous Product Watcher

Example objective:

> Track several AI companies throughout the day and continuously
> maintain an accurate comparison of their agent capabilities.

The agent periodically revisits sources.

Example:

``` text
10:00 Search companies
10:30 Discover docs
11:00 Extract capabilities
11:30 Verify claims
12:00 Revisit websites
12:30 Discover change
13:00 Reconcile contradiction
```

RawTree can maintain temporal knowledge such as:

``` text
11:02  Acme pricing  $49
13:17  Acme pricing  $59

CHANGE DETECTED
```

The agent then investigates whether this is an actual change, stale
source, cached page, or conflicting information.

This demonstrates **evolving memory**, rather than static chat memory.

------------------------------------------------------------------------

## 3. Autonomous Incident Investigator

Give the agent a simulated production problem:

> Checkout latency increased at 10:42 AM. Find the root cause.

RawTree contains:

-   logs
-   metrics
-   traces
-   deployments
-   API events
-   errors

The agent develops hypotheses and tests them.

``` text
Hypothesis #1
Database overload
      |
      v
Query telemetry
      |
      v
REJECTED

Hypothesis #2
Deployment 1847
      |
      v
Query logs
      |
      v
REJECTED

Hypothesis #3
External payment API
      |
      v
Nimble checks web/status information
      |
      v
CONFIRMED
```

The system preserves the hypothesis history.

A strong demo question:

> "Why did you reject the database hypothesis?"

The agent retrieves and explains the earlier investigation rather than
inventing a new explanation.

------------------------------------------------------------------------

## 4. Persistent Due-Diligence Agent

Example:

> Investigate Company X as a possible partnership or acquisition target.

Research checklist:

``` text
Company
├── Product
├── Founders
├── Customers
├── Pricing
├── Competitors
├── Funding
├── Technical architecture
├── Security
├── Legal issues
├── Customer complaints
└── Risks
```

The important concept is **evidence-backed memory**.

Example:

``` text
CLAIM
"Company has 10,000 customers"

├── Source A: company website
├── Source B: CEO interview
└── Source C: independent article

confidence = HIGH
```

Versus:

``` text
CLAIM
"Company is profitable"

└── Source A: CEO interview

confidence = LOW
requires_verification = true
```

The agent remembers not only **what it believes**, but **why it believes
it**.

------------------------------------------------------------------------

## 5. Research Swarm

Multiple agents share persistent memory.

``` text
                    MANAGER
                       |
       +---------------+---------------+
       |               |               |
       v               v               v
 Research Agent   Verification     Skeptic Agent
                      Agent
       |               |               |
       +---------------+---------------+
                       |
                       v
                    RAWTREE
                 SHARED MEMORY
```

Roles:

### Researcher

Find information supporting or explaining a claim.

### Skeptic

Look for conflicting evidence or weaknesses.

### Verifier

Determine whether evidence is sufficient.

### Manager

Determine what should happen next.

Example:

``` text
CLAIM:
Acme has 10,000 customers

Researcher: CONFIRMED
Skeptic: QUESTIONED
Verifier: PARTIALLY VERIFIED

Final confidence: MEDIUM
```

This demonstrates **persistent shared memory across agents**.

------------------------------------------------------------------------

# Recommended Hackathon Project

Combine idea **#1 (Agent Flight Recorder)** with a lightweight version
of **#5 (Research Swarm)**.

Working project name:

# Continuum

### Long-running agents that remember what they did --- and why.

Example user goal:

> Research the AI agent infrastructure market and produce a verified
> competitive landscape.

Architecture:

``` text
                  CONTINUUM

                      |
             +--------+--------+
             |  ORCHESTRATOR   |
             +--------+--------+
                      |
          +-----------+-----------+
          |           |           |
          v           v           v
     RESEARCHER    VERIFIER    SKEPTIC
          |           |           |
          +-----------+-----------+
                      |
                      v
                 +---------+
                 | RAWTREE |
                 +---------+

                SHARED MEMORY
```

## Partner Responsibilities

### Nimble --- Perception

Use for:

-   web search
-   page extraction
-   crawling
-   live information
-   evidence gathering
-   source verification

### Liquid AI --- Cognition

Use for:

-   structured extraction
-   classification
-   summarization
-   reasoning
-   planning
-   deciding the next action
-   potentially local tool dispatch

### RawTree --- Persistent Memory + Flight Recorder

Store:

-   facts
-   sources
-   evidence
-   decisions
-   hypotheses
-   contradictions
-   task status
-   agent events
-   tool calls
-   errors
-   retries
-   telemetry
-   execution history

### Black Forest Labs / FLUX --- Communication

Use final verified state to generate:

-   visual market map
-   competitive landscape
-   visual executive brief
-   infographic
-   other polished visual deliverables

------------------------------------------------------------------------

# Agent Memory Model

Do not think of memory as one giant transcript.

Separate it conceptually into several layers.

## 1. Event Memory

Everything the agent does.

Examples:

``` text
SEARCH_STARTED
SEARCH_COMPLETED
PAGE_FETCHED
FACT_EXTRACTED
CLAIM_CREATED
CLAIM_VERIFIED
CONTRADICTION_FOUND
DECISION_MADE
TOOL_FAILED
TOOL_RETRIED
TASK_STARTED
TASK_COMPLETED
```

## 2. Knowledge Memory

What the agent currently believes.

Possible conceptual structure:

``` text
entity
claim
value
confidence
status
first_observed_at
last_verified_at
```

## 3. Evidence Memory

Why the agent believes something.

``` text
claim_id
source_url
source_type
observation
timestamp
supports_or_contradicts
```

## 4. Task Memory

What remains to be done.

``` text
task_id
objective
status
priority
parent_task
assigned_agent
attempt_count
```

## 5. Decision Memory

Why the agent took an action.

``` text
decision
reason
inputs_considered
selected_action
timestamp
```

The actual RawTree data can remain flexible JSON; these are logical
concepts rather than a requirement to build rigid schemas.

------------------------------------------------------------------------

# Context Management Strategy

The LLM should **not** receive the entire RawTree history.

Before every significant reasoning step:

``` text
User Goal
   +
Current Task
   +
Relevant Facts
   +
Relevant Evidence
   +
Recent Decisions
   +
Open Contradictions
   +
Recent Tool Results
   =
SMALL WORKING CONTEXT
```

Everything else stays in RawTree.

This is central to demonstrating the hackathon theme.

We want to show that:

``` text
execution history ≠ model context
```

The agent can have thousands of stored events while loading only the few
relevant pieces for its next decision.

------------------------------------------------------------------------

# Self-Correction Loop

One of the strongest features should be contradiction detection.

Example:

``` text
14:32:11 Nimble search
          |
14:32:17 Found pricing page
          |
14:32:22 Extracted $49/month
          |
14:33:01 Found conflicting $79/month
          |
14:33:04 CONTRADICTION FLAGGED
          |
14:34:22 Nimble checks current pricing
          |
14:34:28 $79 determined to be current
          |
14:34:31 Old $49 fact superseded
```

The agent should never silently overwrite its old memory.

Instead, preserve the history:

``` text
$49
  |
  +-- observed_at
  +-- source
  +-- superseded_by --> $79
```

This allows the system to answer:

> What changed?

and

> Why did you change your conclusion?

------------------------------------------------------------------------

# Agent Replay / Inspector

This is probably the most important UI feature.

The dashboard could look roughly like:

``` text
CONTINUUM
------------------------------------------------

Goal
Research AI agent infrastructure companies

Progress                         73%
███████████████████████░░░░░░░

Agent Activity
------------------------------------------------
11:41 Researcher -> Nimble search
11:42 Found Company X pricing
11:42 Memory stored -> RawTree
11:43 Verifier -> checking source
11:43 Contradiction detected
11:44 Skeptic -> alternative search
11:45 Contradiction resolved

Persistent Memory
------------------------------------------------
Events                         847
Facts                          183
Verified                       141
Unverified                      27
Contradictions                  15
Resolved                        12

Agents
------------------------------------------------
Researcher          working
Verifier            working
Skeptic             working

[ Inspect Memory ]     [ Replay Agent ]
```

## Replay Agent

Click a fact or decision and reconstruct the path:

``` text
Search
  |
Evidence discovered
  |
Fact extracted
  |
Conflicting source found
  |
Contradiction created
  |
Verifier investigated
  |
Decision changed
  |
Final verified fact
```

This makes invisible agent-memory architecture understandable to judges
very quickly.

------------------------------------------------------------------------

# Key Demo Scenarios

The final demo should intentionally prove reliability rather than merely
show a final answer.

## Demo 1 --- Resume After Restart

1.  Start research.
2.  Let the agent perform many operations.
3.  Kill the process.
4.  Restart.
5.  Agent queries RawTree.
6.  Agent identifies unfinished work.
7.  Agent continues.

Message:

> The model forgot everything. The system didn't.

## Demo 2 --- Contradiction

Give the agent conflicting sources.

Show:

``` text
Claim A
      |
      +-- source 1 says X
      |
      +-- source 2 says Y
                |
                v
        contradiction detected
                |
                v
          verification task
                |
                v
          updated conclusion
```

## Demo 3 --- Why?

Ask:

> Why do you believe Company X charges \$79?

Agent returns its stored evidence chain.

## Demo 4 --- What Changed?

Ask:

> What did you initially believe that you later changed?

Agent queries historical state transitions.

## Demo 5 --- Long Context

Show something like:

``` text
Agent runtime                 3h 47m
Actions                        186
Web sources                    112
Stored events                1,284
Facts                          317
Verified                       242
Contradictions                  14
Working-context items            8
```

This demonstrates that thousands of historical events do not require
thousands of events in the model context.

------------------------------------------------------------------------

# Suggested MVP Build Order

Do **not** try to integrate all four sponsors immediately.

Recommended order:

## Phase 1 --- RawTree

Get event ingestion and querying working.

Create a simple abstraction such as:

``` text
record_event()
record_fact()
record_evidence()
record_decision()
get_open_tasks()
get_relevant_memory()
```

## Phase 2 --- Basic Agent Loop

Implement:

``` text
load state
-> choose action
-> execute action
-> save result
-> choose next action
```

Initially, the reasoning model can be whichever model gets the loop
working fastest.

## Phase 3 --- Nimble

Replace mocked research with live Nimble search/extraction.

Store every relevant result in RawTree.

## Phase 4 --- Persistent Resume

This is critical.

Stop the process and verify that the next run can reconstruct:

-   objective
-   completed tasks
-   incomplete tasks
-   facts
-   unresolved contradictions

and continue.

## Phase 5 --- Liquid

Introduce Liquid where it creates a clear sponsor use case:

-   extraction
-   classification
-   summarization
-   verification
-   next-action selection

Avoid replacing working orchestration merely to force Liquid into the
stack.

## Phase 6 --- Researcher / Verifier / Skeptic

Create lightweight logical roles.

They do not necessarily need to run concurrently.

A sequential workflow is acceptable:

``` text
Researcher
   |
Verifier
   |
Skeptic
   |
Manager
```

All share RawTree.

## Phase 7 --- Agent Inspector UI

Build only enough UI to make the architecture visible.

Focus on:

-   live activity
-   memory counts
-   claims
-   evidence
-   contradictions
-   task status
-   replay

## Phase 8 --- FLUX

Use the final verified research state to generate a polished visual
output.

Do this last because it is not essential to the reliability mechanism.

------------------------------------------------------------------------

# What NOT to Overbuild

For a one-day hackathon, avoid spending too much time on:

-   authentication
-   elaborate user accounts
-   production deployment infrastructure
-   beautiful dashboard components
-   complex vector databases
-   sophisticated multi-agent frameworks
-   real-time websocket architecture unless trivial
-   elaborate schemas
-   generalized workflow builders

The differentiator is:

> **persistent, inspectable, self-correcting agent memory**

not frontend polish.

------------------------------------------------------------------------

# Possible Repository Structure

A simple structure could be:

``` text
continuum/
├── README.md
├── .env.example
├── package.json
├── src/
│   ├── agent/
│   │   ├── orchestrator.ts
│   │   ├── researcher.ts
│   │   ├── verifier.ts
│   │   └── skeptic.ts
│   │
│   ├── memory/
│   │   ├── rawtree.ts
│   │   ├── events.ts
│   │   ├── facts.ts
│   │   └── context.ts
│   │
│   ├── tools/
│   │   ├── nimble.ts
│   │   ├── liquid.ts
│   │   └── flux.ts
│   │
│   ├── api/
│   │   └── ...
│   │
│   └── ui/
│       └── ...
│
└── scripts/
    ├── demo.ts
    └── seed.ts
```

Exact stack should be selected based on the fastest integration path
once the current partner docs/examples are inspected.

------------------------------------------------------------------------

# Definition of Done for the MVP

The MVP is successful if we can demonstrate all of these:

-   User gives a long-running research goal.
-   Agent decomposes it into tasks.
-   Nimble obtains live information.
-   Important actions/results are written to RawTree.
-   Agent queries RawTree before later decisions.
-   Agent detects at least one contradiction.
-   Agent creates a verification task.
-   Agent resolves or preserves the uncertainty.
-   Agent can stop and resume from persistent state.
-   Agent can explain why it believes a fact.
-   Agent can reconstruct an earlier decision.
-   Liquid participates meaningfully in
    reasoning/extraction/verification.
-   FLUX produces a final visual artifact.

The project does **not** need to be production-ready.

------------------------------------------------------------------------

# Recommended First Codex Task

Start with the persistence layer, not the UI.

Suggested prompt for Codex:

> We are building Continuum, a hackathon project demonstrating reliable
> long-running AI agents through persistent state, memory, context
> management, evidence tracking, and execution replay. RawTree is the
> core persistence/observability layer. Nimble will provide live web
> research, Liquid AI will handle selected
> reasoning/extraction/verification tasks, and Black Forest Labs FLUX
> will create the final visual output.
>
> First, inspect the latest RawTree developer documentation and
> examples. Then scaffold a minimal TypeScript project implementing a
> RawTree-backed agent memory layer. We need to record arbitrary agent
> events, facts, evidence, decisions, tasks, contradictions, and tool
> executions. Avoid over-designing a rigid schema because RawTree
> supports flexible raw JSON.
>
> Implement the smallest working vertical slice:
>
> 1.  Create a research run with a goal.
> 2.  Record several events.
> 3.  Create/update tasks.
> 4.  Store a discovered fact and its evidence.
> 5.  Store a conflicting observation.
> 6.  Mark a contradiction.
> 7.  Query enough persistent state to reconstruct a compact working
>     context.
> 8.  Stop the process and demonstrate that another invocation can load
>     the run and determine the next unfinished task.
>
> Keep integrations modular so Nimble, Liquid AI, and FLUX can be added
> afterward. Prioritize a working end-to-end persistence/resume demo
> over frontend work.

------------------------------------------------------------------------

# One-Line Pitch

> **Continuum is a persistent agent system that remembers not just what
> it learned, but what it did, why it did it, what went wrong, and what
> it still needs to do.**

# Shorter Pitch

> **Most agents remember the conversation. Continuum remembers the
> work.**

# Core Hackathon Message

The project should prove that **long-running reliability comes from
separating durable execution memory from the model's limited working
context**.

RawTree preserves the history.

Nimble observes the changing world.

Liquid reasons over the relevant subset.

FLUX communicates the final result.

The agent can therefore work through hundreds of actions without needing
hundreds of actions stuffed into every subsequent prompt.
