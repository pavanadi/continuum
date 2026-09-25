# RawTree persistence

Verified against official documentation on 2026-09-25:

- [API reference](https://rawtree.com/docs/reference/api): bearer authentication, database selection, JSON insert and query endpoints.
- [Query guide](https://rawtree.com/docs/guides/query-data): bounded SQL, dynamic fields, and application-side SQL construction.
- [Official TypeScript SDK](https://github.com/rawtreedb/rawtree-sdk-typescript): corroborates the API; currently described as experimental. This starter uses native fetch to keep dependencies minimal.

The HTTP transport sends JSON to `/v1/tables/{table}` and SQL to `/v1/query`, with `database` selected explicitly. It checks table existence via `/v1/tables`; authorization and connection failures are not interpreted as an empty run. SQL identifiers are allowlisted. Requests time out after 30 seconds and response error bodies are not printed.

## Storage design

One appended row contains a versioned state snapshot and its event batch. This avoids claiming a transaction across separate state and event writes. Revision numbers order one run's checkpoints. Content-derived checkpoint IDs identify ambiguous writes. The adapter queries for the exact checkpoint after insertion, including when insertion loses its acknowledgement, and stops if visibility remains uncertain. No automatic reinsertion occurs.

Evidence and decisions cannot be silently removed or rewritten; completed tasks cannot be reopened. Historical revisions remain queryable. Resume fetches the latest checkpoint rather than the entire history. The latest checkpoint itself still grows with the run: compact working-context queries and snapshot/delta compaction remain future work.

Only one writer may own a run. Conflicting revisions are detected when visible, but there is no distributed lock or compare-and-swap. Visibility polling is a practical check, not proof of global read consistency or exactly-once execution. A fresh process after an uncertain write requires operator reconciliation. RawTree's cross-request consistency and transactional guarantees have not been established by this small test.

## Live validation

Target: organization `tokensand`, cluster `long-horizon-agents-hack`, database `default`, new table `continuum_checkpoints_v1`. Existing tables were not modified.

Run: `continuum-smoke-1790361947270`.

1. The product orchestrator generated initial and Researcher checkpoints in a local process.
2. Connected RawTree tools inserted those two checkpoints, then queried them with the adapter's latest-state SQL.
3. A second local process validated the retrieved checkpoint through `RawTreeMemory.load()` using the captured live query response. It resumed at Skeptic and generated the remaining checkpoints.
4. Connected tools inserted those checkpoints and queried all four revisions. The final state had three completed tasks, two evidence records, and an unresolved pricing decision. Earlier revisions remained present.

This initial check validated real storage and query compatibility plus reconstruction from a cloud-returned snapshot. It was not an end-to-end credentialed HTTP CLI test. The research payload was fictional throughout.

### Credentialed HTTP validation

After the user configured `.env`, the standalone HTTP CLI was verified on 2026-09-25 with run `continuum-http-1790362433684`:

- First process completed Researcher and persisted its evidence.
- Second process reconstructed the run from RawTree and completed Skeptic.
- Third process reconstructed both observations and completed Verifier with an `unresolved` decision referencing both evidence records.
- A separate `history` invocation returned revisions 4, 3, 2, and 1, including the contradiction event.

All invocations exited successfully through the real HTTP API. The key was not displayed. This proves normal process-exit/resume behavior with live persistence and fictional research; abrupt termination and long-duration operation remain unverified.

The automated suite separately exercises the complete standalone HTTP CLI against a local fixture server across multiple processes, plus lost acknowledgements, unconfirmed writes, invalid checkpoints, conflicting revisions, and append-only evidence protection.
