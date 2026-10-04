# Case-first navigation intent

Status: runtime fix implemented; browser E2E remains required.

Evidence: the actual useHydratedAnalysis hook and actual retry logic were executed
with strict lifecycle/I/O mocks. Before the fix, retained history state started
analysis again after a failed first mount; 4 of 5 new regression cases failed.

A separate effect consumes only startAnalysis with replace navigation, preserving
the path, query, hash and all other state. The local initial capture still permits
the initial saved Case run. Clearing navigation state does not become a new
dependency of the analysis effect, so the replacement does not cancel/restart it.
The flag is consumed even for cached results or failed state lookup. A later mount
does not automatically retry; the existing explicit retry still uses that Case.

No Person/Case creation or provider flow redesign was added. Tests check actual
hook wiring, fresh navigation, remount after failure, explicit retry, plain draft
reload, cached results and unreadable state. Their mock lifecycle is not evidence
of browser paint, mobile accessibility, real history reload or StrictMode timing.
Those remain in the final E2E checklist.
