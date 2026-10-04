# A05 response isolation follow-up

Date: 2026-10-04 JST. Prior immutable tip: `9567801ab8c2ace10a684857b45828fafd57e2e9`.
Status: **Completed — user-approved response isolation only**. All four requested gates and both reviews passed.
The user explicitly approved response isolation, with backend auth, session storage,
Supabase flow, public/auth routes and existing error behavior preserved. The earlier
broader candidate is not integrated. No previous commit is rewritten.

## Change and responsibility

`client.ts` binds the same Supabase `getSession` and global `fetch`/existing URL to
`clientRequest.ts`. This small transport seam makes the actual production request,
error construction and response delivery paths testable with delayed injected I/O.
No separate token/session state, new provider, storage, auth observer or endpoint policy.

Each protected helper captures the existing user/epoch once before its first await.
Only successful responses are checked before delivery, and JSON helpers check again
with that same capture after body parsing. Stale success rejects with
`StaleAuthResponseError`, code `AUTH_RESPONSE_STALE`; it cannot reach caller cache/state.
There is no pre-send guard or `session.user.id` verification. Backend Supabase identity,
authentication, authorization and ownership remain authoritative and unchanged.

Error paths precede stale checks. HTTP401/403/409 preserve the original message and
request ID, including an auth change during error-body parsing. Session lookup,
missing-token behavior, abort, fetch/network and JSON failures retain existing behavior.
Abort remains the original AbortError, network failure its original error, and stale
success has a distinct type/code. No catch rewrites ordinary failures as stale.

## Regression evidence

The unchanged transport was first extracted with no boundary enforcement:20 regressions
returned12 pass/8 fail. A-to-B and logout/relogin completion could deliver old A data
into current cache/state; logout-only was caught too late by the pre-existing generic
cache guard. After adding success checks:20 pass/0 fail/0 skip.

| User condition | Verification |
| --- | --- |
| A request completes after B login | Typed stale rejection; no consultation/analysis cache or caller state writes |
| Request completes after logout | Typed stale rejection before cache/state writes |
| Logout then A login | Same user ID with changed epoch rejects old response |
| Expiry then re-login | Existing observed null/new-session boundary rejects old response |
| Explicit same-user login without logout | Existing finishExplicitLogin rotates epoch and rejects old response |
| Auth change during body parsing | Same original boundary checked after successful JSON completion |
| Same-user concurrent requests | Three overlapping requests complete out of order; auth reconfirmation preserves all |
| No auth change | Token retrieval, Headers, custom Content-Type, RequestInit, signal and JSON behavior preserved |
| Raw response / FormData | Response identity/bodyUsed and no automatic FormData Content-Type preserved |
| HTTP401/403/409 | Original errors arrive even across delayed error-body auth change |
| Abort vs network vs stale | Original abort/network objects propagate; stale success uses distinct error type/code |
| Missing token / session / malformed JSON | Prior no-send/message/original failure semantics remain |
| Public / login / register | Source wiring confirms existing direct Supabase/public paths bypass protected client |

Tests exercise the production transport implementation with synthetic sessions/responses
and cache/state consumers. The production-binding/public-auth test is a source contract,
not a live Supabase/login/registration or browser test. Existing8 cache/lifecycle tests
and5 historical broad-candidate tests remain unchanged.

## Verification and review

```text
focused client regressions: PASS — 20/20 (independent reviewer also ran20/20)
npm test: PASS — 151 passed / 0 failed / 0 skipped
npm run typecheck: PASS
npm run build: PASS — client + Prisma generate + server tsc
npm run lint:md: PASS — 25 files / 0 issues
independent review: APPROVE — independently reran corrected20/20
skeptical review: APPROVE — independently reran corrected20/20
```

The first full build caught four TS2540 errors in test-only Response.json overrides
under Node server types. Replaced assignments with Object.defineProperty using the same
async mock bodies; runtime unchanged. Re-ran build, all151 tests and typecheck successfully.
No tests weakened or skipped. Client remains one large chunk922.40kB/gzip262.35kB.
Markdown check also passed. No latency improvement or live auth proof is claimed.

## Remaining boundaries

- Pre-send old body/new token race: UNRESOLVED P1. If auth changes while getSession
  awaits, existing transport can still send the original body using a newer token.
  Response isolation cannot undo that server write. This responsibility was explicitly
  excluded from the approved guard; do not call it fixed or replace backend ownership.
- `fetchApi` checks raw Response delivery only; a future caller parsing/using its body
  after return needs its own retained boundary. All current business-payload callers
  use `fetchApiJson`, which guards completion. Existing cache/page boundary checks stay.
- User code doing new asynchronous work after a resolved payload must retain its own
  boundary before mutation; the guard is not a universal UI transaction or auth lock.
- Real Supabase session expiry/login events, browser React lifecycle and production
  isolation are NOT_RUN. Tests simulate the existing boundary publications without
  redesigning event handling or storage. Backend ownership regressions still pass.
- No Production/deploy/DB/push/merge/paid call, dependency/config or auth-storage change.

## Decision log

Problem: delayed successful protected responses can be delivered across user/session changes.
Evidence: eight negative controls and actual production-seam regressions.
Options: broad pre-send candidate, narrow response isolation, leave partial.
Decision: adopt user-approved response isolation after all gates and both reviews passed.
Why: resolves the requested response contamination without changing identity/token policy.
Rejected: broad session-user validation, token parsing/storage, auth flow redesign,
HTTP-error replacement, shared in-flight serialization and public-route wrapping.
Risks: pre-send write race and live lifecycle verification remain separate.
Revisit: separately scoped write-intent/pre-send policy and authorized live auth tests.
