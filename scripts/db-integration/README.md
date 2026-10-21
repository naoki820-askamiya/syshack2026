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
POST/PATCH rollback with a synthetic failing profile trigger followed by successful retry,
revoked-Feedback exclusion from the next context, and explicit stale-run recovery identity/concurrency.
Every fixture is synthetic. No user consultation contents or credentials are logged.

Cleanup verifies the created container ID and run label before removal. Normal failure and handled
interrupts remove that container and discard tmpfs data; a hard process kill/host crash can leave a
labeled container running. Inspect only `label=kigen404.disposable-run` before any manual cleanup.
The harness does not certify deployed Supabase RLS, GRANTs, Data API, provider behavior or migrations.

Combined new-Person/Case creation is also checked with two real concurrent connections,
lost-response replay, failures after each table insert, changed-input conflicts, owner separation,
existing-Person intent compatibility, and failed analysis followed by creation replay. Each failed
combined save must leave neither row; analysis failure must retain the already committed pair.

`integration.test.ts` のゲスト v1 テストは、実装と同じゲスト repository と、この隔離 DB 内の合成予算を使います。
50 並列の再送・別資格、全体金額・件数・同時枠の最終枠、実行者の送信許可 CAS、transaction rollback、
許可保存後の応答消失、取消、終端後の同時枠返却、UNKNOWN による受付停止、起動時回復、
不変の再送結果、同意・資格の期限切れ、削除・内容期限と遅延完了の競合を検証します。
競合の検証では実際の予算行をロックし、別々の PostgreSQL 接続 2 本が待機したことを観測してから解放します。
短期発行制限の回帰テストでは、制限期間より長く 2 transaction を待機させます。
transaction 開始時の古い時刻で、新しく発行した資格が集計から抜けないことを確認します。
fixture の料金・保持期間は承認済みの本番方針ではありません。AI provider は呼び出しません。
配備先の DB 権限や Supabase RLS・Data API の動作を証明するテストでもありません。
テストの追加だけを実行成功の証拠にせず、実際のハーネス終了結果を別途記録してください。
Docker daemon が利用できなければ実 PostgreSQL の受入ゲートは未検証です。
モック・構文・型チェックの成功を、実 DB 検証の代わりとして報告しないでください。
