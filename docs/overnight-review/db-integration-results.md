# B05 Local PostgreSQL Integration Results

Date: 2026-10-04 JST.
Status: B05 reviewed and committed as `f3f620b`; B02 recovery extension verified, root and backend reviews approved.
Application base: `406fc8581a471cedfe4a030845c820b03a4c4f2f`.
Successful application revision during run: `4213a0ffa04dc03ada38d296f1642d87a34f4e4c`
plus concurrent uncommitted improvements in the isolated worktree.

## Environment and safety

Docker Desktop engine 29.6.1 available; local PostgreSQL 17 image ID
`sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0`.
Image tag resolution failed despite inventory presence, so the harness validates and uses the
cached image ID with `--pull never`. No existing stack was started, stopped, or modified.
Test DB was unique, loopback-only, on a Docker-assigned port, with tmpfs storage/random credentials.
Child cwd was a fresh empty temporary directory; no repository env files loaded.
Production/shared DB access, paid API calls, real user data and migration deployments: 0.

## Verified result

`node --test scripts/db-integration/safety.test.mjs`: 1 passed, 0 failed.

`node scripts/db-integration/run.mjs`: latest rerun 7 passed, 0 failed, 0 skipped (test duration 2901 ms).
B02 implementation was frozen at `94aca4e`; successful-run test blob: `9a956c24a78b1e1fb7c95ee7c54a53bfa4b902dd`.
Docker label-filter inventory after completion returned no remaining harness containers.

| Scenario | Actual PostgreSQL evidence |
| --- | --- |
| User A/B ownership | User B lookup/start yields null/not_found; cross-user person/case composite FK rejects P2003; B usage count remains 0. |
| Two-connection start | Two distinct pg_locks PIDs must wait concurrently before lock release; exactly one started and one analyzing; attempt count = 1 and winning run ID retained. |
| Stale completion/failure | Replaced old run saves no result and updates no state; current run saves exactly one result; duplicate completion is rejected. |
| Version / rollback | Empty prompt violates DB check; case remains analyzing with result count 0. Valid retry succeeds. Duplicate case/version rejects P2002. Version 2 is latest even with a 2020 timestamp. |
| Quota concurrency | Two different cases wait on the real policy lock; one starts, the other is AI_RATE_LIMITED; one reservation and one unchanged draft/attempt 0. |
| Feedback transaction | DB trigger fails profile update: POST returns safe 500 and Feedback count = 0; removal of failure permits retry 201. PATCH failure preserves note/consent; successful withdrawal marks profile stale even when privacy is OFF; re-enabling global personalization/Feedback while Profile is OFF still excludes revoked Feedback from next real AI context and usedFeedbackIds. |
| B02 explicit recovery | Wrong owner/equal timestamp do not recover; two real locked connections recover the same run exactly once. Old completion is rejected; replacement made equally old stays analyzing against old run recovery/failure; current result alone saves version 1, and analyzed state cannot be recovered. Synthetic 2020/2021 dates are fixtures, not a product threshold. |

The previous six-scenario run completed in 3364 ms before the recovery extension.
An initial harness run had 5 passes/1 failing observation: joining pg_locks with
transaction-cached pg_stat_activity missed a newly created connection. The observation was
corrected to use live pg_locks and database OID; the two-connection assertion was preserved.
No application tests were deleted, skipped, or weakened.

## Limits / human decisions

Actual PostgreSQL constraints and backend ownership were verified using the DB owner role.
The auth.users/auth.uid scaffold is the existing shadow stub; real Supabase RLS/GRANT/Data API
behavior remains unverified and must be exercised in a separately authorized isolated Supabase project.
No production scheduler, stale threshold, user quota policy, retention rule or safety policy was selected.
Fixtures use a test-only quota of one request to expose contention; that value is not a product recommendation.
