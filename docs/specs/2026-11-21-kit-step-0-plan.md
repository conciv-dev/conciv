# Test kits, step 0 (defects and ground) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three kit defects every later item stands on (the engine reading the developer's real environment, `mount` hanging when the chat is open, `session.tool` not reaching a direct tool), and find out what the missing Navigation API does in happy-dom.

**Architecture:** `@conciv/harness-testkit` owns the engine a test runs (`createHarnessEngine`); `@conciv/plugin-testkit` `createEngine` forwards to it and adds `mount` for happy-dom and browser mode. Each fix lands in the kit file that owns the behaviour and is proven by a throwaway test that is run and never committed. The real tests are written only after every missing kit piece exists (the maintainer's order, 2026-11-21).

**Tech Stack:** TypeScript (strict, NodeNext), vitest 5.1 (node, happy-dom, browser mode projects from `conciv()` of `@conciv/unplugin`), Testing Library (`@solidjs/testing-library`), Effect `ConfigProvider`, MCP SDK client.

**Spec:** `docs/specs/kit-plan.md` (step 0). This plan covers step 0 only; steps 1 to 4 each get their own plan after this one lands, because each later step's tests need labels and shapes read from the code at that time.

## Global Constraints

- Worktree `/Users/omrikatz/Public/web/aidx-wt-kit-mounts`, branch `test/plugin-testkit-mounts`. Local commits only, by pathspec. Never push, never open a PR, never `--no-verify`.
- A test contains only: kit calls, Testing Library queries by role, label or text, user-event, asserts. No mocks, no polling (`vi.waitFor`, `expect.poll`), no private helper around the engine, no code written as strings, no test ids, no CSS or DOM-structure reads.
- Node and happy-dom tests sit next to their source: `src/x.test.ts`, `src/x.dom.test.tsx`. Browser mode: `src/<area>.browser.test.tsx`.
- Zero code comments in TS. Functions, not classes. No identifier ending in "Of". No `any`, `as`, `@ts-ignore`.
- No new dependency without the maintainer's yes. None is needed here.
- No new kit export beyond what a task names. A task that needs more stops and reports.
- NO test file is committed in this plan. Every test below is a throwaway proof: written in a throwaway worktree off the branch head (`git worktree add ../aidx-wt-kit-proof <head>`, `pnpm install`), run there, its output pasted in the report, a copy kept in the lane's scratchpad, the worktree removed after. The kit change itself is made and committed in `aidx-wt-kit-mounts`. Order per task: the failing run happens in a proof worktree made at the head BEFORE the change; after the kit commit the proof worktree is made again at the NEW head, the proof files are copied back from the scratchpad, and the passing run happens there. The orchestrator reruns each proof itself before the task counts as done.
- Where a task says "Test:", read "Throwaway proof:". Test files, and anything a proof needs outside the kit (the app's devDependencies and `conciv()` in Task 2), stay in the throwaway worktree and are left out of every `git add`.
- Gates per task: `turbo run typecheck --filter=@conciv/harness-testkit --filter=@conciv/plugin-testkit --filter=@conciv/plugin-test-runner` (plus `--filter=@conciv/app` in Task 2; no `test` task, since no test file is committed) with `TURBO_CONCURRENCY=1 VITEST_MAX_FORKS=1`, `oxlint`, `oxfmt --check`, `fallow audit --format json --quiet --explain --gate-marker agent`, `pnpm exec conciv-publish check-turbo-depends-on`.
- Subagents are Opus and are told "You are a subagent. Don't run memo".

## Review Focus

1. A direct tool that answers with several content parts (a queue notice before the result, or a result with an image as `ios_screenshot` gives): `session.tool().call` returns the list of parts unchanged, exactly as a code-mode reply with several parts already does. Nothing is dropped. Covered by Task 1 Step 3.
2. A developer shell that already holds `CONCIV_SESSION_ID`, `CONCIV_HOME` or an API key: the kit engine must start and must not see them. Covered by Task 3's unit test.
3. A plugin tool that still runs through code mode (`open`): it must keep working after Task 1. Covered by Task 1's second proof.
4. The app opened with its chat already open, in browser mode as well as happy-dom: `mount` must resolve. Covered by Task 2 in both projects.
5. The app mounted closed (today's only working case) must still resolve after Task 2. Covered by Task 2's second test.

---

Run order: Task 1, Task 3, then Task 4 (the Navigation run, which also sets up the throwaway app proof), then Task 2, then Task 5. Task 4 runs before Task 2 because an unknown Navigation failure in happy-dom could make Task 2's proof fail for the wrong reason.

### Task 1: `session.tool` reaches a direct tool

**Files:**

- Modify: `packages/harness-testkit/src/call-tool.ts`
- Modify: `packages/harness-testkit/src/README.md` (the `call-tool.ts` line)
- Test: `packages/plugins/test-runner/src/tools.test.ts`
- Create: `.changeset/kit-tool-reaches-direct-tools.md` (`@conciv/harness-testkit` patch)

**Interfaces:**

- Consumes: `createEngine` and `engine.session.tool(name).call(input)` from `@conciv/plugin-testkit/node` (existing).
- Produces: unchanged signature `callTool(apiBase: string, session: string, name: string, input: unknown): Promise<unknown>`. New behaviour: when the engine's MCP tool list has a tool named `name`, it is called by that name; otherwise the call goes through `execute_typescript` as today.

Facts (read): the engine lists direct tools by their own name on `/api/mcp` (`packages/core/src/api/mcp.ts:372-376`); a direct reply can carry queue notices before the result (`mcp.ts:228-232`); `test_runner_status` is direct (`packages/plugins/test-runner/src/tools.ts:10,52-58`); `open` is code mode (`packages/plugin-host/src/core/tool/plugin/server.ts:223-228`).

- [ ] **Step 1: Write the failing tests**

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('the agent reads the last test result before any run', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  const status = await engine.session.tool('test_runner_status').call({})

  expect(status).toEqual({summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []})
})

test('a tool that runs through code mode still answers', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  const opened = await engine.session.tool('open').call({file: 'src/app.ts'})

  expect(opened).toEqual({ok: true, file: 'src/app.ts'})
})
```

- [ ] **Step 2: Run to verify the first fails**

Run: `cd packages/plugins/test-runner && VITEST_MAX_FORKS=1 pnpm exec vitest run --project node src/tools.test.ts`
Before any proof run in a fresh proof worktree: `pnpm exec turbo run build --filter=@conciv/harness-testkit... --filter=@conciv/plugin-testkit... --filter=@conciv/plugin-test-runner...` and then `pnpm exec turbo run build:types --filter=@conciv/harness-testkit --filter=@conciv/plugin-testkit` (each kit and its own dependencies must be built; the kits are peers of the plugin, so naming only the plugin does not build them).
Expected: the first test FAILS with `'external_test_runner_status' is not defined` (a ReferenceError from the code-mode sandbox: the call went through `execute_typescript`, where a direct tool does not exist; observed in the real run, 2026-11-21); the second PASSES (if it does not, stop and report what `open` answered). If the first test's expected value differs from what the tool really answers before a run, stop and report the real value before changing the assert.

- [ ] **Step 3: Change `callTool` in `packages/harness-testkit/src/call-tool.ts`**

After `client.connect`, read `client.listTools()`. If a listed tool has `name`, call `client.callTool({name, arguments: input ?? {}})`; else keep the `execute_typescript` path. Both paths decode with the existing `readReply`: one text part is parsed as JSON (on the direct path WITHOUT the `{result}` unwrap that `decodeReply` does for `execute_typescript`, since a direct tool's own output may have a `result` field), several parts come back as the content list, `isError` and a truncated reply throw. No part is dropped or guessed at: a direct tool can answer with a result plus images (`packages/plugins/ios/src/tools.ts:103`, `packages/contract/src/code-reply.ts:38-43`) and a queue notice can come first (`packages/core/src/api/mcp.ts:228-232`).

- [ ] **Step 4: Run to verify both pass** (proof worktree made again at the new head)

Run: `VITEST_MAX_FORKS=1 pnpm exec vitest run --project node src/tools.test.ts` in `packages/plugins/test-runner`.
Expected: 2 tests pass.

- [ ] **Step 5: Gates, then commit the kit change only** (the commit comes before Step 4's passing run)

```bash
git add packages/harness-testkit/src/call-tool.ts packages/harness-testkit/src/README.md .changeset/kit-tool-reaches-direct-tools.md
git commit -m "fix(harness-testkit): session.tool calls a direct tool by its own name"
```

---

### Task 2: `mount` resolves when the chat is already open

**Files:**

- Modify: `packages/plugin-testkit/src/mount.ts`
- Modify: `packages/plugin-testkit/src/README.md` (the `mount.ts` line)
- Modify: `apps/conciv/package.json` (devDependencies: `@conciv/unplugin`, `@conciv/plugin-testkit`, `@conciv/harness-testkit`, `@conciv/vitest-config`, `vitest`, `@solidjs/testing-library`, `@testing-library/user-event`, all `workspace:*` or `catalog:` as `packages/plugins/test-runner/package.json` has them; `"test": "vitest run"`)
- Modify: `apps/conciv/vite.config.ts` (add `conciv()` from `@conciv/unplugin/vite` to `plugins`)
- Test: `apps/conciv/src/routes/panel.dom.test.tsx`, `apps/conciv/src/shell.browser.test.tsx`
- Create: `.changeset/kit-mount-ready.md` (`@conciv/plugin-testkit` patch)

**Interfaces:**

- Consumes: `mount({engine, seed?, route?}): Promise<void>` (existing), `Platform.onInteractive?: () => void` (`apps/conciv/src/index.tsx:26`, fired at `apps/conciv/src/routes/__root.tsx:398`).
- Produces: `mount` resolves when the app has called `onInteractive`. Signature unchanged.

Facts (read): the chat is open only when the route's search has `open=true` (`apps/conciv/src/routes/__root.tsx:255,258`, `apps/conciv/src/lib/session-search-schemas.ts:4`), so the route is `/panel/latest?open=true`; `mount` waits for the button "Open conciv chat" (`mount.ts`); with the chat open the launcher reads "Minimize conciv chat" (`apps/conciv/src/shell/fab.tsx:132-135`); the open chat is `role="dialog"` named "conciv chat agent" (`apps/conciv/src/routes/panel.tsx:169-170`); the embed waits on the same `onInteractive` (`packages/embed/src/mount-impl.tsx:162`).

- [ ] **Step 1: Give the app its test setup**

Add the devDependencies and `conciv()` listed above, run `pnpm install`, and confirm `pnpm exec vitest list` in `apps/conciv` exits 0 with the node, happy-dom and browser projects named.

- [ ] **Step 2: Write the failing tests**

`apps/conciv/src/routes/panel.dom.test.tsx`:

```tsx
import {expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import {createEngine} from '@conciv/plugin-testkit/node'
import {mount} from '@conciv/plugin-testkit/browser'

test('the app opened on its latest session shows the chat', async () => {
  const engine = await createEngine()

  await mount({engine, route: '/panel/latest?open=true'})

  expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeDefined()
})

test('the app opened closed shows its launcher', async () => {
  const engine = await createEngine()

  await mount({engine})

  expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeDefined()
})
```

`apps/conciv/src/shell.browser.test.tsx` holds the first test again, unchanged, so the open-chat case is proven in a real browser.

- [ ] **Step 3: Run to verify the open-chat test fails**

Run: `cd apps/conciv && VITEST_MAX_FORKS=1 pnpm exec vitest run src/routes/panel.dom.test.tsx src/shell.browser.test.tsx`
Expected: "the app opened on its latest session shows the chat" FAILS in both projects inside `mount` itself, with Testing Library's "Unable to find" error for the button named "Open conciv chat" (the launcher reads "Minimize conciv chat" while the chat is open); "the app opened closed shows its launcher" PASSES.

- [ ] **Step 4: Change `makeMount` in `packages/plugin-testkit/src/mount.ts`**

Pass `onInteractive` in the `Platform` it builds, resolving a promise made with `Promise.withResolvers<void>()`, and await that promise in place of the `findByRole` wait. Nothing else in `Platform` changes.

- [ ] **Step 5: Run to verify all pass**

Run the command from Step 3. Expected: 3 tests pass (2 happy-dom, 1 browser mode).

- [ ] **Step 6: Gates, commit the kit change only**

```bash
git add packages/plugin-testkit/src/mount.ts packages/plugin-testkit/src/README.md .changeset/kit-mount-ready.md
git commit -m "fix(plugin-testkit): mount resolves when the app is interactive, open chat included"
```

---

### Task 3: the kit engine stops reading the developer's environment

**Files:**

- Create: `packages/harness-testkit/src/isolated-env.ts`
- Modify: `packages/harness-testkit/src/harness-engine.ts` (the provider record; the `env` option)
- Modify: `packages/plugin-testkit/src/engine.ts` (forward `env`)
- Modify: both kit `src/README.md` files
- Test: `packages/harness-testkit/src/isolated-env.test.ts`, `packages/harness-testkit/src/harness-engine.test.ts`
- Create: `.changeset/kit-isolated-environment.md` (both kits, patch)

**Interfaces:**

- Produces: `isolatedEnv(source: NodeJS.ProcessEnv, home: string, temporary: string): Record<string, string | undefined>` in `isolated-env.ts` (file export only).
- Produces: `HarnessEngineOptions.env?: Record<string, string>` and `CreateEngineOptions.env?` with the same type (plain JSON, so it is the same in browser mode; it adds or replaces variables, it does not remove any). Applied after the isolation, before the kit's own `CONCIV_DISABLE_FILEWATCHER: 'true'`.

Rule, adapted from opencode `packages/core/script/test.ts:10-35` (read; ours has no record mode, so no key is ever kept): drop a variable whose name matches `/^(?:AWS|AZURE|GOOGLE|GCP|GCLOUD|VERTEX|OPENAI|ANTHROPIC|GEMINI|XAI|CLOUDFLARE|CF_AIG|SNOWFLAKE|AICORE|GITLAB|NPM_CONFIG)_/i` or `/(?:^|_)(?:API_KEY|AUTHORIZATION|TOKEN|SECRET|PASSWORD|CREDENTIALS?)$/i`; set `HOME`, `XDG_CONFIG_HOME` (`<home>/.config`), `XDG_DATA_HOME` (`<home>/.local/share`), `XDG_CACHE_HOME` (`<home>/.cache`), `XDG_STATE_HOME` (`<home>/.local/state`), `TMPDIR`; on Windows also `USERPROFILE` (the home) and `TMP`, `TEMP` (the temp folder), as opencode `test.ts:34`; keep `PATH`. Ours adds: drop every `CONCIV_*` variable from the source.

- [ ] **Step 1: Write the failing tests**

`isolated-env.test.ts`:

```ts
import {expect, test} from 'vitest'
import {isolatedEnv} from './isolated-env.js'

test('the engine gets a home of its own and none of the developer secrets or conciv variables', () => {
  const source = {
    PATH: '/usr/bin',
    LANG: 'C',
    HOME: '/Users/dev',
    ANTHROPIC_API_KEY: 'k',
    GITHUB_TOKEN: 't',
    CONCIV_SESSION_ID: 'conciv_real',
    CONCIV_HOME: '/Users/dev/.conciv',
  }

  expect(isolatedEnv(source, '/kit/home', '/kit/tmp')).toEqual({
    PATH: '/usr/bin',
    LANG: 'C',
    HOME: '/kit/home',
    XDG_CONFIG_HOME: '/kit/home/.config',
    XDG_DATA_HOME: '/kit/home/.local/share',
    XDG_CACHE_HOME: '/kit/home/.cache',
    XDG_STATE_HOME: '/kit/home/.local/state',
    TMPDIR: '/kit/tmp',
  })
})
```

`harness-engine.test.ts`:

```ts
import {expect, test} from 'vitest'
import {createHarnessEngine} from './harness-engine.js'

test('a variable given to the engine reaches its configuration', async () => {
  await expect(createHarnessEngine({env: {CONCIV_SESSION_ID: 'nope'}})).rejects.toThrow(
    'the configured conciv session id "nope" is not a conciv session id (conciv_...)',
  )
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/harness-testkit && VITEST_MAX_FORKS=1 pnpm exec vitest run src/isolated-env.test.ts src/harness-engine.test.ts`
Expected: the first file FAILS to load (`./isolated-env.js` does not exist); the second test FAILS because `createHarnessEngine` resolves instead of rejecting (an unknown `env` property is ignored at run time). If the second test still does not reject with that message once `env` exists, stop and report: it means the engine does not read that variable from the provider, and the test needs another variable.

- [ ] **Step 3: Implement `isolatedEnv` and use it**

In `createHarnessEngine`, build the provider record as `{...isolatedEnv(process.env, <the kit home>, <a temp folder under the kit root, created with `mkdirSync` before the provider is built>), ...options.env, CONCIV_DISABLE_FILEWATCHER: 'true'}`. The kit home is the folder it already passes as `home` (`join(concivStateDir(root), 'home')`).

- [ ] **Step 4: Forward `env` from `CreateEngineOptions`** in `packages/plugin-testkit/src/engine.ts` `startEngine`. It is plain JSON, so browser mode needs no other change.

- [ ] **Step 5: Run to verify they pass**, then the gates for both kits and `@conciv/plugin-test-runner`.

- [ ] **Step 6: Commit the kit change only**

```bash
git add packages/harness-testkit/src/isolated-env.ts packages/harness-testkit/src/harness-engine.ts packages/harness-testkit/src/README.md packages/plugin-testkit/src/engine.ts packages/plugin-testkit/src/README.md .changeset/kit-isolated-environment.md
git commit -m "fix(testkits): the test engine gets its own home and none of the developer's secrets"
```

Not in this task: code that calls `os.homedir()` directly cannot be reached through the provider. Task 5 covers it.

---

### Task 4: find out what the missing Navigation API does in happy-dom

**Files:** none committed. This task produces a report, not code.

Facts (read): the page plugin calls the global `navigation.addEventListener('currententrychange', ...)` on attach (`packages/plugins/page/src/attachment.ts:329`); happy-dom has no `navigation`; the kit's happy-dom environment (`packages/plugin-testkit/src/dom-environment.ts`) installs none. What nobody has run: whether this throws on every mount, only when a tab attaches, and where the error shows.

- [ ] **Step 1: Set up the throwaway app proof** (Task 2 Step 1, in the proof worktree only) and write Task 2's "the app opened closed shows its launcher" proof.

- [ ] **Step 2: Run it in happy-dom and keep the whole output**

Run: `cd apps/conciv && VITEST_MAX_FORKS=1 pnpm exec vitest run --project happy-dom src/routes/panel.dom.test.tsx > navigation-run.txt 2>&1; echo "vitest exit $?"`, then `grep -n -i "navigation\|ReferenceError\|unhandled" navigation-run.txt`.

- [ ] **Step 3: Run it again with `route: '/panel/latest?open=true'`** (the mount will hang on today's kit; give the run its normal timeout and keep the output the same way). The page renderer attaches once a session is routed (`packages/plugins/page/src/renderer.tsx:39`, built in at `apps/conciv/src/runtime/plugin/builtins.ts:15`).

- [ ] **Step 4: Report to the orchestrator inbox**

State, with the output lines: does a mount in happy-dom reach `attachment.ts:329`; if it does, what fails (a thrown ReferenceError, an unhandled rejection, a logged error, nothing) and whether the test still passes.

- [ ] **Step 5: The fill, inside step 0**

The orchestrator amends this plan with the fill's exact shape from that report (a `navigation` object in `packages/plugin-testkit/src/dom-environment.ts` beside its existing fills, with `addEventListener` and `currentEntry`, and history push and replace firing `currententrychange`), and it is built and proven before Task 2 runs. If the run shows nothing fails, no fill is written and the overall plan's item is closed with the run's output.

---

### Task 5: the test process gets its own home, as opencode

Ruled 2026-11-21: A, a wrapper starts vitest with the isolated environment, and each package's `test` script runs the wrapper.

**Files** (amended after the first real try, 2026-11-21: pnpm does not link a bin that points into `dist` when it installs before the build, a package's own bin is never linked into itself, and `harness-testkit` cannot depend on `plugin-testkit`):

- Create: `packages/harness-testkit/src/run-tests.ts` (the wrapper; it sits beside `isolated-env.ts`, which it imports)
- Modify: `packages/harness-testkit/package.json` and `tsdown.config.ts`: export `./run-tests`
- Create: `packages/plugin-testkit/bin/conciv-test.js`, a committed two-line file (the node shebang, then `import '@conciv/harness-testkit/run-tests'`), so the bin's target exists at install time
- Modify: `packages/plugin-testkit/package.json`: `"bin": {"conciv-test": "./bin/conciv-test.js"}`, and `bin` added to `files`
- Modify the `test` scripts: `packages/plugins/test-runner` runs `conciv-test`; `packages/plugin-testkit` runs `node bin/conciv-test.js` (its own file); `packages/harness-testkit` runs `node dist/run-tests.js` (its own file; turbo builds before test). `packages/oxlint-plugin` keeps `vitest run`: its tests are lint-rule tests with no engine. Every package that later gets kit tests depends on `@conciv/plugin-testkit` and runs `conciv-test`.
- Modify: both kit READMEs, `AGENTS.md` Testing (one line: kit tests run through `conciv-test`, which gives the test process its own home)
- Create: `.changeset/kit-test-wrapper.md` (both kits, patch)

**Interfaces:**

- Consumes: `isolatedEnv(source, home, temporary)` from Task 3 (a file import inside `harness-testkit`; no new export of it).
- Produces: the bin `conciv-test [...vitest args]`. It makes a folder with `mkdtempSync(join(tmpdir(), 'conciv-test-home-'))` and `<home>/tmp`, spawns `vitest run` plus its own arguments with `env: isolatedEnv(process.env, home, join(home, 'tmp'))` and inherited stdio, forwards SIGINT and SIGTERM to the child, removes the folder when the child exits, and exits with the child's code. Shape as opencode `packages/core/script/test.ts:5-8,37-54` (read).

Why (read): `packages/plugin-host/src/core/filesystem/protected.ts:4` and the real harness adapters (`packages/harness/src/codex/models.ts:58`, `claude/index.ts:36`, `opencode/history.ts:29`, `pi/history.ts:74`) call `os.homedir()` directly; vitest's `test.env` reaches only its workers, while browser-mode engines start in vitest's own process (`packages/plugin-testkit/src/test-projects.ts:18,124`). Starting the whole process isolated covers both.

- [ ] **Step 1: Throwaway proof, written first**, in `packages/plugins/test-runner/src/home.test.ts`:

```ts
import {homedir} from 'node:os'
import {basename} from 'node:path'
import {expect, test} from 'vitest'

test('the test process has a home of its own', () => {
  expect(basename(homedir()).startsWith('conciv-test-home-')).toBe(true)
})
```

- [ ] **Step 2: Run it with `pnpm exec vitest run --project node src/home.test.ts`. Expected: FAIL (the home is the developer's).**
- [ ] **Step 3: Write the wrapper, the export and the bin; switch the `test` scripts.**
- [ ] **Step 4: Run it with `pnpm exec conciv-test --project node src/home.test.ts` (proof worktree at the new head). Expected: PASS, and the folder is gone after the run (`ls "$TMPDIR" | grep conciv-test-home-` prints nothing).**
- [ ] **Step 5: Rerun the proofs of Tasks 1, 2 and 3 through `conciv-test`, the browser-mode proof of Task 2 included. Expected: all pass.**
- [ ] **Step 6: Gates (add `publint` and `attw` for both kits, since a bin and an export were added), commit the kit change only**

```bash
git add packages/harness-testkit/src/run-tests.ts packages/harness-testkit/package.json packages/harness-testkit/tsdown.config.ts packages/plugin-testkit/bin/conciv-test.js packages/plugin-testkit/package.json packages/plugin-testkit/src/README.md packages/harness-testkit/src/README.md packages/plugins/test-runner/package.json AGENTS.md pnpm-lock.yaml .changeset/kit-test-wrapper.md
git commit -m "feat(plugin-testkit): conciv-test runs vitest with a home of its own"
```

---

## Open points (the maintainer's)

Answered 2026-11-21: the app's first browser-mode file is `apps/conciv/src/shell.browser.test.tsx` (used here only inside the throwaway proof); the test process gets its own home; all missing kit pieces are written first, then the real tests.

Open: the name of the wrapper's bin (`conciv-test` is the suggestion).

## Review

Reviewed by Codex (`gpt-5.6-sol`, read only) on 2026-11-21. Confirmed against the code and applied: the open-chat route needs `?open=true`; a direct reply keeps all its parts; the proof must run on the new head; the temp folder must exist; `env` is `Record<string, string>`; the Navigation run comes before the mount proof; `test.env` does not reach browser-mode engines.
