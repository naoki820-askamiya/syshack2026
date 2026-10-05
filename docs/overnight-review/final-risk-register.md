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
| R07 | P2 | FACT | Crash quota has no durable event-case/run linkage | Unknown attempts cannot be reconciled by guess | Linkage/refund/scheduler policy | Reconcile exact known attempts; retain unknown usage | no | no |
| R08 | P2 | FACT / UNMEASURED | Profile age/minimum/regeneration/derived consent and summary bounds | Product/source-chain policy undecided | Count/age/refresh/consent rules | Review revocation/source fallback; no automatic writer | no | yes |
| R09 | P2 | UNMEASURED | Score probability misunderstanding and graph selection | Human comprehension absent; source/reason and missing-confidence fixes complete | Select A-F after observation | Observe result/score on mobile and keyboard | no | yes |
| R10 | P2 | FACT / UNMEASURED | Remaining dependency advisories and actual production packaging | Runtime patch is scoped; major/upstream fixes remain separate | Major/override/packaging decision | Read runtime repair evidence and current audit boundaries | no | no |
| R11 | P2 | FACT / UNMEASURED | Request volume302 and one large entry; real latency/deadlines | Per-load4/failure stop repaired; no global cap/abort or browser speed evidence | Partial pagination/deadline/lazy fallback | Measure browser/network/DB and overlapping retries | no | no |
| R12 | P2 | FACT | Uncertain Person/Case-create response can duplicate intent; poll cutoff is not a request deadline | Confirmed Person ACK reuse repaired, full idempotency unresolved | Intent key/replay/conflict/lifetime | Test uncertain commit against approved server contract | no | no |
| R13 | P2 | FACT | Existing relationship edit is temporary cache rather than persistent Person edit | Automatic PATCH would choose an edit policy | Person edit/snapshot contract | Inspect second consultation and historical label behavior | no | no |
| R14 | P2 | FACT | Actual password recovery remains unavailable | SDK internal session selection/publication races need bounded design; History/logout/honest affordance repaired | Recovery operation contract/provider setup | Review SDK counterexamples then implement/test approved complete flow | no | no |
| R15 | P2 | UNMEASURED | Provider first event, browser paint and real end-to-end latency/stream delivery | Backend/client logical metrics are implemented; real lifecycle measurements absent | Correlation/delivery adoption | Execute isolated browser/provider measurements; retain logical/paint distinction | no | no |
| R16 | P2 | UNMEASURED | Paid Luna comparison/current deployed model | No approved flag plus numeric aggregate cap | Budget/model baseline/adoption | Use final-plan and reviewed capped runner after authorization | no | no |
