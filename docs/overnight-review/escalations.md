# Escalations

All items below are deferred at the decision boundary. No production mutation,
new safety/retention policy, model switch or paid benchmark was performed.

## P0

No P0 requiring whole-run stop was observed. Tests/build were green at the fetched
base. Original develop checkout and its unrelated untracked files were preserved.

## P1 — Pre-send write-intent race (outside completed A05 response isolation)

A05 is Completed within the user's2026-10-04 approved responsibility: reject stale
successful protected responses before caller cache/state delivery. The production
transport has20 new regressions, both reviewers approved, and all four gates passed.
See [A05 follow-up](a05-response-guard.md). Backend ownership, Supabase flow, token/session
storage and public/auth routes are unchanged. Real Supabase/browser verification is NOT_RUN.

The separate before-send race remains: the existing client awaits getSession. A body
prepared for A could be sent with B's newer token if auth changes during that await.
Response guards cannot undo a server write already sent. This run does not enforce
write-intent at send time or claim the broader race is fixed.

Historical context: automatic approval review rejected the earlier broad central guard
and a JWT alternative for global auth/privacy/service-availability impact. That candidate
remains unwired. The user's later conditional approval narrowed responsibility to response
isolation; it was applied without those pre-send/session-user/token-claim checks.

Human decision: separately scope a write-intent/pre-send policy and authorize a disposable
real auth lifecycle test environment. Do not use a frontend response guard to replace
backend authorization. Preserve A05 Completed for the approved scope and this P1 unresolved.

## P1 — Safety and crisis semantics (B01/C01)

Known avoidActions false positives and selected inflected direct threats are fixed.
Review found inverse-negation and attributed-quote loopholes; final code uses exact
affirmative endings and conservatively rejects quoted aggression. Broad Japanese
negation/quotation, indirect urging, diagnoses, DV/self-harm/abuse/stalking routing
and over-routing require human safety/product review. No crisis policy or support
replacement is adopted. Use crisis fixtures/proposal and 25 offline evaluation inputs;
Schema validity and keyword checks do not certify safe model behavior.

## P1 — B02 production recovery owner and quota reconciliation

Owned/run-matched explicit-cutoff helper and real PostgreSQL contention tests exist.
No route, cron or scheduler invokes it automatically. Decide scheduler, operational
owner, stale threshold, monitoring response and abandoned quota reservation correction.
The existing five-minute SQL example is not an adopted quality threshold. A recovered
Case does not automatically settle a historical usage reservation.

## P1 — B03 derived source and permission lifecycle

Explicit stale/source-absent profiles fall back; provenance distinguishes user input,
user Feedback and AI summaries. Decide minimum case evidence, age, regeneration,
correction and transitive withdrawal from derived summaries/Profile snapshots.
Current metadata does not prove content source fidelity or independently verified facts.

## P1 — Supabase RLS/GRANT/Data API verification

B05 verifies actual PostgreSQL constraints and backend owner queries using an isolated
owner-role DB and an auth stub. It does not prove real Supabase RLS, GRANT, Auth deletes,
Data API or production isolation. Use a separately authorized disposable Supabase project.

## P1 — C02 retention/delete contract

Archive is not deletion. Decide account deletion UI, snapshot/derived retention,
backup/log/provider retention and accurate copy; current code alone cannot establish
external retention settings. Do not promise immediate complete erasure.

## P2 — Dependencies, performance and deploy verification

B06 audit completed; installed vulnerable versions remain. Prioritize compatible
Express/qs patch with exact lock diff and tests; transitive major/override and Prisma
downgrade are separate decisions. Production image contents are UNKNOWN.

Deep-route rewrites/build identity are repo-only fixes. Production GET /login and
/history returned404; no deploy was authorized, so live resolution remains unverified.

History fanout302 requests/100 concurrency and a single ~922kB client chunk were
measured locally. Decide endpoint ordering/partial-error/cancellation semantics and
run real browser/network/DB measurements before optimization. No index, cache,
chart removal, route lazy, memo or architecture migration was adopted.

## P2 — AI comparisons and score UX

Luna A–E comparisons are NOT_RUN. Require explicit paid gate, finite aggregate cap,
current prices/framing reservation/usage accounting and human semantic evaluation.
Keep current model/prompt. Streaming prototype waits for the full validated response;
no measured early-field latency benefit. Score A–F fixture variants need human UX,
keyboard/screen-reader and device tests before production adoption.
