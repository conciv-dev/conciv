# npm Publishing (`@opendui/*`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish all 12 `@opendui/*` library packages to npm, releasable both locally and from CI, using `@changesets/cli` with lockstep versioning, `publint` + `attw` packaging gates, and OIDC trusted publishing with provenance.

**Architecture:** Changesets drives lockstep versioning (all 12 share one version via `fixed`), rewriting `workspace:^` to caret ranges on publish. A single `pnpm release` script (build → publint → attw → `changeset publish`) is the publish entrypoint for both local and CI. `changesets/action` opens a "Version Packages" PR on push to `main` and publishes on merge via OIDC. Per-package metadata is applied by an idempotent normalize script, not hand-edited.

**Tech Stack:** pnpm 10.33.2 workspace, turborepo, tsdown (8 packages) + vite/tsc (4 packages), `@changesets/cli`, `@changesets/changelog-github`, `publint`, `@arethetypeswrong/cli`, GitHub Actions.

**Source spec:** `docs/superpowers/specs/2026-06-18-npm-publishing-design.md`

## Implementation deviations (as built)

Two user-requested changes were made during execution; the rest matches the tasks below.

1. **TypeScript, not `.mjs`.** All tooling is `.ts` run via Node 24 native type stripping (no build step), matching repo convention.
2. **`@opendui/publish` tooling package** (private, at `packages/publish`, `private: true`) replaces the loose root `scripts/`. It is a real package mirroring `@opendui/aidx-cli`: `src/` + `test/`, `tsconfig.json` extending the base, vitest tests, `typecheck`/`lint`/`test` scripts. Its `aidx-publish` bin is a **citty** command tree (`version` / `check` / `release` / `snapshot`) that uses **execa with `cwd` = workspace root**, so `changeset`/`turbo` always run at the repo root regardless of caller cwd. The bin runs from `src/cli.ts` (Node type-stripping, no build step) because it orchestrates the build of every other package. Root delegators: `release:version`, `release:check`, `release`, `release:snapshot`. New deps: `citty`, `execa` (both user-requested).

