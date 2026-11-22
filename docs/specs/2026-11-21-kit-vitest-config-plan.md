# The kit owns its vitest config, and `conciv()` imports it Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plugin author installs one package, adds `conciv()` to `vite.config.ts` and runs `conciv-test`. Nothing private is needed, and nothing searches folders for the kit.

**Architecture:** `@conciv/plugin-testkit` exports its vitest config at `@conciv/plugin-testkit/vitest` and owns every setting in it. `conciv()` from `@conciv/unplugin` loads that export with a plain `import()`, the kit being an optional peer of the unplugin. The repo's CI extras (result file, coverage, reporters) are passed by the repo's CI runner, because vitest reads them at the root only.

**Tech Stack:** as the step 0 plan.

**Spec:** the maintainer's words, 2026-11-21: "the Unplugin will be in charge of that, or even the testkit should have an export for a config for vitest" and "since when we need to tell vitest where to look?". `docs/specs/kit-plan.md` for the kits.

## Global Constraints

All of the step 0 plan's "Global Constraints" apply: commit locally by pathspec under the commit lock, never push, never `--no-verify`, no test file committed, proofs are throwaway and run through the committed bin, failing run on the head before the change and passing run at the new head, subagents are opus and told "You are a subagent. Don't run memo".

- No new dependency. `@conciv/plugin-testkit` becomes an optional peer of `@conciv/unplugin`; that is a declaration of an existing workspace package, not a new one.
- No behaviour change for a test run: the three projects, their file patterns, environments, setup files and timeouts stay what they are. The rerun of every earlier proof shows it.

## Facts (read by the orchestrator)

1. `conciv()` in test mode reads the author's `package.json`, walks up `node_modules` for the kit and imports `dist/test-projects.js` by path (`packages/unplugin/src/core/vite.ts:58-98`). The unplugin lists the kit in no dependency field.
2. The kit's exports are `./node` and `./browser` only; `src/test-projects.ts` is a build entry with no export (`packages/plugin-testkit/package.json`, `tsdown.config.ts`).
3. `test-projects.ts:10-16` imports `POLL_TIMEOUT_MS`, `TANSTACK_AI_SOLID_DEPS`, `browserOptimizeDeps`, `ciTest`, `ciTestSolidBrowser` from the private `@conciv/vitest-config` (`packages/vitest-config/src/reporters.ts`, 81 lines). That import is why vitest-config is a peer of the kit.
4. vitest 5.1.0 types `reporters`, `coverage`, `teardownTimeout` and `outputFile` as `NonProjectOptions`: they are root-only and ignored inside a project. `ciTest()` is spread inside each project, so its reporters and coverage do nothing there today.
5. `ciTest()` also gives `testTimeout` 30 000, `hookTimeout` 30 000, `expect.poll` 5 000 / 50, a worker cap read from `VITEST_MAX_FORKS`, and a `globalSetup` that sets `CONCIV_HOME` to `test-results/conciv-home` (`src/setup/conciv-home-setup.ts`). `ciTestSolidBrowser()` adds a setup file that runs Testing Library's `cleanup` after each test.
6. `@conciv/tsconfig` is build-time only in both kits; `@conciv/vitest-config` is build-time only in `@conciv/harness-testkit` (its own `vite.config.ts`). On main both were devDependencies.
7. The release guard counts peers (`packages/publish/src/guards.ts:304-331`), so a private peer aborts a release.

## Review Focus

1. An author's package with `conciv()` and no kit installed: `vitest` starts with no projects added and no error.
2. The kit installed but its config throwing while loading: the error reaches the author, it is not swallowed as "not installed".
3. A CI run of a `conciv()` package: `test-results.json` and the coverage summary exist afterwards (they may not today, Fact 4).
4. `VITEST_MAX_FORKS=1` still caps a run after the kit stops reading it through `ciTest()`.
5. The build graph: no cycle between `@conciv/unplugin` and `@conciv/plugin-testkit`, and `check-turbo-depends-on` passes.

---

### Task 1: the kit owns its vitest config and exports it

**Files:** `packages/plugin-testkit/src/test-projects.ts`, a new `packages/plugin-testkit/src/vitest.ts` (or rename `test-projects.ts` to it: the lane picks the smaller diff), `package.json` (export `./vitest`, peers), `tsdown.config.ts`, `tsdown.types.config.ts`, `src/README.md`; `packages/harness-testkit/package.json`; `.changeset/kit-owns-vitest-config.md`.

**Interfaces:**

