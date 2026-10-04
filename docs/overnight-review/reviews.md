# Overnight Review Log

Date: 2026-10-04 JST. Comparison base: `406fc8581a471cedfe4a030845c820b03a4c4f2f`.
Independent reviewer: root. Skeptical reviewer: separate skeptic agent.
Implementer messages supplied pre-fix failures and targeted test output; reviewer conclusions below
are source/diff checks unless an explicit separate run is listed. Browser/provider behavior is not certified.

## Skeptical reviews

| Issue | Checked paths / revision | Outcome and limits |
| --- | --- | --- |
| A01 | `input.schema.ts`, `context.repository.test.ts`, `api.integration.test.ts`; committed `7fa7973` | No blocking findings. API/UI1000 and DB text match; 500/501/1000 ON/OFF retain exact feedback with no truncation; API1001 rejects. No provider/model change. |
| A12 | `server.ts`, `middlewares/errorHandler.ts`, `v17/server.errors.integration.test.ts`; `cbb9dab` | No blocking findings. Request ID precedes parser/CORS; only known parser type+status errors normalize400/413; generic internal failures remain opaque. 100kb preserves previous default. |
| A02 | `app/utils/analysisViewModel.ts`, `ActionSuggestionV17.tsx`, `frontend.analysisViewModel.test.ts`; `3fdfb7c` | No blocking findings. safe/caution preserved, missing/legacy unknown; text differentiates independently of color; unknown uses cautious styling. |
| A10 | `v17/feedback.routes.ts`, `api.integration.test.ts`; `4213a0f` | No blocking findings. Short DB-only transaction encloses feedback and profile invalidation; withdrawal invalidates even privacyOFF. Separate B05 real-DB POST/PATCH rollback proof passed. |
| A11 | `ai/v2/analyzeMood.ts`, `analyzeMood.test.ts`; `b6a8dff` | No blocking findings after monotonic deadline follow-up. Permanent errors/abort/refusal/config do not resend; selected transient failures retry with fresh controllers/backoff; Retry-After bounded by total deadline; post-await rejects expired output. 13 mock tests, not real API latency evidence. |
| A07 | `app/utils/consultationHistory.ts`, `api/consultationMapper.ts`, `History.tsx`, `NewConsultation.tsx`, `frontend.consultationHistory.test.ts`; `8260033` | No blocking findings. personId groups/filter/routes/selection avoid same-name merge; failed owned-ID fetch blocks submission; native candidate buttons support keyboard selection. Live browser reload/keyboard remains unverified. |
| A04 | `PrivacySettingsV17.tsx`, `privacySettingsModel.ts`, `frontend.privacySettingsModel.test.ts`; `3c30dc4` | No blocking findings. GET failure leaves null instead of ON fallback; PATCH is disabled and guarded; retry preserves loadedOFF; error/retry/active-state explicit. |
| A05 partial | `authBoundary.ts`, `storage.ts`, `AuthContext.tsx`, `ProtectedRoute.tsx`, `sessionV17.ts`, `Navigation.tsx`, `frontend.storage.test.ts`; `50330f4` | Initial P2 found: repeated Supabase SIGNED_IN on tab refocus rotated epoch/remounted draft form. Fixed observer identity handling and explicit-login attempt/boundary guard. Final8 storage tests/source check no blocker for the partial subset. Central request-send race remains unresolved; candidate is deliberately unwired. |
| B03 partial | `context.repository.ts`, `input.schema.ts`, `context.ts`, `constants.ts`, `workflow.repository.ts`, `context.repository.test.ts`; committed `1cf70cb` | No blocking findings. Explicit stale/source-absent profile omitted; generated summary/user feedback/user fact differentiated; v5 snapshot preserves optional metadata and legacy input compatibility. Alias removed and callers updated. Source-chain consent and actual model use remain unverified. |
| B04 | `vercel.json`, `vite.config.ts`, `frontend.deployRoutes.test.ts`; committed `0fd92d5` | No blocking findings.13 registered routes target SPA entry without intercepting API/assets/health/build.json; SHA metadata explicitly unknown on archives. Dirty flag includes untracked source. Local config/build evidence does not prove production reload until authorized deploy. |

