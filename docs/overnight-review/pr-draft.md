# PR draft

## Title

KIGEN404: 認証・相談・AI出力の境界を修正し、残件と独立E2Eへ引き継ぐ

## Problem and resulting behavior

The portfolio review reproduced auth/cache/write-intent races, non-resumable analysis,
lost caution/source metadata and inconsistent Feedback/privacy boundaries. The final
resumed review additionally found acknowledged Person IDs lost on Case failure,
unbounded continued History reads, inert error affordances and a diagnostic quote
exception that accepted instructions reversing the denial.

The branch now preserves the original ownership/CAS/latest-version authority while
isolating stale client responses/writes, resuming the saved Case, displaying actual
source/strength/comparison reasons and keeping unknown confidence unknown.
Confirmed Person ACKs survive retry; each History load has at most4 workers and
stops new pages after failure/auth change. History/logout failures are recoverable.
Password recovery is explicitly unavailable pending a safe complete operation contract.

## Scope

- Atomic Feedback/Profile invalidation and source provenance/owner checks.
- Classified AI retry/deadline, actual SDK integer timeout and bounded safety exceptions.
- Saved-Case intent consumption, stable Person identity and source-backed result display.
- Metadata-only backend attempt durations/known usage and bounded client logical milestones.
- Express4.22.3/body-parser1.20.8/qs6.16.0 only; existing direct ranges/root manifest retained.
- Synthetic evaluation30 fixtures, build/history evidence, risk/decision/E2E handoff.

Prompt/model/output schema/DB architecture and Supabase session storage are retained.
No Production write/deploy/migration/delete, merge, push or external PR creation.
No major/override/forced dependency repair. Streaming/lazy routes remain experiments.

## Validation

Final command evidence is in [verification](final-verification.md): full regressions,
typecheck, client/server build, Markdown, disposable PG, standalone HTTP/qs6,
offline13, auth41 and new client29 focused cases. Every logical issue received
independent and skeptical review; confirmed full-branch findings were repaired.
Large-chunk warning remains. Local Node/synthetic checks do not prove browser,
Supabase RLS/GRANT, real model safety/quality or deployed route behavior.

## Remaining decisions and recommendation

Crisis/retention/derived consent/Profile generation policy, durable crash quota,
uncertain-create idempotency, complete password recovery and graph comprehension
remain explicit partials. Thirteen audit entries remain; exact production packaging
and exploitation prerequisites are separate from raw audit counts.

READY_AFTER_E2E: use [handoff](e2e-handoff.md) with isolated synthetic users and
independent device/browser observation before merge judgment. See
[risk register](final-risk-register.md) for recommended merge/public-demo gates.
This is a saved draft, not a created or merged PR.
