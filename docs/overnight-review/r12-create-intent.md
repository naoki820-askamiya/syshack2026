# R12: Resource-local creation intent

## Adopted bounded contract

Person and AnalysisCase POST accept optional UUID createIntentKey. Each table has
owner/key uniqueness; one key can name distinct operations in the two tables and
distinct authenticated owners. Omitted API keys and legacy DB NULL keys retain
ordinary create behavior; explicit JSON null is rejected. Trace x-request-id,
names and equal text are not deduplication keys.
The server computes a v1 SHA256 fingerprint of fixed-order, validated normalized
input. Notes absent/null are equal; UUID case and trimmed text are normalized.
Generated ID/time, mutable Person identity, Case snapshot/status/run and the key
are excluded. Client fingerprint and PATCH key fields are rejected strictly.

Resource, key and original fingerprint commit together. A unique collision is
matched narrowly to the intent constraint; the owned resource is read only after
the failed transaction has rolled back. Equal fingerprint returns the current
resource; different input returns CREATE_INTENT_CONFLICT409. Other database errors
propagate unchanged. Person edit does not rewrite its original fingerprint.
Case replay retains its original snapshot, run/result/status and updatedAt, without
starting analysis or reserving quota. An archived/missing Person yields404 for
these POST operations, including Case replay; no archived resource is resurrected.
Ordinary Case GET semantics are unchanged. Retry metadata is removed from every
public Person/Case create/read/list/update envelope, and is not logged.

The existing resource lifetime bounds this metadata; there is no independent ledger,
TTL, cleanup task or new retention duration. Physical deletion removes the intent
with its resource, so a retry after deletion is outside the guarantee. Account
authentication and ownership remain backend responsibilities. Deletion/retention
policy remains R02; this change does not authorize longer retention.

NewConsultation retains separate Person and Case keys in component memory per
user/epoch and submitted payload. Unacknowledged unchanged retries reuse keys;
changed payload uses a new key. A synchronous ref prevents same-render double
submit. Acknowledged Person is reused and its current identity can be explicitly
edited. Saved Case's known-version snapshot supplies the immediate confirmed
identity. No business data/key is put in Web Storage. Reload/unmount loses these
in-memory keys: cross-reload recovery remains PARTIAL, not a deduplication claim.

## Evidence and limitations

Before backend implementation4/4 new regressions failed. Actual TSX fixtures verify
lost Person response, failed/lost Case response, payload changes, epoch changes,
same-render double submission, acknowledged Person reuse/editor and saved snapshot
identity. Synthetic hooks establish control flow, not live React/browser/Auth.

Initial real PG12/14 passed: concurrent INSERTs exposed installed Prisma7.9.1
adapter-pg's P2002 metadata under driverAdapterError.cause.constraint.fields instead
of the documented meta.target example. The repair inspects the observed structured
kind/code/fields only; it does not parse SQL/error messages or handle all P2002s.
Corrected disposable PG14/14 pass/0skip with cleanup. Tests hold two real connections
behind an INSERT advisory-lock trigger, then verify one resource/same ID; they also
cover conflict, different owner/new key/legacy key, mutable replay, archive denial,
unchanged analyzed Case and quota, and insert rollback with unchanged retry.

Only the disposable runner applies the additive nullable-column migration.
Production migration/deploy and live provider/browser checks are NOT_RUN.
Changing canonical v1 in the future requires compatibility with existing keys.
Review and final npm gates are recorded in final-verification.md.

Review cycle1 found ACK Person then explicit rename then original-name new input
reused the acknowledged creation key and replayed the edited old resource.
Actual-page negative control8/9 pass, then the fix discards the Person key only
when typing discards a known ID; unknown-response retries keep their key.
Cycle2 frontend independent31/31 and backend44/44 pass and APPROVE. Final npm
test299/0skip, typecheck/build PASS; Markdown53 files/0issues.
Cycle2 skeptical APPROVE, independent69/69 focused including R13/timing interop.
No unresolved confirmed blocker within the documented guarantee.
