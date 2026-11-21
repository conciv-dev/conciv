# `concivTest()`: the kit's vitest setup is one plugin the author adds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A package that has tests installs the kit and adds one plugin to its `vite.config.ts`. The unplugin knows nothing about the kit. The author can override any setting the normal vitest way.

**Architecture:** `@conciv/plugin-testkit/vitest` exports `concivTest()`, a vite plugin whose `config` hook adds the kit's three vitest projects. All test-mode code leaves `@conciv/unplugin`, with its peer and dev dependency on the kit. This replaces Tasks 2 and 3 of `2026-11-21-kit-vitest-config-plan.md`.

**Tech Stack:** as the step 0 plan.

**Spec:** the maintainer, 2026-11-21: "why is unplugin install the testkits?", "this sooooooooo simple", then to the `concivTest()` form: "sure, but we need to make sure it is easily overridable yes?", and on the dependency loops: "we need to fix the cycles".

```ts
import {defineConfig} from 'vitest/config'
import conciv from '@conciv/unplugin/vite'
import {concivTest} from '@conciv/plugin-testkit/vitest'

export default defineConfig({
  plugins: [conciv(), concivTest()],
})
```

## Global Constraints

All of the step 0 plan's "Global Constraints" apply (local commits by pathspec under the commit lock, never push, never `--no-verify`, no test file committed, throwaway proofs failing before and passing at the new head, opus subagents told "You are a subagent. Don't run memo").

- `@conciv/unplugin` has no dependency of any kind on a test kit, and no code that looks for one.
- No option is added to `concivTest()` in this plan. Overriding is done the way vitest already offers: the author writes the setting in their own `test: {...}`.
- No new dependency.

## Facts (read by the orchestrator)

1. Commit `675a7a48f` made the kit an optional peer and a devDependency of the unplugin, and `conciv()` imports `@conciv/plugin-testkit/vitest` in test mode (`packages/unplugin/src/core/vite.ts`, `testConfig`). That is what this plan removes.
2. The kit exports `testProjects()` at `./vitest` (`packages/plugin-testkit/src/test-projects.ts`, commit `9fcf30730`). Each project has `extends: true` and spreads `kitTest()` (timeouts, `expect.poll`, the worker cap) INSIDE the project.
3. The workspace has exactly three dependency loops, all through `packages/plugins/tanstack/package.json` devDependencies `@conciv/embed` and `@conciv/unplugin`, which no file in that package imports (leftovers of its deleted tests), and one of them through the unplugin's new link to the kit. With those two lines and that link gone the workspace has none (computed from the manifests).
4. vitest reads `reporters`, `coverage`, `outputFile` and `teardownTimeout` only at the root of the config, never in a project. A `conciv()` package writes no `test-results.json` and no coverage in CI today (lane report `090203-plugins-p.md`, run at two heads).
5. Passing vitest flags through `turbo run ... -- <flags>` changes the hash of every task in the call, so each CI shard would rebuild its whole graph (same report). That route is dropped.

## Review Focus

