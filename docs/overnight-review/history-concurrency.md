# R11 bounded History reads

Date: 2026-10-05 JST. Baseline: ec68feb. No new endpoint or pagination/error policy.

## Reproduction and minimal repair

The actual History loader launched a Case pagination chain for every Person at once.
Baseline regressions reproduced peak12 for12 Persons, continued page dispatch after
failure, and missing local auth-boundary checks before subsequent pagination dispatch.

One History load now uses at most4 Case-read workers. Each Person keeps sequential
pagination; all pages, stable Person order and the existing newest-first sort remain.
The first transport failure is latched at each fetch promise before peers can resume.
Auth changes and the first failure stop subsequent pages/queued Persons. A failing
read rejects promptly even if another peer remains pending; Promise.all observes
late peer rejection. Cache publication remains all-or-nothing under the original
auth boundary. Protected API errors retain their identity.
The baseline store already checked the captured boundary; the cache spy alone does not prove a real baseline cross-user publication.

The limit is per load invocation, not global across the app. Already-dispatched
requests are not aborted; a retry can overlap those settling requests. No request
deadline, partial-result policy, lazy route or server capacity claim was introduced.

## Regression and review

Baseline7 tests:1 passed/6 failed. Current9 loader cases plus2 History retry cases:
11 passed,0 skipped. Coverage includes all pages/order, failures on both pages,
switch/logout/same-user relogin, empty history, simultaneous rejected/fulfilled pages,
and a first error while peers remain pending.

Skeptical cycle1 reproduced a microtask gap in the initial candidate:4 initial reads
became7 when one rejected while3 peers fulfilled. Moving the latch into each fetch
catch and adding both concurrency cases repairs it. Cycle2 independently replayed
the same counterexample:4 remained4; first error unchanged. Independent reviewer
checks and global test/typecheck/build/Markdown gates are recorded in final-verification.

Tests transpile the actual loader/page with explicit synthetic seams. They establish
local control flow, not browser lifecycle, Supabase timing or production capacity.

## Source-backed mock measurement

[Machine-readable report](../../experiments/performance/history.json) reran20 size
combinations and3 failures with hashes of actual loader/mapper/services.

P100/C100:10,000 synthetic cases,302 requests, peak4 per load,926.036ms local mock
completion. The previous ec68feb report recorded peak100 and106.537ms. Fixed timers,
transpile/CPU/GC and scheduling make these mock durations variable; reduced fanout
does not establish a real speedup and increases time in this synthetic setup.

First Case-page failure:6 requests total,3 peers still active at return,0 requests
after return,0 cache writes. Second-page failure:301 requests,3 peers active,
0 after return,0 cache writes. First Person-page failure:1 request,0 cache writes.
Live network/DB/provider/browser/render, deadlines and global retry capacity remain
UNMEASURED.
