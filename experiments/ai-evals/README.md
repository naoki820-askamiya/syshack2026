# Offline AI evaluation

Run from the dedicated worktree with the existing dependencies:

```powershell
.\node_modules\.bin\tsx.cmd experiments/ai-evals/scripts/offline.ts
npm.cmd test
```

The runner creates `results/offline.json` for 30 synthetic inputs. Candidate outputs
are deliberately constructed contract fixtures, **not model responses**. This does
not compare quality, speed, tokens, or costs of any real model. Unknown measurements
are null. Semantic flags are human-review hints; grader thresholds are not a product
safety policy. No production consultation, provider call, secret or dotenv read occurs.

## Paid benchmark boundary

No paid runner is provided or executed. `scripts/budget.ts` tests a planning gate:
`ALLOW_PAID_MODEL_BENCHMARK=1` is necessary, plus a finite explicit budget cap, model,
request count, input bound, output limit, retry count and current prices. The example
uses 30 Luna requests per variant, 3,000 maximum output tokens and zero retries. Input planning
uses UTF-8 byte counts including instructions, actual serialized input and JSON Schema; this is not an
exact tokenizer. Provider framing and price freshness also need to be budgeted before real
execution. A production-ready runner still needs a aggregate reservation ledger,
request accounting and usage reconciliation. Do not interpret this offline planner
as authorization or as a charged-dollar guarantee.

Model variants prepared: current/current; Luna/current; Luna/candidate-1;
Luna/none; Luna/low. No medium variant is proposed without evidence that none/low
are insufficient. Deployed current model is UNKNOWN. Decisions remain
**KEEP CURRENT MODEL** and **KEEP CURRENT PROMPT**.

## Streaming prototype

Installed OpenAI 4.104.0 exposes `responses.stream()` and `finalResponse()` with
Structured Outputs. `scripts/streamingPrototype.ts` constructs a schema-bound SDK
request without sending, and consumes a mock async event stream. Raw deltas remain
private. Only completed, fully validated JSON produces application section events;
actions/replies appear only in `final_ready`. Transport/parsing/schema/safety failures emit nothing and retain the
same case ID for reconciliation/retry. Nothing is persisted or wired into the UI.

This conservative prototype emits sections at the same completion time. It provides
**no measured first-useful-output benefit**. Earlier completed-field delivery needs
an incremental parser, field safety review and latency evidence before adoption.

## Baseline and human grading

`baseline/` contains pre-change instructions, input/output schemas and constants.
The runtime prompt and output schema are unchanged. Context version moved v4 to v5
for provenance. `docs/overnight-review/prompt-evaluation.md` records candidate-1 and
instruction/context/output audits. All model semantic ratings remain NOT_RUN until
responses exist and a human reviews source fidelity, unsupported inference, crisis
handling and contradictions. Deterministic graders cannot prove those properties.

Pricing example source (checked 2026-10-04): [official Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna), short-context standard input/output $0.10/$0.50 per million tokens. Recheck before paid use.

Consumer callback failures are separate: a validated summary may already have
been emitted when its consumer throws. The exact exception propagates, with no
persistence. The fixture does not claim delivered events can be retracted.

New fixtures include quoted injection, crisis-like input, excluded stale Profile,
contradicting Feedback and AI-summary reification. Stale eligibility is covered by
the actual context repository tests; its AI fixture contains no stale Profile.
Repeated-input observations repeat constructed contract output, not model inference.
High concern scores always invite axis-specific human review; field keywords are
only diagnostic hints and no semantic support proof or calibrated FP/FN rate.
