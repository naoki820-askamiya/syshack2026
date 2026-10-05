# R15 Client measurement plumbing

Status: Completed deterministic plumbing; independent/skeptical reviews approved, adopted-tree254 tests/typecheck/client-server build passed. Exact final-tip gates are in final-verification.md. Real browser, paint, provider-first-event and latency results remain UNMEASURED. Runtime measurement baseline: b4ff1da, after separate R12 and R14 commits.

## Boundaries and interpretation

Only NewConsultation, useHydratedAnalysis and a small measurement helper are changed. Business API payloads, auth/session publication, caches/storage, route/state handoff, model/SDK contracts, effect dependencies and polling policy are unchanged. The three existing strict actual-source fixtures only receive a no-op measurement dependency; their original assertions remain intact. The new tests execute the actual New page and hydration hook with the actual recorder factory, plus strictly synthetic React/I/O fixtures.

| Milestone | Observed point | Meaning |
| --- | --- | --- |
| submit | Valid form accepted, before existing Person/Case requests | Excludes initial click-to-form-validation time |
| case_ack | Current auth boundary accepts the existing Case response ID | Saved-Case acknowledgement; earliest useful confirmation, not displayed pixels |
| state | Current hook accepts a checked server status or reconciled saved-result state | First accepted state, not provider output or an optimistic analyzing label |
| result_ready | Client has a saved consultation plus non-null normalizeAnalysis of the existing server response/cache | Saved server result is usable by this display model; no new semantic/safety revalidation |
| logical_finish | Successful check settles with result_ready, or cached fast-path accepts that ready result | Logical successful flow completion; no render/paint guarantee |

Durations are monotonic elapsed milliseconds from accepted submit for a new submit trace, or from the hook attempt's start for reload/retry origins. Reload/cache/retry never acquire invented submit or Case-ACK timestamps. A cached result is not new provider output. No receipt time is called provider compute time. Missing stages are absent/unknown, not zero. A failed check, missing consultation/result, or unusable result model emits no successful logical_finish. Polling finally blocks that clear loading are not themselves completion.

## Correlation, lifecycle and privacy

A private in-memory32-trace map associates the existing Case ID and user/epoch snapshot. External events contain only opaque numeric trace, origin enum, milestone enum and elapsed_ms. Performance measure names contain that opaque trace and milestone. No business text, Person name/ID, Case/user ID, token, header, provider response ID or raw error enters the native entries, logs, network or persistence. No console logger, new request, global window export, localStorage or sessionStorage is added.

Each effect setup receives a generation lease. Old/released/retried/auth-invalidated callbacks cannot record. Unmount invalidates the lease immediately and defers record disposal one microtask to coalesce StrictMode-like synchronous cleanup/setup. Cached synchronous completion also coalesces that cycle; after deferred cleanup, a genuine later remount gets a distinct reload trace. Completed observations remain in the bounded map until eviction/auth clear. Explicit retry retires the old attempt and gets its own origin/clock. New-page cleanup cancels a pending submit unless acknowledged navigation handoff has been recorded.

The map never exceeds32 traces with at most5 milestones each. Native measures are removed by exact owned names on eviction/auth clear; unrelated Performance entries are untouched. A separate name ledger prevents this module from emitting more than160 native entries even when clearing throws. If platform clearing fails, anonymous old entries may remain and later native emission is dropped at the cap; memory/auth invalidation still works. No external latency guarantee is implied by retention or cleanup.

Missing Performance, throwing methods, invalid/nonfinite/negative/descending clocks and failing telemetry sinks are isolated from business flow. This does not remove the pre-existing hook performance.now dependency used for its120s polling window; the unavailable-platform tests verify the new adapter only. The existing UI requires its normal browser platform.

The native API shape was checked with Context7 against the [MDN User Timing guide](https://github.com/mdn/content/blob/main/files/en-us/web/api/performance_api/user_timing/index.md) and [Performance.measure reference](https://github.com/mdn/content/blob/main/files/en-us/web/api/performance/measure/index.md). Application-defined observations are distinct from paint timing.

## Regression and validation evidence

Before wiring, actual cached hook and actual New-submit assertions both failed because no measurements existed (2 failures,10 passes in the initial set). Self-review then reproduced duplicate cached StrictMode-like readiness/completion (2 entries instead of1) and corrected provisional completed-lease reuse; a later genuine remount remains a separate trace.

The final dedicated set has18 passing cases, zero skips. It covers accepted milestone correlation/privacy allowlist, absent/throwing/invalid/descending clocks, sink failure, auth epoch invalidation, pending and cached StrictMode-like cleanup/setup, pending unmount, reload/retry origins, old retry callbacks, missing saved result, failed hydration, actual New-to-hook unchanged route handoff, and real Node native Performance eviction/auth clear.100 completed native traces leave exactly32 records/64 two-stage entries; adversarial clearing failure across200 traces emits at most160 entries. Node native entries are not browser evidence.

Commands: tsx --test src/backend/v17/frontend.clientTiming.test.ts and the existing analysisNavigation/personCreateRetry/personPrefill regressions; npm.cmd run typecheck; npm.cmd run build; markdownlint-cli2 docs/overnight-review/client-timing.md. Check results and reviewer disposition are reported with the final frozen candidate. Builds retain the existing large-chunk warning.

## Unmeasured / next evidence

No real browser/React StrictMode render, layout, paint, keyboard/screen reader, authenticated network, provider request, first event, first visible useful interpretation, p50/p95, throughput, billing, or end-to-end speed improvement was measured. Successful runtime measurement adoption proves the local observation contract only. Browser/provider stage measurements and any streaming/early-field delivery policy remain separate work.
