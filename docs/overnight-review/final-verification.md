# Final verification

Date: 2026-10-05 JST. Existing dedicated branch; original develop preserved.
Frozen resumed runtime uses independently installed/copied candidate dependencies,
not the original node_modules junction. Original3 package manifest hashes are unchanged.

| Gate | Result / scope |
| --- | --- |
| npm.cmd test | 312 passed,0 failed,0 skipped |
| npm.cmd run typecheck | PASS |
| npm.cmd run build | PASS client/server; Prisma generation uses loopback port9 dummy URL |
| npm.cmd run lint:md | PASS;54 files |
| Disposable PG safety | 1 passed,0 skipped |
| Disposable PostgreSQL | 14 cases; unique loopback tmpfs DB, owner role/shadow scaffold, own container cleaned |
| AI deterministic | 13 tests/30 constructed synthetic rows, model inference0 |
| Focused auth | 41 tests:response20/write-intent21 |
| Client timing + existing flow | Full312 includes explicit Person edit, prefill/retry/new intent, History and saved-analysis cases; focused final slice logged separately |
| SDK/safety/validation | 43 passed:analyzer21/safety15/validation7 |
| Runtime HTTP/qs | 6 passed under adopted tree; same script against untouched control4pass/2expectedfail |
| History | Fresh23 synthetic scenarios; five current source hashes verified, peak4/load and failure stop |
| Bundle | Normal1/lazy4 actual files independently read/gzipped; exact reports matched |
| Independent reviews | Backend/frontend across base406fc858 through current source; skeptical per-change and whole-branch; AUTH-P1 cycle2 reviewed24/24 |

The final documentation tip repeats the four requested commands plus PG safety/
integration, AI/auth/UX and runtime dependency tests. Exact revision and final Git
commands are in [git evidence](../../experiments/final-git-state.log); current ignored logs
are residual-final-tests.log/residual-final-typecheck.log/residual-final-build.log/
residual-final-markdown.log/residual-final-db.log/residual-final-focused.log under
experiments. Earlier final-*.log files are historical. No secret or real user fixture
is included. Logs preserve actual terminal evidence; this file cannot recursively
embed its own commit hash.

The prior final whole-branch review discovered a diagnostic quote exception that accepted
reverse instructions. Before2valid regression failures, after full254 green;
5 adversarial reversals/prefixes/extra-text were independently denied while the
original benign two-sentence warning remains. No prompt/model/schema change.

R11 skeptical cycle1 found same-batch next-page dispatch4-to7; per-fetch latch
and two regressions repair it. Client cached StrictMode-like duplicate timing is
also fixed and tested. Root independent controls and skeptical replays confirm scope.
See [resumed reviews](resumed-reviews.md) and each linked per-issue evidence doc.

The earlier initial PG run after Docker cold start reached the15-second Feedback test timeout:
6passed/1cancelled, then synthetic test.invalid DNS failed after mock restoration.
An unchanged rerun passed7/0skips (4857.7304ms), with own-container cleanup.
Cold import/setup is a possible explanation, not a confirmed cause. No timeout
increase, skipped test or weaker assertion. Final-tip DB repetition is separate.

Dependency copying initially used slow Copy-Item; its partial copy was safely
completed with non-deleting robocopy /E. A permission-review deadline timed out,
then the permitted short-command retry succeeded. Adopted inventory matches
23,748 files/473,597,375 bytes, ordinary directory/no shared junction; original
Express/body-parser/qs manifest hashes and original branch are unchanged.

Local Node/transpile fixtures establish control flow, not real React/browser
paint, Supabase RLS/GRANT/Data API, model semantics/quality/cost or Production routes.
These remain NOT_RUN/UNMEASURED in the risk register. Large-chunk warning remains.

Repeat only in this worktree: npm.cmd test; npm.cmd run typecheck; npm.cmd run build;
npm.cmd run lint:md; node --test scripts/runtime-dependency-regression.test.mjs;
node --test scripts/db-integration/safety.test.mjs; node scripts/db-integration/run.mjs.
Never point the DB suite at shared/Production data or run migration deployment.

## Approved residual implementation: R07

Start HEAD3ae8fe4; branch chore/portfolio-polish-overnight; develop/A05 preserved.
Frozen R07 tree: npm test268/0skip; typecheck/build PASS; Markdown51 files/0 issues;
focused33/0skip; real disposable PostgreSQL8/0skip with own container removed.
Independent and skeptical reviews APPROVE. Logs: experiments/residual-r07-*.log.
No Production migration, external Auth, paid API, push or merge.

## Approved residual implementation: R13

Cycle2 frozen source: npm test287/0skip; typecheck/build PASS; Markdown52 files/0
issues; focused UI24/0skip; real disposable PostgreSQL11/0skip, container removed.
Cycle1 independently found four UI defects; negative regression7/9 and2/5 failures
plus A,B,A retry reproduction precede the fix. New Other validation is preserved.
The PG FK fixture shape was corrected to reach the original P2003 assertion.
Independent frontend APPROVE; final backend/skeptical review recorded in R13 doc.
Logs: experiments/residual-r13-*.log. These fixtures do not prove real browser/Auth.

## Approved residual implementation: R12

Cycle2 npm test299/0skip; typecheck/build PASS; Markdown53 files/0issues.
Initial backend4/4 regressions failed before implementation. Initial PG12/14
exposed the installed adapter error metadata; corrected PG14/14 with two real
connections and cleanup. UI reviewed-new-intent regression8/9 before,9/9 after.
Independent backend44/44 and frontend31/31 APPROVE; skeptical whole-change review
is recorded in the R12 doc. Logs: experiments/residual-r12-*.log.
Reload, physical deletion and real browser/Auth are outside the verified guarantee.

## Password recovery feasibility: R14 remains partial

Actual installed private SDK public initialize/setSession/updateUser tests pass7/7,
plus existing unsafe SDK2 and honest affordance2: independent/skeptical11/11.
Near-expiry refresh-failure fallback was first reproduced7/8; a sticky denial latch
in the experiment fixes it. Main runtime/Auth routes/storage are unchanged.
Delayed response/JSON and same-user new epoch are synthetic only, not actual email
callbacks or complete recovery. Frozen full306/typecheck/build/Markdown53 passed.
Logs: experiments/residual-r14-*.log and R14 candidate evidence.

## Whole-branch additional repair: AUTH-P1

The independent reviewer reproduced base async requireAuth rejection unanswered by
Express4. Regression2/3 before; cycle1 raw forwarding then exposed shaped SDK-error
detail and null continuation. Two real HTTP regressions gave18/20 before the final
boundary wrap. After: actual middleware/API/error focused24/24, full312/0skip,
typecheck/build/Markdown54 green and cycle2 skeptical APPROVE.
Independent cycle2 approval and exact final HEAD review are in resumed reviews.
Logs: experiments/residual-auth-error-*.log. No global normalizer, JWT/storage,
provider/library or authorization redesign. Ordinary invalid credentials still401.
