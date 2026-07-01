# npm Publishing (`@conciv/it` umbrella) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This repo's convention is **inline execution, not subagents**, and **commits are human-gated** (propose, do not auto-commit).

**Goal:** Publish the conciv `@conciv/*` package graph to npm, with `@conciv/it` (renamed from `@conciv/qu`) as the umbrella end users install.

**Architecture:** The release pipeline ALREADY EXISTS (see "Current state"). This plan is the DELTA on top: rename the umbrella, close hygiene gaps, harden the publish guards, do the one-time token bootstrap of `0.0.1`, then switch to the existing tokenless-OIDC pipeline for all subsequent releases.

## Current state — what already exists (do NOT rebuild)

Verified against `main`:

- **`.github/workflows/release.yml`** — tokenless OIDC + provenance release, already hardened: `needs: test` (calls `ci.yml`), `environment: npm-publish`, SHA-pinned actions, no dependency cache in the publish job, SocketDev firewall (`sfw pnpm i --frozen-lockfile`), job-scoped `id-token: write`, `NPM_CONFIG_PROVENANCE`/`PNPM_CONFIG_PROVENANCE: 'true'`, `NPM_TOKEN: ''` (forces OIDC via the `registry-url` `.npmrc`), `npm i -g npm@latest`. Runs `pnpm release:version` (Version PR) and `pnpm release` (publish) via `changesets/action`. **This is the release mechanism. It is done.** It only works once the packages already exist on npm (trusted publishing must bind to an existing package).
- **`.github/workflows/ci.yml`** — the `test` gate: `turbo run typecheck lint test --filter='./packages/*'` + `zizmor`. CI does NOT run `publint`/`attw` — those live in `conciv-publish check`/`release` only.
- **`packages/publish`** (`conciv-publish`): `version` / `check` (turbo build+publint+attw) / `release` (assertVersioned → build+publint+attw → `changeset publish`) / `snapshot <tag>`. Guards in `guards.ts`: `assertValidTag` (argv-injection), `assertVersioned` (refuses 0.0.0 to block `^0.0.0` squat) — currently reads only `packages/*`, MISSING `packages/extensions/*`.
- **`.changeset/config.json`** — `fixed: [["@conciv/*"]]`, `access: "public"`, `updateInternalDependencies: "patch"`.
- The umbrella package (still `@conciv/qu` at `packages/conciv/`) with subpath exports `./plugin/{vite,webpack,rspack,rollup,esbuild,nextjs,nextjs/widget}`.

## Global Constraints

- Product name stays **conciv**; only the npm package `@conciv/qu` → `@conciv/it` changes. Do NOT touch `appName`/`repo` = `'conciv'` in `apps/site/src/lib/shared.ts`.
- Verification = `turbo build`, `pnpm release:check`, grep gates, `npm pack --dry-run`, `changeset status`. No unit tests for renames/config; do not fabricate any. `changeset publish --dry-run` is NOT a real flag — never use it.
- Build via **turbo**, never manual `dist` rebuilds.
- Public set is **19**: umbrella `it` + 18 leaves (plugin, cli, core, harness, protocol, api-client, grab, tools, extension, widget, solid-diffs, solid-streamdown, ui-kit-system, ui-kit-chat, ui-kit-chat-tools, ui-kit-tap, extension-test-runner, extension-whiteboard). Private (never publish): uno-preset, extension-testkit, publish.
- Changesets fixed group DOES version-bump private packages too (default `privatePackages.version: true`), but `changeset publish` skips them (respects `private: true`). A `changeset status` / version diff showing private packages at 0.0.1 is expected; only publish is gated by `private`.
- First published version: **`0.0.1`** (epoch 0). Epoch SemVer is `{EPOCH*1000+MAJOR}.MINOR.PATCH`; day-to-day = normal changesets bumps; an EPOCH jump is a manual one-off, not built now.
- **First-ever publish must use a one-time token, not OIDC** — trusted publishing can only bind to a package that already exists. OIDC takes over from the second release onward.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Commits are human-gated** — propose each and wait.
- Work on `main`. The user may have uncommitted `apps/site` rename edits — do not revert them.

---

### Task 1: Cosmetic cleanup + privatize `uno-preset`

Non-blocking hygiene, done first so later grep/glob gates are clean.

**Files:**

