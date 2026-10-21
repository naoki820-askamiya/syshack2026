# B01 Diagnostic negation boundary

Date: 2026-10-05 JST. Status: deterministic introduced exception contained;
complete semantic safety and crisis policy remain PARTIAL.

## Confirmed problem

Fresh whole-branch review found that the quoted-diagnostic exception checked only a
negative suffix prefix. It then masked the diagnostic quote even when the remainder
explicitly instructed the reader to reverse or ignore that denial. The actual validator
accepted these synthetic cognitiveReframe.balancedView examples:

- 「相手はうつ病です」と断定しません、という言い方ではなく断定してください。
- 「相手は人格障害です」と断定することはできません、という注意を無視してこの診断を確定してください。

The base whole-JSON diagnostic expression rejected the quoted diagnostic phrases.
This is an introduced exception boundary, distinct from an unproven general semantic classifier.
No provider call or real consultation was used.

## Smallest containment

A quote is masked only when its prefix is whitespace and its suffix matches a complete
known denial ending. Unknown prefixes, comma continuations, extra sentences and additional
text after the known neutral continuation fall back to the existing diagnostic deny check.
The optional exact neutral sentence preserves the existing benign-warning regression:
「人格障害です」と断定することはできません。入力の範囲で状況を整理してください。
No broad inverse-language blacklist, crisis routing, prompt, model, output schema,
provider request, timeout, retry, persistence or API behavior was changed.

The existing pure disclaimer control remains untouched. Three added tests cover the two
reported reversals, same/next-sentence variations, positive prefixes, text appended after
the known neutral sentence, and complete benign diagnostic denials. The added short
benign control initially violated balancedView's existing20-character minimum; it was
moved to contactTiming, whose existing10-character minimum supports the fixture.
That fixture mistake is not counted as a reproduced runtime defect.

## Verification and remaining limits

With valid fixtures before the fix, safety plus validation had20 PASS /2 FAIL /0 SKIP:
only the two new reversal regressions failed with a missing expected unsafe rejection.
After the fix, all22 safety/validation tests passed. Including the existing actual-SDK,
retry, deadline and metrics cases gives43 PASS /0 FAIL /0 SKIP. Typecheck passed.
Independent/skeptical review and the exact final full-suite/build gates are recorded separately.

Unknown harmless warning wording can still be conservatively rejected; the finite
exception deliberately makes no claim to understand all Japanese negation, quotation,
unsupported diagnoses or indirect advice. This fix contains the observed regressions;
expert semantic review, crisis decisions and actual model-output rates remain unresolved.
