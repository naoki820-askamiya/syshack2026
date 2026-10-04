# Final performance evidence

Mode: local build and source-backed synthetic mocks. Production deployment: none.

## Bundle comparison

| Build | Entry JS bytes / gzip | All JS bytes / sum of per-chunk gzip | Chunks |
| --- | --- | --- | --- |
| Current eager routes | 923,124 / 262,567 | 923,124 / 262,567 | 1 |
| Build-only lazy Analysis/Action | 530,835 / 153,241 | 923,903 / 264,507 | 4 |

The prototype moves bytes out of the entry; total bytes grow 779 and summed gzip
grows 1,940. It does not establish network transfer, browser parse/render, cold/warm
route latency or mobile improvement. Null Suspense fallback, chunk load failures,
auth boundaries and direct reload need browser E2E before adopting route splitting.
The app routes, standard Vite config and package scripts remain unchanged.

The probe uses writeBundle so later Vite preload rewrites are included. Root read
all four emitted prototype files and independently gzip-compressed them; every
exact count matched bundle-lazy.json. Reviewers checked source scope and arithmetic;
their later physical inspection could not see the prototype because the normal
build replaced dist. The normal physical entry also matches bundle.json.
Rendered package character attribution remains before minification and is not
a package gzip share. Recharts is attributable to the deferred Analysis route,
but no independent Recharts compressed-byte contribution is claimed.

Repeat the prototype first, inspect its artifacts before normal build clears dist:

    $env:KIGEN_BUNDLE_REPORT='experiments/performance/bundle-lazy.json'
    npm.cmd run build:client -- --config scripts/bundle-lazy-prototype.config.ts
    $env:KIGEN_BUNDLE_REPORT='experiments/performance/bundle.json'
    npm.cmd run build:client -- --config scripts/bundle-measure.config.ts

## History

All 20 size combinations and 3 failures reran with current source hashes.
P100/C100: 302 requests, 100 concurrent, 10,000 synthetic cases, 2,616,512 response
bytes; 106.537 ms mock completion and 16,160,752 bytes highest sampled heap growth.
These are variable Node mock time/memory, not production or browser measurements.
First case-page failure still leaves 99 peers active and 198 later requests, with
zero partial cache writes. No concurrency pool or new endpoint was adopted.

## Backend and client

Existing metadata-only timing observes DB start/context, combined generation,
save and total analysis. Auth, usage settlement, prompt, provider-first/complete and
validation substages are not individually measured. Client submit/Case create/
first result/paint/complete remain uninstrumented. The stage inventory is verified;
missing values remain UNKNOWN/null. An isolated cross-navigation capture design
was reviewed, but adoption into the UI needs lifecycle/browser measurement
coverage; no unmeasured latency improvement is claimed.
