# Auth SDK rejection reaches Express4 error handling

Whole-branch independent review found a P1 availability boundary already present
at the base: requireAuth awaited getUser without catching rejected SDK promises.
Installed Express4's Layer does not observe returned middleware promises, so the
request could remain unanswered and produce an unhandled rejection. A synthetic
probe using the actual middleware and Express Layer reproduced next calls0.
No real Auth request was made.

The minimal fix catches only getUser rejection, wraps it as a safe internal AppError,
calls next once and returns. The raw cause is retained internally, never serialized.
Ordinary invalid/missing token stays401; verified ownership publication is retained.
Existing error middleware emits safe500 with requestId for unexpected exceptions,
without exposing raw error/token or reaching the business/DB handler.
No token validation/storage/Auth flow, library version or authorization policy changed.

Regression before:2 pass/1 fail. Cycle1 skeptical review found a shaped AuthApiError
would be duck-typed as public and expose SDK detail, while null rejection would call
next(null) as normal continuation. New realHTTP cases18/20 before, then wrapping
all unexpected rejection values fixes both. After:middleware3 plus HTTP/API/error21,
24 pass/0skip. Integration uses an injected SDK throw and bounded request signal;
the response must be500, not merely a timeout. Normal401 and API error tests remain.
Full gates and independent/skeptical review are recorded in final verification.

Current [Express migration guidance](https://expressjs.com/en/guide/migrating-5)
distinguishes automatic rejected-promise forwarding in Express5 from the explicit
next(error) required by this installed Express4 application. No major upgrade.
