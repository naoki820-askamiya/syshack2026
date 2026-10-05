# R14: History read failure retry

## Scope

Start: ec68feb966be62ff9eab872bd7a24f3f97e1dc1b. A failed History read had an error message but no inline retry. This issue adds a retry attempt dependency to the existing loader effect, clears the old error while loading, and exposes accessible loading/error states. Person ID filters and the existing loader/cache ownership contracts remain unchanged.

## Regression evidence

The actual History TSX is transpiled with strictly allowlisted React and I/O fixtures. Synthetic consultation data only; no Supabase, database, network, or browser session is used.

- Before implementation: 1 failure (no inline retry), 1 pass (unmounted delayed read ignored).
- After implementation: the 2 History retry cases and 5 existing History identity cases pass (7/7, zero skips).
- Retry retains the selected Person ID, clears the old error, shows loading, and renders the recovered server result. The old effect cleanup still rejects state updates after unmount.

## Validation and limits

Commands: tsx --test src/backend/v17/frontend.historyRetry.test.ts src/backend/v17/frontend.consultationHistory.test.ts; npm.cmd run typecheck; npm.cmd run build:client. All passed. Client build retains the existing large-chunk warning.

This is deterministic component-source coverage with mocked React/I/O. Browser keyboard, screen-reader announcement, live authenticated GET, and provider outage/recovery remain NOT_RUN. No deployment or Production writes.
