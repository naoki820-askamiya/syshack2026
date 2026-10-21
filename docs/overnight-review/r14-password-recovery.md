# R14: Password recovery candidate and safety blocker

## Status and authority

Actual password recovery: PARTIAL / HUMAN_DECISION_REQUIRED. The misleading affordance fix is Completed; full gates and both reviews approved its narrow scope. The residual-implementation request permits a narrow existing-SDK recovery flow, while the harness still forbids an Auth/storage redesign. History retry and logout error feedback are separate implemented issues. This password issue contains investigation, synthetic installed-SDK characterization, a minimal honest-affordance change, and an unadopted complete-flow proposal. No recovery request, password update, route, AuthContext publication, client configuration, redirect allowlist, or email template was changed.

## Existing implementation and official reference

Baseline Login had an inert forgot-password button. It is now plain visible text: パスワード再設定は現在利用できません。 No email link or invented support contact is offered. Existing AuthProvider observes SDK auth events and publishes Supabase identity through the existing user/epoch boundary; it has no recovery-specific authorization state. The singleton keeps persistSession=false, autoRefreshToken=false, detectSessionInUrl=true. It uses the default implicit callback flow; no new PKCE or storage design is proposed.

Context7 supplied the official [Supabase password guide](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/passwords.mdx) and [redirect URL guide](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/redirect-urls.mdx). The conventional API is resetPasswordForEmail(email, { redirectTo }) followed by updateUser({ password }) in a valid recovery session. A redirect must be allowed in the provider configuration. Merely having a normal authenticated session is insufficient application evidence of a recovery intent.

Installed @supabase/auth-js is 2.110.0. GoTrueClient.ts updateUser awaits initializePromise (line3303), then `_useSession`/`__loadSession` chooses a session; `_updateUser` sends its access token (line3340), then saves that captured session and emits USER_UPDATED (lines3355-3356). The default path is lockless; legacy acquisition applies only when a custom lock is supplied. No SDK internals were modified.

## Concrete counter-evidence

Command: tsx --test src/backend/v17/frontend.passwordRecoverySdk.test.ts. Two characterization cases pass with the actual installed GoTrueClient and strictly injected synthetic fetch. No Auth host, email address, secret, token from a real session, or network request is used.

1. A caller captures and validates A's user/epoch. A test-only deferred existing initialization promise holds updateUser before session selection; actual SDK signInWithPassword establishes B; releasing initialization sends A's proposed password using B's synthetic token. The controlled delay characterizes the actual await boundary; it is not proof that an already initialized browser reset page naturally stalls there.
2. The actual memory-session SDK sends A's update and waits for a synthetic response. B signs in while that request is pending. A's successful response causes the SDK itself to save and publish A again before the application continuation can reject a stale result. This case does not replace any SDK method or session state; only transport response delivery is delayed.

These are unsafe-behavior characterizations, not successful recovery regressions or provider/E2E validation. They show why a page-level precheck and postcheck alone are insufficient. Changing only UI state cannot undo the SDK's internal session write/publication.

## Honest-affordance regression

The actual Login TSX is rendered under strictly allowlisted React/navigation/AuthContext fixtures. Before the fix, 1 of 2 new cases failed because the unavailable message was absent; the unchanged SDK-option source contract passed. After replacing only the dead button, both cases pass. The page has no interactive password-reset control, retains ordinary login/register controls, and the singleton configuration remains exactly autoRefreshToken=false, detectSessionInUrl=true, persistSession=false.

Command: tsx --test src/backend/v17/frontend.passwordResetAffordance.test.ts src/backend/v17/frontend.passwordRecoverySdk.test.ts (4/4, zero skips). npm.cmd run typecheck and npm.cmd run build:client pass after this source change; client build retains the existing large-chunk warning. Independent/skeptical review approved this scope. Final adopted-tree254 tests/typecheck/build pass; this does not implement password recovery.

## Smallest proposed complete flow

- Public /forgot-password page: native email validation, safe generic success/error, busy status, disabled duplicate request, fixed same-origin /reset-password redirect. Login links to it. No account-existence disclosure.
- Existing AuthProvider records only a genuine PASSWORD_RECOVERY event, after its usual identity publication, as an in-memory user/epoch authorization. Normal SIGNED_IN, token refresh, INITIAL_SESSION, or a normal logged-in user never grants recovery authorization. Callback observation belongs centrally because SDK initialization can emit recovery before a page-specific effect subscribes.
- /reset-password page requires that current recovery authorization, labelled new-password and confirmation controls, native validation, safe errors/status, and a single update action. User/epoch changes revoke authorization immediately. Success consumes it. Missing, invalid, expired, reused, or reloaded state fails closed and offers a fresh request.
- Existing client storage, sign-in/sign-up/sign-out, auth identity publication, and callback handling are retained. Only the two exact deep-route rewrites would be added; API/assets exclusions remain.

