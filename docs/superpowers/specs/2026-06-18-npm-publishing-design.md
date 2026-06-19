# npm Publishing for `@opendui/*` — Design Spec

Date: 2026-06-18
Status: Approved (design); hardened after 6-agent review; pending implementation plan
Owner: Omri Katz

## 1. Goal

Publish all **library packages** in this monorepo to the public npm registry under
the `@opendui/*` scope, releasable both **locally** and from **CI**, using
off-the-shelf tooling (no hand-written version/publish glue).

Apps (`apps/site`, `apps/examples/*`) are NOT published — they are `private: true`.

### In scope

The 12 packages under `packages/*`, all currently `version: 0.0.0`, all public:

```
@opendui/aidx              @opendui/aidx-protocol
@opendui/aidx-cli          @opendui/aidx-solid-diffs
@opendui/aidx-core         @opendui/aidx-solid-streamdown
@opendui/aidx-harness      @opendui/aidx-test-runner
@opendui/aidx-plugin       @opendui/aidx-tool-ui
@opendui/aidx-tools        @opendui/aidx-widget
```

### Out of scope

- Publishing apps.
- Changing build tooling (tsdown / vite builds stay as-is). Source maps are kept (MIT/OSS — no
  leak concern; maps give consumers real stack traces).
- Documentation-site deploy pipeline (already on Netlify).

## 2. Decisions (locked)

| Decision             | Choice                                                                                                            | Rationale                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release tool         | **`@changesets/cli`**                                                                                             | Industry-standard monorepo publisher; auto-bumps dependents, rewrites `workspace:` specifiers to real versions on publish, generates changelogs. Most tool-driven, least hand-written. |
| Versioning model     | **Lockstep** (`fixed: [["@opendui/*"]]`)                                                                          | All 12 packages share one version. One mental model for a pre-1.0 product with tightly-coupled internal deps. Exit path in §6.                                                         |
| Internal dep ranges  | **`workspace:^`** (not `workspace:*`)                                                                             | On publish, changesets rewrites to a caret range (`^0.1.0`) so consumers resolve patch releases instead of being hard-pinned to an exact version.                                      |
| Release surfaces     | **Local AND CI**                                                                                                  | Runnable on a laptop with a token, and automated via GitHub Actions. Neither is the sole path.                                                                                         |
| Automation           | **`changesets/action@v1`** (pinned to commit SHA)                                                                 | Opens a "Version Packages" PR on push to `main`; publishes on merge.                                                                                                                   |
| npm auth             | **OIDC trusted publishing + provenance** in CI; **granular `NPM_TOKEN`** for the one-time bootstrap publish only. | No long-lived CI token; provenance attestation on every post-bootstrap release.                                                                                                        |
| Provenance flag      | **CI env only** (`NPM_CONFIG_PROVENANCE=true` in release.yml) — NOT in `package.json`                             | `--provenance` errors outside a CI OIDC environment; putting it in `publishConfig` would break local + bootstrap publishes.                                                            |
| Packaging validation | **`publint` + `@arethetypeswrong/cli`**, both in the publish gate                                                 | Catch malformed `exports`/`files`/types before they reach the immutable registry.                                                                                                      |

Reference implementations studied: **floating-ui** (turbo + changesets + publint + OIDC —
closest match to our stack; its `changeset-version.js` wrapper and setup action directly
informed §4.5/§4.6), **Slidev** (bumpp lockstep — rejected: more hand-written glue),
**Fumadocs** (migrated off changesets to a homegrown `tegami` script — rejected: not reusable).

## 3. Architecture

```
author code  ──▶  pnpm changeset  ──▶  .changeset/*.md  (intent: bump kind + summary)
                                            │
                  ┌─────────────────────────┴─────────────────────────┐
                  ▼ LOCAL                                              ▼ CI
        pnpm release:version                              push main → release.yml
        (= changeset version                              changesets/action:
           + pnpm install --lockfile-only)                  • no changesets → no-op
        bump all 12 to same version,                        • changesets present →
        write CHANGELOGs, rewrite                             open "Version Packages" PR
        workspace:^ deps, resync lock                       • PR merged (versions bumped) →
                  │                                           run `pnpm release` → publish
        review + commit                                       with OIDC + provenance
                  ▼
        pnpm release  (build → publint → attw → changeset publish)
```

### Tooling stack (root `devDependencies`, added)

- `@changesets/cli`
- `@changesets/changelog-github` (needs `GITHUB_TOKEN` in env even for local `release:version`)
- `publint`
- `@arethetypeswrong/cli`