1. The author's own setting must win. A value the author writes in `test: {...}` (a timeout, `maxWorkers`, a reporter) is the one the run uses, in all three projects.
2. An author who already has `test.projects`: `concivTest()` must not silently drop theirs. Read what vitest does when a plugin and the user both give projects, and make the result explicit (theirs kept beside the kit's, or a plain error); say which and why.
3. A package with `conciv()` and no `concivTest()`: a plain vitest run, nothing from the kit.
4. The kit's own sub-project guard (`userConfig.test?.name !== undefined`, so a project does not add projects to itself) moves with the code.
5. CI: `test-results.json` and the coverage summary exist after a run of an in-repo kit package.

---

### Task 1: the unplugin lets go of the kit; the loops go

**Files:** `packages/unplugin/src/core/vite.ts`, `packages/unplugin/package.json`, `packages/unplugin/src/core/README.md`, `packages/plugins/tanstack/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`; changesets.

- [ ] Delete from the unplugin: `testConfig`, `isTestkitMissing`, `ModuleNotFoundSchema`, `TESTKIT`, the `env.mode === 'test'` branch that calls them, and the peer, the peer meta and the devDependency on `@conciv/plugin-testkit`. Keep whatever else test mode does there that is not about the kit (read `testing = config.mode === 'test'` at `vite.ts:324` and say what it is for).
- [ ] Remove `@conciv/embed` and `@conciv/unplugin` from the tanstack plugin's devDependencies after confirming with a grep that nothing in the package imports them (its build, its vite config, its stories). If something does, stop and report.
- [ ] Read pnpm's docs for a setting that makes a workspace dependency loop an install error (`disallowWorkspaceCycles`); if pnpm 11 has it, set it in `pnpm-workspace.yaml`. If it does not exist, report that; do not write a checker.
- [ ] **Proof:** `pnpm install` prints no "cyclic workspace dependencies" line, and `turbo run build --dry=json` prints no "Circular package dependency" line; before the change both print. `check-turbo-depends-on` passes. **Commit** `refactor(unplugin): the unplugin does not know the test kit; the workspace has no dependency loop`.

### Task 2: `concivTest()`

**Files:** `packages/plugin-testkit/src/test-projects.ts` (or a new `src/vitest.ts` if that is the smaller diff), `package.json` export map if the file moves, `README.md`, `src/README.md`; `packages/plugins/test-runner/vite.config.ts`; `AGENTS.md` (the two Testing lines that say `conciv()` sets the test projects); `packages/skills/skills/conciv-develop/SKILL.md` and `references/rpc-and-testing.md`; `docs/specs/2026-11-21-real-tests-plan.md` Task 0 line; changeset.

**Interfaces:**

- Produces: `concivTest(): Plugin` from `@conciv/plugin-testkit/vitest`. Its `config` hook returns `{test: {...}}` with the three projects. `testProjects` stops being exported unless something still needs it; say which.
- Overriding. Read how vitest merges a project that has `extends: true` with the root config (which side wins), and how vite merges a plugin's `config` result with the user's config. Then arrange the kit's values so that the author's `test: {...}` wins for every tunable setting (`testTimeout`, `hookTimeout`, `expect.poll`, `maxWorkers`): the kit gives them as defaults at the lowest priority the two merges allow, and keeps inside the projects only what a project needs to exist (name, file patterns, environment, setup files, vite plugins, the browser provider and commands). Write down the merge order you found, with the file and line in vitest and vite you read it from.

- [ ] **Step 1: Proofs** (throwaway, in `packages/plugins/test-runner`, through the committed bin):
  - the three kit-config project tests (`kitcfg/` in the lane scratchpad) pass with `plugins: [conciv(), concivTest()]`;
  - with `test: {testTimeout: 1234}` added to the package's config, a test in each project reads `1234` from its own task timeout (as `kit-config.test.ts` reads 30000 today), and without it reads 30000;
  - with `concivTest()` removed, `vitest` runs as a plain project (no project named `happy-dom`).
- [ ] **Step 2: Failing run** (no `concivTest` export; and the override test reads 30000). **Step 3: Change. Step 4: Passing run; rerun every earlier proof. Step 5: Gates plus `publint` and `attw` for the kit and the unplugin, commit** `feat(plugin-testkit): concivTest() is the kit's vitest setup, and the author's own settings win`.

### Task 3: this repo's CI reporting, in this repo's configs

**Files:** the `vite.config.ts` of each in-repo package that uses `concivTest()` (today `packages/plugins/test-runner`), `packages/vitest-config/src/reporters.ts` only if a root-only helper is missing, its README.

**Interfaces:** an in-repo package adds the repo's reporters and coverage at the ROOT of its own config, the same private helper the packages below the kits already use (`ciTest()` in `packages/harness-testkit/vite.config.ts`). It is the overriding of Task 2 used once. If `ciTest()` carries something that must not be at the root of a kit package (its `globalSetup`), give the root-only part its own small function and say why.

- [ ] **Proof:** `GITHUB_ACTIONS=1`, one throwaway test in test-runner, through the committed bin: `test-results.json` and `coverage/coverage-summary.json` exist after the run; before the change they do not. The job summary: say whether vitest writes one per package and whether the repo's setting turns it off. **Gates, commit** `ci: kit packages report results and coverage through their own config`.

---

## Not in this plan

- `@conciv/app` and `@conciv/uno-preset` as private peers of the kit: the app handing out its own CSS and vite setup, as opencode. Planned next.
- Options on `concivTest()` (a different browser, more instances): none until a real case needs one.
