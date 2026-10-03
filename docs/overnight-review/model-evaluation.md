# Model evaluation

Decision: **KEEP CURRENT MODEL**. Runtime reads `OPENAI_ANALYSIS_MODEL`, then
`OPENAI_MODEL`; no hardcoded default was changed. Isolated worktree has no model
configuration; deployed current model is **UNKNOWN**, not inferred from history.

| Variant | Prepared | Model results |
| --- | --- | --- |
| A current model + current prompt | Saved baseline and 25 inputs | NOT_RUN |
| B gpt-6-luna + current prompt | Dataset and contract | NOT_RUN |
| C gpt-6-luna + candidate-1 | One candidate text | NOT_RUN |
| D Luna / reasoning none | Comparison plan | NOT_RUN |
| E Luna / reasoning low | Comparison plan | NOT_RUN |

No medium or higher comparison is proposed until none/low insufficiency is observed.
The existing OpenAI 4.104.0 SDK supports Responses streaming and schema request
construction locally; no dependency update was needed for the mock prototype.

[Official Luna documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
checked 2026-10-04 lists Structured Outputs/streaming and none/low reasoning support,
and standard short-context input/output $0.10/$0.50 per million tokens. Availability,
provider behavior and actual maintenance advantages were not measured in this app.
The plan uses explicit none/low for comparisons; no default reasoning assumption.

## Budget and results

`ALLOW_PAID_MODEL_BENCHMARK=1` was absent. Paid provider calls = **0**.
The example plan for one 25-request Luna variant uses 22,306 conservative UTF-8 input
bytes as a token planning bound (instructions + maximum fixture + SDK JSON Schema),
3,000 maximum output tokens, zero retries and an illustrative $1 cap. Estimated total
$0.093265 before provider framing/region/mode adjustments is **preliminary**, not
spend authorization or a charged upper-bound guarantee. A/B/C plus none/low costs
are not collapsed into this one-variant estimate. Current-model price is UNKNOWN.
Actual tokens, reasoning tokens, model latency, first useful output and spend are null.

The offline runner exercises 25 synthetic input shapes and deliberate mock outputs;
its green contract tests do not give a quality score to the current model or Luna.
Human semantic contradiction/source fidelity/unsupported inference/diagnosis grades
are NOT_RUN. Safety determinism does not certify model behavior or crisis routing.

## Adoption gates remaining

Need real schema/validation rates, blinded human comparison of contradictions,
source support, diagnosis-like statements, personalization OFF, unsupported inferences,
and a measured latency/cost/maintenance advantage. Before a paid runner: refresh price,
reserve framing tokens, enforce aggregate budget/request count, reconcile actual usage,
and use only synthetic fixtures. No conclusion from a smaller prompt alone.

Problem: migration benefits unproven. Options: immediate switch, offline preparation,
controlled paid comparison. Decision: offline preparation. Rejected: blind migration,
paid bulk generation without gate. Risks: current unknown deployment model, all actual
quality/latency outcomes. Revisit with explicit gate and budget plus semantic reviewers.
