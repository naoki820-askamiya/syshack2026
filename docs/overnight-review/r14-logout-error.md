# R14: Logout rejection feedback

## Scope

Start: ec68feb966be62ff9eab872bd7a24f3f97e1dc1b. The Navigation logout handler previously allowed SDK rejection to escape without visible feedback. It now catches rejection, renders a generic inline alert, shows a pending status, disables duplicate submissions, and permits retry. The pending/error state is bound to the existing user/epoch snapshot so delayed A-session errors cannot appear in a later B session.

AuthContext, the Supabase client configuration, SDK signOut behavior/scope, auth observers, and cache clearing semantics are unchanged. Successful logout retains the existing navigation to home. This issue does not add serialization or change the SDK's own concurrent operation semantics.

## Regression evidence

The actual Navigation TSX and actual auth boundary/storage modules run under strictly allowlisted React/SDK-call fixtures with synthetic data.

- Before implementation: 3/3 new cases failed (escaped rejection, missing pending control, unsafe unknown rejection).
- After implementation: 3 new cases, 8 existing storage/auth-boundary cases, and 2 Navigation/privacy cases pass (13/13, zero skips).
- Rejection preserves the current auth identity and consultation cache, exposes an accessible generic error, and leaves retry enabled. A later successful fixture logout clears the cache through the unchanged boundary observer contract and redirects once.
- Pending controls prevent a rendered duplicate submission; a delayed A rejection after switching to B does not display an error, change B cache, or navigate. Unknown rejection payloads are not rendered.

## Validation and limits

Commands: tsx --test src/backend/v17/frontend.logoutError.test.ts src/backend/v17/frontend.storage.test.ts src/backend/v17/frontend.personalizationNavigation.test.ts; npm.cmd run typecheck; npm.cmd run build:client. All passed. Client build retains the existing large-chunk warning.

The tests isolate component behavior with mocked React and signOut calls; they do not prove real SDK/provider logout or browser assistive-technology behavior. Those checks remain NOT_RUN. No deployment or Production writes.
