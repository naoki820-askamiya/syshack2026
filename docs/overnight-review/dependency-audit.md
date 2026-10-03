# B06 Dependency Reachability Audit

Date: 2026-10-04 JST. Base: `406fc8581a471cedfe4a030845c820b03a4c4f2f`.
Status: audit completed; dependency repair not applied.

## Evidence and limits

`npm audit --json` returned 16 affected dependency entries: 11 high, 5 moderate, 0 critical.
These include meta-vulnerabilities; they are not 16 proven production exploits.
There are 15 advisory records rooted in 8 transitive packages.
The tracked lockfile has 579 entries including the root; resolved origins are all public
`registry.npmjs.org`, with no file/git/workspace/private-registry dependencies.
The first network escalation was rejected for unestablished payload sensitivity.
After this evidence and the user's explicit B06 authorization were supplied, the same official audit request succeeded.
No `audit fix`, override, install, major upgrade, or downgrade was executed.

Reachability below is code/lockfile inspection, not an exploit claim.
`node_modules` in the dedicated worktree uses existing local dependency links;
`npm ls` consequently calls some packages extraneous. Parent chains below use
the tracked lockfile, not that misleading installed-tree classification.

The repository Dockerfile uses `npm ci` without omitting dev dependencies, so all listed packages
are included if that Dockerfile is deployed unchanged. It is a development image
(`server:dev`), not verified production-image evidence. Actual production server packaging
and production dependency versions remain UNKNOWN.

## Advisory reachability

All advisory roots below are transitive. Direct meta-vulnerabilities are `express`,
`markdownlint-cli2`, and `prisma`.

| Advisory / installed version | Parent chain / execution | Untrusted input and current reachability | Compatible repair / decision |
| --- | --- | --- | --- |
| [qs comma array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), 6.15.3 | Express 4.22.2 → qs; runtime HTTP query parsing | Express extended query parser runs before route auth; however required `comma: true` is absent, so this specific path is not established. No urlencoded middleware is mounted. | Patched qs 6.16.0. Express 4.22.3 declares `~6.16.0` and fits existing `^4.21.2`; validate body-parser's separate qs edge as well. |
| [qs attacker-controlled isBuffer](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), 6.15.3 | Express/body-parser → qs; runtime | Express uses `allowPrototypes: true`, but the advisory needs parsed input to reach `qs.stringify`. No application stringify sink found. Runtime parser is reachable; full exploit chain not established. | Same qs 6.16.0 patch; no Express major upgrade needed. |
| [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), 3.0.3 | markdownlint-cli2 → micromatch → braces; CLI | Repository glob patterns/config, not consultation API bodies. Hostile contributed glob/config remains a tooling input concern. | Audit proposes markdownlint-cli2 0.23.3; use a scoped lockfile update and verify resolved braces is outside affected `<=3.0.3`. |
| [deepmerge recursive graph exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), 7.1.5 | prisma → @prisma/config → deepmerge-ts; CLI/build config | `prisma.config.ts` loads developer config, not request JSON. No application import found; ordinary JSON cannot directly create cyclic references. Deep/cyclic trusted plugin config remains possible. | Advisory patch 8.0.0 is outside parent exact 7.1.5. Audit proposes Prisma 6.19.3 major downgrade: rejected; requires upstream compatible release or separate tested override decision. |
| [fast-uri IDN host confusion](https://github.com/advisories/GHSA-5jgf-p345-68v8), 3.1.5 | prisma → @prisma/dev → @prisma/streams-local → ajv → fast-uri; CLI/dev | Schema reference URI resolver in development tooling. No application network-allowlist or user-URI sink found. | fast-uri 3.1.8 is within ajv `^3.0.1`; lockfile-only scoped refresh can be investigated with Prisma build checks. |
| [fast-uri IPv6 normalization](https://github.com/advisories/GHSA-f65p-4m7j-42xc), 3.1.5 | Same CLI/dev chain | No current consultation input path found; no SSRF claim established. | Same compatible 3.1.8 candidate. |
| [fast-uri repeated hostname decoding](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), 3.1.5 | Same CLI/dev chain | Same development-schema boundary; production runtime usage not found. | Same compatible 3.1.8 candidate. |
| [fast-uri encoded scheme](https://github.com/advisories/GHSA-jqff-g426-hqxp), 3.1.5 | Same CLI/dev chain | Same development-schema boundary. | Same compatible 3.1.8 candidate. |
| [fast-uri unvalidated port serialization](https://github.com/advisories/GHSA-qw65-cvwx-89v3), 3.1.5 | Same CLI/dev chain | No user-controlled serialized URL network sink in app. | Same compatible 3.1.8 candidate. |
| [fast-uri encoded host case](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), 3.1.5 | Same CLI/dev chain | Same development-schema boundary. | Same compatible 3.1.8 candidate. |
| [js-yaml merge CPU exhaustion](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm), 5.2.2 | markdownlint-cli2 → js-yaml; CLI | Linter YAML config, not runtime consultation text. | markdownlint-cli2 0.23.3 declares patched yaml 5.4.1. No direct application API change. |
| [markdown-it linkify quadratic behavior](https://github.com/advisories/GHSA-253c-mchw-3w2r), 14.3.0 | markdownlint-cli2 → markdown-it; CLI | Markdown lint inputs. No markdown-it runtime rendering/import found. Specific linkify setting not verified; do not infer an active exploit. | markdownlint-cli2 0.23.3 declares 15.0.1 (transitive major); check linter behavior and node compatibility before adoption. |
| [smol-toml malformed input DoS](https://github.com/advisories/GHSA-7w5x-hrqm-74c2), 1.7.0 | markdownlint-cli2 → smol-toml; CLI | Linter TOML config, not runtime API. | markdownlint-cli2 0.23.3 declares 1.8.0. |
| [mysql2 auth downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), 3.15.3 | prisma → mysql2; CLI connector | Prisma datasource and runtime adapter are PostgreSQL. No application MySQL connection found; malicious MySQL server path not used in this product. | Parent pins 3.15.3; audit's Prisma major downgrade rejected. A compatible upstream release is preferred. |
| [mysql2 compressed inflate DoS](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), 3.15.3 | Same Prisma CLI chain | No MySQL/compressed-protocol runtime path found. | Same upstream/dependency decision; no product migration. |

Meta-vulnerability chains cover `@prisma/config`/`prisma`,
`body-parser`/`express`, and `micromatch`/`fast-glob`/`globby`/`markdownlint-cli2`.
They inherit the relevant root advisory exposure and are not additional independent vulnerabilities.

## Decision

Problem: known vulnerable versions exist, but raw audit counts hide execution boundaries.
Evidence: lockfile parent graph, Dockerfile, actual Express query parser source, repository imports,
public npm package metadata for Express 4.22.3 / qs 6.16.0 / markdownlint-cli2 0.23.3 / fast-uri 3.1.8.
Decision: preserve dependency versions during the correctness fixes; prioritize a separate scoped
Express/qs patch, then tooling patches. Reject `npm audit fix --force` and Prisma downgrade.
Why: public advisory prerequisites do not justify architectural changes or untested transitive majors.
Risks: unverified production packaging, future request sinks/config paths, and unfixed installed versions.
Revisit: targeted install in an isolated checkout; inspect exact lockfile diff; run HTTP parser regressions,
tests/typecheck/build/lint and re-audit. Human decision is needed for any major/override repair.

[npm audit documentation](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md)
explains registry payloads, meta-vulnerabilities and why an advisory exit code 1 is not a network failure.
