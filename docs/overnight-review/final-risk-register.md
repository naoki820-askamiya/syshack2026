# Final risk register

Date: 2026-10-05 JST. Current report supersedes prior snapshot counts.
Merge/demo gates below are review recommendations, not permission or a claim of
repository policy. Local regressions do not establish live provider/browser safety.

| ID | Severity | Evidence | What remains | Why incomplete | Human decision | Next action | Blocks merge? | Blocks public demo? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | P1 | FACT | Crisis-like input uses normal analysis; full Japanese safety FP/FN policy absent | Expert policy needed | Routing/copy/resources | Review synthetic crisis proposal and model semantics | no | yes |
| R02 | P1 | FACT / UNMEASURED | Archive is not deletion; old/derived JSON and provider retention | Scope undecided | Retention/backup/operator/deletion contract | Inventory copies then approve deletion semantics | no | yes |
| R03 | P1 | UNMEASURED | Live Supabase Auth/RLS/GRANT/Data API | PG owner role/shadow scaffold is insufficient | Isolated Supabase verification | Verify direct-access/identity/service-role boundaries | yes | yes |
| R04 | P1 | UNMEASURED | Browser auth switching/logout/expiry/mobile/keyboard | Synthetic control flow does not prove SDK rendering lifecycle | Isolated users/devices | Execute auth and UX E2E matrix | yes | yes |
| R05 | P1 | UNMEASURED | Deployed deep routes and exact frontend/backend identity | No deployment performed | Deployment/smoke window | Verify build SHA and actual SPA/API content after authorization | yes | yes |
| R06 | P1 | UNMEASURED | Real model source fidelity/refusal/crisis/contradictions | No paid outputs or human baseline | Budget/rubric/semantic grading | Capped synthetic outputs with blind human review | yes | yes |
| R07 | P2 | FACT | Unknown crash/provider attempts, billing/refund and automatic recovery | Durable event-case/run linkage and known-attempt settlement are implemented; unknown attempts cannot be guessed | Refund/scheduler/stale threshold policy | Retain unknown usage; reconcile only original owner/event/case/run and measured attempts | no | no |
| R08 | P2 | FACT / UNMEASURED | Profile age/minimum/regeneration/derived consent and summary bounds | Product/source-chain policy undecided | Count/age/refresh/consent rules | Review revocation/source fallback; no automatic writer | no | yes |
| R09 | P2 | UNMEASURED | Score probability misunderstanding and graph selection | Human comprehension absent; source/reason and missing-confidence fixes complete | Select A-F after observation | Observe result/score on mobile and keyboard | no | yes |
| R10 | P2 | FACT / UNMEASURED | Remaining dependency advisories and actual production packaging | Runtime patch is scoped; major/upstream fixes remain separate | Major/override/packaging decision | Read runtime repair evidence and current audit boundaries | no | no |
| R11 | P2 | FACT / UNMEASURED | Request volume302 and one large entry; real latency/deadlines | Per-load4/failure stop repaired; no global cap/abort or browser speed evidence | Partial pagination/deadline/lazy fallback | Measure browser/network/DB and overlapping retries | no | no |
| R12 | P2 | FACT / UNMEASURED | Reload/unmount/physical deletion recovery; poll cutoff is not a request deadline | Current-screen UUID intent, atomic owner/key uniqueness, normalized replay and409 are implemented; key survives only current mounted screen | Reload/server draft/physical deletion contract | Verify live response loss; choose expanded lifecycle before storage/ledger changes | no | no |
| R13 | P2 | FACT / UNMEASURED | Future edit-conflict UX, Profile generation and live browser behavior | Explicit save/cancel, atomic invalidation and locked future snapshots are implemented; existing last-writer-wins retained | Profile policy/future conflict UX | Observe two editors and historic latest-Person labels; do not mutate past snapshots | no | no |
| R14 | P2 | FACT / UNMEASURED | Actual password recovery remains unavailable | Private SDK feasibility passed; main singleton callback consumption, grant/bearer reuse and complete route remain unresolved | Recovery operation/callback contract/provider setup | Decide intent consumption/revocation and cross-reload reuse, then test complete isolated flow | no | no |
| R15 | P2 | UNMEASURED | Provider first event, browser paint and real end-to-end latency/stream delivery | Backend/client logical metrics are implemented; real lifecycle measurements absent | Correlation/delivery adoption | Execute isolated browser/provider measurements; retain logical/paint distinction | no | no |
| R16 | P2 | UNMEASURED | Paid Luna comparison/current deployed model | Luna change permission received; numeric aggregate paid cap absent and no live runner invoked | Numeric budget/model baseline/adoption | Satisfy aggregate budget gate and review capped runner before real calls | no | no |

Whole-branch AUTH-P1 is repaired: unexpected SDK rejection reaches a generic500
with requestId, including public-error-shaped and null values. Normal401/verified
identity remain unchanged. Local24-case focused regressions and full312 pass;
real Auth availability remains part of R03/R04, not established by these mocks.
