# Frontend regression evidence

All work applies only to the dedicated KIGEN404 overnight branch/worktree. No Production
changes, provider calls, real consultation data, business-data browser persistence, new
state library, or architecture migration were used in this frontend subset.

## Issue evidence

| Issue | Reproduction | Regression evidence | Verification limit |
| --- | --- | --- | --- |
| A02 | `recommendedActions.safety` was discarded by normalization, and all recommended actions received safe-looking styling. New regression returned four `undefined` values before the fix. | Four ViewModel tests pass: current safe/caution retained, malformed/missing and legacy safety become unknown, textual labels distinguish all three. | UI source and client build verified; actual browser visual/keyboard review not performed by this agent. |
| A04 | Existing fallback settings were ON and could be saved after failed GET. Extracted baseline save helper caused the new zero-PATCH test to fail. | Two tests pass: unloaded/error settings cannot PATCH, and successfully loaded original OFF values remain OFF. UI has null/loading/error/retry and disables saving without a successful read. | Provider/network behavior uses injected update mock and source review; real account settings untouched. |
| A05 | Auth identity change retained user A consultation/analysis; expiry retained old data; stale A writes did not throw. Three added tests failed before cache guards. | Eight cache/lifecycle tests pass: synchronous clear before auth observers, A to B, expiry to same-user re-login, delayed write rejection, refocus/token refresh preservation, current explicit login epoch and stale/superseded login completion. Five unwired request-candidate tests pass. | PARTIAL: central API-client guard was rejected by automatic approval review; the before-send `getSession` race remains. No real Supabase auth integration/browser lifecycle test. |
| A06 | Both primary navigation menus lacked privacy destination; the UI offered a User Pattern control although runtime never sends it to AI. Two source-contract regressions failed. | Two source-contract tests pass: registered route is linked in both menus and unsupported User Pattern control is absent. Existing stored preference value is preserved; accurate capability note is shown. | Actual desktop/mobile keyboard/screen-reader navigation not exercised. |
| A08 | Baseline `slice(-5).reverse()` on seven newest-first cases returned oldest five. Exact negative control failed with actual `[1,2,3,4,5]`, expected `[7,6,5,4,3]`. | Two model tests pass: newest five for descending/mixed insertion order without mutation, and stale user/session data/errors hidden synchronously before effects. Home separately loads DB history and shows loading/error/retry/loaded-empty. | History fan-out remains; no live latency or browser reload measurement. |
| A09 | Existing UI always POSTed and never hydrated prior Feedback. Two regression tests failed (second POST instead of PATCH, and incomplete read still created). | Three tests pass: new POST/existing PATCH by Feedback ID, incomplete read produces no writes, reload restores values and revoked permission. UI re-reads after uncertain save failure and remains editable after success. | Tests cover model/request selection and mapping; actual browser prop-change/loading behavior not exercised. Skeptical review found and fixed pending-send prop-change disablement by resetting sending when a new read starts. |

## Scoped accessibility changes

- Action safety has different text and icons as well as color.
- Loading/error/save messages use status or alert roles in settings, Home and Feedback.
- Feedback textarea has a real label and generated input ID; score buttons expose pressed state.
- Native disabled fieldset blocks changes while Feedback saves; scores can be cleared.
- Navigation has named desktop/mobile landmarks, current-page state and expanded state.
- Home CTA is a single Link, with no nested button.

These are source-level improvements, not a complete accessibility audit.

## A05 automatic approval limitation

The central API-client changes were not applied. The repeated rejection stated:

> Despite helper tests, this wires an untested auth guard into the central API client used by all requests, retaining a broad authentication and service-availability blast radius rather than a narrowly scoped change.

The JWT-session-claim alternative was also not applied; approval review cited global
authentication lifecycle, privacy and session availability impact. The accepted narrower
solution uses observed user/sign-out boundaries and guarded explicit login completion,
without parsing or persisting tokens.

A read/write request may start for A, then the existing client awaits `getSession`, then
send its body using B's newer token. Post-response/cache guards cannot undo this write.
The candidate and mock tests are preserved separately with no runtime caller; see
`experiments/auth-boundary/README.md`. Human review/approval of the narrow central-client
integration remains required. The rejection was not bypassed.

## Verification

The focused frontend tests, TypeScript typecheck and client build passed after the final
A06/A08/A09 implementation. Client bundle remains one large chunk (920.00 kB at that local
build), which is not evidence of actual end-user latency.

Default-sandbox read/test commands began yielding no output during the run. Equivalent
authorized local fixture tests/typecheck/build executed successfully with managed-worktree
escalation. This is reported as an execution-environment limitation, not a code failure.
Final all-project gates and commit IDs are recorded by the coordinating agent.
