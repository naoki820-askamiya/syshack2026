# Auth request boundary candidate

A05 runtime changes clear and scope memory cache and reset authenticated page state.
The candidate is `src/backend/v17/frontend.authenticatedRequest.candidate.ts` so the existing
server TypeScript root can compile its tests without a build-configuration change.
It has no runtime caller and remains **unwired**: automatic approval review rejected central API-client edits
because they affect every authenticated request and may affect authentication/service availability.
No central-client behavior is changed by this experiment.

The remaining race is an identity/session change while the existing `fetchApi` awaits
`getSession`, before a POST is sent. Cache-write guards reject a later response, but cannot
undo a request already sent with the newer session token. Human approval of a narrow,
reviewed central-client guard is required before runtime integration.

Run the candidate mock tests with:

```powershell
npx.cmd tsx --test src/backend/v17/frontend.authenticatedRequest.test.ts
```

Tests cover current-user success and token preservation, stale/mismatched session zero
request count, identity change during session lookup, delayed network response, and delayed
body parse after expiry and same-user re-login. These do not prove real Supabase auth races.
