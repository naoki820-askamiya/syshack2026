# P1-01 Protected write intent

Status: Completed. Independent and skeptical reviewers approved the frozen delta.
Global gate: 172 tests passed, 0 skipped; typecheck/build/lint passed.

Evidence: before the fix, all 12 method/transition fixtures sent the old A body
after delayed session lookup. The new suite had 7 passes and 14 failures.

The existing user/epoch capture now reaches the protected transport. After token
lookup and complete RequestInit construction, POST/PATCH/PUT/DELETE check the same
capture immediately before send. No asynchronous gap or global write queue is added.
A rejected intent has code AUTH_WRITE_INTENT_STALE; the existing response isolation
retains AUTH_RESPONSE_STALE. An already aborted write keeps its original reason.
Session lookup failures/missing token and sent HTTP/network failures keep their
existing semantics. GET dispatch and public/login/register transports are unchanged.

This is client race containment, not backend authentication or authorization.
Token storage, Supabase flows, JWT parsing, owner checks and business cache rules
are unchanged. Requests already sent may still change server data as their original
authenticated owner; their successful stale responses remain blocked from delivery.

Regression coverage: 21 new fixtures plus the previous 20 response-race fixtures.
The four methods cover A→B, logout and logout→same A during token lookup. Additional
cases cover parallel writes, raw response helper, lowercase method, abort priority,
missing token, 401/403/409, network error and unchanged GET semantics.
