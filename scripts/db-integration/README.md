# Disposable PostgreSQL Integration Harness

Run from the repository root:

```powershell
node --test scripts/db-integration/safety.test.mjs
node scripts/db-integration/run.mjs
```

Requirements: local Docker engine, cached `postgres:17-bookworm` image, current installed
Node dependencies, and generated Prisma Client. No package or image is automatically downloaded.
The wrapper resolves the cached tag inventory to a validated image ID to handle a local Docker
tag-resolution anomaly without retagging or pulling.

The runner creates one uniquely named, labeled PostgreSQL container with a random loopback port,
random ephemeral password/database name, and tmpfs data. It never uses existing Compose stacks,
`.env`, shared Supabase, or an externally supplied database URL. The child runs in a new empty
temporary directory; both migration/runtime URLs are overridden with the runner-created URL.
The test refuses non-loopback or incorrectly named databases before importing the DB client.
No external model requests are made; Supabase identity is a synthetic stub for the HTTP test.

It applies the repository's existing `init-shadow-db.sql` and ordered migrations.
The auth schema is only the existing shadow stub, not real Supabase Auth/RLS evidence.
The application repository and Prisma SQL run against actual PostgreSQL constraints/transactions.
Concurrent tests hold a real advisory lock and require two distinct waiting PostgreSQL PIDs before
releasing the gate; both operations use the unchanged production repository.

Covered behavior: user ownership/composite foreign key, concurrent case start, stale result/failure
rejection, version uniqueness/latest order, result-write rollback, quota concurrency, and Feedback
POST/PATCH rollback with a synthetic failing profile trigger followed by successful retry.
Every fixture is synthetic. No user consultation contents or credentials are logged.

Cleanup verifies the created container ID and run label before removal. Normal failure and handled
interrupts remove that container and discard tmpfs data; a hard process kill/host crash can leave a
labeled container running. Inspect only `label=kigen404.disposable-run` before any manual cleanup.
The harness does not certify deployed Supabase RLS, GRANTs, Data API, provider behavior or migrations.
