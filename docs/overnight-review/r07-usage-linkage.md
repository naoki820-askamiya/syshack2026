# R07: Durable usage linkage and guarded settlement

## Scope and contract

The approved residual implementation adds nullable original case/run UUIDs to
usage events. Case start and reservation remain in the existing short transaction;
the run comes from PostgreSQL UPDATE RETURNING. Reservation failure rolls back
the case start. No external AI call enters a database transaction.

Settlement matches authenticated owner, event, original case/run, analyze route
and allowed status. It inspects the update count; a zero-row result is classified
through the same owned linkage as identical prior settlement, conflict or unmatched.
It never follows the case's mutable current run. Failures are observable and cannot
roll back a saved analysis result.

Known attempts must be integers from zero through the existing maximum three.
Unexpected generation exceptions retain unknown attempts and the conservative
reservation. costUnits represents attempt-based quota, not provider billing.

## Evidence and verification

The new contract regressions failed12/12 before implementation. After the minimal
change, focused linkage/repository/service tests passed33/33, with zero skips.
See ignored experiments/residual-r07-before.log and residual-r07-focused.log.
Real PostgreSQL tests additionally cover rollback of run start when reservation
insert fails, owner/run mismatch, repeated and conflicting settlement, replacement
run isolation, legacy NULL linkage and existing account-delete retention.
Final suite results are recorded in [final verification](final-verification.md).

The R07 frozen tree passed all268 tests, typecheck, client/server build, Markdown
lint51 files/0 issues, and disposable PostgreSQL8 cases/0 skips. Its own container
was removed. Independent and skeptical reviewers each reran33 focused tests and
approved the bounded change. Existing large client chunk remains a build warning.

## Migration and remaining limits

20261005010000_usage_run_linkage is an additive migration file. It is applied only
by the disposable loopback/tmpfs integration harness during this run. Existing
rows keep NULL links; a paired-column CHECK rejects partial links. There is no FK
to current run, no new cascade, no inferred backfill and no production migration.
Existing owner ON DELETE SET NULL is preserved; correlation UUIDs are retained
with usage rows, so this change is not a new deletion/anonymization guarantee.

Crash/provider acceptance and billing remain UNKNOWN without external evidence.
Scheduler, final stale threshold, automated refunds, retention and provider billing
reconciliation remain decisions. The linkage/settlement implementation is complete
only within this bounded contract; R07 as an operations policy remains partial.
