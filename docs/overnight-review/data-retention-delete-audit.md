# C02 Data retention and deletion source audit

Status: HUMAN_DECISION_REQUIRED. Date: 2026-10-04 JST. Source audit only.
No deletion, retention job, production access or policy change was performed.

## Evidence boundary

CONFIRMED below means checked repository schema, SQL migration or app source. SQL represents
intended migration constraints; the production schema/applied migration state was not queried.
Actual auth-user deletion and cascading behavior were not executed in this audit. UNKNOWN means
no verified operational contract, not that data is absent or deleted. This document is not legal advice.

Sources: [Prisma schema](../../src/backend/prisma/schema.prisma),
[initial SQL migration](../../src/backend/prisma/migrations/20260512000000_init_supabase_kigen404/migration.sql),
[v1.7 migration](../../src/backend/prisma/migrations/20260813010000_v1_7_ai_backend_spec/migration.sql),
[person repository](../../src/backend/v17/persons.repository.ts),
[privacy routes](../../src/backend/v17/privacy.routes.ts),
[user-pattern routes](../../src/backend/v17/userPattern.routes.ts),
[context repository](../../src/backend/v17/context.repository.ts),
[workflow repository](../../src/backend/v17/workflow.repository.ts).

## Storage and cascade contract in source

| Location | Stored data | Deletion relationship in repository contract |
| --- | --- | --- |
| Supabase auth.users | Auth identity; operational storage scope UNKNOWN | Auth-user delete has SQL CASCADE to business rows listed below; no app account-delete entrypoint found |
| persons | Nickname, relationship, notes, timestamps, archived_at | user_id → auth.users CASCADE; case → person uses NO ACTION, so hard-deleting a referenced person alone is blocked |
| analysis_cases | Event facts, user response/chat, age/gender/reaction/time, person_snapshot JSON, run/status/failure metadata | user_id → auth.users CASCADE; case deletion cascades to results and feedback |
| analysis_results | Versioned result_json, context_json, model/prompt/schema versions, used_case_ids and used_feedback_ids, profile/pattern IDs | user_id → auth.users CASCADE; case FK CASCADE; snapshot JSON and provenance ID arrays have no per-source deletion cascade |
| analysis_feedbacks | Scores, outcome, outcome_note, recommended-action use, allow_personalization_use | user_id → auth.users CASCADE; case and result FKs CASCADE; permission withdrawal updates a boolean rather than deleting row |
| person_profiles | Generated profile_json, source counts/latest-case ID, model/schema/timestamps/stale metadata | user_id → auth.users CASCADE; person FK CASCADE; source_latest_case_id is a scalar reference, not a source-case FK |
| user_pattern_summaries | Generated summary_json, counts/model/schema/timestamps | user_id → auth.users CASCADE; own summary DELETE API deletes this table's own row only |
| user_privacy_settings | Future personalization/context permissions | user_id → auth.users CASCADE; PATCH changes flags, not stored business rows |
| user_consent_records | Terms/privacy versions, consent time, optional IP/user-agent hashes | user_id → auth.users CASCADE; no app deletion UI/API found |
| guest_trial_attempts | Hashed trial/IP/device/user-agent identifiers, status, expiry | No auth owner cascade; expires_at does not itself delete rows; no retention cleanup job found |
| api_usage_events | User/guest references, route/status/cost units, timestamps, optional hashes | user_id → auth.users SET NULL; guest FK SET NULL; row and remaining metadata survive those reference deletions |
| Browser memory cache | Consultation/result copies during current session | storage.ts clears synchronously on auth boundary; no business localStorage persistence in current source; browser memory is not server deletion |

The cross-schema auth FKs are present in SQL migrations even though Prisma exposes userId scalar
fields without an auth.users relation. Do not infer absence of auth cascades from Prisma alone.
Conversely, do not claim the cascade is currently deployed without environment verification.

## Archive, permission withdrawal and delete are different operations

`POST /api/persons/:personId/archive` updates archived_at. Owned-person lookup and listing filter
archived rows, but their cases, results, feedback, snapshots and profile are preserved. It is not a
hard delete or an erasure request. No matching user-facing archive control was found in current pages.

`PATCH /api/privacy-settings` updates future context flags. `PATCH /api/analysis-feedbacks/:feedbackId`
can set allowPersonalizationUse=false. Current context retrieval excludes that feedback on future
runs; it does not erase the original feedback, already-saved context_json/result_json, or generated
profile copies. Global personalization OFF also does not erase saved rows. Historical snapshots
must be treated as independent retained copies when designing an erasure contract.

`DELETE /api/user-pattern-summary` uses own-user deleteMany. It does not remove consultations,
feedback, profiles, result JSON or stored context snapshots. User Pattern generation/context use
is currently unimplemented; deletion of an existing summary is narrower than account/data deletion.
No app-controlled end-user hard-delete API/UI was found for auth accounts, persons, consultations,
results, feedback or person profiles. SQL RLS deletion policies do not establish an app UI capability;
production Data API exposure, grants and direct-user access were not verified.

## Backups, logs and provider scope

CONFIRMED: the analysis Responses request sets `store: false` in
[analyzeMoodV2](../../src/backend/ai/v2/analyzeMood.ts). This single request option does not establish
zero retention, provider log deletion, backup erasure, training use guarantees or organization settings.
The actual provider account settings/contract and retention behavior are UNKNOWN in this audit.
No provider deletion endpoint was called.

Current source log sites record workflow correlation IDs, model/version/status, attempt/count/timing
metadata and bounded error categories, plus stale-recovery and reconciliation events. These IDs
can still be linked to retained records; hashes are not assumed anonymous. Consultation contents,
names, credentials, tokens and raw provider errors should remain outside the documented metrics
contract. Hosting request logs, DB logs, auth logs, log sink retention/access, SDK/network logging,
backups/PITR, exports, replicas and incident snapshots remain UNKNOWN without operational evidence.
No claim is made that every downstream platform log is sanitized or that deletion propagates there.

## Product-copy candidates for review

These are proposed wording only and were not added as a new deletion promise:

- 「参考情報の利用をOFFにすると、今後の分析での利用を止めます。保存済みの相談・結果・Feedbackを削除する設定ではありません。」
- 「アーカイブは一覧から対象を非表示にする操作です。保存済みデータの削除ではありません。」
- 「User Pattern の削除はその要約のみが対象です。相談履歴や分析結果は残ります。」
- Account deletion copy must remain unspecified until the app entrypoint, cascading tests,
  retained usage metadata, backups/logs/provider scope and completion timeframe are approved.

Avoid claims such as “all data immediately deleted”, “no provider retention” or “OFF erases history”.
The existing Privacy Settings copy already distinguishes future use from data deletion.

## Human decisions and acceptance evidence

Before implementation, decide the product/legal retention purposes and duration for each row/copy,
account/person/case/feedback/profile deletion versus archive, historical snapshot handling,
consent-record and anti-abuse metadata obligations, backup/log/provider exceptions, user export,
withdrawal semantics, restoration restrictions and accurate completion copy. Specify who handles
requests and how failures/retries/audit evidence work without storing the erased contents again.

Proposed acceptance evidence: dedicated non-production schema verification; actual owned-user
cascade with usage-row SET NULL assertions; unrelated-user isolation; deletion of JSON-derived
copies under the approved contract; interrupted deletion recovery; backup/restore/log procedures;
provider-account retention documentation; user-visible completion tests. This run only prepares
that checklist. It does not choose a production deletion policy or execute these deletions.
