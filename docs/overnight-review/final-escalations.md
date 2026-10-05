# Final human decisions

Date: 2026-10-05 JST. Work continued around these decisions without confirmation waits.
Current item classification is in [risk register](final-risk-register.md).

## Safety / Crisis and retention

R01: decide crisis routing, urgent-support copy/resources and expert semantic review.
Known avoid-label regressions are contained; complete Japanese safety is not proven.
R02: choose retention period, backup/provider/operator handling and deletion of
old/derived JSON snapshots. Archive is not physical deletion.

## Personalization and identity

R08: choose minimum evidence, stale age, regeneration and derived-source consent.
Provenance/source-owner checks are implemented; no threshold or automatic writer
was invented. R13: persistent existing-Person relationship edits need a contract;
automatically PATCHing Person could alter future context and history labels.

R12: acknowledged Person ID is now retained for a failed Case-create retry.
An uncertain Person/Case commit with a lost response remains distinct: choose
owner-scoped intent key, uniqueness, payload conflict/replay and lifetime before
server idempotency. Equal display names or consultation text are not intent keys.

## Password recovery

R14 History retry and logout failure feedback are implemented. Login now explicitly
reports unavailable recovery instead of an inert button. Actual recovery remains
PARTIAL: synthetic installed-SDK cases demonstrate session selection after an await
and stale SDK session publication before the caller postcheck. A page guard alone
does not solve these boundaries. See [SDK evidence and bounded proposal](r14-password-recovery.md).
Choose an operation-bound dispatch/publication design before adding a complete
recovery flow; no Auth storage/SDK/configuration redesign was adopted.

## Model, UX and performance

R06/R16: approve an aggregate numeric paid budget, deployed-model baseline and blind
human semantic ratings before Luna/Prompt adoption. Paid calls0; KEEP CURRENT MODEL
and KEEP CURRENT PROMPT. Thirty synthetic fixtures/offline13 tests are prepared.

R09: source/strength/comparison reasons and missing-confidence honesty are repaired.
Choose score/radar format after observing human comprehension; AI confidence is
not calibrated accuracy. R11: per-load read cap and failure stop are implemented;
live capacity, partial pagination, deadlines and lazy fallback/chunk recovery remain.
R15: backend substages/known usage and bounded client logical milestones are implemented; first provider event,
browser paint and real latency remain UNMEASURED. No streaming adoption.

## Production and operations

R03/R04/R05: live Auth/RLS/GRANT, browser auth/device matrix, deployment and exact
build/deep-route checks require an isolated environment and separate authority.
No Production writes, deployment, merge or push occurred.
R07: do not guess or refund unknown abandoned attempts by timestamp; durable
event-case/run linkage, conservative charge and scheduler policy remain undecided.
R10: scoped runtime patches are handled separately from remaining tooling/Prisma
advisories. Major changes and forced overrides remain unadopted; braces has no
patched version in the reviewed advisory.
