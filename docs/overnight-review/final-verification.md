# Final verification

Date: 2026-10-04 JST. Dedicated branch; no Production writes or real user fixtures.
All requested commands are rerun at the final documentation tip. Their output logs
are ignored local artifacts under experiments; exact final HEAD is reported by git.

| Gate | Result / scope |
| --- | --- |
| npm.cmd test | 191 passed, 0 failed, 0 skipped; actual SDK uses injected synthetic fetch |
| npm.cmd run typecheck | PASS |
| npm.cmd run build | PASS client/server; Prisma generate uses loopback port9 synthetic URL |
| npm.cmd run lint:md | PASS; final document count in final terminal evidence |
| Disposable PG safety | 1 passed, 0 skipped |
| Disposable PostgreSQL | 7 passed, 0 failed, 0 skipped; unique loopback tmpfs, container removed |
| AI deterministic | 13 passed; 30 constructed synthetic contract rows; no model inference |
| Focused central auth | 41 passed:20 response races/errors +21 write-intent cases |
| Progressive UX | 9 passed:actual hook5 + saved-Case retry4 |
| Person prefill/accessibility | 6 passed:actual page1 + source/AST5 |
| AI runtime safety/SDK | 33 passed:analyzer14 + safety12 + validation7 |
| History measurement | 23 actual-function mock scenarios; source hashes refreshed |
| Bundle prototype | Both local builds pass; exact lazy4 files checked by root before normal build |
| Whole branch reviews | Independent backend/frontend and skeptical; base406fc858 through final tip |

Full-branch review found and fixed actual SDK timeout validation and selected-Person
prefill overwrite. B01 skeptical cycle1 found affirmative-prefix role bypass; cycle2
approved full-label containment. Every logical fix received independent and skeptical
review, with original30 commits preserved. No remaining confirmed new local blocker.

Actual PostgreSQL owner-role results are not Supabase RLS/GRANT evidence.
Mock/source/browser lifecycle, real provider semantics/latency/cost and Production
deep routes remain NOT_RUN, explicitly gated in the risk register. No critical local
test was skipped or weakened. The large-chunk build warning remains informational.

Repeat from this worktree: npm.cmd test; npm.cmd run typecheck; npm.cmd run build;
npm.cmd run lint:md; node --test scripts/db-integration/safety.test.mjs;
node scripts/db-integration/run.mjs; focused suites use existing tsx.cmd --test.
Do not run migration deploy or connect these tests to a shared/Production database.
