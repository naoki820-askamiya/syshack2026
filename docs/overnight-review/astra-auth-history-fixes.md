# Astra I01 and I05 implementation evidence

## Scope and reproduction

Audit base: `c4bea857` on `chore/portfolio-polish-overnight`.
The implementation follows inspect, failing regression, minimal change, focused verification,
self review, and independent review. No production, cloud, paid-model, or GitHub mutation occurred.

I01: `/api/me` converted unexpected `getUser` SDK rejection into `401 AUTH_INVALID`.
The new mounted HTTP regressions failed three times with `401 != 500` before the route fix.
The route now forwards non-401 errors to the existing safe error handler; missing credentials
still return `user: null`, and invalid/null identities still return `401 AUTH_INVALID`.
A verified identity still requires exactly one SDK lookup per authorized request.

Independent SDK review then reproduced returned `AuthRetryableFetchError` values being
misclassified as 401 as well. Installed SDK source shows `_getUser` catches AuthError and
returns it, while fetch maps network status 0 and service 502/503/504 into retryable errors.
Five additional mounted regressions failed before the bounded follow-up. Middleware now
recognizes the SDK retryable guard or an SDK API error with a 5xx status and emits the same
sanitized 500. SDK invalid JWT 400/401, no-user, and unrecognized ordinary error retain their
existing 401 behavior. A status/name-shaped ordinary error does not trigger SDK classification.

Context7 corroborates this taxonomy in the official Supabase docs:
[transport versus auth errors](https://github.com/supabase/supabase/blob/master/apps/studio/lib/telemetry/funnel-errors.ts)
and [503 AuthRetryableFetchError](https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/auth-error-503-authretryablefetcherror-51b88c.mdx).
Installed source, mounted HTTP tests, and identity-publication tests supply runtime evidence;
no live Supabase lookup was performed.

I05: failed History reads stopped further dispatch but left peer GETs pending.
Home and History cleanup suppressed rendering without canceling those requests.
An already-aborted GET regression failed before the transport change.

## Changes and deadline decision

Each History load owns an AbortController and a 30-second total deadline, including token
lookup, all pages, response-body parsing, and peer reads. The existing four-worker limit remains
per load. First failure, caller cleanup, auth-boundary change, and deadline abort the owned signal.
Cache replacement occurs only after every page succeeds under the original auth boundary.
Timers and abort/auth listeners are released on success and failure.

The 30-second deadline is an initial client recovery budget aligned with the existing AI operation
budget; it is not a measured production latency target or freshness promise. Revisit it with
representative large histories and actual browser/network evidence before a pagination redesign.
No global authentication serialization or application-wide admission limit was added.

Protected requests forward the signal to fetch and race cancellation during token lookup and
JSON parsing. Supabase getSession itself exposes no cancellation here: it may finish later,
but a canceled request cannot dispatch afterward, and its owned listener is released promptly.
Typed HTTP status/code/requestId, original abort reason, and existing stale-response/write-intent
errors remain available to callers. Ordinary GET retains its existing dispatch/response contract.

Independent review caught a microtask gap introduced by the signal race: the initial guard
ran before the actual send callback. A new adversarial regression failed with a POST dispatch
under user B at microtask 5. Abort and mutator-boundary checks now run inside the exact send
callback. The matrix covers four mutators across twelve auth-switch schedules, plus twelve
cancellation schedules. The existing GET behavior assertion was preserved unchanged.

Home and History abort their load during effect cleanup. History also tags its component state
with the auth boundary, hides earlier-user rows/errors synchronously, and reloads on user/epoch
changes. Inline retry and selected Person ID behavior remain covered.

## Offline before and after

The same real loader and transport were run with injected signal-aware network I/O:
twelve Persons, four concurrent pending case reads, first response HTTP409, and three immediate
retry attempts. The optional offline probe is in `frontend.historyCancellation.test.ts`.

| Measurement | Audit HEAD | Fixed |
| --- | ---: | ---: |
| Peak pending mock network reads | 10 | 4 |
| Pending mock reads after three failures | 9 | 0 |
| Cache writes | 0 | 0 |
| Total dispatches | 15 | 15 |

These are deterministic injected-I/O measurements, not browser socket or useful-paint evidence.
Normal successful paginated reads still return all 1,200 rows across 37 requests in newest order.
Overlapping independent loads retain their own limit; the four-worker cap is not an app-wide cap.

To rerun the before/after probe, export the audit HEAD versions of `sessionV17.ts` and
`clientRequest.ts` to temporary files and set `HISTORY_BASELINE_LOADER` and
`HISTORY_BASELINE_CLIENT` to those paths. Then run:

```powershell
node_modules/.bin/tsx.cmd --test --test-name-pattern='offline before/after' src/backend/v17/frontend.historyCancellation.test.ts
```

## Focused verification

- The initial mounted/API/transport/history suite passed 58 tests.
- The returned-SDK follow-up route/middleware suite passed 35 tests, and strict server typecheck passed.
- The final write-intent, client transport, cancellation, concurrency, and UI suite passed 67 tests.
- Coverage includes first HTTP/JSON error, simultaneous peer settlements, auth switch/logout/relogin,
  already-aborted load, token lookup/body cancellation, cleanup/remount/retry, deadline boundary,
  late response, zero partial cache, listener release, and ordinary same-user parallel requests.
- The independent bounds/workflow/safety review suite plus caller UI tests passed 54 tests;
  eight fresh unsafe-reversal/benign holdouts also passed. Generic serializer hooks were separately
  escalated to the input-bounds owner after the independent adversarial probe.
- An intermediate typecheck ran during concurrent I02 edits and reported only the then-missing
  `AI_INPUT_LIMIT_EXCEEDED` enum member. Full typecheck/build/test/Markdown gates belong to the
  root agent after all implementations and independent corrections settle.

Final focused command:

```powershell
node_modules/.bin/tsx.cmd --test src/backend/v17/frontend.writeIntent.test.ts src/backend/v17/frontend.clientRequest.test.ts src/backend/v17/frontend.historyCancellation.test.ts src/backend/v17/frontend.historyConcurrency.test.ts src/backend/v17/frontend.historyRetry.test.ts
```

## Remaining evidence boundary

Live Supabase identity/RLS, browser transport teardown and rendering, deployment, and large-history
pagination remain unverified here. Token lookup cancellation means preventing downstream work,
not canceling the SDK operation. The deadline and regex safety checks are not semantic or monetary
quality guarantees. Root-agent final gates and independent review remain required before merge.
