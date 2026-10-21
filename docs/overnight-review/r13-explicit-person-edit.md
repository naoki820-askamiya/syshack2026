# R13: Explicit Person editing and snapshot ordering

## Adopted bounded contract

An existing Person is edited through an explicit editor in the new-consultation
screen. Nickname/relationship draft, cancel, save, busy and error/retry are separate
from submitting the consultation. Direct nickname input still selects a new Person;
selected existing relationship controls require the editor. No silent PATCH occurs.
Draft and successful-save publication retain the original user/epoch and Person.
ProtectedRoute already remounts children by user/epoch; no Auth policy was changed.

Known Person selection always GETs the current owned Person, including when history
is cached. Historical demographic defaults and the consultation draft may remain,
but cached identity labels do not supply authoritative future Person values.
Saving only changes the selected identity, not historical consultation cache.

Backend PATCH preserves owner/active predicates and the existing last-writer-wins
contract. Person UPDATE, dependent Profile invalidation and response read are in
one short transaction. Identity-field PATCH conservatively marks Profile stale even
when Privacy is OFF; notes-only PATCH does not claim notes are AI input.
No revision/CAS, Profile generator, evidence threshold or age rule was introduced.

Case creation reads active owned Person under FOR SHARE and inserts the Case in
the same transaction. The lock orders this read against edit/archive; old internal
snapshots are ignored. Past Case/result snapshots are unchanged. Historical labels
retain the current mapper's latest-Person display contract; they are not frozen
past labels. Future analyses still use each Case's stored snapshot.

## Evidence and acceptance

Backend negative control:1 pass/2 fail before implementation. Tests verify explicit
save/cancel/retry, validation, duplicate click, A-to-B/same-user-login/unmount late
results, current Person lookup despite old cache, unchanged consultation draft,
owner/archive rejection and transaction-local Profile invalidation.
The actual TSX is evaluated with allowlisted synthetic hook/transport fixtures;
this is not real React/browser rendering or provider E2E.

Review cycle1 found four UI defects: selected other/customer/classmate could not
submit, changing identity after GET failure stayed blocked, retry could reload the
original URL Person instead of the failed selection, and an acknowledged new
Person lacked its editor after Case failure. Negative controls recorded7/9 and2/5
failures; the retry-target defect was independently reproduced as requests A,B,A.
Cycle2 retains new-Person Other-detail validation, resets only new-identity failure
state, retries the actual last target, and retains the acknowledged full Person.
Focused UI24 pass/0skip; full npm test287 pass/0skip; typecheck and client/server
build pass. The existing large-chunk warning remains.
Cycle2 independent frontend and backend reviews APPROVE; skeptical review APPROVE
with an independent27/27 run (UI24 plus backend3). No unresolved confirmed blocker.

Disposable PostgreSQL adds real invalidation failure rollback, privacy OFF then ON,
old/new snapshots, foreign owner plus the preserved composite FK, and two-connection
Person edit/archive ordering. Fresh observer queries verify that the production
Case creation actually waits for the held row change. Final results and reviews
are recorded in [final verification](final-verification.md).
Disposable PostgreSQL11 pass/0skip, including two-connection edit/archive races;
the first fixture failed a shape CHECK before reaching the FK, then was corrected
without changing the expected P2003 ownership failure. Container cleanup succeeded.

Physical deletion/retention, external Data API write permissions, live browser
accessibility and a future edit-conflict UX remain separate. This change contains
no Auth/storage redesign, provider/model switch or Production operation.
