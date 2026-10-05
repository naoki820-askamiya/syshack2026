# Final human decisions

Date: 2026-10-05 JST. Decisions did not stop other issues. Current status is in
[summary](final-summary.md) and [risk register](final-risk-register.md).

## Adopted residual contracts

R07 linkage and known-attempt settlement are implemented; missing durable linkage
is no longer an open defect. Unknown/abandoned attempts retain conservative usage.
Choose scheduler, stale threshold, refund and provider-billing reconciliation.
Legacy NULL reservations are not guessed/backfilled; costUnits are quota attempts.

R13 explicit save/cancel/edit is implemented with current owned Person lookup,
atomic Profile invalidation and locked future Case snapshot creation. Past
snapshots are retained, historical labels KEEP current latest-Person mapping,
and existing last-writer-wins is retained. No new revision/CAS or Profile writer.
R08 minimum evidence, age, regeneration and derived-source consent remain decisions.

R12 optional owner/resource-scoped UUID key, server-normalized immutable fingerprint,
atomic uniqueness, replay and typed409 are implemented. Omitted key/legacy DB NULL
remain ordinary create; explicit JSON null is rejected. Archived Person POST/replay
fails404 and resources are not resurrected. Resource lifetime bounds metadata;
no TTL/independent retention policy was introduced. Reload/unmount/physical-delete
retry recovery remains outside this bounded guarantee; choose that contract before
persisting drafts or adding a ledger.

## Password recovery

R14 supported private SDK isolation is executable as a synthetic-only feasibility
probe; no reset/email route is wired. Exact captured-token GET/PUT and a sticky
refresh-denial latch prevent the observed private SDK from altering the main
session in delayed-response/body tests. Ordinary autoRefreshToken=false alone was
insufficient, as the near-expiry SDK fallback counterexample shows.

The existing main singleton still consumes callbacks. Decide central recovery
intent observation/revocation/consumption, ordinary sign-in denial and reused
issued bearer-session callback policy. One-use email code is not one-use bearer
session. A same-origin page flag alone cannot prove cross-reload replay denial.
Do not weaken this requirement or redesign Auth/token storage within this harness.
Then verify cancel/duplicate/failure/reload, provider redirect/email and actual UI.
An already-sent A password update may still change A; UI guards cannot undo it.

## Safety / retention / result comprehension

R01 crisis routing, urgent-support copy/resources and expert semantic review remain.
R02 retention duration, old/derived snapshots, backups/provider/operator copies and
physical deletion remain; archive is not deletion. R09 score/radar selection needs
human observation; confidence is not calibrated accuracy. Source/unknown fixes stay.

## Model, UX and operations

The user allows Luna adoption, but no numeric aggregate paid cap exists. Paid calls0;
KEEP CURRENT MODEL/PROMPT until capped real outputs and blind semantic grading.
Current deployed baseline, framing/price/usage/retry bounds and adoption criteria
must be verified. Thirty synthetic fixtures/offline13 are preparation only.

R03-R05 actual Auth/RLS/GRANT, browser matrix and deployed exact build remain NOT_RUN.
No Supabase CLI or cached Auth-stack images were found. Do not run the shadow
auth.uid stub against a real Supabase project. Existing disposable PG is owner-role
evidence only. R10 remaining advisories need package/upstream/major decisions.
R11 partial pagination/deadline/lazy fallback and R15 actual paint/provider latency
remain UNMEASURED; no streaming adoption.

No Production writes, deployment, merge, push or paid provider calls occurred.
