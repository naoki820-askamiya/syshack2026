# KIGEN404 develop integration assessment

Date: 2026-10-06 JST. Read-only product/repository assessment; no commit, dependency update, push, merge, deployment, cloud database, paid model or real user data used. Supplementary loopback browser fixture is stored outside the repository.

## Current Git and remote evidence

- Worktree HEAD: `c4bea857c6561d905715943c707897044794c9ae` (new working changes by other agents are outside this frozen comparison).
- Live GitHub `develop`: `406fc8581a471cedfe4a030845c820b03a4c4f2f`; live `main`: `d6e19a0ddee7d0261adaa52a786e70eab0a55579`.
- `git merge-base --is-ancestor develop HEAD`: exit 0. Existing overnight commits descend from current remote develop; no base divergence observed.
- Live open PRs: [#13 Develop, develop to main](https://github.com/naoki820-askamiya/syshack2026/pull/13), [#14 older Auth change](https://github.com/naoki820-askamiya/syshack2026/pull/14), targeting `feature/personalized-analysis` rather than develop.
- No remote `chore/portfolio-polish-overnight` branch and no overnight PR found in the complete returned branch/open-PR inventories. GitHub Actions workflow-runs lookup for current develop returned an empty list; this is absence of runs, not passing CI.
- Frozen develop-to-overnight delta: 182 files, 12,897 insertions, 621 deletions; much of it is review evidence, experiments, tests and generated Prisma code. Overall feature scope includes auth/persistence/history/Feedback/personalization already inherited through develop.

## Minimum requirements for develop integration

These are assessment recommendations, not newly invented repository rules. The older risk register explicitly calls its merge/demo gates recommendations.

1. Freeze the final source/dependency state, run test/typecheck/client+server build/Markdown lint and targeted runtime/parser regressions, review exact diff and generated Prisma consistency. Repeat affected checks after subsequent changes.
2. Run the repository disposable PostgreSQL suite against its own newly created container. It verifies real repository transaction/ownership/CAS/snapshot/idempotency behavior, not real Supabase RLS/Auth.
3. Exercise actual React pages and installed SDK in an isolated browser fixture for the changed client lifecycle: login/logout, A to B, Person/Case/history/result, Feedback edit/revisit and privacy read/save/failure. Record what was actually observed; fixture outcomes cannot certify deployed providers or DB persistence.
4. Keep outstanding product/privacy/security contracts explicit in the review package; no silent adoption of pagination, derived consent, recovery scheduler, Profile generator, streaming, provider/model change or production grants.
5. Immediately before an authorized GitHub write/merge, refresh develop/head/review threads/CI and check the intended target; current request prepares mergeability and does not itself execute merge/deploy.

Real Supabase grants/Auth, model quality/budget, deployed deep routes/build identity, score comprehension and production packaging remain release/public-demo evidence gaps. They need no new production access to complete local correctness repairs. Do not label the branch production ready from local results. A team can require them before develop integration, but that is an explicit acceptance decision, not a pre-existing enforceable policy shown here.

## I04: grants and server-owned fields

FACT: tracked migrations enable own-row CRUD policies for `analysis_cases`, `analysis_results`, `person_profiles` and other business tables. No GRANT/REVOKE inventory is present in the tracked migrations. Thus RLS isolates rows but does not, by itself, protect status/result/Profile fields from their owner if default/explicit grants expose writes.

UNKNOWN: exposed schemas, anon/authenticated ACLs, function execution grants/default privileges, runtime login role and BYPASSRLS, actual service key/Data API configuration. Do not infer them from schema-owner/shadow tests. Supabase documents grants as object access and RLS as row access; `service_role` bypasses policies. [Official Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api), [official API key roles](https://supabase.com/docs/guides/api/api-keys).

Verification preparation: inventory `information_schema.role_table_grants`, `role_column_grants`, `pg_default_acl`, `pg_roles` bypass flags, exposed schemas/functions and `pg_policies` in an explicitly isolated Supabase environment. For anon/A/B/service-role actors, test own/other row GET, own status/run/version/result/Profile writes, arbitrary FK/result linkage and usage-policy writes. Record denial and unchanged rows. Only after the intended direct-access contract is approved, prepare least-privilege ACL/policy migration and reverse plan; never deploy the shadow `auth.uid()` stub. No SQL was sent to any cloud DB here.

## I06: history projection/pagination contract

Current implemented history iterates Person pages then Case pages with an invocation cap of four; new cancellation/deadline repair is handled separately. Global cross-Person pagination is a product/API contract change, not necessary to preserve existing complete-history behavior during develop integration.

Decision-ready proposal: owned Case projection joined to current Person labels, `created_at DESC, id DESC` stable ordering, opaque cursor containing both fields, limit 50, active/archive policy explicit. Keep immutable person snapshots for analysis and latest result `version DESC`. Partial pages must be identified as partial, maintain loaded filter/scroll/retry and include accessible load-more controls. Concurrent insert before the cursor appears on refresh, not duplicated in the next page. Owner comes only from verified auth. Tests: exact 50 boundary; equal timestamps; insert between pages; duplicate/skip check; archive while paging; A/B/unknown cursor ownership; fail/retry/filter. Measure representative EXPLAIN and bytes/requests/auth calls before adding an index. No endpoint, cursor, index or changed partial UX adopted here.

## I07: transitive consent

FACT: direct future Feedback query requires `allowPersonalizationUse=true`; Feedback withdrawal invalidates existing Profile even when privacy is OFF. Past AnalysisResult stores `used_feedback_ids` and context; recent Case summaries can still repeat a previous permitted Feedback after it is revoked. Profiles track counts/latest source Case, not full source Feedback lineage. Historical snapshots remain immutable.

Decision: direct-only future use with precise copy, or transitive exclusion of derived references. For transitive exclusion, treat each candidate prior summary/Profile as derived and establish source lineage; missing lineage must fail closed rather than claim consent. Suppress future derived references whose actual source Feedback was withdrawn, preserving historical rows and current Case. Specify re-enabling and mixed-source handling. Cover allowed to revoke to next context; privacy OFF then ON; missing lineage; cross-owner; revoked Feedback in historical source. Measure query cost. No privacy semantics changed here.

## I08: browser and bundle evidence

Installed: Node 22.15.1, npm, Docker CLI, app Vite/React/Supabase packages. Not installed on PATH: Supabase CLI, psql, gh, Playwright. App node_modules has no Playwright/Puppeteer. Browser control is available through CUA; no new CLI/library installation is needed.

Supplementary fixture: `kigen404-browser-fixture.mjs` serves actual current app source with installed Vite/React/Tailwind plugins and actual Supabase SDK at `http://127.0.0.1:5196`. Fake Auth REST and business API are synthetic in-memory A/B test stores owned by the fixture, not product persistence. No production backend/DB/model imports. All provider/client env variables are stripped; Vite config-file loading is disabled and envDir is a dedicated empty directory. Cache and output stay in the permitted artifact directory. CSP permits only self/loopback network and blocks remote font/resource connections. HMR disabled; no external egress intentionally configured.

HTTP preflight verified `/login`, `/src/main.tsx`, `/__fixture/summary` return 200 with CSP. Seed IDs and synthetic credentials are in `kigen404-browser-fixture-seed.json`; ephemeral request ledger records only method/path/actor/time, not tokens or bodies. Browser observations are supplied separately by the root agent; startup/HTTP checks alone do not prove rendered UI correctness. Dev source behavior is not a production-bundle paint benchmark. Lazy/chart redesign remains deferred until cold/warm useful-paint/longtask/error/reload/mobile/keyboard measurements.

The Docker daemon was unavailable during this assessment (Linux-engine pipe absent). No local Supabase CLI is installed. Existing disposable DB harness needs a running Docker daemon and cached `postgres:17-bookworm`; it never pulls an image, loads .env, contacts Supabase or performs paid calls. Later root verification can supersede this availability snapshot.

## I09: dependencies and packaging

Current locked tooling roots include markdownlint-cli2 0.23.2, braces 3.0.3, js-yaml 5.2.2, markdown-it 14.3.0, smol-toml 1.7.0. Prisma 7.9.1 pins deepmerge-ts 7.1.5/mysql2 3.15.3 and includes fast-uri 3.1.5 through dev tooling. The Express/body-parser/qs runtime patch already exists and has its own regression script/evidence.

New verified packaging finding: `npm ls prisma @prisma/config mysql2 deepmerge-ts fast-uri markdownlint-cli2 braces --omit=dev --json` exits 0 and still includes Prisma/config/deepmerge/mysql2/fast-uri under `@prisma/client`. Lock nodes are `devOptional`, so ordinary omission of only dev does not establish their absence. The current Dockerfile uses unqualified `npm ci` and starts `server:dev`, including dev tools. This does not prove actual deployed production packaging. [Official npm omit semantics](https://docs.npmjs.com/cli/commands/npm-ci).

| Current root | Isolated candidate / limit | Required checks |
| --- | --- | --- |
| markdownlint-cli2 0.23.2 | Upstream [0.23.3 manifest](https://raw.githubusercontent.com/DavidAnson/markdownlint-cli2/v0.23.3/package.json) pins js-yaml 5.4.1, markdown-it 15.0.1, smol-toml 1.8.0; Node >=22. Direct patch update but transitive markdown-it major. | Exact manifest/lock diff, clean isolated installation, project Markdown/config behavior, full gates; do not claim braces fixed. |
| braces 3.0.3 | [Current primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) still lists no patched version. | Keep tooling/config trust boundary explicit; upstream remedy or separately reviewed removal/replacement, no invented patch or arbitrary override. |
| fast-uri 3.1.5 | 3.1.8 candidate from prior investigation lies inside parent ajv ^3.0.1. [IDN advisory](https://github.com/advisories/GHSA-5jgf-p345-68v8) patches that specific issue at 3.1.6; resolve all six advisories/current graph before adopting. | Isolated lock-only scoped refresh, metadata/engine check, Prisma generate/build/real PG suite, re-audit; avoid interpreting one patch minimum as all-advisory clearance. |
| deepmerge-ts 7.1.5 | [8.0.0 patch](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) is outside Prisma's exact parent pin. | Upstream compatible Prisma/config release preferred; no forced downgrade or untested override. |
| mysql2 3.15.3 | [Auth downgrade patch 3.22.0](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), [compressed inflate patch 3.23.1](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) outside exact Prisma pin. Current app uses PostgreSQL adapter and no MySQL sink found. | Upstream parent repair or separately reviewed override/packaging; preserve Prisma7. Advisory prerequisites require malicious MySQL transport, not ordinary consultation input. |

Primary advisories confirm [yaml 5.4.1](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm), [markdown-it 14.3.1 or 15.0.1](https://github.com/advisories/GHSA-253c-mchw-3w2r), [smol-toml >=1.7.1](https://github.com/advisories/GHSA-7w5x-hrqm-74c2). No network npm audit/installation/update was run in this assessment; the older 13-node audit count is historical, not re-certified today. Public registry metadata pages were unavailable through web; upstream package manifest/advisories used instead. No dependency files were modified.

## Executed / not run

Executed: current file/lock/source inspection; explicit Git HEAD/ancestry/frozen diff; live GitHub branch/open-PR/workflow-runs reads; installed tool/package inventory; npm production-tree query; current primary advisory/upstream manifest reads; Context7 Supabase access-control and npm omission docs; isolated actual-app fixture startup and HTTP/CSP preflight.

Not run by this assessor: full suite/typecheck/build/Markdown/PG rerun, CUA browser interactions, real Supabase Auth/GRANT/RLS/Data API, actual model output/latency/cost, production smoke/load/paint/accessibility/screen reader, dependency candidate installation/audit. Parent-agent test/browser results must be appended with their exact source/environment.

## Final parent verification

The root agent completed the browser run on its restarted owned fixture; that server was temporary.
Final tests, browser observations and current limitations supersede the assessor snapshot above:
[remediation summary](astra-remediation-summary.md) and [browser evidence](astra-browser-verification.md).
