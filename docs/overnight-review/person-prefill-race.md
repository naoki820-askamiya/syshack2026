# P2 Person prefill race

Status: selected-Person pending identity edits contained; browser E2E pending.

Fresh actual-page review reproduced a typed new nickname being overwritten by the
late selected-Person response and rebound to the previous Person ID. That lookup
path was added for uncached personId links. The pending state already prevented
submit, but identity controls were editable.

The existing pending state now natively disables nickname, relationship fieldset
and Person suggestions. Name/suggestion handlers also reject pending edits.
Event/action and other draft input stay editable and survive response completion.
When lookup finishes, nickname editing again clears personId for a new identity.
No automatic Person PATCH, identity policy or cache/session storage is introduced.

The permanent actual-page test transpiles the real TSX with strict synthetic
React/JSX/I/O seams, defers Person GET, checks disabled controls and handler guard,
preserves unrelated event draft, then verifies completed prefill and new-name edit.
It failed before the fix. Native browser keyboard/focus behavior remains NOT_RUN.

Inherited limitation: editing an existing Person relationship does not persist a
Person update; its temporary consultation label can differ from the DB snapshot.
A separate explicit Person-edit contract remains a human decision.
