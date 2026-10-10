# C01 Crisis routing proposal

Status: HUMAN_DECISION_REQUIRED. Date: 2026-10-04 JST. Proposal and synthetic fixtures only.
No runtime routing, prompt, resource list or safety policy was changed.

## Current behavior

[analyzeMoodV2](../../src/backend/ai/v2/analyzeMood.ts) validates the ordinary input schema,
then calls the configured analysis provider; it has no pre-provider crisis-routing branch.
[workflow service](../../src/backend/v17/workflow.service.ts) calls this generator through the ordinary workflow.
[Current-behavior tests](../../src/backend/ai/v2/crisisRouting.currentBehavior.test.ts) execute the actual
AI entrypoint with an explicitly injected mock client and a fixed valid normal-analysis output.
All 14 inputs reach that mock once and accept the normal result schema. This is a characterization
of dispatch and validation, not a test of real model responses, contextual appropriateness or safety.
No API, real user data, provider, database or paid request was used.

[Fixtures](../../experiments/crisis-routing/fixtures.json) include DV, self-harm, harm to others,
violence, stalking, abuse, threats and harassment. Six controls cover explicit negation, fictional
quotation, historical events, figurative language, insufficient evidence and an ordinary short reply.
The reviewFocus/domain fields organize human review; they do not define production classifications.
They are deliberately synthetic, non-graphic and contain no detailed means of harm.

## Routing contract candidate

A separately versioned routing decision could precede ordinary interpretation and return one of
`ordinary`, `support_options`, `clarification` or `unavailable`. These are discussion states,
not adopted labels or thresholds. A reviewable envelope would contain policy version, allowed state,
minimal evidence references to the current input, uncertainty and reason category. It would not
assert diagnosis, intent, verified facts, urgency probabilities or another person's mental state.
No free-text consultation content should enter monitoring logs.

| Candidate state | UI proposal | Unresolved decision |
| --- | --- | --- |
| ordinary | Existing evidence-based interpretation with existing limits | Which evidence permits ordinary interpretation after screening? |
| support_options | Explain the app's limits and display region/language verified support options | Who maintains resources, escalation criteria, and content? |
| clarification | Optional concise question that does not require further disclosure | What questions are useful, proportionate and avoid delaying support? |
| unavailable | State screening is unavailable; preserve the user's ability to leave or seek support | Whether ordinary analysis is suppressed or offered, and what copy appears |

Do not silently treat a failed classifier as an ordinary/safe decision. The fallback behavior and
whether generation may continue require explicit product/safety approval. User navigation and
resource selection must remain voluntary. This app must not present itself as a replacement for
professional support or emergency services. No contact number or country-specific guidance is
proposed here because verified resource ownership and supported regions are undecided.

## Failure and over-routing review

| Case | Evidence needed before adoption |
| --- | --- |
| Missed or ambiguous harm language | Expert review of missed cases, uncertainty handling and optional clarification |
| Negation, quotes, history and metaphor | Distinguish reported speaker, time and context; keyword match alone is insufficient |
| False positive ordinary concern | Ability to continue or leave without forced labels; measure confusion and abandonment |
| Threats inside copied chat or prior AI context | Preserve untrusted-input boundaries; avoid treating instructions or old summaries as current facts |
| Provider refusal, timeout, malformed output or disagreement | Tested explicit unavailable state; no automatic normal-result fallback assumption |
| Unsupported language/region or stale resources | Clear unavailable scope and resource verification process |
| Revisit, retry and revoked context consent | Consistent versioned decisions; no stale result overwrite or unauthorized context reuse |

The fixture set is a starting matrix, not sufficient safety coverage. Review needs additional
language, culturally specific wording, mixed/third-person accounts, vulnerable-user scenarios,
and ordinary cases before choosing any false-negative/false-positive limits.

## Human decision points

Product and qualified safety reviewers must determine scope, supported regions/languages,
resource ownership and review cadence, routing criteria, fallback behavior, sensitive-data handling,
consent, UI wording, evaluation labels and acceptance thresholds. Legal review is required for
adopted commitments. Do not deploy a candidate based only on mock schema success.

Preparation is complete for this run; implementation remains escalated. Tests characterize current
behavior rather than lock in a desired safety policy. A future approved router should replace those
characterization expectations with reviewed routing acceptance tests.
