# Change and commit manifest

Scope: fetched `origin/develop` at `406fc8581a471cedfe4a030845c820b03a4c4f2f`, dedicated
`chore/portfolio-polish-overnight`. No external Issue/PR/push/merge/deploy.
Final classification and evidence: [summary](summary.md); decisions: [escalations](escalations.md);
independent/skeptical review record: [reviews](reviews.md).

## Logical commits

| Commit | Purpose |
| --- | --- |
| `7fa7973` | fix: align feedback context length contract |
| `cbb9dab` | fix: normalize malformed and oversized JSON errors |
| `3fdfb7c` | fix: preserve caution actions in analysis UI |
| `4213a0f` | fix: make feedback and profile invalidation atomic |
| `b6a8dff` | fix: classify AI retries and enforce a total deadline |
| `50330f4` | fix: scope consultation cache to authenticated sessions |
| `8260033` | fix: identify consultation history and selection by person id |
| `3c30dc4` | fix: block privacy saves after settings load failure |
| `1cf70cb` | fix: track context provenance and exclude stale profiles |
| `0fd92d5` | fix: configure deep routes and expose build identity |
| `f3f620b` | test: verify concurrency and rollback in disposable PostgreSQL |
| `39cb07a` | fix: retry analysis from the saved case |
| `128ed38` | fix: show the latest five consultations with loading states |
| `34e6b91` | fix: expose supported personalization settings in navigation |
| `6d62137` | fix: reload and edit saved analysis feedback |
| `45845b2` | fix: scope known unsafe-output checks by field |
| `94aca4e` | fix: guard stale analysis recovery by owner and run |
| `a62dfa9` | test: prepare offline model and prompt evaluation |
| `f5acd78` | fix: name form controls and expose pending states |
| `acc93b8` | feat: record safe analysis stage timings |
| `dbbc28f` | test: prove stale recovery races in PostgreSQL |
| `d11db37` | test: measure history pagination and failure fanout |
| `4933b22` | test: characterize crisis inputs without adopting routing policy |
| `5b379aa` | docs: audit retained data and deletion boundaries |
| `e877bc6` | docs: prepare synthetic score presentation alternatives |
| `8edd7a1` | test: measure client chunks and library attribution |
| `770f631` | docs: audit advisory reachability and compatible fixes |
| `3ef5784` | chore: clean whitespace in new regression files |
| `9567801` | docs: summarize overnight changes and human decisions |
| A05 follow-up HEAD | fix: isolate stale authenticated API responses — response-only guard,20 regressions, status/evidence sync |

One additional B02 commit adds actual PostgreSQL recovery races; the closing whitespace
commit only removes new trailing whitespace/extra EOF blank lines. No runtime refactor.
All implementation subsets received independent and skeptical reviews; reported limits
are retained rather than converted into full completion.

## Changed paths

108 paths including the A05 follow-up. Generated dependency/runtime outputs,
.env files and original checkout untracked work are excluded.

