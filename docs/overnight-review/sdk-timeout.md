# P1 SDK timeout compatibility

Status: actual installed-SDK regression repaired; no provider request made.

Fresh whole-branch review found that remainingMs is fractional because it subtracts
performance.now(). OpenAI 4.104.0 core.buildRequest validates request timeout with
Number.isInteger before fetch. The actual SDK rejected the request as AI_PROVIDER_ERROR
with zero injected fetch calls; existing parse mocks did not exercise that contract.

The SDK option now uses integer milliseconds, floored with a minimum of one.
The outer precise deadline/timer, external abort, bounded attempts, backoff,
Retry-After and maxRetries=0 remain unchanged. There is no extra provider resend or
model/prompt/storage change.

The permanent regression runs actual sdk.responses.parse and its Structured Output
parser with a synthetic injected fetch and loopback dummy URL. It failed before
the fix, then returns a fully validated result in one synthetic send. No real HTTP,
API key, paid call, environment file or user data is used. All existing provider
deadline/abort/refusal/retry tests remain required.

Documentation: Context7 official API documentation was queried for timeout/retries;
its resolver did not return the Node SDK package. The installed version's core.mjs
integer validator is the version-specific evidence, not an assumption from current
SDK examples.