Builds remain per-package (`tsdown` for 8, `vite build && tsc` for the 4 solid/ui/widget
packages). Turbo orchestrates ordering via existing `^build`.

## 4. Components

### 4.1 `.changeset/config.json`

```jsonc
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": ["@changesets/changelog-github", {"repo": "omridevk/aidx"}],
  "commit": false,
  "fixed": [["@opendui/*"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": [],
}
```

- `fixed` glob `@opendui/*` → lockstep across all 12. Verify the glob is honored via
  `pnpm changeset status` during bootstrap (changesets supports micromatch globs in `fixed`).
- Apps are `private: true`, so changesets excludes them automatically.
- `access: public` is required for scoped packages.
- `updateInternalDependencies` is largely **moot under `fixed`** (all 12 bump together regardless);
  left at `patch` so behavior is sane if `fixed` is ever removed. It is NOT the mechanism that
  syncs internal ranges — `workspace:^` + publish-time rewrite does that.

`changeset init` generates a default config + `.changeset/README.md`; **overwrite** the generated
`config.json` with the above.

### 4.2 Per-package metadata normalization

Each of the 12 `package.json` files gains:

```jsonc
"repository": { "type": "git", "url": "git+https://github.com/omridevk/aidx.git", "directory": "packages/<dir>" },
"homepage": "https://github.com/omridevk/aidx/tree/main/packages/<dir>#readme",
"bugs": "https://github.com/omridevk/aidx/issues",
"publishConfig": { "access": "public" },   // NOTE: no `provenance` here — set via CI env (§4.6)
"keywords": [ /* per-package; owner supplies the list, script applies it */ ]
```

Already correct and left untouched: `name`, `version`, `license` (MIT on all 12),
`type: "module"`, `exports`, `files`.

Internal deps are switched from `workspace:*` to `workspace:^` across all packages.

Applied by a one-shot, **idempotent** tool script `scripts/normalize-pkg-meta.mjs` that:

- reads each `packages/*/package.json`, merges the fields above (deriving `directory` from the
  folder name; reading `name`/`description` from the file for README/homepage),
- derives the repo slug from `git remote get-url origin` rather than hardcoding,
- never overwrites an existing `README.md`,
- writes back with stable key order,
- supports a **`--check` mode** (exit non-zero on drift) wired into `ci.yml` so hand-edits to one
  of the 12 files are caught instead of silently re-normalized later.

`keywords` are owner-supplied (one array per package). The script cannot invent them; the
implementation plan must capture the 12 keyword lists as an input artifact.

Per-package `README.md`: all 12 currently lack one. The script generates a minimal stub
(title + description + monorepo link). Content polish is a tracked follow-up, not a release blocker.

### 4.3 Turbo tasks (`turbo.json`, added)

```jsonc
"publint": { "dependsOn": ["build"] },
"attw":    { "dependsOn": ["build"] }
```

Each package gains scripts: `"publint": "publint"` and `"attw": "attw --pack"`. The 4 vite-built
packages (hashed-chunk `dist/`) are the highest packaging risk — implementation must drive both
checks to green for them specifically; expect to fix `exports`/types issues they surface.

### 4.4 Root `package.json` scripts (added)

```jsonc
"changeset":       "changeset",
"release:version": "node scripts/changeset-version.mjs",      // changeset version + lockfile resync
"release:check":   "turbo run build publint attw",            // dry validation, no publish
"release":         "turbo run build publint attw && changeset publish"
```

- `scripts/changeset-version.mjs` runs `changeset version` then `pnpm install --lockfile-only`
  so the "Version Packages" commit carries an in-sync `pnpm-lock.yaml` (else the next
  `--frozen-lockfile` install fails). Mirrors floating-ui's `changeset-version.js`.
- `release` is the single publish entrypoint for BOTH local and CI. It gates on `publint` AND
  `attw` (the latter is the only types-resolution check for the vite packages), then
  `changeset publish` (skips already-published versions; rewrites `workspace:^`).
- Named `release:version` (not `version`) to avoid the npm `version` lifecycle hook.

### 4.5 CI — `.github/workflows/ci.yml`

Reusable workflow (`on: { workflow_call: {}, pull_request: {}, push: { branches: [main] } }`) so
`release.yml` can `uses:` it. Steps: checkout → `pnpm/action-setup` → `actions/setup-node` (node 22,
`cache: pnpm`) → `pnpm i --frozen-lockfile` → `node scripts/normalize-pkg-meta.mjs --check` →
`turbo run build typecheck lint test`.

