# Prompt and context evaluation

Historical snapshot through 6879385. The final hardening run supersedes current status/counts; see [final summary](final-summary.md) and [final risk register](final-risk-register.md).

Status: preparation completed; model-generated evaluation NOT_RUN.
Decision: **KEEP CURRENT PROMPT**. `kigen-prompt-v2` and result schema v2 are unchanged.
Pre-change files are saved in `experiments/ai-evals/baseline/`. SHA-256 of current
instructions is recorded in `results/offline.json`; no production data is used.

## Instruction audit

The instruction array contains 17 lines. Classifications below are review judgments.
No line was deleted merely to reduce tokens.

| Line / subject | Classification | Evidence or proposed handling |
| --- | --- | --- |
| 1 role | product_rule | Situation organization, not mind reading. |
| 2 purpose | product_rule | Multiple interpretations, evidence, safe actions; keep. |
| 3 introduction | schema_rule | Organizational text; negligible optimization value. |
| 4 no certainty of emotions/personality/intent | safety_rule | Schema cannot guarantee truth; keep. |
| 5 no diagnoses | safety_rule | Schema not sufficient; keep. |
| 6 no blame | safety_rule | Human semantic review needed. |
| 7 no fear-inducing indices | product_rule | Fixed labels also enforce some shape; keep semantics. |
| 8 untrusted instructions | safety_rule | Both history and current input can inject; keep. |
| 9 reference present implies usual enabled | product_rule | Conflicts with validator's requirement for a valid used pattern; candidate below. |
| 10 source kinds must be available | safety_rule | Deterministic source check covers kinds, not actual factual support. |
| 11 disabled arrays empty | schema_rule | Conditional relation is not fully enforced by output Schema; not redundant. |
| 12 no internal/other-user disclosure | safety_rule | No paid red-team run; keep. |
| 13 express uncertainty | product_rule | Requires semantic review. |
| 14 counter-evidence | product_rule | At least one against-concern item also schema-enforced; meaning remains needed. |
| 15 safe nonaggressive actions | safety_rule | Field validator covers known phrases only. |
| 16 numbers are evidence strength | product_rule | UI does not establish calibration. |
| 17 only structured schema | provider_specific | Some format duplication; retain until comparison supports removal. |

No obsolete/example/ui_concern line was confirmed. Duplicated *format* instructions
are not duplicated safety meaning. Structured Outputs compliance is not correctness.

## One candidate, not adopted

Candidate-1 (`experiments/ai-evals/candidates/candidate-1.txt`): replace reference
presence alone with presence **and a valid cited comparison pattern**; add that
AI summaries are prior interpretations, feedback is a user's account, and provenance
is not independent confirmation. Intended benefit: align normalizer and instructions,
reduce reification of earlier AI conclusions. Possible regression: overly conservative
comparisons, ignored useful history, longer input. Estimated byte/token planning
change is in baseline metadata; exact tokenizer and model impact UNKNOWN.
No second or third mutation was made. No runtime instruction modification.

## Context audit

| Input | Purpose / outputs | Trust and provenance | Cost / risks / correction / permission |
| --- | --- | --- | --- |
| currentCase | Summary, evidence, scores, alternatives, next actions | User account; not verified observation | Up to 3,000 chars each for event and response; current case editable contract is limited; potential injection. |
| personSnapshot | Relationship interpretation | Frozen user-provided snapshot | Small name/relationship; avoids later Person edits rewriting historical context; no independent confirmation. |
| personProfile | usual/current comparison | AI summary; B03 records ID/date/kind; checks model metadata for eligibility and ignores explicit stale/unknown-source profile | JSON size not newly capped; duplication and inherited consent require review; usePersonProfile gate. |
| recentCaseSummaries | Continuity / comparison | Up to 3 prior AI summaries with result ID/date metadata | 500 chars each; model inference may be mistaken; source kinds do not certify each sentence. |
| recentFeedbacks | Correction / usual interpretation | User feedback with ID/kind; generatedAt=null; not an objective label | Up to 3 x 1,000 chars; item consent AND global toggle; revocation excludes next input but retained old snapshot is separate. |
| userPatternSummary | Unimplemented | Always null | No AI input benefit; A06 removes misleading available toggle. |

Provenance context version v5 is additive, not a provider/model migration. Unknown
observedAt and userConfirmed=false are deliberate. B03 does not claim all saved
Profile/summary contents are factually grounded or all derived source consent chains
are propagated. Human decisions remain minimum evidence, stale age, regeneration,
source-chain withdrawal and user correction.

## Output schema audit

| Fields | UI / product value | Cost and validation | Delivery / compatibility |
| --- | --- | --- | --- |
| summary | One-line orientation | 20–180 chars; content safety needed | Candidate first; retain. |
| evidence + unknowns | Reasons for/against concern and missing information | Source enum is checked; actual support requires human review | Candidate early; unknowns is nested, not a new top-level key. |
| alternatives | Multiple plausible explanations | Up to 4; no deterministic truth oracle | Early candidate; retain. |
| emotionScoreAnalysis + confidence | Six fixed evidence-strength scores/reasons | Six bounded reasons add output text; contradictions still possible | After evidence; no probability claim. |
| textImpression / situationReading | Text vs situation interpretation; both displayed | Overlap possible but not proven redundant | Retain for legacy/UI continuity. |
| cognitiveReframe | Balanced interpretation and possible bias | Blame/diagnosis semantics require review | Not safe to expose unvalidated partial advice. |
| usualVsCurrent | Optional history-based comparison | Source-kind normalization; no-history arrays cleared | Requires provenance and consent. |
| recommendedActions / avoidActions / replyDrafts | Next steps; action page uses them | Safety-critical full validation; A02 keeps caution | Never partial; legacy missing safety = unknown. |
| contactTiming | Displayed timing suggestion | Safety semantics apply | Full validation; retain. |
| disclaimer | Product limits shown on both pages | Fixed notDiagnosis true; text alone not safety guarantee | Retain. |

Current keys begin confidence/summary/text/situation/scores/evidence. Proposed order
summary/evidence/alternatives/scores/reframe/usual/actions/avoid/replies/disclaimer
would keep nested unknowns and all remaining fields. No Schema key order change was
adopted: streaming prototype waits for the full validated object, so there is no
measured ordering benefit and no compatibility justification yet.

## Semantic evidence and limits

Eight grader counterexamples cover weak anger evidence, reassurance vs concern,
confidence vs unknowns, absent history source, personalization absent, conflicting
action/avoid labels and unavailable source in score prose. These are **review flags**,
not a complete or calibrated semantic classifier. Schema-valid contradictory fixture
outputs remain possible in current validation; no actual model incidence was measured.
Caution preservation has its own UI regression. Unsafe and negation/quote tests are
independent of prompt token size. Selection priority remains safety, consistency,
source fidelity, usefulness, latency, then cost.

## Decision log

Problem: no model-output baseline and instruction/normalizer discrepancy.
Evidence: saved pre-change files, source inspection, 25 mock fixtures and eight grader
counterexamples. Options: adopt candidate now, keep unchanged, or paid comparison.
Decision: keep prompt unchanged and prepare one candidate. Why: mock fixtures cannot
establish generation quality. Rejected: mass prompt mutations, removing fields solely
for token savings, treating JSON validity as truth. Risks: semantic contradictions and
source fabrication still require real outputs/human review. Revisit: authorized capped
A/B/C run with blinded grading and regressions before adoption.