3. **No central metadata enforcer.** Each package owns its own publish metadata (`keywords`, `repository`, `homepage`, `publishConfig`) in its `package.json` — the values were applied once during bootstrap and now live with each package. There is intentionally NO `normalize` command, central `KEYWORDS` map, or CI `meta:check`; `publint` is the packaging gate. (Spec §4.2's "normalize script" is superseded by this decision.)

4. **Snapshot prereleases.** `pnpm release:snapshot <tag>` (default `beta`) runs `changeset version --snapshot <tag>` → build/publint/attw → `changeset publish --tag <tag> --no-git-checks`, publishing e.g. `0.1.0-beta-<ts>` under the `beta` dist-tag without touching `latest`. (Spec §6 had listed sustained pre-mode as YAGNI; snapshot was added per request.)

5. **pnpm 11 + Shai-Hulud hardening.** Upgraded to `pnpm@11.7.0` (build settings migrated from the removed `onlyBuiltDependencies`/`ignoredBuiltDependencies` + `package.json#pnpm` to `allowBuilds` in `pnpm-workspace.yaml`; pnpm 11 turns on `strictDepBuilds`, `blockExoticSubdeps`, and `minimumReleaseAge` by default). Added against the self-replicating npm worm class: `minimumReleaseAge: 2880` (48h dependency cooldown, with `minimumReleaseAgeExclude` for our own just-published dev tooling); `allowBuilds` blocks install/build scripts for everything except `esbuild`/`lightningcss`; **Socket Firewall** (free) wraps every CI install (`sfw pnpm i`); **zizmor** audits the workflows; `ci.yml` runs at `permissions: contents: read`. The key lesson folded in: OIDC + provenance is NOT sufficient alone (the Nov 2025 wave published validly-attested malware by running code inside the trusted release job), so we minimize untrusted code in the `id-token: write` job, keep the `npm-publish` manual-approval environment, and rely on the cooldown so a poisoned release is yanked before we install it. Provenance env now sets both `NPM_CONFIG_PROVENANCE` and `PNPM_CONFIG_PROVENANCE` (pnpm 11 prefix change).

6. **Adversarial security review (5 agents) — fixes folded in.** Workflow `id-token/contents/pr write` moved from workflow-level to the `release` job only (`contents: read` at top, so the `test` job never shares a run with the publish token). CODEOWNERS extended to `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `CODEOWNERS` itself. `fixed` glob narrowed to `@opendui/aidx*` so the private `@opendui/publish` is never in the versioned set. `aidx-publish snapshot <tag>` now validates the tag (`/^[a-z][a-z0-9-]*$/`) to block argument injection into changeset/npm. `aidx-publish release` refuses to publish while any package is `0.0.0` (workspace:^ would become `^0.0.0`, an open upper bound). Every package ships a `LICENSE` (npm auto-includes it) and the streamdown port ships `LICENSE-APACHE`.

**RELEASE-BLOCKING manual prerequisites (GitHub + npmjs.com — not in this repo, must be set before first publish):**

- Branch protection on `main` with **Require a pull request** + **Require review from Code Owners** (otherwise CODEOWNERS is advisory and a direct push to `main` auto-publishes).
- The `npm-publish` environment must **exist** with **required reviewers** (a 404 today means the gate is a no-op).
- npm `@opendui` org: **require 2FA**, **disallow classic tokens**, and pin the **trusted publisher** to `release.yml` + the `npm-publish` environment.
- Make the `zizmor` job a **required status check** for merge.

**Accepted residual (no clean fix without a larger refactor):** `esbuild`/`lightningcss` build scripts run during `pnpm i` inside the `id-token: write` release job (the job also builds). Mitigated by: minimal `allowBuilds` (only those two), exact-version + integrity pinning, the 48h cooldown on resolution, Socket Firewall at install, and the manual-approval environment. The full fix is to split build (no token) from publish (token) across runners with an attested artifact handoff — a follow-up, since a naive artifact handoff just reintroduces the cache-poisoning vector we removed.

## Global Constraints

- **Package manager:** `pnpm@10.33.2`. Node `>=22`. Run every command from the repo root unless stated.
- **New root devDeps (require user approval before install):** `@changesets/cli`, `@changesets/changelog-github`, `publint`, `@arethetypeswrong/cli`. Do not install without explicit approval.
- **Functions over classes; no IIFEs; no useEffect; short one-line comments** (global user rules).
- **The 12 publishable packages (dir → name):** `aidx`→`@opendui/aidx`, `cli`→`@opendui/aidx-cli`, `core`→`@opendui/aidx-core`, `harness`→`@opendui/aidx-harness`, `plugin`→`@opendui/aidx-plugin`, `protocol`→`@opendui/aidx-protocol`, `solid-diffs`→`@opendui/aidx-solid-diffs`, `solid-streamdown`→`@opendui/aidx-solid-streamdown`, `test-runner`→`@opendui/aidx-test-runner`, `tool-ui`→`@opendui/aidx-tool-ui`, `tools`→`@opendui/aidx-tools`, `widget`→`@opendui/aidx-widget`. Apps (`apps/site`, `apps/examples/*`) are `private: true` and never publish.
- **Repo slug:** `omridevk/aidx`. npm scope `@opendui` is owned (confirmed 2026-06-18).
- **Provenance is CI-only** (`NPM_CONFIG_PROVENANCE=true` env in release.yml). Never put `provenance` in `package.json`.
- **Source maps are kept** (OSS); only `*.stories.*` and `fixtures.*` are excluded from publish.
- **Versioning is lockstep**; first release is `0.1.0`.
- **Use turbo to build** (memory); never hand-rebuild dist.

---

### Task 1: Install changesets tooling and write lockstep config

**Files:**

- Modify: `package.json` (root — add devDeps + scripts placeholder)
- Create: `.changeset/config.json`
- Create: `.changeset/README.md` (generated by `changeset init`)

**Interfaces:**

- Produces: a working `.changeset/` directory; `pnpm changeset status` runs; lockstep `fixed` glob in config.

- [ ] **Step 1: Get user approval, then install the 4 devDeps**

Confirm with the user first (Global Constraints). Then:

```bash
pnpm add -Dw @changesets/cli @changesets/changelog-github publint @arethetypeswrong/cli
```

- [ ] **Step 2: Initialize changesets**

```bash
pnpm changeset init
```

Expected: creates `.changeset/config.json` and `.changeset/README.md`.

- [ ] **Step 3: Overwrite `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": ["@changesets/changelog-github", {"repo": "omridevk/aidx"}],
  "commit": false,
  "fixed": [["@opendui/*"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 4: Verify changesets sees the workspace and the lockstep group**

```bash
pnpm changeset status --since=HEAD~1 || pnpm changeset status
```

Expected: command runs without config errors. With no changesets present it prints "No changesets present" (that is success here). No error about `fixed`/glob.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .changeset/
git commit -m "build: add changesets with lockstep config"
```

---

### Task 2: Idempotent package-metadata normalize script

**Files:**

- Create: `scripts/normalize-pkg-meta.mjs`
- Create: `scripts/normalize-pkg-meta.test.mjs`
- Modify: all 12 `packages/*/package.json` (applied by the script)
- Create: `packages/*/README.md` for packages lacking one (applied by the script)

**Interfaces:**

- Produces: `scripts/normalize-pkg-meta.mjs` runnable as `node scripts/normalize-pkg-meta.mjs` (apply) and `node scripts/normalize-pkg-meta.mjs --check` (exit 1 on drift). Adds `repository`, `homepage`, `bugs`, `publishConfig.access`, `keywords` to each package; rewrites internal `workspace:*` deps to `workspace:^`; writes a README stub when absent.

- [ ] **Step 1: Write the failing test**

Create `scripts/normalize-pkg-meta.test.mjs` (uses node:test + real fs in a temp dir, no mocks):

```js
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {normalizePackage, REPO_SLUG} from './normalize-pkg-meta.mjs'

test('adds publish metadata and is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'norm-'))
  const pkgDir = join(dir, 'packages', 'core')
  await mkdir(pkgDir, {recursive: true})
  const pkgPath = join(pkgDir, 'package.json')
  await writeFile(
    pkgPath,
    JSON.stringify(
      {
        name: '@opendui/aidx-core',
        version: '0.0.0',
        description: 'engine',
        dependencies: {'@opendui/aidx-protocol': 'workspace:*'},
      },
      null,
      2,
    ),
  )

  const first = await normalizePackage(pkgPath, 'core', {write: true})
  const after = JSON.parse(await readFile(pkgPath, 'utf8'))
  assert.equal(after.publishConfig.access, 'public')
  assert.equal(after.repository.directory, 'packages/core')
  assert.equal(after.repository.url, `git+https://github.com/${REPO_SLUG}.git`)
  assert.equal(after.dependencies['@opendui/aidx-protocol'], 'workspace:^')
  assert.ok(Array.isArray(after.keywords) && after.keywords.length > 0)
  assert.equal(first.changed, true)

  const second = await normalizePackage(pkgPath, 'core', {write: true})
  assert.equal(second.changed, false, 'second run must be a no-op (idempotent)')
  await rm(dir, {recursive: true, force: true})
})

test('check mode reports drift without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'norm-'))
  const pkgDir = join(dir, 'packages', 'tools')
  await mkdir(pkgDir, {recursive: true})
  const pkgPath = join(pkgDir, 'package.json')
  await writeFile(pkgPath, JSON.stringify({name: '@opendui/aidx-tools', version: '0.0.0'}, null, 2))
  const res = await normalizePackage(pkgPath, 'tools', {write: false})
  assert.equal(res.changed, true)
  const untouched = JSON.parse(await readFile(pkgPath, 'utf8'))
  assert.equal(untouched.publishConfig, undefined, 'check mode must not write')
  await rm(dir, {recursive: true, force: true})
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/normalize-pkg-meta.test.mjs
```

Expected: FAIL — `normalize-pkg-meta.mjs` does not exist / `normalizePackage` not exported.

- [ ] **Step 3: Write `scripts/normalize-pkg-meta.mjs`**

```js
import {readFile, writeFile, readdir, access} from 'node:fs/promises'
import {join, dirname, basename} from 'node:path'
import {fileURLToPath} from 'node:url'

export const REPO_SLUG = 'omridevk/aidx'

// Owner-editable keyword lists, keyed by package directory name.
const KEYWORDS = {
  aidx: ['opendui', 'aidx', 'ai', 'vite-plugin', 'dev-agent', 'embeddable'],
  cli: ['opendui', 'aidx', 'cli', 'ai-agent'],
  core: ['opendui', 'aidx', 'ai', 'server', 'h3', 'srvx', 'engine'],
  harness: ['opendui', 'aidx', 'ai', 'harness', 'claude', 'codex', 'gemini'],
  plugin: ['opendui', 'aidx', 'vite-plugin', 'webpack', 'rspack', 'rollup', 'esbuild', 'nextjs'],
  protocol: ['opendui', 'aidx', 'protocol', 'types', 'ag-ui'],
  'solid-diffs': ['opendui', 'aidx', 'solid-js', 'diff', 'code-diff'],
  'solid-streamdown': ['opendui', 'aidx', 'solid-js', 'markdown', 'streaming'],
  'test-runner': ['opendui', 'aidx', 'test-runner', 'vitest', 'jest', 'playwright'],
  'tool-ui': ['opendui', 'aidx', 'tool-ui', 'react', 'shadcn', 'ai-tools'],
  tools: ['opendui', 'aidx', 'ai-tools', 'tool-definitions'],
  widget: ['opendui', 'aidx', 'widget', 'solid-js', 'chat', 'ai'],
}

function desired(pkg, dir) {
  return {
    repository: {type: 'git', url: `git+https://github.com/${REPO_SLUG}.git`, directory: `packages/${dir}`},
    homepage: `https://github.com/${REPO_SLUG}/tree/main/packages/${dir}#readme`,
    bugs: `https://github.com/${REPO_SLUG}/issues`,
    publishConfig: {access: 'public'},
    keywords: KEYWORDS[dir] ?? ['opendui', 'aidx'],
  }
}

function rewriteWorkspaceDeps(deps) {
  if (!deps) return false
  let changed = false
  for (const [k, v] of Object.entries(deps)) {
    if (v === 'workspace:*') {
      deps[k] = 'workspace:^'
      changed = true
    }
  }
  return changed
}

// Merge desired fields; return whether anything changed. Pure on the object.
function applyMeta(pkg, dir) {
  const want = desired(pkg, dir)
  let changed = false
  for (const key of ['repository', 'homepage', 'bugs', 'publishConfig', 'keywords']) {
    if (JSON.stringify(pkg[key]) !== JSON.stringify(want[key])) {
      pkg[key] = want[key]
      changed = true
    }
  }
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (rewriteWorkspaceDeps(pkg[field])) changed = true
  }
  return changed
}

export async function normalizePackage(pkgPath, dir, {write}) {
  const raw = await readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw)
  const changed = applyMeta(pkg, dir)
  if (changed && write) await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return {changed, name: pkg.name}
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function ensureReadme(pkgDir, pkg) {
  const readme = join(pkgDir, 'README.md')
  if (await exists(readme)) return false
  const body = `# ${pkg.name}\n\n${pkg.description ?? ''}\n\nPart of [aidx](https://github.com/${REPO_SLUG}).\n`
  await writeFile(readme, body)
  return true
}

async function main() {
  const check = process.argv.includes('--check')
  const here = dirname(fileURLToPath(import.meta.url))
  const pkgsDir = join(here, '..', 'packages')
  const dirs = await readdir(pkgsDir)
  let drift = false
  for (const dir of dirs) {
    const pkgPath = join(pkgsDir, dir, 'package.json')
    if (!(await exists(pkgPath))) continue
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
    if (pkg.private) continue
    const res = await normalizePackage(pkgPath, dir, {write: !check})
    if (!check) await ensureReadme(join(pkgsDir, dir), pkg)
    if (res.changed) {
      drift = true
      console.log(`${check ? 'DRIFT' : 'updated'}: ${res.name}`)
    }
  }
  if (check && drift) {
    console.error('\nMetadata drift. Run: node scripts/normalize-pkg-meta.mjs')
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/normalize-pkg-meta.test.mjs
```

Expected: PASS (2 tests).

- [ ] **Step 5: Apply to the real packages**

```bash
node scripts/normalize-pkg-meta.mjs
```

Expected: prints `updated:` for each of the 12 packages. Inspect one: `git diff packages/core/package.json` shows `repository`, `homepage`, `bugs`, `publishConfig`, `keywords`, and `workspace:^`.

- [ ] **Step 6: Verify check-mode is now clean and the workspace still resolves**

```bash
node scripts/normalize-pkg-meta.mjs --check && echo CLEAN
pnpm install --lockfile-only
```

Expected: prints `CLEAN`; install resolves `workspace:^` with no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/ packages/*/package.json packages/*/README.md pnpm-lock.yaml
git commit -m "build: normalize publish metadata + workspace:^ across packages"
```

---

### Task 3: Exclude stories and fixtures from publish artifacts

**Files:**

- Modify: build config of any package emitting `*.stories.*` / `fixtures.*` into `dist` (`packages/tool-ui/vite.config.ts`, `packages/solid-diffs/vite.config.ts`, `packages/solid-streamdown/vite.config.ts`, and their `tsconfig.build.json`)

**Interfaces:**

- Produces: `dist/` outputs with zero `*.stories.*` and zero `fixtures.*` for all 12 packages.

- [ ] **Step 1: Confirm the current leak (failing check)**

```bash
pnpm -r build
find packages/*/dist -name '*.stories.*' -o -name 'fixtures.*' | sort
```

Expected: lists files (e.g. `packages/tool-ui/dist/fixtures.js`, several `*.stories.*`). This is the condition to eliminate.

- [ ] **Step 2: Exclude stories/fixtures from the `tsc` declaration build**

In each affected `packages/<pkg>/tsconfig.build.json`, add to `exclude`:

```jsonc
"exclude": ["**/*.stories.ts", "**/*.stories.tsx", "**/*.stories.js", "**/fixtures.ts", "**/fixtures.tsx", "**/*.test.*"]
```

- [ ] **Step 3: Exclude stories/fixtures from the vite bundle**

In each affected `packages/<pkg>/vite.config.ts`, ensure the library entry does not include stories/fixtures. If entries are globbed, filter them:

```ts
// drop dev-only modules from the published bundle
const entries = Object.fromEntries(
  Object.entries(rawEntries).filter(([name]) => !/\.stories$|(^|\/)fixtures$/.test(name)),
)
```

(If a package lists explicit entries, simply remove any `stories`/`fixtures` entry instead.)

- [ ] **Step 4: Rebuild and verify the leak is gone**

```bash
pnpm -r build
find packages/*/dist -name '*.stories.*' -o -name 'fixtures.*' | sort
```

Expected: no output (empty).

- [ ] **Step 5: Verify a dry-run tarball is clean**

```bash
pnpm -r --filter "./packages/*" exec npm pack --dry-run 2>&1 | grep -E '\.stories\.|fixtures\.' && echo LEAK || echo CLEAN
```

Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add packages/*/tsconfig.build.json packages/*/vite.config.ts
git commit -m "build: keep stories and fixtures out of published dist"
```

---

### Task 4: publint + attw turbo tasks and per-package scripts

**Files:**

- Modify: `turbo.json` (add `publint`, `attw` tasks)
- Modify: all 12 `packages/*/package.json` (add `publint` + `attw` scripts — via a one-line script edit each, or extend the normalize script)

**Interfaces:**

- Produces: `turbo run publint` and `turbo run attw` run after build for all 12; both pass clean.

- [ ] **Step 1: Add the turbo tasks**

In `turbo.json` `tasks`, add:

```jsonc
"publint": { "dependsOn": ["build"] },
"attw": { "dependsOn": ["build"] }
```

- [ ] **Step 2: Add per-package scripts**

In each `packages/*/package.json` `scripts`, add:

```jsonc
"publint": "publint",
"attw": "attw --pack ."
```

- [ ] **Step 3: Run publint across all packages**

```bash
turbo run publint
```

Expected: each package reports. Fix every error publint reports (commonly: `exports` missing `types` condition order, `files` not including an exported path). Re-run until all green. Note `tool-ui`/`solid-streamdown` CSS subpath exports must resolve to a shipped file.

- [ ] **Step 4: Run attw across all packages**

```bash
turbo run attw
```

Expected: each package green. The 4 vite packages are highest risk; fix any `false-cjs`/`no-resolution`/masquerading errors by correcting `exports` types conditions. attw validates types only (CSS subpaths are out of its scope — that is expected).

- [ ] **Step 5: Commit**

```bash
git add turbo.json packages/*/package.json
git commit -m "build: add publint and attw packaging gates"
```

---

### Task 5: changeset-version wrapper and root release scripts

**Files:**

- Create: `scripts/changeset-version.mjs`
- Modify: `package.json` (root scripts)

**Interfaces:**

- Consumes: `.changeset/config.json` (Task 1), normalized packages (Task 2), turbo gates (Task 4).
- Produces: `pnpm release:version`, `pnpm release:check`, `pnpm release`.

- [ ] **Step 1: Write the version wrapper**

Create `scripts/changeset-version.mjs`:

```js
import {spawnSync} from 'node:child_process'

// changeset version does NOT update the lockfile; resync so --frozen-lockfile CI passes.
function run(cmd, args) {
  const r = spawnSync(cmd, args, {stdio: 'inherit', shell: false})
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('pnpm', ['exec', 'changeset', 'version'])
run('pnpm', ['install', '--lockfile-only'])
```

- [ ] **Step 2: Add the root scripts**

In root `package.json` `scripts`:

```jsonc
"changeset": "changeset",
"release:version": "node scripts/changeset-version.mjs",
"release:check": "turbo run build publint attw",
"release": "turbo run build publint attw && changeset publish"
```

- [ ] **Step 3: Verify the validation gate runs clean**

```bash
pnpm release:check
```

Expected: build + publint + attw all pass for the 12 packages.

- [ ] **Step 4: Verify a publish dry-run rewrites workspace specifiers**

```bash
pnpm -r publish --dry-run --no-git-checks 2>&1 | grep -c 'workspace:' | grep -qx 0 && echo NO-WORKSPACE-LEAK
```

Expected: `NO-WORKSPACE-LEAK` (no residual `workspace:` in the would-be-published manifests).

- [ ] **Step 5: Commit**

```bash
git add scripts/changeset-version.mjs package.json
git commit -m "build: add release scripts with lockfile-resync version wrapper"
```

---

### Task 6: CI and release workflows (SHA-pinned) + CODEOWNERS

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/CODEOWNERS`

**Interfaces:**

- Consumes: `release:version`, `release` scripts (Task 5); normalize `--check` (Task 2).
- Produces: green `ci.yml` on PRs/push; `release.yml` that opens the Version PR and publishes via OIDC.

- [ ] **Step 1: Resolve action commit SHAs (no floating tags)**

```bash
gh api repos/actions/checkout/commits/v4 --jq .sha
gh api repos/pnpm/action-setup/commits/v4 --jq .sha
gh api repos/actions/setup-node/commits/v4 --jq .sha
gh api repos/changesets/action/commits/v1 --jq .sha
```

Record each SHA; substitute for `<sha-...>` below.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  workflow_call: {}
  pull_request: {}
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha-checkout>
      - uses: pnpm/action-setup@<sha-pnpm>
      - uses: actions/setup-node@<sha-setup-node>
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm i --frozen-lockfile
      - run: node scripts/normalize-pkg-meta.mjs --check
      - run: turbo run build typecheck lint test
```

- [ ] **Step 3: Write `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    branches: [main]
concurrency: ${{ github.workflow }}-${{ github.ref }}
permissions:
  id-token: write
  contents: write
  pull-requests: write
jobs:
  test:
    uses: ./.github/workflows/ci.yml
  release:
    needs: test
    runs-on: ubuntu-latest
    environment: npm-publish
    steps:
      - uses: actions/checkout@<sha-checkout>
      - uses: pnpm/action-setup@<sha-pnpm>
      - uses: actions/setup-node@<sha-setup-node>
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: npm i -g npm@latest
      - run: pnpm i --frozen-lockfile
      - uses: changesets/action@<sha-changesets>
        with:
          version: pnpm release:version
          publish: pnpm release
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: 'true'
          NPM_TOKEN: ''
```

- [ ] **Step 4: Write `.github/CODEOWNERS`**

```
/.changeset/            @omridevk
/packages/*/package.json @omridevk
/.github/workflows/     @omridevk
```

- [ ] **Step 5: Validate the workflow YAML**

```bash
pnpm dlx action-validator .github/workflows/ci.yml && pnpm dlx action-validator .github/workflows/release.yml
```

Expected: no schema errors. (If `action-validator` is unavailable, confirm with `gh workflow list` after pushing a branch.) Confirm no `<sha-...>` placeholder remains: `grep -r '<sha-' .github && echo UNPINNED || echo PINNED` → `PINNED`.

- [ ] **Step 6: Commit**

```bash
git add .github/
git commit -m "ci: add CI and OIDC release workflows with changesets"
```

---

### Task 7: Bootstrap the first release (operational runbook)

**Files:**

- Create: `.changeset/<generated>.md` (first changeset)
- Modify: 12 `packages/*/package.json` versions → `0.1.0` (by `changeset version`)
- Create/modify: `packages/*/CHANGELOG.md` (by `changeset version`)

This task is operational and partly performed on npmjs.com and GitHub settings. It is gated on Tasks 1-6 merged to `main`. **npm is immutable: no rollback, forward-fix only.**

- [ ] **Step 1: Reserve the 12 names and create a short-lived token**

On npmjs.com: ensure the `@opendui` org restricts publish to members; create a **granular token** scoped to `@opendui/*`, publish-only, no delete/deprecate, expiry ≤ 7 days. Keep it out of git.

- [ ] **Step 2: Author the first changeset**

```bash
pnpm changeset
```

Select all packages, choose **minor**, write a summary (e.g. "Initial public release"). Confirms `0.1.0` lockstep.

- [ ] **Step 3: Version + resync lockfile, then review**

```bash
GITHUB_TOKEN=$(gh auth token) pnpm release:version
git diff -- packages/*/package.json
```

Expected: all 12 at `0.1.0`; CHANGELOGs written; lockfile updated. Commit:

```bash
git add packages/*/package.json packages/*/CHANGELOG.md .changeset/ pnpm-lock.yaml
git commit -m "chore: release 0.1.0"
```

- [ ] **Step 4: Bootstrap publish locally with the token (no provenance)**

```bash
NPM_TOKEN=<token> npm config set //registry.npmjs.org/:_authToken=<token>
pnpm release
```

Expected: all 12 publish at `0.1.0`. Verify: `npm view @opendui/aidx-core version` → `0.1.0`.

- [ ] **Step 5: Enable OIDC trusted publishing per package**

On npmjs.com, for **each** `@opendui/*` package → Settings → Trusted Publisher → GitHub Actions:

- Repository: `omridevk/aidx`
- Workflow filename: `release.yml`
- Environment: `npm-publish`

- [ ] **Step 6: Delete the bootstrap token**

Revoke the granular token on npmjs.com and `npm config delete //registry.npmjs.org/:_authToken`. All future releases use OIDC.

- [ ] **Step 7: End-to-end OIDC smoke (`0.1.1`)**

```bash
pnpm changeset   # patch, all packages, "verify OIDC release path"
git add .changeset/ && git commit -m "chore: trigger OIDC release smoke" && git push origin main
```

`release.yml` opens the "Version Packages" PR. Merge it. Expected: the release job publishes `0.1.1` via OIDC; `npm view @opendui/aidx-core` shows the **provenance** badge / `npm view @opendui/aidx-core dist.attestations`.

---

## Self-Review

**Spec coverage:** §4.1 config → Task 1. §4.2 metadata + `workspace:^` + README → Task 2. §4.3 turbo publint/attw → Task 4. §4.4 release scripts → Task 5. §4.5/§4.6 ci/release YAML + provenance env + registry-url + npm upgrade + concurrency → Task 6. §4.7 stories/fixtures exclusion (maps kept) → Task 3. §4.8 CODEOWNERS + SHA-pin + protected env → Task 6 + Task 7 (env). §5 bootstrap runbook → Task 7. §6 workspace rewrite verify → Task 5 Step 4; partial-publish note → Task 7 header. §7 DoD checks distributed across Tasks 2/3/5/6/7. Branch protection + `pnpm audit` are repo-settings/optional steps noted in spec §4.8 — branch protection is a GitHub settings action (Task 7 prerequisite); `pnpm audit` may be added to `ci.yml` Step 2 as a non-blocking line if desired (flagged, not yet a task to keep first release unblocked).

**Placeholder scan:** Action SHAs are resolved by an explicit command (Task 6 Step 1) and asserted non-placeholder (Step 5) — not a TBD. Keyword lists are concrete in the script. No "implement later".

**Type consistency:** `normalizePackage(pkgPath, dir, { write })` and `REPO_SLUG` exported in Task 2 match the test's imports. `release:version` / `release` / `release:check` script names are consistent across Tasks 5, 6, 7.

**Note added during review:** `pnpm audit --prod --audit-level=high` (spec §4.8) is not yet wired as a blocking gate to avoid blocking the first release on a pre-existing advisory; add it to `ci.yml` once the dep tree is audited clean.