- Produces: `@conciv/plugin-testkit/vitest` exporting `testProjects(): TestProjectInlineConfiguration[]`, with types. Same three projects as today.
- `test-projects.ts` imports nothing from `@conciv/vitest-config`. The kit owns: `testTimeout` 30 000, `hookTimeout` 30 000, `expect.poll` `{timeout: 5000, interval: 50}`, the poll timeout it provides to tests, the pre-bundle list (the three `@conciv/ai > @tanstack/ai-solid > ...` entries move in), and Testing Library `cleanup` after each test in the two page projects (in the kit's own happy-dom and browser setup files).
- Dropped from the projects: `reporters`, `coverage`, `teardownTimeout` (root-only, Fact 4).
- `globalSetup` with `CONCIV_HOME`: read whether anything in a kit run still reads `CONCIV_HOME` now that `conciv-test` gives the run its own home and the engine its own state folder. If nothing does, drop it. If something does, stop and report what.
- The worker cap: read whether vitest 5.1.0 itself reads `VITEST_MAX_FORKS` or `VITEST_MAX_WORKERS` (grep its dist). If it reads `VITEST_MAX_FORKS`, drop the kit's own reading. If it reads only `VITEST_MAX_WORKERS`, keep a cap in the kit that reads `VITEST_MAX_FORKS` (AGENTS.md names that variable) and say so.
- Manifests: `@conciv/plugin-testkit` moves `@conciv/vitest-config` and `@conciv/tsconfig` from peers to devDependencies; `@conciv/harness-testkit` does the same. `@conciv/app` and `@conciv/uno-preset` stay as they are: they wait for a ruling.

- [ ] **Step 1: Proof.** In `packages/plugins/test-runner` (it uses `conciv()`), three throwaway tests, one per project (a node test making an engine, a `*.dom.test.tsx` and a `*.browser.test.tsx` mounting the app). Plus two checks run as commands: `grep -r "@conciv/vitest-config" packages/plugin-testkit/dist` prints nothing, and the release guard, called from a throwaway script, no longer lists `@conciv/vitest-config` or `@conciv/tsconfig`.
- [ ] **Step 2: Failing run:** the grep prints lines and the guard lists both. **Step 3: Change. Step 4: Passing run:** the three tests pass through the committed bin, the grep is empty, the guard lists only `@conciv/app` and `@conciv/uno-preset`; rerun every earlier proof. **Step 5: Gates plus `publint` and `attw` for the kit, commit** `feat(plugin-testkit): the kit owns its vitest config and exports it`.

---

### Task 2: `conciv()` imports the kit's config

**Files:** `packages/unplugin/src/core/vite.ts`, `packages/unplugin/package.json` (optional peer `@conciv/plugin-testkit`, and the devDependency that links it inside this repo), `pnpm-lock.yaml`, the unplugin README; `.changeset/unplugin-imports-kit-config.md`.

**Interfaces:**

- `testConfig` becomes: `import('@conciv/plugin-testkit/vitest')`, then `{test: {projects: loaded.testProjects()}}`. When the import fails because that package is not installed (`ERR_MODULE_NOT_FOUND` naming `@conciv/plugin-testkit`), it returns `{}`. Any other failure is rethrown.
- Deleted: `TESTKIT`, `ManifestSchema`, `readManifest`, `installedTestkit`, `findTestkit`, the path import, and the schema that only checked the path import's shape if a typed import makes it unneeded.
- The kit's own package no longer needs a special case (`own.name === TESTKIT`): its `vite.config.ts` does not use `conciv()`.

- [ ] **Step 1: Proof.** The three tests of Task 1 again, plus one throwaway node script that calls the unplugin's vite `config` hook in test mode twice: once as is (projects named `node`, `happy-dom`, `browser` come back), once with the kit made unresolvable (state how: the lane picks an honest way, such as running from a throwaway folder whose `node_modules` has the unplugin and no kit), where it returns no projects and does not throw.
- [ ] **Step 2: Failing run** is not meaningful for the first three (they pass today through the folder walk); the failing run is the grep `grep -n "installedTestkit\|test-projects.js" packages/unplugin/src/core/vite.ts` printing lines. **Step 3: Change. Step 4: Passing run. Step 5: Gates, `turbo run build test typecheck --dry=json` exits 0 with no cycle, `check-turbo-depends-on`, `publint` and `attw` for the unplugin, commit** `refactor(unplugin): conciv() imports the kit's vitest config`.

If the build graph cannot take the edge without a cycle, stop and report the cycle; do not keep the folder walk as a fallback.

---

### Task 3: the repo's CI extras come from the CI runner

**Files:** `packages/vitest-config/src/ci-shards.ts` (and `shards.ts` if the task line is built there), `packages/vitest-config/src/README.md`.

**Interfaces:** first the fact. Run one `conciv()` package's `test` with `GITHUB_ACTIONS=1` and a throwaway test, and see whether `test-results.json` and `coverage/coverage-summary.json` are written at the current head. Report it either way.

- If they are not written today: the CI runner passes them at the root, where vitest reads them: `turbo run ... test -- --reporter=default --reporter=github-actions --reporter=json --outputFile.json=test-results.json --coverage.enabled --coverage.provider=v8 --coverage.reporter=json-summary`, only for the `test` task and only under `GITHUB_ACTIONS`. Check that the args reach `conciv-test` and through it vitest, and that packages whose `test` is not vitest are not broken by them (list every `test` script in the repo first; if any is not vitest, stop and report).
- If they are written today, say what writes them and change nothing here.

- [ ] **Step 1: The fact check above. Step 2: Change only if needed. Step 3: Proof:** the two files exist after the run with the new line. **Step 4: Gates, commit** `ci: the test run's result file and coverage are set by the CI runner`.

---

## Not in this plan: needs the maintainer

1. `@conciv/app` and `@conciv/uno-preset` are still private peers of the kit, because `mount` renders the real app. Until that is ruled, a release from this branch still aborts on those two.
2. Several runtime imports of the kit are devDependencies only (`vite-plugin-solid`, `unocss`, `@vitest/browser-playwright`, `@solidjs/testing-library`, `solid-js`, `happy-dom`). How they are declared for an author is the same ruling.
3. `packages/harness-testkit`, `packages/plugin-testkit` and `packages/oxlint-plugin` run their own tests on a plain vitest config that uses the private package, not on `conciv()`. They sit below the kit, so they cannot use it. Left as is.