```text
docs/overnight-review/a05-response-guard.md
docs/overnight-review/ai-ux.md
docs/overnight-review/changes.md
docs/overnight-review/crisis-routing-proposal.md
docs/overnight-review/data-retention-delete-audit.md
docs/overnight-review/db-integration-results.md
docs/overnight-review/dependency-audit.md
docs/overnight-review/escalations.md
docs/overnight-review/execution.md
docs/overnight-review/frontend-evidence.md
docs/overnight-review/history-performance.md
docs/overnight-review/model-evaluation.md
docs/overnight-review/performance-followups.md
docs/overnight-review/prompt-evaluation.md
docs/overnight-review/remaining-findings.md
docs/overnight-review/reviews.md
docs/overnight-review/score-ux.md
docs/overnight-review/summary.md
docs/仕様書.md
experiments/ai-evals/README.md
experiments/ai-evals/baseline/constants.ts
experiments/ai-evals/baseline/input.schema.ts
experiments/ai-evals/baseline/instructions.ts
experiments/ai-evals/baseline/metadata.json
experiments/ai-evals/baseline/output.schema.ts
experiments/ai-evals/candidates/candidate-1.txt
experiments/ai-evals/fixtures/dataset.ts
experiments/ai-evals/graders/semantic.ts
experiments/ai-evals/results/offline.json
experiments/ai-evals/scripts/budget.ts
experiments/ai-evals/scripts/evaluationHarness.test.ts
experiments/ai-evals/scripts/offline.ts
experiments/ai-evals/scripts/streamingPrototype.test.ts
experiments/ai-evals/scripts/streamingPrototype.ts
experiments/auth-boundary/README.md
experiments/crisis-routing/fixtures.json
experiments/performance/bundle.json
experiments/performance/history.json
experiments/score-ux/index.html
package.json
scripts/bundle-measure.config.ts
scripts/db-integration/README.md
scripts/db-integration/integration.test.ts
scripts/db-integration/run.mjs
scripts/db-integration/safety.mjs
scripts/db-integration/safety.test.mjs
scripts/history-performance.mjs
src/app/api/client.ts
src/app/api/clientRequest.ts
src/app/api/consultationMapper.ts
src/app/api/preferencesV17.ts
src/app/api/sessionV17.ts
src/app/auth/AuthContext.tsx
src/app/components/AnalysisFeedbackForm.tsx
src/app/components/Navigation.tsx
src/app/components/ProtectedRoute.tsx
src/app/hooks/useHydratedAnalysis.ts
src/app/pages/ActionSuggestionV17.tsx
src/app/pages/AnalysisV17.tsx
src/app/pages/History.tsx
src/app/pages/Home.tsx
src/app/pages/Login.tsx
src/app/pages/NewConsultation.tsx
src/app/pages/PrivacySettingsV17.tsx
src/app/pages/Register.tsx
src/app/utils/analysisRetry.ts
src/app/utils/analysisViewModel.ts
src/app/utils/authBoundary.ts
src/app/utils/consultationHistory.ts
src/app/utils/feedbackModel.ts
src/app/utils/homeHistoryModel.ts
src/app/utils/privacySettingsModel.ts
src/app/utils/storage.ts
src/backend/ai/v2/analyzeMood.test.ts
src/backend/ai/v2/analyzeMood.ts
src/backend/ai/v2/constants.ts
src/backend/ai/v2/context.ts
src/backend/ai/v2/crisisRouting.currentBehavior.test.ts
src/backend/ai/v2/input.schema.ts
src/backend/ai/v2/safety.test.ts
src/backend/ai/v2/validation.ts
src/backend/middlewares/errorHandler.ts
src/backend/server.ts
src/backend/v17/analysisCases.routes.ts
src/backend/v17/api.integration.test.ts
src/backend/v17/context.repository.test.ts
src/backend/v17/context.repository.ts
src/backend/v17/feedback.routes.ts
src/backend/v17/frontend.accessibility.test.ts
src/backend/v17/frontend.analysisRetry.test.ts
src/backend/v17/frontend.analysisViewModel.test.ts
src/backend/v17/frontend.authenticatedRequest.candidate.ts
src/backend/v17/frontend.authenticatedRequest.test.ts
src/backend/v17/frontend.clientRequest.test.ts
src/backend/v17/frontend.consultationHistory.test.ts
src/backend/v17/frontend.deployRoutes.test.ts
src/backend/v17/frontend.feedbackModel.test.ts
src/backend/v17/frontend.homeHistoryModel.test.ts
src/backend/v17/frontend.personalizationNavigation.test.ts
src/backend/v17/frontend.privacySettingsModel.test.ts
src/backend/v17/frontend.storage.test.ts
src/backend/v17/server.errors.integration.test.ts
src/backend/v17/workflow.repository.test.ts
src/backend/v17/workflow.repository.ts
src/backend/v17/workflow.service.test.ts
src/backend/v17/workflow.service.ts
vercel.json
vite.config.ts
```

## A05 approved follow-up

[Response-isolation evidence](a05-response-guard.md):20 new regressions,8 baseline failures,
all4 gates and independent/skeptical approvals. A05 Completed ONLY in the user's narrowed
response responsibility. Before-send old-body/new-token write race remains a separate P1.
No auth/session-storage/backend/public endpoint changes; broad historical candidate unwired.

## Result artifacts

- `docs/overnight-review/summary.md`: requested final report sections and classifications.
- `docs/overnight-review/escalations.md`: priority, evidence, rejected central auth changes and human decisions.
- `docs/overnight-review/remaining-findings.md`: residual risks and unverified environments.
- `docs/overnight-review/reviews.md`: independent / skeptical outcomes, counterexamples and repair limits.
- `docs/overnight-review/frontend-evidence.md`: baseline negative controls and frontend coverage limits.
- `docs/overnight-review/db-integration-results.md`: actual disposable PostgreSQL scenarios and cleanup.
- `docs/overnight-review/dependency-audit.md`: reachability/repair proposals, no dependency mutation.
- `docs/overnight-review/model-evaluation.md` and `prompt-evaluation.md`: KEEP decisions, NOT_RUN metrics and budgets.
- `docs/overnight-review/ai-ux.md` and `performance-followups.md`: implemented waiting flow, measured/unknown timings.
- `docs/overnight-review/crisis-routing-proposal.md`, `data-retention-delete-audit.md`, `score-ux.md`: C01–C03 preparation.
- `experiments/ai-evals/`: saved baseline, synthetic inputs, graders, offline results, mock streaming and gate plan.
- `experiments/auth-boundary/`: historical unwired broader candidate; response-only production follow-up is separately documented.
- `experiments/performance/`: source hashes and synthetic History/bundle measurements.
- `experiments/score-ux/index.html`: fixed synthetic A–F comparison, no product adoption.

## Verification and operational limits

A05 follow-up application gates:151 pass/0 fail/0 skip, typecheck/build pass; Markdown
check passed (25 files, 0 issues). Previous29 commits preserved, one independent follow-up. Actual DB7 pass/0 skip, cleanup inventory empty.
No browser, real Supabase policy, real model quality or end-to-end latency claim.
No paid benchmark, production DB access, schema deployment, dependencies change,
architecture migration, safety/crisis policy adoption, or retention/deletion operation.
