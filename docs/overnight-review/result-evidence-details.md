# F15 Result evidence and usual/current details

Status: Completed for deterministic metadata propagation and display. Human score
comprehension and final graph format remain R09, not completed by these tests.

## Evidence and bounded change

The ec68feb baseline mapper discarded evidence source/strength, sameAsUsual,
comparison reasons/relevance and collapsed the context score category into concern.
Five new mapper regressions failed while four existing regressions passed. The
skeptical reviewer separately replayed the actual baseline page/mapper: all four
new initial page assertions failed; the current page passed.

The mapper now preserves the existing stored fields and the page displays source,
AI-rated strength, same/current reasons and relevance in text. Current input is
user entry, Feedback is a user's report, and recent AI/Profile summaries explicitly
include inference. Legacy/missing/invalid metadata remains unknown. Disabled
comparisons do not expose leftover detail arrays. No minimum evidence or age
threshold, graph replacement, prompt/schema/model or new provider was adopted.

Confidence is described as an AI self-rating, not measured accuracy/stability.
Skeptical cycle1 found inherited missing confidence defaulted to medium, which
would falsely acquire the new self-rating description. Cycle2 fixes missing/invalid
values to unknown with neutral absent-record copy and preserves explicit low,
medium and high. Regression coverage includes this counterexample.

## Verification and review

Mapper10 and actual-page5:15 passed, no failures/skips. Page tests transpile the
actual TSX and execute render paths with strict synthetic JSX/I/O seams; they do
not prove React lifecycle, native browser layout, screen reader or human understanding.
Typecheck passed; client build and final global gates are recorded in final-verification.
Independent backend reviewer approved, skeptical reviewer approved after cycle2.
All existing safety/caution, legacy score and schema fields remain supported.
