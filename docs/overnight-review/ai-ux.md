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

Server `analysis_timing` captures monotonic db_start, db_context, combined AI generation,
db_save and total request analysis durations with IDs/model/prompt/schema/attempt/status/
errorStage/reference counts. Generated/input text, names, token/secret and raw error
messages are excluded. Arbitrary client request-ID header text is not copied into logs.
Provider-first-event/complete/prompt/validation sub-times remain null because generation
is currently nonstreaming. Compensation/usage failures emit metadata-only operational
signals without changing a saved successful result. Mock success/failure/log-failure
fixtures verify logging does not affect business behavior or disclose synthetic secrets.
Client submit/case-create/first-result/complete and auth timings are NOT_INSTRUMENTED.
Cross-navigation/retry/auth correlation needs a separately verified client measurement path.

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
