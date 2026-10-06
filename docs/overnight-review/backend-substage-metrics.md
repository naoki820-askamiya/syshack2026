# R15 Backend AI substage metrics

Status: deterministic backend measurement plumbing completed. Real-provider timing,
real token usage/cost and browser timing remain UNMEASURED. No paid call was made.

Before this change, successful analysis measured only combined AI generation.
Prompt build, provider complete and validation were always null; Responses usage
was discarded. Five new deterministic regressions failed before the change.

## Observation boundaries

Each actual analyzer attempt emits an internal metadata-only observation:

| Field | Observed boundary |
| --- | --- |
| prompt_build_ms | Instructions, input JSON and Structured Output format construction inside the existing attempt timer |
| provider_request_ms | SDK parse invocation until fulfillment, rejection or the outer timeout/abort wins |
| provider_complete_ms | SDK parse fulfillment only; null if no fulfilled parse was observed |
| validation_ms | Existing local output schema/semantic validation, including rejected output; null when not reached |
| total_attempt_ms | Attempt preparation through accepted output or classified failure, before retry backoff |

All durations use the monotonic clock. Provider completion includes SDK receive and
parse work; it is not provider server compute time. A refusal or incomplete response
can have a fulfilled SDK parse without a successful analysis. Late fulfillment after
an outer timeout cannot retrospectively publish completion/usage. SDK parsing that
rejects before returning a response also leaves completion and usage unknown, even
if the provider may have charged for work.

The existing workflow analysis_timing sums the observed prompt/provider/validation
substage durations across attempts. Null means none was observed, not zero elapsed.
Combined ai_generation_ms still includes retry/backoff and the whole analyzer call.
provider_first_event_ms remains null because this is nonstreaming. The internal
analysis_ai_attempt event carries case/run, configured model, prompt/schema version,
attempt, outcome, bounded failure code, durations and token counts only.

## Token counts and privacy

Known Responses usage fields are input_tokens, output_tokens, total_tokens,
input_tokens_details.cached_tokens and output_tokens_details.reasoning_tokens.
The observation exposes only nonnegative safe integers; absent, nonnumeric,
fractional, infinite, negative or unreadable values remain null. Zero is preserved.
Each response has its own counts, including a response later rejected by local
validation. Missing attempts are not imputed or silently presented as a complete
billing total. Quota cost units, settlement and crash policy remain unchanged.

No prompt/input/output text, Person name, provider response ID, error detail,
headers, auth credential or API key is passed to the observer. The workflow event
retains only the existing case/run identifiers as correlation. Metrics are not
returned in the HTTP result and are not stored in result/context JSON.

A synchronous observer exception and an asynchronous observer rejection are both
isolated. Async monitoring is not awaited. The workflow uses a small synchronous
metadata logger; monitoring failures cannot change success, retry or the original
failure. Slow synchronous observer work is not a new latency guarantee.

## Verification

Focused analyzer, workflow, safety and validation: 48 passed, 0 failed, 0 skipped.
Typecheck: PASS. The new subset includes actual installed SDK 4.104.0 with injected
synthetic fetch, per-attempt retry and rejected-output usage, refusal, malformed or
absent usage, timeout and late completion, workflow aggregation, and both observer
failure modes. No real network, real DB or paid provider request was used.

The actual SDK injected fetch receives the same Structured Output/store:false
request and integer timeout contract. Model, prompt, output schema, retry classes,
three-attempt limit, total deadline and returned result remain unchanged. These
checks prove instrumentation behavior, not provider latency or semantic quality.

The usage shape was checked against the installed SDK definitions/parser and the
[official Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
via Context7. No upgrade was needed.