This proposal must not be wired until the update operation cannot pick another user's session or republish a superseded session at the SDK's actual dispatch/publication boundaries. A new private token-bound client, broad serialization, SDK internal patch, auth storage change, or transport-level operation contract would require explicit bounded design approval and independent/skeptical review. The current issue does not adopt any of those options. Wiring only the email request now would send users to an unfinished reset flow.

The smallest future transport-bound design must retain the initiating recovery user/epoch throughout the operation, reject before actual PUT dispatch after all SDK waits, and reject a superseded result before the SDK can write or publish its captured session. A fetch wrapper checked only before dispatch and after response arrival is not automatically sufficient: body parsing and later SDK continuations also await. A supported operation-aware SDK publication hook, or an explicitly approved isolated token-bound recovery client with a defined publication contract, would need a separate bounded design and adversarial regressions. No such hook or client is adopted here.

## Required acceptance evidence and external unknowns

Before adoption: genuine recovery versus ordinary sign-in; missing/invalid/expired/reused/reloaded callback; successful update and single-use intent; validation and retry; delayed initialization/session selection; user switch before dispatch; user switch during update; no superseded SDK session restoration; unchanged default auth/client configuration; exact route rewrites; accessible errors/busy controls; full tests/typecheck/build and two reviews.

Redirect allowlist, email templates/delivery, deployed deep-route reload, actual recovery callback/provider errors, browser keyboard/screen-reader behavior, and real-session concurrency remain UNKNOWN / NOT_RUN. No live Auth request or provider configuration change was made.

## Approved residual feasibility probe

The revised supported private-client candidate is tested with the installed
GoTrueClient public APIs only: initialize/setSession/updateUser, separate memory
storage keys, URL detection OFF and automatic refresh OFF. Main singleton and
AuthProvider are unchanged. All transport is injected synthetic fetch; the test
is an executable design probe, not a runtime reset route or successful email flow.

Candidate transport allows only captured-token GET/PUT on the exact user endpoint
while the initiating user/epoch is current. Refresh endpoints receive a synthetic
terminal error and are never dispatched to a provider. Any refresh attempt latches
the candidate closed so later user requests cannot dispatch. This extra latch is
necessary: initial probe7/8 passed and the near-expiry case failed because installed
SDK preserves a still-valid token after non-retryable refresh failure and can
continue to PUT. Source and actual SDK reproduce this; autoRefreshToken=false by
itself is insufficient. Corrected candidate plus existing unsafe-characterization
tests9/9 pass/0skip, including same-user logout/relogin.
That case models logout by invalidating the shared boundary, then uses the real
SDK signInWithPassword; it is not real signOut/AuthProvider integration. Both
synthetic clients have URL detection OFF, so callback initialization is untested.
Independent review caught a Node Response.json readonly fixture typing error;
Object.defineProperty retains the same delayed body seam and fixes server build.

Fresh supported session update preserves the main token and boundary. Switching
before session initialization produces no private password PUT. Switching during
response or delayed JSON parsing permits private SDK publication only to the
private client; main B stays B and the application outcome is stale. Near-expiry
and expired sessions produce no provider refresh or password PUT. A PUT already
sent for A can still change A's password on the provider; isolation cannot undo it.

R14 remains PARTIAL. The real existing singleton consumes URL callbacks; a private
client alone does not isolate that initialization. PASSWORD_RECOVERY is an SDK
callback classification, not cryptographic evidence of a reset-only capability.
Before wiring, define/test central callback observation, finite in-memory recovery
authorization and revocation/consumption, ordinary sign-in denial, duplicate update,
cancel/unmount/reload, failure retry, exact route rewrites and real email/redirect
behavior. There is no new storage policy, global signOut, forced token revocation,
SDK patch or unfinished email-request link in the product.

The single-use email verification code and the bearer session returned after that
verification have different lifetimes. Reusing a still-valid issued bearer-session
callback is not proven impossible by a one-use in-memory page grant. Rejecting all
such cross-reload replay needs an adopted server/provider contract; inventing a
new Auth/token-storage design is outside this harness. This acceptance condition
is not silently weakened to wire the reset route.

Local readiness inspection found no Supabase CLI and no cached Supabase Auth stack
images. PostgreSQL owner-role tests remain separate from Auth/RLS evidence.
Do not run init-shadow-db.sql on a real Supabase database; its auth.uid stub cannot
prove client roles or RLS. Live Auth/RLS/browser remain NOT_RUN, with handoff steps.
Cycle2 independent and skeptical reviewers APPROVE experimental scope only;
each reran11/11 focused cases and server typecheck. No runtime adoption is claimed.
