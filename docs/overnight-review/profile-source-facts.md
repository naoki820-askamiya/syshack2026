# B03 Available Profile source facts

Status: deterministic source checks implemented; age/quality policy remains partial.

A non-stale eligible Profile now carries its existing schema version, source case
and feedback counts, latest source case ID, needsRefresh=false and source existence
check result in optional provenance.profileFacts. The same facts survive into the
saved context snapshot; they do not claim user confirmation or psychological fact.
Older input/snapshots remain valid because the new metadata is optional. Output
schema and prompt instructions are unchanged; baseline snapshots remain immutable.

The latest source case must exist under both the authenticated owner and the
current Person. Missing/deleted/wrong-owner/wrong-Person references exclude the
Profile. Privacy OFF avoids Profile loading as before. Source verification adds one
scoped read only when the existing metadata checks passed; no unbounded query,
generation scheduler, new writer or database migration is introduced.

Evidence: the metadata test and three scoped absence tests failed before the fix.
Counts and timestamps are facts, not a minimum sample or age rule. We do not claim
that finding a source proves every summary sentence or consent derivation is valid.
Feedback withdrawal continues to invalidate the existing profile. Regeneration,
expiry, minimum count and derived consent policy remain human decisions.
