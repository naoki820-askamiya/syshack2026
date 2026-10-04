# PR draft

## Title

KIGEN404: 相談・認証・AI検証の境界を修正し、独立E2Eへ引き継ぐ

## Why

Portfolio review reproduced feedback length mismatch, lost caution, old history
selection, settings fallback writes, auth/cache races, and non-resumable AI wait.
Final whole-branch review additionally caught a real SDK timeout contract failure
missed by parse mocks and delayed Person prefill overwriting identity edits.

## What changed

- Correctness: aligned feedback1000 contract, newest-first history and malformed-JSON errors.
- Auth/session: synchronous user/epoch cache isolation, success-body guard, write-intent pre-send guard; same-user parallelism and API errors preserved.
- UX: saved Case handoff/state reconciliation/retry, consume start intent, pending Person identity protection.
- Personalization: stable Person ID, editable/revocable Feedback, atomic profile invalidation, factual provenance/source owner+Person checks.
- AI reliability: classified bounded retries/deadline, actual SDK integer timeout and known safety-role bypass containment;30 offline fixtures/human-review flags.
- DB/invariants: run CAS/latest version/owner constraints preserved;7 disposable PostgreSQL scenarios.
- Accessibility: native groups/names/pressed state and pending/error announcements, with browser audit pending.
- Observability: PII-free stage/outcome/reconciliation metadata; unknown timings remain null.
- Docs: risk/escalation/E2E/PR package, retention/crisis proposals and measured build/history evidence.

## What intentionally did not change

Architecture, provider/model/prompt/output schema, Production DB and major dependency
versions remain. No deploy/merge/push. Crisis/retention/source-chain policy decisions
were prepared, not selected. Lazy routing and streaming are prototypes, not adopted.

## Verification

191 tests/0skip; typecheck/build/lint PASS. Disposable PostgreSQL7/0skip and safety1.
Central auth41; UX9; Person/a11y6; AI SDK/safety33; offline13/30syntheticrows.
Independent and skeptical whole-branch reviews from406fc858 found no remaining
confirmed new local blocker after fixes. See final-verification.md for limits.

## Remaining risks

FACT: crisis normal dispatch, archive-not-delete, crash quota linkage, inherited
Person relationship edit contract and known dependencies. UNMEASURED: live Auth/RLS,
browser/deep-route behavior, real-model quality, score comprehension and speed.
INFERENCE: lazy entry reduction or bounded fanout may help; no user benefit claimed.
Full IDs and merge/public-demo gates are in final-risk-register.md.

## E2E follow-up

Another member should execute e2e-handoff.md independently on isolated accounts,
including direct reload, auth switching, saved-Case retry, personalization/Feedback
revocation, mobile/keyboard and result interpretation. Recommendation READY_AFTER_E2E.
This is a saved draft only; no PR was opened, pushed or merged.
