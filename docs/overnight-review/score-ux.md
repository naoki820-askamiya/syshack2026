# C03 Score UX comparison

Preparation only: `experiments/score-ux/index.html` compares six representations of
one fixed synthetic result. A radar, B bars+reason, C cards+reason, D text-first with
collapsed numbers, E text-only, F arbitrary 3/5-level ordinal display. No library or
production UI change. Existing product does not become a diagnostic/probability tool.

The same source reasons and six mock scores are held constant. Controls are native
buttons/select and results use a labelled SVG plus textual reasons. The ordinal
boundaries are **unvalidated prototype values**, not product policy. Browser visual,
keyboard, screen reader and user-comprehension tests remain NOT_RUN.

Human test tasks: explain what the number means; name the missing information;
find counter-evidence; choose a next step without treating high concern as fact;
compare time to find reasons and confidence in interpretation. Record probability
misinterpretations and accessibility failures, not only preference. No favored
variant or production replacement is selected.

Problem: numerical presentation may invite overinterpretation. Evidence: existing
six-score UI and fixed labels; no current user study. Options: A–F. Decision: fixture
comparison only. Rejected: automatic graph removal/new calibrated thresholds.
Risks: even ordinal labels can look diagnostic; lack of live device tests. Revisit:
small moderated human study with the synthetic examples before design adoption.
