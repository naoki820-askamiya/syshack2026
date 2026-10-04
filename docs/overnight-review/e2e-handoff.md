# Independent E2E handoff

Status: NOT_RUN in this run. Use synthetic consultations and two isolated test users.
Record build SHA, dirty flag, frontend/backend origins, device/browser, time,
case/person IDs and pass/fail evidence. Do not record real text or credentials.
Do not deploy or use Production DB without separate authorization.

| Test | What to observe | Result |
| --- | --- | --- |
| Register / login | SDK success/failure, errors and return path | NOT_RUN |
| Direct route / reload | Login, dashboard, new, history, analysis, action, privacy routes | NOT_RUN |
| New consultation | Saved Case exists before AI completes; no duplicated Person | NOT_RUN |
| Slow Person prefill | Identity controls disabled, event draft retained, failures retryable | NOT_RUN |
| Analysis state | Draft/analyzing/analyzed/failed match server, no fake percentage | NOT_RUN |
| Lost analysis response | Latest/state reconcile before restarting | NOT_RUN |
| Failed analysis retry | Same saved Case; no new Person/Case | NOT_RUN |
| Failed Case remount | Consumed navigation flag does not silently retry | NOT_RUN |
| State GET failure/stall | No implicit provider start; polling cutoff is scheduling only | NOT_RUN |
| Same Person second case | Existing Person reused, selected ID not display-name equality | NOT_RUN |
| Same-name two Persons | Histories and consultation targets remain distinct | NOT_RUN |
| Existing relationship edit | Inspect cache label versus DB snapshot; record current limitation | NOT_RUN |
| Personalization ON/OFF | Actual permitted source IDs reflect settings | NOT_RUN |
| Privacy GET/PATCH failure | No saving fallback defaults, recover with read/retry | NOT_RUN |
| Feedback create/edit/reload | POST once, PATCH existing, restored values | NOT_RUN |
| Feedback opt-out | Future context excludes item; profile invalidation visible | NOT_RUN |
| A→B while token lookup pending | No old protected POST/PATCH/PUT/DELETE sent | NOT_RUN |
| A→B while response/JSON pending | No A cache/state delivered to B | NOT_RUN |
| Logout / same-user re-login / expiry | Old epoch responses and unsent writes rejected | NOT_RUN |
| Parallel same-user requests | Ordinary independent requests complete | NOT_RUN |
| 401/403/409 / abort / network | Existing errors remain distinguishable and recoverable | NOT_RUN |
| Public/login/register | No unnecessary protected client guard effect | NOT_RUN |
| Mobile | Readability, scrolling, controls and navigation | NOT_RUN |
| Keyboard | Focus, labels, choice state, pending/error announcements | NOT_RUN |
| Result comprehension | Independently explain evidence, uncertainty, alternatives and caution | NOT_RUN |
| Score interpretation | Ask whether numbers mean emotional probability; record misunderstanding | NOT_RUN |
| Crisis / safety | Use proposal fixtures; expert policy review required, not approval by regex tests | NOT_RUN |

## Post-deploy smoke preparation

Only after an independently authorized deployment: obtain the intended full commit
SHA and fetch frontend /build.json; require exact commitSha equality and dirty=false.
Record backend health/build identity separately; do not infer it from frontend metadata.
Fetch each deep route directly and reload in the browser. Require the expected SPA
entry/asset content; HTTP200 alone is not proof (fallback/error shells can be200).
Verify API errors remain JSON and are not rewritten to SPA HTML. For owned synthetic
Case IDs test both analysis/action; test unknown/other-user IDs for safe non-disclosure.
Check cold and warm navigations, auth redirect/return, chunk failure recovery and
mobile/keyboard behavior. Mark each step verified or NOT_RUN with its environment.
No smoke command or deployment was executed against Production here.
