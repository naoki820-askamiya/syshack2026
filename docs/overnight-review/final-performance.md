# Final performance evidence

Date: 2026-10-05 JST. Local build/source-backed synthetic measurements only.

## Current bundle comparison

| Build | Entry JS bytes / gzip | All JS bytes / sum of per-chunk gzip | Chunks |
| --- | --- | --- | --- |
| Current eager routes | 931,403 / 264,959 | 931,403 / 264,959 | 1 |
| Build-only lazy Analysis/Action | 535,265 / 154,875 | 932,187 / 267,052 | 4 |

Both builds use the frozen resumed client and adopted runtime dependency tree.
Root read every emitted file before the next normal build cleared dist; exact
bytes and Node gzip matched bundle.json/bundle-lazy.json. The writeBundle probe
includes final preload rewriting. Total lazy bytes grow784; summed gzip grows2,093.
This is entry relocation, not a measured network/parse/render/mobile speedup.

Production route splitting was not adopted. Null fallback, chunk failure recovery,
auth lifecycle and direct reload need independent browser evidence. Package character
attribution is transformed code before minification, not package compressed share;
no independent Recharts gzip contribution is claimed.

Repeat lazy first, inspect its physical artifacts, then normal measurement build:

    $env:KIGEN_BUNDLE_REPORT='experiments/performance/bundle-lazy.json'
    npm.cmd run build:client -- --config scripts/bundle-lazy-prototype.config.ts
    $env:KIGEN_BUNDLE_REPORT='experiments/performance/bundle.json'
    npm.cmd run build:client -- --config scripts/bundle-measure.config.ts

## History

Current23 source-hashed scenarios:20 size combinations and3 failures.
P100/C100:10,000 synthetic cases,302 requests, peak4 per invocation,926.036ms mock.
Before at ec68feb:peak100 and106.537ms mock. Fixed synthetic timers/scheduling/CPU
make these durations variable; the cap increases this mock time and is not a speedup.

First Case-page failure:6 requests,3 in-flight peers at return,0 later dispatch,
0 partial cache writes. Already-sent requests are not aborted; retries can overlap
them, so the cap is not app-global. Other failures/ordering/auth/same-batch boundaries
are covered in [R11 evidence](history-concurrency.md). Real capacity/network/DB,
request deadlines, partial results and browser rendering remain UNMEASURED.

## Backend and client observations

[Backend metrics](backend-substage-metrics.md) observe prompt build, SDK request/
complete, validation/attempt times and known safe-integer response token counts.
SDK completion includes receipt/parse, not server compute. First event, auth and
settlement sub-times remain unknown; absent/invalid/late usage remains null.
No incomplete usage is imputed as a complete cost total.

[Client instrumentation](client-timing.md) observes accepted submit/Case ACK/state/
usable saved result/logical finish with bounded private correlation and anonymous
native Performance entries. Auth/retry/unmount/StrictMode-like controls are tested.
Cached result readiness is not new model output; logical finish is not paint.

Actual browser/React lifecycle, first visible useful interpretation, provider latency,
p50/p95, throughput/billing and human-perceived improvement remain UNMEASURED.
No stream or performance architecture was adopted.