The A05 finding is backed by current
[Supabase onAuthStateChange reference](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
retrieved through Context7: SIGNED_IN may reconfirm an already active session when refocusing a tab.
The review rejected invalidating every such event; the final code rotates same-user epoch only for a
current explicit login completion. No JWT/token parsing or external identity policy was introduced.

## Exact pending file blobs checked

Checkpoint HEAD: `3c30dc430251b4b9eb8223b13a3184c53fac6b6f`.

| Path (repository relative) | Git blob hash |
| --- | --- |
| src/app/utils/authBoundary.ts | a47d4bafc4cd4c7fff3ca8229099a8af6f54c56d |
| src/app/auth/AuthContext.tsx | 5b9609cdd51b3de953c774736d7f93adf82b429b |
| src/backend/v17/frontend.storage.test.ts | abdb46c3c748a4a4573e4fe63684b5c951a5eb3d |
| src/backend/v17/context.repository.ts | 2612d971da5f195a001046c22e73bc8369bd8d3b |
| src/backend/ai/v2/context.ts | a667e1354b06cd8717893bce445c0cb170cf19d0 |
| src/backend/ai/v2/input.schema.ts | b452fb08d458c9bf445b37839e36484990eb19a0 |
| src/backend/ai/v2/constants.ts | 24a802f54c69f1ad1694dd5319bf6b825f09a8f0 |
| vercel.json | b6151260f56bd9472aacd6e7379445bfc8c8111e |
| vite.config.ts | 0add02fdaf71a871d69acc46634179916b73e2e0 |

## B05 harness self-review and independent review

Implementer: skeptic agent. Independent reviewer: backend agent. Skeptical reviewer: root.
Exact harness blobs submitted to reviewers:

| Path | Git blob hash |
| --- | --- |
| scripts/db-integration/run.mjs | 5b60a87c5d0e7be31b755e259d3f3b3779af6196 |
| scripts/db-integration/safety.mjs | 659cbf66bd349e4c669a697cad49b248946c829b |
| scripts/db-integration/integration.test.ts | 56f3ab0cb6e370719721b8e19ca8b05b3042939a |

Backend independent review found one cleanup-path requirement: explicitly resolve/check the
temporary directory immediately before recursive removal. Fixed parent tmpdir/prefix verification;
guard1 test and syntax check passed. No other blocking findings reported.
Self-review verified cached-image-only operation, unique loopback DB, empty child cwd,
random credentials/no logs, ID+label-only container cleanup and real repository SQL, not duplicated SQL.
Real-DB6 scenarios passed; see [results](db-integration-results.md).
Root skeptical review approved final guarded runner and consent proof; B05 committed `f3f620b`.
B02 extension test blob `9a956c24a78b1e1fb7c95ee7c54a53bfa4b902dd` passed seven real-DB scenarios;
root and backend approved the follow-up recovery test delta.

## Scope and unresolved evidence

No production writes, migrations, deploy, merge, dependency repair, paid API, or real-user fixture use.
No final safety, retention, scheduler, stale-age/minimum-count, model or prompt decision was adopted.
A05 is partial: independent cache protection is not a substitute for enforcing identity before sending
every API request. RLS/GRANT/Data API verification is outside the local PostgreSQL owner-role harness.

## Later skeptical reviews

| Issue | Checked paths / revision | Outcome and limits |
| --- | --- | --- |
| A03 | `NewConsultation.tsx`, `useHydratedAnalysis.ts`, `analysisRetry.ts`, `AnalysisV17.tsx`, `frontend.analysisRetry.test.ts`; `39cb07a` | No blocking source/diff findings. Navigate after Case save; latest/state reconciliation precedes same-Case retry; analyzing never resends; truthful waiting/error states and no new Person/Case on retry. Four helper mock regressions; browser latency, navigation and unknown Case-create completion remain unverified. |
| A08 | `Home.tsx`, `homeHistoryModel.ts`, `frontend.homeHistoryModel.test.ts`; `128ed38` | No blocking findings. Copy-sort selects latest five; immediate boundary guard hides old-user data/errors before effects; DB loading/error/retry explicit. Two model tests do not prove full browser/auth behavior. |
| A06 | `Navigation.tsx`, `PrivacySettingsV17.tsx`, `frontend.personalizationNavigation.test.ts`; `34e6b91` | No blocking findings. Registered desktop/mobile privacy destinations; current-page labels; unsupported User Pattern control replaced with truthful note preserving stored value. Source navigation regressions are not browser layout or accessibility proof. |
| A09 | `AnalysisFeedbackForm.tsx`, `preferencesV17.ts`, `feedbackModel.ts`, `frontend.feedbackModel.test.ts`; `6d62137` | Initial P2: pending A save then result B left sending true forever. New-load effect resets sending. Final subset no blocker: GET prerequisite, saved-ID PATCH, failed-save re-read, result/auth response guards. Component lifecycle repair source-reviewed; model tests do not simulate prop change. B05 real DB verifies revoked Feedback excluded from next context with global privacy ON. |
| B01 partial | `ai/v2/validation.ts`, `safety.test.ts`; `45845b2` | Initial P1 inverse-avoidance bypasses reproduced in two skeptical cycles; later P1 indirect urging inside attributed quotes reproduced. Exact affirmative endings now fail closed and generic attribution allowances removed. All17 safety/validation tests independently pass; permanent counterexample regressions retained. Harmless observed-quote rejection and broad semantic policy remain escalated. |
| B02 partial | `workflow.repository.ts`, `workflow.repository.test.ts`; `94aca4e` | No blocking findings in caller-cutoff detection/recovery. Advisory lock plus owner/status/run/timestamp CAS preserves newer/completed runs; invalid/future cutoff rejected before DB.11 unit regressions independently pass; separate real-DB7-scenario extension passed. Scheduler, threshold and usage reconciliation decisions remain open. |
| Offline AI preparation | `experiments/ai-evals/{fixtures,graders,scripts}`, `package.json`; `a62dfa9` | No blocking findings for offline-only scope. Gate recomputes estimate against forged/stale flags; schema/input/instruction byte planning; eight evaluation/stream tests independently pass.25 synthetic contract outputs do not compare models or prompt quality. Stream emits only after fully validated completion; no early-useful latency benefit or paid runner. |
| History measurement | `scripts/history-performance.mjs`, `experiments/performance/history.json`, `history-performance.md`; submitted script blob `abefcdf99361ca37b19d6cd1bb16983a29bc6f04` | Implementer self-review and root independent review no blocker; frontend skeptical source review found no blocker; final matching-source rerun sent for confirmation.23 source-backed mock scenarios, no runtime change/production performance claim. Re-run after backend instrumentation import changes if needed. |

Safety review containment preserved known regression checks rather than adding an unbounded keyword
blacklist. Diagnostic quote disclaimers are narrowly allowed; aggression observations remain
conservatively rejected until a human-approved semantic policy exists. No test was skipped or weakened.

## Final source review additions

| Issue | Checked paths | Outcome |
| --- | --- | --- |
| A13 | `NewConsultation.tsx`, `Login.tsx`, `Register.tsx`, `frontend.accessibility.test.ts`; NewConsultation blob `a243ca5d9ba1cbe9fcb382f875fa9b953f5f756c` | No blocking findings;5 AST regressions independently passed. Named labels/groups, pressed state, reachable delete and auth announcements/autofill are present. Browser keyboard/screenreader/contrast remain unverified. |
| Instrumentation | `workflow.service.ts`, `analysisCases.routes.ts`, `workflow.service.test.ts`; service blob `fbe5909379c08e8d802acd4b548e578f972ca13d` | No blocking findings;5 unit regressions independently passed. Metadata-only UUID request ID, IDs/counts/versions, monotonic measured stages and explicit null unobserved stages. Compensation and logger errors do not change saved success. No real-provider timing proof. |
| B06 audit | `dependency-audit.md`, tracked lockfile, parser/import graph | Root and backend read-through no blockers. Audit is complete, dependency repair absent. Raw meta-counts are not proven production exploits; prerequisite and packaging UNKNOWN limits retained. Reviewers did not repeat registry audit. |
| History final | `history-performance.mjs`, report blob `1b522c982bd1cc889d1b144de23e5264e030e436`, doc `29d59507a4ee38453e283751ae11d4b7bde8f5c9` | Root independent and frontend skeptical reviews approved. All4 source SHA-256 values match final source;23 scenarios passed.302 requests/100 parallel at P100/C100;69.501ms mock,15.55MiB sampled heap. No runtime optimization/production capacity claim. |
| Bundle measurement / C03 preparation | `bundle-measure.config.ts`, `bundle.json`, `experiments/score-ux/index.html`, `score-ux.md` | Skeptical source review no blockers for measurement and fixed-fixture comparison only. JS package character attribution is not compressed share; browser/visual/a11y/human comprehension NOT_RUN. No graph, scale, stage threshold or UI policy adopted. Separate frontend independent review requested for root-owned artifacts. |

## Final preparation and report review

| Work | Independent / skeptical outcome |
| --- | --- |
| C01 | Root independent + skeptic separate source/test review:14 synthetic inputs,2 characterization tests; ordinary injected-mock dispatch only, no model safety or routing guarantee. |
| C02 | Root independent + skeptic: migration CASCADE/usage SET NULL and retained JSON copies accurately separated; actual deletion/provider/deployed settings UNKNOWN. |
| Bundle probe / C03 | Frontend independent + skeptic: actual bytes/gzip match built file; fixed A–F fixture and unvalidated ordinal boundaries, no runtime adoption or browser claim. |
| AI docs | Frontend corrected feedback generatedAt=null, model eligibility vs forwarded metadata, and unmeasured score-cost wording; final docs corrected. |
| Client metrics | Frontend identified missing submit/first-result/complete instrumentation; report now explicitly NOT_INSTRUMENTED. |

Final service and frontend changes are frozen before global gates. All reported approvals
cover their stated subset; PARTIAL decisions and unverified browser/provider/Supabase
behavior remain in escalations. There was no formal GitHub review or external write.

## Closing handoff review

Frontend independent read-only review approved summary/changes, pending evidence docs
and specification sync. No blocking error or completion overclaim;131-test/build
results and DB7 proof separated from A05 PARTIAL, model UNKNOWN, Luna NOT_RUN,
client timings NOT_INSTRUMENTED and browser limits. Reviewer checked projected29
commits/104 paths, manifest, preserved develop, History source hashes and diff check.

Closing whitespace-only commit `3ef5784` removed new trailing whitespace/extra EOF blank
lines; root reviewed the exact diff. Runtime behavior is unchanged. Final Markdown
check passed with24 files/0 issues.

Skeptic separate read-only final review approved: no blocking factual error or
completion overclaim.104 paths match actual diff/manifest;28 commits plus final report
match29. A05 unwired/rejected guard, B01/B02/B03 partials, actual models NOT_RUN,
missing client metrics, Production boundaries and all verification limits are explicit.
Specification sync matches runtime implementation. No reviewer edited or committed files.

## A05 conditionally approved response-isolation follow-up

Prior29 commits remain immutable at `9567801ab8c2ace10a684857b45828fafd57e2e9`.
The user explicitly approved response isolation with ten constraints and seven regression
categories. Both reviewers independently inspected production binding/transport/tests:

| Role | Final outcome |
| --- | --- |
| Independent frontend reviewer | APPROVE; independently reran corrected20 tests,0fail/0skip. Same original boundary through response/body, HTTP errors and ordinary failures preserved; auth/public/storage unchanged. |
| Skeptical reviewer | APPROVE; independently reran corrected20 tests,0fail/0skip. No scope or completion overclaim; old body/new token remains separate P1, raw/post-delivery and live lifecycle limits explicit. |

Reviewed runtime blobs: `clientRequest.ts` `be3b80968447984d0e7f21d60bf9f18b00fcc546`,
`client.ts` `e5b0ce1e44d7b5807c2dfa3c6548a4cd829bdcdd`; corrected test blob
`737b2d22aa7b8cca86675daba057023e0001582b`.
Guard-free negative control:12pass/8fail. Final regression20pass; full151pass/0fail/0skip,
typecheck/build pass, Markdown25files/0issues. Initial server-build TS2540 affected only
mock json assignments; same deferred mocks corrected, all affected gates rerun.
No auth/backend/storage, dependency, schema, Production or external write change.
A05 is Completed only within the latest response-isolation authority; historical earlier
PARTIAL review records above describe the prior29-commit state, not the current status.
