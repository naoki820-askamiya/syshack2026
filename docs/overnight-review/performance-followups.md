# Performance follow-ups

## Measured

Base client: one chunk909.22kB/gzip258.32kB. Current measurement-only build:
921,702 bytes/gzip262,133, one entry, no imports/dynamic imports. Exact output in
`experiments/performance/bundle.json`; run `npm.cmd run build:client -- --config scripts/bundle-measure.config.ts`.
Recharts contributes449,182 rendered characters before final minification; lodash194,364,
React Router223,553 and Supabase Auth379,855. These are transformed module counts,
**not compressed-byte percentages or browser parse times**. No source map is committed.

History uses actual loader/mapper/service pagination with synthetic HTTP/repository
mocks:20 size combinations plus3 failures. P100/C100 needs302 HTTP requests and100
concurrency; first-case-page failure leaves99 active peers and starts198 more calls.
See [method and limitations](history-performance.md). Real latency/capacity UNKNOWN.

## Decision log

Problem: eager chart routes and Person→Cases fanout can increase initial bytes and
request pressure. Evidence: build chunk/module attribution and actual-function mocks.
Options: retain, lazy-route experiment, dedicated paginated listing, bounded pool with
cancellation. Decision: preserve runtime and record targeted follow-ups. Why: bundle
bytes/mock timers do not prove user latency; cross-person endpoint order/ownership/
partial-error contract needs review. Rejected: replacing charts, adding cache/Redis,
indexes without query plans, memoizing blindly. Risks: current pressure remains and
initial bundle grew with correctness fixes. Revisit: browser cold/warm entry and
analysis route transfer/parse/layout; cancellable fanout baseline and endpoint fixture
contracts; real disposable DB query plans with production-like synthetic cardinality.

## Next measurements

1. Browser parse/load/render for Home and Analysis on representative mobile/network.
2. Lazy Analysis/Action routes in an isolated experiment with route reload/auth/error tests.
3. Cross-person newest-first pagination with owner filters and deterministic tie ordering.
4. Bounded pool and AbortSignal propagation with fail/partial-result semantics decided.
5. Provider complete/first-useful and DB context/save timings from safe telemetry.

No user-perceived speed improvement, query speedup or production scalability is claimed.
