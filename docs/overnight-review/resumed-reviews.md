# Residual implementation reviews

Date: 2026-10-05 JST. Resumed from ec68feb on the existing dedicated worktree.
The prior40 commits were retained without rewrite. Each listed logical change was
reproduced, minimally repaired, covered and reviewed before its independent commit.

| Change | Independent check | Skeptical check | Evidence |
| --- | --- | --- | --- |
| F15 source/reason display | Backend actual mapper/page15 passed; root source/UI review | Cycle1 missing confidence was fabricated; cycle2 unknown preserved and approved | result-evidence-details.md |
| R12 acknowledged Person reuse | Backend actual page/new+prefill6 passed; root payload/state/auth review | Baseline duplicate repro; narrow ACK-only scope approved | person-create-retry.md |
| R11 History cap/failure stop | Backend final loader9+retry2 passed; root ordering/error/cache review | Cycle1 same-batch4-to7 counterexample; cycle2 per-fetch latch4-to4 approved | history-concurrency.md |
| R15 backend metrics | Root independent analyzer/service/safety/validation48 passed | Actual SDK, timeout/late response, usage privacy, observer failure approved | backend-substage-metrics.md |
| R14 History retry | Root focused/actual page and auth effect review | Filter retention and late unmount approved | r14-history-retry.md |
| R14 logout feedback | Root actual component/current-boundary/error review | Auth API unchanged, no stale-user error, no premature navigation approved | r14-logout-error.md |
| R14 unavailable recovery honesty | Root actual Login and installed-SDK4 passed | Honest copy and two SDK counterexamples approved; complete recovery still partial | r14-password-recovery.md |

The global pre-commit gates for these7 issues were233 tests/0 skips, typecheck,
client/server build and46 Markdown files/0 issues. No model/provider/Auth host was
contacted. Reviewer tests use strictly synthetic seams; browser evidence is separate.

Disposable PG initial attempt reached the15-second Feedback test timeout; after
timeout restoration the SDK attempted test.invalid (DNS failed). No Production or
live Supabase host was used. An unchanged rerun passed all7/0 skips in4857.7304ms
and cleaned its own container. Cold import/setup delay is a possible explanation,
not a confirmed root cause. No timeout increase, skipped test or weaker assertion.

Fresh whole-branch source reviews include the complete base406fc858 diff. Final exact-tip verification is recorded in final-verification.md.

## Final additional issues

| Change | Independent / skeptical evidence | Result |
| --- | --- | --- |
| R10 runtime patch | Root and skeptical exact579/3-entry lock checks; candidate6pass/control4pass2fail | Approved,585e3d8 |
| R15 client | Root/backend/skeptic29pass; cached StrictMode and native160-entry clear-failure regression | Approved,64a8fd4 |
| B01 diagnostic quotation | Whole-branch backend finding; root43pass; frontend source review; skeptic5 pre/current adversarial comparisons | Approved,66e64f8 |

The introduced diagnostic-mask exception previously accepted reversals after a negative
prefix. Complete known suffix plus whitespace-only quote prefix restores conservative
denial of unknown continuations while preserving the existing neutral control.
Before2 valid failures, current22 safety/validation and43 with SDK pass. General
Japanese semantics/crisis remains partial. No known confirmed local blocker remains
after the independent and skeptical whole-branch reviews. Final four gates use the
adopted independent dependencies:254 full regressions/0 skips, typecheck/fullbuild green.

## Approved residual pass and whole-branch second review

The earlier254/7 counts are historical. Start3ae8fe4; base406fc858; original51
commits are retained. Current full source has312 regressions and disposable PG14.

| Change | Independent / skeptical evidence | Result |
| --- | --- | --- |
| R07 original-run usage | Backend and skeptic owner/event/run, pair CHECK, atomic reserve, known settlement; focused33 and PG8 | Approved b8aca18; generated synchronization05f8fe5 |
| R13 explicit edit/snapshot | Frontend24, skeptic27, PG11; cycle1 four UI counterexamples then cycle2 fixes | Approved a011611 |
| R12 create intent | Backend44, frontend31, skeptic69, PG14; installed adapter metadata and explicit new-intent replay counterexample repaired | Approved f4fa335 |
| R14 private SDK candidate | Independent/skeptic11, server typecheck; near-expiry refresh fallback before7/8 then fixed with latch | Approved experiment633152a, recovery remains partial |
| Whole branch before AUTH repair | Backend119, frontend172, skeptic228 and server typecheck; complete base-to633152a source read | Frontend bounded APPROVE; backend found existing-base AUTH-P1 |
| AUTH-P1 cycle1/2 | Initial middleware2/3; shaped/null realHTTP18/20 before final containment; independent24 and skeptic24 after plus server typecheck | Approved5bd32fa; safe generic500, normal401 retained |

The final source tip is5bd32fa. Final document/performance commit is evidence only;
all reviewers must match its exact HEAD and compare the complete base-to-tip diff.
Exact final review and all-command terminal results are saved in ignored
experiments/residual-final-*.log and final-git-state.log; no recursive self-SHA in docs.
No open confirmed local blocker after cycle2. Browser/Auth/RLS/model/operational
partials remain explicit in final-risk-register, not inferred from reviewer PASS.