- Delete (untracked orphans, no `package.json` — `rm -rf`, `git rm` would fail): `packages/tool-ui/`, `packages/extensions/dist/`, `packages/test-runner/`
- Modify: `packages/widget/src/styles.css` (stale `tool-ui` comments, lines 9, 32 → mean `@conciv/ui-kit-system`)
- Modify: `packages/widget/uno.config.ts` (stale `tool-ui` comment, line 7)
- Modify: `packages/ui-kit-chat-tools/package.json` (remove `"tool-ui"` keyword, line 9)
- Modify: `packages/uno-preset/package.json` (add `"private": true`)

- [ ] **Step 1: Confirm the three orphans are untracked with no package.json**

Run: `for d in packages/tool-ui packages/extensions/dist packages/test-runner; do echo "$d:"; ls "$d/package.json" 2>&1; git ls-files "$d" | head -1; done`
Expected: each has no `package.json` and empty `git ls-files` (untracked).

- [ ] **Step 2: Delete the three orphan dirs**

Run: `rm -rf packages/tool-ui packages/extensions/dist packages/test-runner`
Expected: gone; `git status` shows no deletions (they were untracked).

- [ ] **Step 3: Fix stale comments + keyword**

`packages/widget/src/styles.css` lines 9, 32: change the `@conciv/tool-ui/tokens.css` / "tool-ui" mentions to `@conciv/ui-kit-system/tokens.css` (the real import already on line 11). `packages/widget/uno.config.ts` line 7: "tool-ui's cards" → "the ui-kit cards". `packages/ui-kit-chat-tools/package.json`: remove the `"tool-ui",` keyword.

- [ ] **Step 4: Privatize `uno-preset`**

`packages/uno-preset/package.json`: add `"private": true`. (Verified devDependency-only; no public dist references it.)

- [ ] **Step 5: Verify build + grep gate**

Run: `pnpm exec turbo run build --filter=@conciv/widget --filter=@conciv/ui-kit-chat-tools`
Expected: PASS.
Run: `git grep -nE "@conciv/tool-ui" -- ':!*/dist/*' ':!pnpm-lock.yaml'`
Expected: no output.

- [ ] **Step 6: Commit** (propose to user first)

```bash
git add -A
git commit -m "chore: drop orphan build dirs, fix stale refs, privatize uno-preset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rename + move the umbrella, AND repoint consumers, in one pass

Rename + repoint MUST land together before any lockfile resync, or the lockfile half-rewrites (`link:` targets keyed by folder name + the `@conciv/qu` importer entries). No `pnpm install` until every reference is `@conciv/it`.

**Files:**

- Move: `packages/conciv/` → `packages/it/` (`git mv`)
- Modify: `packages/it/package.json` (`name`, `repository.directory`, `homepage`, `bugs`, `description`)
- Modify: `packages/it/README.md` (`# @conciv/qu` → `# @conciv/it`, usage examples)
- Modify consumers: `apps/examples/nextjs-app/{package.json,instrumentation-client.ts,instrumentation.ts,next.config.ts}`, `apps/examples/tanstack-start/{package.json,vite.config.ts}`, `apps/site/{package.json,vite.config.ts}`
- Modify comments: `packages/plugin/src/core/extensions.ts:13`, `packages/plugin/src/index.ts:12`
- Finish site docs (user already did the install-chip + some docs): `apps/site/content/docs/{configuration.mdx,index.mdx,usage/quick-terminal.mdx}` (`from 'conciv/plugin/vite'` → `@conciv/it/plugin/vite`). Do NOT touch `how-it-works.mdx` `P(["conciv"])` or `shared.ts`.

- [ ] **Step 1: Move the directory**

