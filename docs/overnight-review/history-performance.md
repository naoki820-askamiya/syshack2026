# History retrieval measurement

Date: 2026-10-04 JST. Mode: SOURCE_BACKED_SYNTHETIC_MOCK. No product runtime change.

## Method and scope

Run `node --expose-gc scripts/history-performance.mjs` from the dedicated worktree.
The harness transpiles and executes the actual `loadConsultationHistory`, `toConsultation`,
`listPersons` and `listCasesByPerson` source functions with an explicit dependency allowlist.
Only synthetic person/case fixtures, mock repositories, in-memory cache spies and a fixed
2ms HTTP timer are supplied. There is no app API, auth provider, dotenv, database or paid API call.
Source SHA-256 values and all 23 scenarios are recorded in [history.json](../../experiments/performance/history.json).

Time includes local JSON conversion, sorting, sampled memory overhead and Windows timer scheduling.
It is not real network or production latency. Memory is process heap/RSS growth sampled around
requests and completion, with pre-run GC when available. Fixture creation is excluded; loader
module/transpilation allocations are included in memory. Samples are not a true peak or browser render budget.
There is no React/layout/accessibility measurement, real database query plan or capacity claim.

## Request growth

Persons use a known total: `hasMore = offset + persons.length < total`.
Cases use `hasMore = analysisCases.length === limit`, so an exact multiple of 50 needs
an extra empty page. Current frontend loads all persons before `Promise.all` starts every
person's case pagination concurrently; there is no concurrency bound.

For P positive persons and C cases per person, observed HTTP requests match
`ceil(P/50) + P * (floor(C/50) + 1)`.

| Persons | C=1 | C=10 | C=49 | C=50 | C=100 | Peak case concurrency |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 2 | 2 | 3 | 4 | 1 |
| 10 | 11 | 11 | 11 | 21 | 31 | 10 |
| 50 | 51 | 51 | 51 | 101 | 151 | 50 |
| 100 | 102 | 102 | 102 | 202 | 302 | 100 |

For P=100/C=100, 10,000 cases returned through 302 requests, maximum
100 concurrent requests, 2.50 MiB synthetic response JSON and
15.55 MiB highest sampled heap growth. Local mock completion
was 69.501ms on Node v22.15.1. This is one synthetic run; timings/heap vary.
Every successful scenario writes the completed sorted cache once; no partial cache is written.

## Failure behavior

| Failure, P=100/C=100 | Total requests | Active at reject | New requests after reject | Cache writes |
| --- | --- | --- | --- | --- |
| first-case-page | 300 | 99 | 198 | 0 |
| second-case-page | 301 | 99 | 0 | 0 |
| first-person-page | 1 | 0 | 0 | 0 |

`Promise.all` rejects on one person failure without cancelling peers. First-case-page failure
leaves the other 99 person loads running; they continue paginating after the caller sees an error.
The harness explicitly drains these peers before starting the next scenario, preventing overlap.
Person-list failure prevents all case requests. Existing behavior does preserve all-or-error cache writes.

## Follow-up decision

Confirmed: request count grows with persons; exact-page case totals add an empty request;
unbounded fanout and continued peer work after failure exist in current source.
Inferred: a bounded request pool, cancellation-aware pagination and a dedicated paginated
Home/History endpoint may reduce pressure. They need ownership, ordering and partial-error
contracts plus real-environment evidence before adoption. No runtime optimization was applied.
Root owns bundle/browser evidence and the consolidated performance follow-up decision.
