# B02 Recovery and usage reconciliation

Status: deterministic observability completed; abandoned-reservation policy partial.

The service inspects both rejected compensation and fulfilled update counts.
A zero-row update is recorded as unmatched, never as successful recovery. It can be
a benign superseded run; the original analysis error and newer run stay unchanged.
Settlement failure records the existing usage event ID, exact case/run and known
actual attempt count. No consultation, token or provider error detail is emitted.
Monitoring failures cannot alter a saved result or the original failure.

The existing stale recovery helper already requires explicit owner/case/run/cutoff,
locks and rechecks that run, emits a recovery event, and has real PostgreSQL coverage.
No scheduler, automatic threshold or new endpoint is enabled.

## Manual preparation path

For a usage_reconciliation_required event, first correlate its usageEventId with
the existing owner-scoped api_usage_events row and retained case/run event. Confirm
that the row is still allowed, no operator has already settled it, and the logged
attempt count is authoritative. Prepare a guarded owner+event+allowed update with
the current status and the existing bounded cost rule; review before execution.
No such update was executed in this run.

For a process crash without an outcome event, actual provider attempts are UNKNOWN.
The database does not persist an event→case/run relation. Do not infer that relation
by timestamps or clear another reservation. Options needing human decision:
retain the conservative reservation, compensate after authoritative provider
evidence, or introduce reviewed durable linkage for future runs. Retaining may
consume quota until its window expires; unconditional refund can undercount paid
work. Case recovery does not itself refund usage. This limitation blocks a claim
of complete crash reconciliation, not the owner/run-safe recovery helper.

Regression: new service tests failed 2/7 before the change. They inspect zero-row
outcome, exact correlation, known attempts, original failures and PII exclusion.