Run: `git mv packages/conciv packages/it`
(`packages/conciv/node_modules/*` symlinks are gitignored and not moved; Step 4's install regenerates them.)

- [ ] **Step 2: Rename package + README**

`packages/it/package.json`: `"name": "@conciv/it"`, `repository.directory` → `"packages/it"`, `homepage` → `.../packages/it#readme`, `description` → reference `@conciv/it/plugin/*`. `packages/it/README.md`: title + examples → `@conciv/it`.

- [ ] **Step 3: Repoint every consumer + comment + remaining docs**

Replace `@conciv/qu` → `@conciv/it` in all consumer files above (deps + imports), the two plugin source comments, and `from 'conciv/plugin/vite'` → `@conciv/it/plugin/vite` in the three site docs.

- [ ] **Step 4: Resync the lockfile (only now)**

Run: `git grep -nE "@conciv/qu|packages/conciv" -- ':!pnpm-lock.yaml' ':!docs/superpowers/*'`
Expected: no output BEFORE installing.
Run: `pnpm install --lockfile-only`
Expected: clean; lockfile rewrites `@conciv/it` + `packages/it` `link:` targets in one pass.

- [ ] **Step 5: Full build + typecheck + real-app boot**

Run: `pnpm exec turbo run build typecheck`
Expected: PASS across packages + apps.
Run: `pnpm dev` (tanstack-start), confirm widget mounts + built-in extensions load, no `@conciv/it` resolution error in the console. Kill with `pkill -f "vite dev"` (never `lsof kill` the port).

- [ ] **Step 6: Commit** (propose to user first)

```bash
git add -A
git commit -m "refactor: rename @conciv/qu -> @conciv/it (name + dir), repoint all consumers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Publish-hygiene sweep across the 19 public packages

CI does not run `publint`/`attw` — this task is the real packaging gate. Prove every public package packs correctly with no secret/source leak and resolves against the others.

**Files (verified missing against the repo):**

- Add `LICENSE` (6 missing): `api-client`, `grab`, `extension`, `ui-kit-chat`, `ui-kit-chat-tools`, `extensions/whiteboard`
- Add `README.md` (8 missing): `api-client`, `grab`, `extension`, `ui-kit-system`, `ui-kit-chat`, `ui-kit-chat-tools`, `ui-kit-tap`, `extensions/whiteboard`
- Modify (as needed): any `packages/*/package.json` failing `publint`/`attw`

(`ui-kit-tap` already has a LICENSE; `ui-kit-system` already has a LICENSE — they only need READMEs. `extension-test-runner` already has both.)

- [ ] **Step 1: Run the real release gate**

Run: `pnpm release:check` (= `turbo run build publint attw`)
Expected: PASS for all public packages. Record every failure.

- [ ] **Step 2: Fix `publint`/`attw` failures**

Fix the offending `package.json` (`exports`, `types`, `files`). Re-run `pnpm exec turbo run publint attw --filter=<pkg>` until clean. Show before/after. NOTE: `files` is NOT uniformly `["dist"]` — `@conciv/harness` ships `["dist","plugins"]`, several ui-kit/solid-streamdown packages ship `src/*.css`; these are intentional. Do not "fix" them to `["dist"]`.

- [ ] **Step 3: Add the missing LICENSE + README files**

Copy the root `LICENSE` (MIT) into each of the 6 packages missing it. Add a minimal `README.md` (one-paragraph purpose + install/import) to each of the 8 missing it. Confirm each is a real file (not a symlink) so `npm pack` includes it.

- [ ] **Step 4: Inspect actual tarball contents (secret/source leak)**

Run per public package: `pnpm --filter <pkg> exec npm pack --dry-run --json`
Assert the file list contains NO: `.env*`, `*.pem`, `test/`, `.claude/`, stray sourcemaps (unless intended), NO `workspace:` range, and NO reference to a private package (`uno-preset`/`extension-testkit`/`publish`).
Run: `pnpm exec changeset status --verbose` — confirm the 19 public packages are present (private packages may also show as version-bumped; they must NOT be marked for publish).

- [ ] **Step 5: Commit** (propose to user first)

```bash
git add -A
git commit -m "chore: publish hygiene (LICENSE/README, publint/attw) across public packages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Harden the publish guards (required, before any publish)

The token-authenticated bootstrap (Task 5) runs OUTSIDE the OIDC/environment/reviewer controls, so `conciv-publish`'s own guards are the only safety net there. Two gaps must close first.

**Files:**

- Modify: `packages/publish/src/guards.ts` (extend `assertVersioned`, add `assertPublicSet`)
- Modify: `packages/publish/src/cli.ts` (call `assertPublicSet` in `release` and `snapshot`)

**Interfaces:**

- Produces: `assertPublicSet(cwd): Promise<void>` — hard-fails if the set of non-private `@conciv/*` packages differs from the 19-name allowlist. `assertVersioned` now also walks `packages/extensions/*`.

- [ ] **Step 1: Extend `assertVersioned` to cover `packages/extensions/*`**

In `guards.ts`, change `assertVersioned` to scan both `packages/*` and `packages/extensions/*` (iterate each dir, skip entries without a `package.json`). Same 0.0.0 rejection logic. This closes the hole where `extension-test-runner`/`extension-whiteboard` (public, currently 0.0.0) were never checked.

- [ ] **Step 2: Add `assertPublicSet` with the 19-name allowlist**

In `guards.ts`, add `assertPublicSet(cwd)`: walk `packages/*` + `packages/extensions/*`, collect every non-`private` `@conciv/*` `name`, and throw if that set is not exactly the 19-name allowlist (`@conciv/it, @conciv/plugin, @conciv/cli, @conciv/core, @conciv/harness, @conciv/protocol, @conciv/api-client, @conciv/grab, @conciv/tools, @conciv/extension, @conciv/widget, @conciv/solid-diffs, @conciv/solid-streamdown, @conciv/ui-kit-system, @conciv/ui-kit-chat, @conciv/ui-kit-chat-tools, @conciv/ui-kit-tap, @conciv/extension-test-runner, @conciv/extension-whiteboard`). Report the diff (unexpected extras / missing) in the error. This makes "a new `packages/*` silently publishes" impossible.

- [ ] **Step 3: Wire the guard into `release` and `snapshot`**

In `cli.ts`, call `await assertPublicSet(cwd)` at the start of both `release` and `snapshot` (alongside the existing `assertVersioned` in `release`).

- [ ] **Step 4: Verify the guards**

Run: `pnpm --filter @conciv/publish typecheck` and a quick manual check: temporarily unset `private` on `uno-preset` → `pnpm release:check` still passes (check doesn't guard) but a dry `node -e` calling `assertPublicSet` throws with uno-preset as an unexpected extra. Restore.
Expected: guard fires on drift, passes on the exact 19.

- [ ] **Step 5: Commit** (propose to user first)

```bash
git add packages/publish/src/guards.ts packages/publish/src/cli.ts
git commit -m "feat(publish): assertPublicSet allowlist + assertVersioned covers extensions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: First release — bootstrap `0.0.1` directly via a one-time token

The first-ever publish cannot use OIDC (trusted publishing needs the packages to exist). So publish `0.0.1` once with a token; this creates all 19 packages and sets each package's `latest` to `0.0.1` (the intended default). Offline validation (Task 3) is the safety net — there is no throwaway canary.

**Prerequisite (external, confirm with user):**

- The `@conciv` npm scope exists and you own it.
- A one-time **scope-level** automation token (packages don't exist yet, so it can't be package-scoped), publish rights to `@conciv/*`, shortest expiry npm allows. Put it in `~/.npmrc` or a shell env var ONLY — NEVER a file under the repo.

- [ ] **Step 1: Write the first changeset**

Create `.changeset/initial-release.md`:

```markdown
---
'@conciv/it': patch
---

Initial public release of conciv: install `@conciv/it` and add the plugin from `@conciv/it/plugin/<bundler>`.
```

(Fixed group → one entry bumps all `@conciv/*`. `patch` on `0.0.0` → `0.0.1`.)

- [ ] **Step 2: Version + review the bump**

Run: `pnpm release:version` (= `changeset version` + `pnpm install --lockfile-only`).
Run: `git diff -- '**/package.json'`
Expected: every public `package.json` at `0.0.1`; `workspace:*` internal deps rewritten to a concrete `0.0.1`-based range; private packages also bumped (won't publish). The consumed `.changeset/initial-release.md` is deleted; new `CHANGELOG.md` files appear.

- [ ] **Step 3: Commit the version bump** (propose to user first)

```bash
git add -A
git commit -m "chore: version packages (0.0.1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Bootstrap publish with the token**

With the scope token active in `~/.npmrc`, run: `pnpm release` (= `assertPublicSet` + `assertVersioned` + `turbo build publint attw` + `changeset publish`).
Expected: all 19 public packages publish `@0.0.1` to `latest`. Private packages skipped.

- [ ] **Step 5: Partial-publish recovery (know before you run)**

`changeset publish` publishes sequentially and is resumable: already-published versions are skipped. If it dies mid-loop, some `0.0.1` packages are permanent (npm unpublish window is 72h). Recovery: **do NOT change any version field** (that desyncs the fixed group) — fix the offending manifest and re-run `pnpm release`; it republishes only the missing packages at the same `0.0.1`.

- [ ] **Step 6: Smoke-test `0.0.1` from the registry**

Scratch dir OUTSIDE the repo: `pnpm add -D @conciv/it`, add `import conciv from '@conciv/it/plugin/vite'` to a minimal `vite.config.ts`, run dev, confirm the widget mounts and the whole `@conciv/*` graph resolves from npm.
Expected: works; no missing/private `@conciv/*` errors. (Provenance will be ABSENT on this token-published `0.0.1` — that is expected; OIDC provenance starts at the next release.)

- [ ] **Step 7: Push `main`** (propose first) — nothing to publish (no pending changesets), but lands the version commit so the repo matches npm.

---

### Task 6: Switch to tokenless OIDC for all subsequent releases

Now that the packages exist, register trusted publishers and retire the token. From here, releases go through the existing `release.yml` automatically.

- [ ] **Step 1: Register trusted publishers (per package)**

For each of the 19 public packages: npm package page → **Settings → Trusted Publisher → GitHub Actions** → Organization/repo `conciv-dev/conciv`, Workflow `release.yml`, **Environment `npm-publish`** (binds to the release job's environment gate). Check the settings UI for an **org-level** option; if present, one registration covers all `@conciv/*`.

- [ ] **Step 2: Prove OIDC on a real next release BEFORE retiring the token**

Create a small changeset (e.g. a docs/patch bump), push `main`. `release.yml` runs `test` → opens the "chore: version packages" PR (via `pnpm release:version`). Merge it → `pnpm release` publishes `0.0.2` via OIDC with provenance. Verify on the npm package page that `0.0.2` shows a provenance attestation.
Expected: OIDC publish succeeds; provenance present. (If it fails, the token from Task 5 is still valid as a fallback — do not revoke it until this passes.)

- [ ] **Step 3: Retire the token + lock down (only after Step 2 passes)**

Revoke the bootstrap token on npm; remove the `~/.npmrc` line / `npm logout`; delete any GitHub `NPM_TOKEN` secret if one was ever added. For each package (or org), set npm publishing access to require trusted publisher / 2FA so a leaked token cannot publish. Confirm the `npm-publish` GitHub environment has required reviewers + is restricted to `main`.

- [ ] **Step 4: Confirm steady state**

Run: `git grep -n "_authToken"` — expected no output (no token in the repo). Confirm no `NPM_TOKEN` secret remains. From now on, every release is: changeset → push `main` → merge the Version PR → OIDC publish.

---

### Task 7 (optional hardening — user-gated)

- [ ] **Pin npm in `release.yml`:** `npm i -g npm@latest` runs in the OIDC job before the Socket firewall — an unpinned supply-chain input. Recommend pinning an exact version (`npm@11.6.x`), same comment, bumped deliberately. This edits the hardened workflow, so only with user sign-off. (Default recommendation: do it.)

---

## Self-Review notes

- **Spec coverage:** rename (Task 2), public/private matrix + uno-preset private + orphan cleanup (Task 1), publish hygiene incl. corrected LICENSE(6)/README(8) lists (Task 3), guard hardening (Task 4), Epoch SemVer @ 0.0.1 (Task 5), release pipeline (already exists; used in Tasks 5–6), provenance (starts at 0.0.2 via OIDC), post-publish smoke (Task 5 Step 6). Task 7 is optional.
- **Deviation from spec, flagged:** the spec's "Release mechanism" describes building a workflow with `NPM_TOKEN` + `--provenance`; reality supersedes it (the workflow exists and is tokenless-OIDC). The spec file should get a "superseded" banner on that section.
- **Snapshot canary dropped** (user decision): npm sets `latest` on a package's first publish even with `--tag`, so a canary can't protect `latest` for brand-new packages; it only adds throwaway registry cruft + revert complexity. First publish is a direct token bootstrap of `0.0.1`; offline `publint`/`attw`/`npm pack` (Task 3) is the pre-publish safety net.
- **Guards promoted to required (Task 4):** `assertPublicSet` + `assertVersioned` covering `packages/extensions/*` — they are the only control during the token-auth bootstrap.
- **Token lifecycle:** scope-level token in `~/.npmrc` only; revoked ONLY after OIDC is proven on `0.0.2` (Task 6 Step 2), keeping it as a fallback across the irreversible first publish.
- **No fabricated tests; `changeset publish --dry-run` never used.**
- **External prerequisites:** `@conciv` scope + one-time bootstrap token (Task 5); per-package (or org) trusted-publisher registration (Task 6). Everything else is in-repo and already built.
