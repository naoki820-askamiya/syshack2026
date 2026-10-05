# Analysis waiting UX

Before: submit → Person/Case creation → wait for complete AI → navigate.
After: save Person/Case → immediately navigate to that saved Case analysis view →
check latest/result status → start if intended → show actual analyzing status → validated
saved result. Retry first reconciles latest/status and uses the same Case. Running
analysis polls every2s; scheduling stops after120s, but an in-flight request is not
bounded by that scheduling check. It does not resend a running analysis. A draft reload does not auto-start.
A failed/running screen exposes refresh/retry and History. No invented percent/time,
raw model token, mind-reading copy or unvalidated action appears.

First useful information is confirmation that a Case exists and its actual state.
Time to first useful **AI** interpretation equals final result in this implementation;
it was not measured against a real model. Total end-to-end latency UNKNOWN.

## Instrumentation

Server analysis_timing retains DB start/context, combined AI, save and total durations.
The resumed [backend substages](backend-substage-metrics.md) observe prompt build,
SDK request/complete, validation and attempt duration, plus available safe-integer
input/output/cached/reasoning/total token counts. Completion includes transport and
SDK parsing; it is not provider compute time. Missing usage and late completion
after timeout remain null. First provider event, auth and settlement sub-times
remain unknown. No raw prompt/output, names, credentials, headers or raw errors
enter these events; failures of observers do not change business success/error.

The [client measurement](client-timing.md) records accepted submit, current-boundary
Case ACK, accepted state, usable stored result and logical successful finish with
opaque native Performance events. Private correlation is bounded and cleared on
auth change; retries use their own trace, stale leases cannot write, and a
StrictMode-like cleanup/setup is coalesced. No consultation/Person/user/Case IDs
or text enters exposed measures. Missing stages remain unknown.

These are observed control-flow milestones. Browser paint, visible first useful
interpretation, actual provider latency, p50/p95 and end-to-end improvement remain
UNMEASURED. Cached readiness is not new provider output. No invented percent or
arrival estimate was added.

## Streaming decision

Installed SDK supports stream request construction. Mock prototype consumes private
provider events and emits summary/evidence/alternatives/scores/final only after complete
JSON and full validation; actions/replies are in final only. No DB save, UI integration,
paid call or early-delivery improvement. Earlier sections/key-order change are pending
incremental parsing, field safety and measured benefit. Stream failure uses saved Case
reconciliation. Current request/result contract remains unchanged.

## Limits

Case creation with a lost response can still need a future idempotency contract.
B02 helper is not a production scheduler; long-running server state is not silently
recovered by the UI. A05 response isolation and the separately authorized pre-send write-intent P1
are Completed. See [write-intent evidence](p1-write-intent.md). Poll/error/reload
behavior was unit/source reviewed; live browser/provider UX remains unverified.

Final hardening also consumes the Case navigation start flag after one handoff;
remount after failure no longer retries implicitly. See [regression](case-navigation-intent.md).
