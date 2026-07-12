# Extension-Testkit Harness DI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tests inject a harness object through `start()` → `getExtensionTestApi`, so extensions can test harness-dependent features (terminal's tty) against the real engine.

**Architecture:** `makeApp` already accepts `harness?: HarnessAdapter` (used over registry lookup). Thread the same optional through `StartOpts`, forward it from `bootExtensionServer`/`getExtensionTestApi`, give `createFakeHarness` an opt-in `tty` command, and add a terminal IT on the sanctioned `getExtensionTestApi` path that reloads the page and asserts the restored terminal.

**Tech Stack:** TypeScript, vitest, playwright (via extension-testkit), node-pty (server-side, already wired), pnpm workspace.

## Global Constraints

- Zero code comments; functions only, no classes; no `else`; no non-null assertions; no `any`/casts (repo style rules).
- Never add test code to a shipped package's `src` beyond the `harness` pass-through parameter in `start.ts` (which is DI, not test code).
- Commit with pathspec only: `git commit -m "..." -- <paths>`; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run all commands from the repo root `/Users/omrikatz/Public/web/aidx` or the named package dir.
- Build via turborepo: `pnpm turbo build --filter=<pkg>` after editing shipped src, before running dependent tests.
- Spec: `docs/superpowers/specs/2026-07-12-extension-testkit-harness-di-design.md`.

---

### Task 1: `start()` forwards an injected harness

**Files:**

- Modify: `packages/core/src/start.ts` (StartOpts at lines 13-24, appOpts at lines 60-71)
- Test: `packages/core/test/start-harness-di.it.test.ts` (create)

**Interfaces:**

- Consumes: `makeApp` already has `harness?: HarnessAdapter` (`packages/core/src/app.ts:53`).
- Produces: `StartOpts.harness?: HarnessAdapter` — Task 3 passes it from the testkit.

- [ ] **Step 1: Write the failing test**

`createFakeHarness` returns a harness whose id (`fake-start-di`) is NOT in the registry. If the pass-through is missing, `makeApp` falls back to `requireHarness('fake-start-di')` and `start()` throws — so "boots cleanly" is the assertion.

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createFakeHarness} from '@conciv/harness-testkit'
import {start} from '../src/start.js'