Note: `packages/aidx` has no `test` script — turbo skips packages lacking the task, so
`turbo run test` is safe; confirm during implementation. Pinned to `pnpm@10.33.2`, node `>=22`.

### 4.6 CI — `.github/workflows/release.yml`

```yaml
on: {push: {branches: [main]}}
concurrency: ${{ github.workflow }}-${{ github.ref }}
permissions: {id-token: write, contents: write, pull-requests: write}
jobs:
  test:
    uses: ./.github/workflows/ci.yml
  release:
    needs: test
    environment: npm-publish # protected env; gates any token + the publish step
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: {node-version: 22, cache: pnpm, registry-url: https://registry.npmjs.org}
      - run: npm i -g npm@latest # OIDC trusted publishing needs npm >= 11.5.1
      - run: pnpm i --frozen-lockfile
      - uses: changesets/action@<sha>
        with:
          version: pnpm release:version
          publish: pnpm release
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'
          NPM_TOKEN: '' # empty → npm CLI uses OIDC (.npmrc from registry-url)
```

- All actions pinned to **commit SHAs**, not floating major tags.
- `registry-url` writes the `.npmrc` OIDC consumes; the npm upgrade + empty `NPM_TOKEN` + the
  written `.npmrc` are ALL required for OIDC to engage — the empty token alone does nothing.
- Provenance is supplied via `NPM_CONFIG_PROVENANCE`, never via `package.json`.

### 4.7 Package-content hygiene (publish artifact)

`files: ["dist"]` is an allowlist. Source maps are **kept** (MIT/OSS — nothing leaks that isn't on
GitHub; maps give consumers real stack traces, including the widget global). Only dev artifacts are
excluded:

- **`*.stories.*`** (tool-ui 26, solid-diffs 4, solid-streamdown 2) and **`fixtures.*`** — dev-only.
  Exclude from build output (or negate-glob from `files`).

Deferred (tracked, not a release blocker): `@opendui/aidx-widget` `./global` is heavy (~11MB JS +
~18MB map). Shrinking it is future work — published as-is for now.

Gate: `pnpm -r pack --dry-run` aggregated file list must contain zero `*.stories.*` and zero
`fixtures.*`.

### 4.8 Repo hardening (supply-chain)

- Pin every GitHub Action to a commit SHA.
- Branch protection on `main`: require PR review (so `changesets/action` cannot push the version
  commit directly without a human merge).
- `CODEOWNERS` on `.changeset/` and `packages/*/package.json` so a malicious changeset / version
  bump requires review.
- Release `environment: npm-publish` with required reviewers; the bootstrap `NPM_TOKEN` (if used
  in CI) lives only on that environment and is **deleted** immediately after bootstrap (§5).
- Add `pnpm audit --prod --audit-level=high` as a release-blocking step.
- Keep the existing `pnpm.onlyBuiltDependencies` allowlist; verify none of the 12 packages add a
  `postinstall`/`prepublishOnly` that shells out (currently none do).

## 5. First-release bootstrap (one-time runbook)

npm OIDC trusted publishing is configured **per package on npmjs.com**, which needs the package to
already exist — a chicken-and-egg. Resolution:

1. **Scope `@opendui` is owned** (confirmed by owner, 2026-06-18). Reserve all 12 package names and
   set the scope so only org members can publish.
2. Create a **granular `NPM_TOKEN`** scoped to `@opendui/*`, publish-only (no delete/deprecate),
   expiry ≤ 7 days.
3. Add a first changeset: `pnpm changeset` → minor → produces `0.1.0` lockstep across all 12.
4. `pnpm release:version` (bumps + resyncs lockfile), review the 12 bumps + CHANGELOGs, commit.
   (`@changesets/changelog-github` needs `GITHUB_TOKEN` in env even locally.)
5. **First publish with the token** — preferred: local from a clean environment via
   `NPM_TOKEN=… pnpm release` (no provenance). Avoid doing the bootstrap via CI to keep the token
   out of Actions; if CI is used, it must run in the `npm-publish` environment. This creates all 12
   at `0.1.0`.
6. On npmjs.com, configure the GitHub Actions trusted publisher for each `@opendui/*` package:
   owner/repo = `omridevk/aidx` (confirm exact slug), workflow filename = `release.yml`,
   environment = `npm-publish`.
