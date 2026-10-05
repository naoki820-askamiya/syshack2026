# R10 Runtime Dependency Repair

Date: 2026-10-05 JST. Status: Completed scoped runtime patch; independent/skeptical reviews approved and adopted dedicated dependencies verified.
Current source snapshot: `b4ff1da21b667243ed26a20a895134b4616cb640`.

## Problem and bounded change

The existing runtime lock graph includes qs 6.15.3, which is affected by two published advisories.
The repair changes exactly three of 579 lock entries and keeps `package.json`, its root lock entry,
all direct dependency ranges, and every other locked package version unchanged.

| Lock entry | Before | After | Changed declarations |
| --- | --- | --- | --- |
| `node_modules/express` | 4.22.2 | 4.22.3 | qs `~6.15.1` to `~6.16.0`; path-to-regexp `~0.1.12` to `~0.1.13` |
| `node_modules/body-parser` | 1.20.6 | 1.20.8 | qs `~6.15.1` to `~6.16.0` |
| `node_modules/qs` | 6.15.3 | 6.16.0 | No dependency declaration change |

Each changed entry also updates its version, public registry tarball URL, and integrity.
The already installed path-to-regexp version is 0.1.13, so its lock entry does not change.
Express remains within the existing `^4.21.2` range and body-parser remains within Express's
`~1.20.5` range. No new direct dependency, override, major upgrade, downgrade, or force repair is used.
Candidate lock SHA256: `91fa0c77f6edae53539382123a1dec69f8b26b56f8eb0d70b38ae487254208ef`.

## Isolation and reproduction

The candidate was generated from tracked files in an ordinary temporary directory, without `.git`,
`.env`, user contents, or the worktree's shared `node_modules` junction. All 579 original lock entries
were inspected; resolved URLs use the public npm registry only. Empty temporary npm user/global
config files and an explicit `https://registry.npmjs.org/` registry were used.

`npm install express@4.22.3 --package-lock-only --ignore-scripts --no-audit --no-fund` generated
registry metadata; the temporary manifest was restored byte-for-byte and the root lock entry
was restored structurally, then a scoped `npm update body-parser qs --package-lock-only --ignore-scripts
--no-audit --no-fund` aligned the transitive graph. The resulting exact three-entry diff was inspected
before adoption. A subsequent `npm ci --ignore-scripts --no-audit --no-fund` succeeded in that
isolated directory (478 installed packages; optional platform entries remain in the 579-entry lock).
Prisma generation ran separately with a synthetic PostgreSQL URL at `127.0.0.1:9`.
No real database, Auth, provider, Production write, deploy, or merge was used.

Runtime: Node 22.15.1 / npm 10.9.2 / Windows. Isolated `node_modules` is an ordinary directory,
contains no reparse points, and is approximately 452 MiB (23,748 files). Its command shims resolve
relative to their own directory. The original dependency directory was not installed into or modified.

The permanent script is [runtime-dependency-regression.test.mjs](../../scripts/runtime-dependency-regression.test.mjs).
Run from the repository root:

```text
node --test scripts/runtime-dependency-regression.test.mjs
```

`R10_DEPENDENCY_ROOT` optionally selects an already installed control dependency tree for this
standalone test only. The old installed tree was read without writing to it.

| Regression boundary | Old dependencies | Candidate dependencies |
| --- | --- | --- |
| Four bracket/comma values with arrayLimit 3 and throwOnLimitExceeded | FAIL: no RangeError | PASS |
| Parsed `constructor.isBuffer` scalar followed by qs.stringify | FAIL: TypeError | PASS |
| Actual Express extended query parsing, pagination, nested arrays | PASS | PASS |
| Actual body-parser JSON, nested object and false boolean | PASS | PASS |
| Actual body-parser malformed JSON status/type | PASS: 400/entity.parse.failed | PASS |
| Actual body-parser oversized JSON status/type | PASS: 413/entity.too.large | PASS |
| Total | 4 PASS / 2 FAIL | 6 PASS / 0 FAIL |

Both HTTP runs bound only to ephemeral loopback ports and sent synthetic fixtures. The advisory
fixtures use small inputs; no memory exhaustion or denial-of-service load was attempted.
The comma fixture needs `comma: true`, which the application does not enable. The stringify fixture
needs a parsed-to-stringify sink, which repository inspection did not find. These prove dependency
behavior and the patch; they do not establish a complete application exploit.
The actual application parser/error regressions also run within the full suite below.

## Verification

| Source snapshot / gate | Isolated candidate result |
| --- | --- |
| `ec68feb966be62ff9eab872bd7a24f3f97e1dc1b` full suite | 191 PASS / 0 FAIL / 0 SKIP |
| Same snapshot client and server build | PASS |
| `b4ff1da21b667243ed26a20a895134b4616cb640` full suite | 233 PASS / 0 FAIL / 0 SKIP |
| Same snapshot typecheck | PASS |
| Same snapshot Markdown lint | PASS, 46 files checked |
| Candidate permanent parser script | 6 PASS / 0 FAIL / 0 SKIP |
| Adopted complete frozen resumed source / full suite | 254 PASS / 0 FAIL / 0 SKIP |
| Adopted source typecheck / client and server build / Markdown | PASS; exact final-tip repetition in final-verification.md |

The ordinary snapshot intentionally has no Git metadata, so the client build emits Git lookup
messages and records unknown build revision; that does not certify the eventual repository revision.
Final gates must be repeated at the adopted exact source/dependency state. No CI, Preview,
Production packaging, or authenticated browser evidence is inferred from these local results.

## Re-audit and remaining risks

Public `npm audit --json` completed before and after the candidate. Both advisory-bearing results
exit 1; neither JSON response contains a registry/network error.

| Audit classification | Before | After |
| --- | --- | --- |
| Affected dependency entries (including meta-vulnerabilities) | 16 | 13 |
| High | 11 | 11 |
| Moderate | 5 | 2 |
| Critical | 0 | 0 |

The qs, Express, and body-parser entries disappear from the candidate audit. The remaining 13 are
`@prisma/config`, `braces`, `deepmerge-ts`, `fast-glob`, `fast-uri`, `globby`, `js-yaml`,
`markdown-it`, `markdownlint-cli2`, `micromatch`, `mysql2`, `prisma`, and `smol-toml`.
These counts include dependency meta-vulnerabilities and are not counts of proven application exploits.
Reachability limits in [B06 audit](dependency-audit.md) still apply.

The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) explicitly lists no patched
version. npm's `fixAvailable` suggestion for a newer markdownlint-cli2 is not evidence that braces
is fixed; a CLI update or its existence cannot replace resolved-graph/advisory verification.
The installed braces version remains affected. No tooling update is included in R10.
The [qs comma advisory](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and
[qs isBuffer advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) identify 6.16.0 as the patch.

Production dependency packaging and all remaining advisory repairs are UNKNOWN or separately scoped.
The public registry metadata and Context7 npm/Express documentation informed the lock-only install,
clean-install, and parser checks; the observed installed versions and test behavior are the local evidence.
