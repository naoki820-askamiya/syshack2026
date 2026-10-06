# R12 Acknowledged Person retention across Case failure

Status: Completed bounded acknowledged-ID fix; uncertain Person/Case response
outcomes and full server idempotency remain Partial.

## Reproduction

The actual NewConsultation page creates a Person successfully, then receives a
Case400 or network failure. Before the fix, the form's personId remains empty and
the next submit creates another Person. Four of five new regressions failed before
the implementation; the existing auth assertion made the fifth pass.

After an acknowledged Person response and the existing auth-boundary assertion,
the page retains that ID in its existing in-memory form. A functional update only
applies when nickname/effective relation still match the submitted identity and
no other Person is bound. Pending submit disables the identity controls and their
handlers; later nickname editing still clears the ID. No payload/name deduplication,
new cache, localStorage, guessed server result, automatic retry or DB mutation
contract was introduced. The next explicit submit reuses the confirmed ID.

## Verification

Five new actual-page synthetic tests passed: acknowledged ID reused after Case400
and network failure, changed nickname invalidation, old auth-epoch suppression,
and pending identity controls/restoration. Previous Person-prefill regression also
passed. Tests execute actual TSX via deterministic React/I/O seams, not live Auth
or a real server response. Typecheck passed. Independent and skeptical reviewers
approved the minimal scope. Final build/global evidence is in final-verification.

## Remaining decision

If Person or Case commits but its response is lost, this change cannot know the ID
and does not ensure exactly-once creation. Real deduplication needs an owner-scoped
per-intent idempotency key, durable uniqueness, payload conflict/replay semantics
and lifetime rules; equal name or consultation text is not a safe intent key.
Existing-Person relationship persistence remains a separate R13 contract decision.