describe('start harness DI', () => {
  it('boots with an injected harness that is not in the registry', async () => {
    const harness = createFakeHarness({id: 'fake-start-di', text: 'ok'})
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-di-'))
    const engine = await start({
      options: {stateRoot: root, systemPrompt: false, harness: harness.id},
      root,
      harness,
      extensions: [],
      launchEditor: () => {},
    })
    expect(engine.cfg.harness).toBe('fake-start-di')
    await engine.stop()
    rmSync(root, {recursive: true, force: true})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/core && pnpm vitest run test/start-harness-di.it.test.ts`
Expected: FAIL — TypeScript error `harness does not exist in type StartOpts`, or at runtime `unknown harness "fake-start-di"` from `requireHarness`.

- [ ] **Step 3: Implement the pass-through**

In `packages/core/src/start.ts`, add the import and two lines:

```ts
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
```

In `StartOpts` (after `extensions?: AnyExtension[]`):

```ts
  harness?: HarnessAdapter
```

In `appOpts` (after `extensionConfig: cfg.extensions,`):

```ts
    harness: opts.harness,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/core && pnpm vitest run test/start-harness-di.it.test.ts`
Expected: PASS

- [ ] **Step 5: Guard against regressions and commit**

Run: `cd /Users/omrikatz/Public/web/aidx && pnpm turbo build typecheck lint --filter=@conciv/core` — expect all green.

```bash
cd /Users/omrikatz/Public/web/aidx
git commit -m "feat(core): start() forwards an injected harness to makeApp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- packages/core/src/start.ts packages/core/test/start-harness-di.it.test.ts
```

---

### Task 2: `createFakeHarness` opt-in tty

**Files:**

- Modify: `packages/harness-testkit/src/create-fake-harness.ts`
- Test: `packages/harness-testkit/test/create-fake-harness.test.ts` (create)

**Interfaces:**

- Consumes: `TtyCommand`, `TtyCommandOpts` from `@conciv/protocol/terminal-types` (`{bin, args, env, unsetEnvPrefixes?}` / spawn context).
- Produces: `createFakeHarness(opts?: {id?: string; text?: string; tty?: {command(opts: TtyCommandOpts): TtyCommand}})` — Task 4 passes a bash tty.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {createFakeHarness} from '../src/create-fake-harness.js'

describe('createFakeHarness tty', () => {
  it('has no tty by default', () => {
    expect(createFakeHarness().tty).toBeUndefined()
  })

  it('exposes an injected tty command', () => {
    const command = () => ({bin: 'bash', args: ['-i'], env: {}})
    const harness = createFakeHarness({tty: {command}})
    expect(harness.tty?.command({cwd: '/', harnessSessionId: 's', resume: false}).bin).toBe('bash')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/harness-testkit && pnpm vitest run test/create-fake-harness.test.ts`
Expected: FAIL — `tty` not in opts type / `harness.tty` undefined in the second case.

- [ ] **Step 3: Implement**

In `packages/harness-testkit/src/create-fake-harness.ts`:

```ts
import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'
```

Change the signature and thread the field into `defineHarness`:

```ts
export function createFakeHarness(
  opts: {id?: string; text?: string; tty?: {command(opts: TtyCommandOpts): TtyCommand}} = {},
): FakeHarness {
```

Inside the `defineHarness({...})` input, after `capabilities: {...},` add:

```ts
      tty: opts.tty,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/harness-testkit && pnpm vitest run test/create-fake-harness.test.ts`
Expected: PASS. Also run the package suite: `pnpm vitest run` — all green (existing consumers unaffected: default stays tty-less).

- [ ] **Step 5: Commit**

```bash
cd /Users/omrikatz/Public/web/aidx
git commit -m "feat(harness-testkit): opt-in tty command on createFakeHarness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- packages/harness-testkit/src/create-fake-harness.ts packages/harness-testkit/test/create-fake-harness.test.ts
```

---

### Task 3: extension-testkit forwards the harness

**Files:**

- Modify: `packages/extension-testkit/src/boot-server.ts`
- Modify: `packages/extension-testkit/src/get-extension-test-api.ts` (type at lines 9-12, call at line 28)
- Test: `packages/extension-testkit/test/boot-server.it.test.ts` (add a case)

**Interfaces:**

- Consumes: `StartOpts.harness` (Task 1), `createFakeHarness` (Task 2).
- Produces: `bootExtensionServer(extension, opts?: {harness?: HarnessAdapter})`; `ExtensionUnderTest` gains `harness?: HarnessAdapter` — Task 4 uses `getExtensionTestApi({server, clientEntry, harness})`.

- [ ] **Step 1: Write the failing test**

Read `packages/extension-testkit/test/boot-server.it.test.ts` first and match its existing extension fixture/style for the extension argument; add this case (adjust the extension fixture import to whatever the file already uses):

```ts
it('boots with an injected harness that is not in the registry', async () => {
  const harness = createFakeHarness({id: 'fake-ext-boot', text: 'ok'})
  const {apiBase, stop} = await bootExtensionServer(extensionFixture, {harness})
  expect(apiBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  await stop()
})
```

With `import {createFakeHarness} from '@conciv/harness-testkit'` added to the test imports (extension-testkit already depends on harness-testkit).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/extension-testkit && pnpm vitest run test/boot-server.it.test.ts`
Expected: FAIL — `bootExtensionServer` takes 1 argument.

- [ ] **Step 3: Implement forwarding**

`packages/extension-testkit/src/boot-server.ts` — new signature; when a harness is injected, its id also becomes the config's harness id so the resolved config is self-consistent:

```ts
import type {HarnessAdapter} from '@conciv/protocol/harness-types'

export async function bootExtensionServer(
  extension: AnyExtension,
  opts: {harness?: HarnessAdapter} = {},
): Promise<BootedServer> {
  const root = await mkdtemp(join(tmpdir(), 'conciv-testkit-'))
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false, harness: opts.harness?.id},
    root,
    harness: opts.harness,
    extensions: [extension],
    launchEditor: () => {},
  })
```

(`options.harness` is `string | undefined` in `ConcivConfig`; `undefined` keeps today's default — verify `ConcivConfig.harness` is optional in `packages/core/src/config.ts` line ~30, it falls back `options.harness ?? env.CONCIV_HARNESS ?? 'claude'`.)

`packages/extension-testkit/src/get-extension-test-api.ts`:

```ts
export type ExtensionUnderTest = {
  server: AnyExtension
  clientEntry: string
  harness?: HarnessAdapter
}
```

with `import type {HarnessAdapter} from '@conciv/protocol/harness-types'`, and the boot call becomes:

```ts
const {apiBase, extensionContexts, stop} = await bootExtensionServer(extension.server, {harness: extension.harness})
```

If `@conciv/protocol` is missing from `packages/extension-testkit/package.json` dependencies, add `"@conciv/protocol": "workspace:^"` and run `pnpm install`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/extension-testkit && pnpm vitest run test/boot-server.it.test.ts`
Expected: PASS (new case and all existing cases — omitted harness keeps registry behavior).

- [ ] **Step 5: Commit**

```bash
cd /Users/omrikatz/Public/web/aidx
git commit -m "feat(extension-testkit): accept an injected harness through getExtensionTestApi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- packages/extension-testkit/src packages/extension-testkit/test packages/extension-testkit/package.json pnpm-lock.yaml
```

---

### Task 4: terminal adopts getExtensionTestApi with a reload IT

**Files:**

- Modify: `packages/extensions/terminal/package.json` (devDependencies)
- Test: `packages/extensions/terminal/test/terminal-view.it.test.ts` (create)

**Interfaces:**

- Consumes: `getExtensionTestApi({server, clientEntry, harness})` (Task 3), `createFakeHarness({id, text, tty})` (Task 2), `makeRpcClient` from `@conciv/harness-testkit`.
- Produces: the acceptance test for the whole spec.

- [ ] **Step 1: Add the devDependency**

Add to `packages/extensions/terminal/package.json` devDependencies (keep alphabetical): `"@conciv/extension-testkit": "workspace:^"`. Then run `cd /Users/omrikatz/Public/web/aidx && pnpm install --filter @conciv/extension-terminal`.

- [ ] **Step 2: Write the test**

`packages/extensions/terminal/test/terminal-view.it.test.ts` — a11y locators only per `docs/testing-extensions.md`; xterm runs `screenReaderMode: true` so terminal output is reachable via `getByText`. The `$((40+2))` trick makes the OUTPUT (`reload-marker-42`) distinct from the typed input echo.

```ts
import {expect, test} from 'vitest'
import terminal from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {createFakeHarness, makeRpcClient} from '@conciv/harness-testkit'

const bashTty = {
  command: () => ({
    bin: 'bash',
    args: ['--noprofile', '--norc', '-i'],
    env: {TERM: 'xterm-256color', PS1: 'P> '},
  }),
}

test('terminal view survives a page reload with its output restored', async () => {
  const api = await getExtensionTestApi({
    server: terminal,
    clientEntry: '@conciv/extension-terminal/client',
    harness: createFakeHarness({id: 'fake-terminal', text: 'ok', tty: bashTty}),
  })
  try {
    const {page} = api
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await page.getByRole('tab', {name: 'Terminal'}).click()
    await expect.poll(() => page.getByText('P>').first().isVisible(), {timeout: 20_000}).toBe(true)

    await page.keyboard.type('echo reload-marker-$((40+2))')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.getByText('reload-marker-42').first().isVisible(), {timeout: 10_000}).toBe(true)

    const rpc = makeRpcClient(api.apiBase)
    await expect
      .poll(
        async () => {
          const persisted = await rpc.navigation.get()
          return persisted?.entries[persisted.index]?.href ?? ''
        },
        {timeout: 10_000},
      )
      .toMatch(/\/terminal\?.*open=true/)

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect
      .poll(() => page.getByRole('tab', {name: 'Terminal'}).getAttribute('aria-selected'), {timeout: 20_000})
      .toBe('true')
    await expect.poll(() => page.getByText('reload-marker-42').first().isVisible(), {timeout: 20_000}).toBe(true)
  } finally {
    await api.dispose()
  }
}, 90_000)
```

Two verification notes for the implementer:

- If the fab label differs in this host, find it with `page.getByRole('button').allInnerTexts()` — embed ITs use `'Open conciv chat'`.
- The nav poll guards the debounced (300ms) navigation write; do not replace it with a sleep.

- [ ] **Step 3: Run the test**

Run: `cd /Users/omrikatz/Public/web/aidx/packages/extensions/terminal && pnpm vitest run --project terminal test/terminal-view.it.test.ts`
Expected: PASS. This exercises: injected fake harness through `start()` (Task 1), tty on the fake harness (Task 2), testkit forwarding (Task 3), real engine + real widget host + real pty + reload restore (the shipped fixes from commits f9b3212e/5c1ee051).

If it fails on the client entry, confirm `@conciv/extension-terminal/client` is an export in `packages/extensions/terminal/package.json` (the embed fixture `packages/embed/test/fixtures/global-entry.ts` already imports it).

- [ ] **Step 4: Full-suite regression run**

```bash
cd /Users/omrikatz/Public/web/aidx && pnpm turbo build typecheck lint
cd packages/extensions/terminal && pnpm vitest run
cd ../whiteboard && pnpm vitest run test/canvas-commit.it.test.ts
cd ../../core && pnpm vitest run test/app-harness-di.test.ts test/start-harness-di.it.test.ts
```

Expected: all green (whiteboard = unchanged-consumer check).

- [ ] **Step 5: Commit**

```bash
cd /Users/omrikatz/Public/web/aidx
git commit -m "test(terminal): reload-restore IT on the extension-testkit path

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- packages/extensions/terminal/test/terminal-view.it.test.ts packages/extensions/terminal/package.json pnpm-lock.yaml
```

---

## EXECUTED (2026-07-12)

All four tasks landed on main (a13d7ea9, 1d044e81, 9b095e87, e33ffbfb, 56c480f3) with two
divergences discovered during execution:

1. The testkit host is a light host runtime, not the full widget — it had no mount point for
   extension `views` at all. `MountedViews` (hand-rolled tabs, flagged for rethink in
   `host-runtime.tsx`) was added so view-based extensions are drivable; the terminal IT drives
   the view tab directly instead of a fab, and app-level navigation restore stays covered by the
   embed ITs.
2. Terminal's devDependency on extension-testkit closed a fatal package cycle
   (`extension-testkit → plugin → embed → extension-terminal`). Broken by extracting the vite
   build plumbing out of the plugin into `@conciv/extension-compiler`; extension-testkit now
   depends on the compiler, not the plugin.
