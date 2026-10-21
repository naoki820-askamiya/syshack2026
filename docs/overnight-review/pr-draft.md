# PR draft

## Title

KIGEN404: 認証・相談・AI出力の境界を修正し、残件と独立E2Eへ引き継ぐ

## Why

The portfolio review reproduced auth/cache/write-intent races, non-resumable analysis,
lost caution/source metadata and inconsistent Feedback/privacy boundaries. The final
resumed review additionally found acknowledged Person IDs lost on Case failure,
unbounded continued History reads, inert error affordances and a diagnostic quote
exception that accepted instructions reversing the denial.

The approved residual pass also reproduced response-loss duplicate creation,
implicit Person editing/snapshot races and an unanswered protected request when
Supabase getUser rejected under Express4. These now have bounded fixes and regressions.

The branch now preserves the original ownership/CAS/latest-version authority while
isolating stale client responses/writes, resuming the saved Case, displaying actual
source/strength/comparison reasons and keeping unknown confidence unknown.
Confirmed Person ACKs survive retry; each History load has at most4 workers and
stops new pages after failure/auth change. History/logout failures are recoverable.
Password recovery is explicitly unavailable pending a safe complete operation contract.

Optional owner/resource UUID intent keys now replay an unchanged Person/Case create
after response loss, while differing normalized input returns409. Existing Person
editing is explicit save/cancel with atomic Profile invalidation; future Case creation
locks and snapshots current owned Person fields while past snapshots remain immutable.
Quota reservations are bound to the original owner/event/case/run and settle only
known attempt counts. Unexpected auth SDK rejection returns a generic500/requestId;
ordinary auth failures stay401 and no internal SDK detail reaches the response.

## What changed

- Correctness/DB: resource-local create-intent uniqueness/replay, locked future snapshot and original-run usage settlement.
- Auth/session: stale response and unsent write rejection, safe SDK500; private password experiment only.
- UX: saved-Case resumption, explicit Person save/cancel, History retry and logout feedback.
- Personalization: atomic Feedback/Profile invalidation and source provenance/owner checks.
- AI reliability: classified retry/deadline, actual SDK integer timeout and bounded safety exceptions.
- Accessibility: labels, pending/error affordances and keyboard-oriented choices; actual browser observation remains pending.
- Observability: metadata-only attempt/known usage and bounded client logical milestones.
- Dependencies: Express4.22.3/body-parser1.20.8/qs6.16.0 only, existing direct ranges/root manifest retained.
- Docs:30 synthetic eval fixtures, source-hashed build/History evidence, risk/decisions/E2E handoff.

## What intentionally did not change

Prompt/model/output schema/DB architecture and Supabase session storage are retained.
No Production write/deploy/migration/delete, merge, push or external PR creation.
No major/override/forced dependency repair. Streaming/lazy routes remain experiments.

## Verification

Final command evidence is in [verification](final-verification.md): full regressions,
typecheck, client/server build, Markdown, disposable PG, standalone HTTP/qs6,
offline13, auth41 and current client focused cases. Every logical issue received
independent and skeptical review; confirmed full-branch findings were repaired.
Large-chunk warning remains. Local Node/synthetic checks do not prove browser,
Supabase RLS/GRANT, real model safety/quality or deployed route behavior.

Current final gates:312 full tests/0skip, typecheck/client-server build and54 Markdown
files pass; disposable PG14 verifies constraints, concurrent replay and snapshot
ordering using actual PostgreSQL. Fresh bundle bytes/gzip and five History source
hashes were independently matched. Per-change and exact whole-branch review logs
are linked from verification; previous254/7 counts are historical.

## Remaining risks

Crisis/retention/derived consent/Profile generation policy, unknown crash/provider
quota reconciliation, create-intent recovery after reload/physical deletion, complete
password recovery and graph comprehension remain explicit partials. Resource-local
replay and durable linkage are implemented. The earlier audit snapshot had thirteen
entries; current production packaging/advisory state has not been re-audited and
exploitation prerequisites are separate from raw audit counts.

FACT: unknown attempts are not refunded; screen keys do not survive reload; no
complete password route is adopted. UNMEASURED: real Auth/RLS/browser/model/deployed
identity and capacity. INFERENCE: merge/demo gates are reviewer recommendations,
not established repository policy. Safety/retention/Profile rules require human choice.

## E2E follow-up

READY_AFTER_E2E: use [handoff](e2e-handoff.md) with isolated synthetic users and
independent device/browser observation before merge judgment. See
[risk register](final-risk-register.md) for recommended merge/public-demo gates.
This is a saved draft, not a created or merged PR.
