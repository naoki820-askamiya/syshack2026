# Historical auth request boundary candidate

A05 runtime changes clear and scope memory cache and reset authenticated page state.
The candidate is `src/backend/v17/frontend.authenticatedRequest.candidate.ts` so the existing
server TypeScript root can compile its tests without a build-configuration change.
It has no runtime caller and remains **unwired**: automatic approval review rejected central API-client edits
because they affect every authenticated request and may affect authentication/service availability.
This historical candidate remains unwired. On2026-10-04 the user approved a narrower
response-only responsibility. Runtime source now binds `src/app/api/clientRequest.ts` through
`client.ts`;20 regressions test the actual transport. It does not integrate the candidate's
pre-send/session-user checks. See [completed follow-up](../../docs/overnight-review/a05-response-guard.md).

The remaining race is an identity/session change while the existing `fetchApi` awaits
`getSession`, before a POST is sent. Cache-write guards reject a later response, but cannot
undo a request already sent with the newer session token. Human approval of a narrow,
write-intent/pre-send policy is still required before extending that responsibility.
The adopted response guard cannot undo a write already sent; this is a separate unresolved P1.

Run the candidate mock tests with:

```powershell
npx.cmd tsx --test src/backend/v17/frontend.authenticatedRequest.test.ts
```

Tests cover current-user success and token preservation, stale/mismatched session zero
request count, identity change during session lookup, delayed network response, and delayed
body parse after expiry and same-user re-login. These do not prove real Supabase auth races.