7. **Delete the `NPM_TOKEN`.** All subsequent releases use OIDC via `release.yml`.
8. Optionally ship `0.1.1` promptly so the only no-provenance version (`0.1.0`) is short-lived.

## 6. Edge cases & risks

- **`workspace:^` rewrite** — `changeset publish` replaces `workspace:^` with `^<version>`. Verify
  via `pnpm -r publish --dry-run` (no residual `workspace:` strings).
- **Partial publish recovery** — npm is immutable; there is **no rollback, forward-fix only**. If
  publish dies after N of 12, re-running `pnpm release` resumes and **skips already-published
  versions** (changesets behavior). A bug found post-publish is fixed by shipping the next version,
  never by unpublishing. State this in the runbook.
- **Lockstep churn** — leaf packages (`protocol`, `solid-diffs`) get version bumps on every release
  even when unchanged. Acceptable pre-1.0. Exit: remove the `fixed` glob to go independent once any
  single package gets external consumers who pin tightly.
- **The 4 vite-built packages** are the highest packaging risk (hashed chunks, CSS subpath exports
  pointing at `src/*.css`). `publint`/`attw` must pass for them. Note: `attw` validates types only,
  NOT CSS subpaths — the CSS exports shipping from `src/` is a conscious choice, not attw-covered.
- **`widget` runtime deps** (`shiki`, `gsap`, `bippy`, `react-grab`) are `dependencies`, not peers —
  a deliberate human call before publish (balloons consumer install graph).
- **OIDC engagement** depends on npm ≥ 11.5.1 + `registry-url` + empty token together (§4.6).

## 7. Definition of Done

- `pnpm release:check` (build + publint + attw) passes clean for all 12 packages.
- `pnpm -r pack --dry-run` aggregate file list has **zero** `*.stories.*` and `fixtures.*`
  (source maps are intentionally kept).
- `pnpm -r publish --dry-run` succeeds with no residual `workspace:` specifiers.
- `node scripts/normalize-pkg-meta.mjs --check` is clean; the set of non-`private` workspace
  packages equals exactly the 12 expected names (CI assertion, fails on drift either direction).
- A clean checkout runs `pnpm i --frozen-lockfile && pnpm release:check` green.
- `.changeset/config.json`, normalized `package.json` metadata, `CODEOWNERS`, `ci.yml`, and
  `release.yml` (SHA-pinned) are committed.
- **One end-to-end OIDC publish** (a post-bootstrap patch, e.g. `0.1.1`) lands via `release.yml`
  and shows the npm provenance badge — proving the Action + trusted-publisher config actually work,
  before relying on the automated path.

## 8. Implementation order (preview for the plan)

1. **Prerequisite:** own/lock `@opendui` scope + reserve 12 names.
2. Add tooling devDeps; `changeset init`; overwrite `.changeset/config.json` (lockstep).
3. `scripts/normalize-pkg-meta.mjs` (+ `--check`) → metadata, `workspace:*`→`workspace:^`,
   README stubs across 12 packages.
4. Package-content hygiene: exclude stories/fixtures from build output (maps kept).
5. Turbo `publint`/`attw` tasks + per-package scripts; drive all 12 (esp. the 4 vite pkgs) green.
6. `scripts/changeset-version.mjs` + root release scripts.
7. `ci.yml` (+ normalize `--check`) and `release.yml` (SHA-pinned, OIDC, concurrency, env gate);
   `CODEOWNERS`; branch protection; `pnpm audit` gate.
8. Bootstrap runbook → first `0.1.0` token publish → enable OIDC per package → delete token →
   `0.1.1` OIDC smoke.

## 9. Review log (6-agent pass, 2026-06-18)

Folded in: provenance moved to CI env (was a static-`package.json` local-break); `changeset-version`
lockfile wrapper; OIDC `registry-url` + npm upgrade prerequisites; `attw` added to the publish gate;
dist hygiene (exclude stories/fixtures; maps kept — OSS, no leak; widget size deferred);
`workspace:*`→`workspace:^`; scope ownership as
hard prerequisite; SHA-pinned actions + protected environment + token deletion + CODEOWNERS +
`pnpm audit`; `concurrency` guard; normalize `--check`; exactly-12 publishable assertion; partial-
publish recovery; end-to-end OIDC smoke in DoD; corrected the `updateInternalDependencies` rationale.

Deferred to the implementation plan as concrete artifacts (junior-review gaps): full `ci.yml`/
`release.yml` YAML, exact npmjs.com OIDC trusted-publisher field values, the 12 per-package
`keywords` lists, README-stub field mapping.
