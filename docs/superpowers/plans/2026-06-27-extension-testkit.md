# Extension TestKit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@mandarax/extension-testkit` exporting `getExtensionTestApi(extension)`, so any extension is tested in a real browser, against a real spawned server, through its real contract — no mocks, no stubs, no `window.*` hooks, no example app.

**Architecture:** A single async factory boots the extension's real server (core `start()`), serves a minimal real host page that mounts the extension through the real framework (a shared `mountExtension` lifted into `@mandarax/extension`) with a real `ClientApi` + `ExtensionHostContext`, launches Chromium, and returns `{page, callTool, session, apiBase, dispose}`. `grab` resolves real source from the `data-mandarax-source` attribute the mandarax plugin already stamps.

**Tech Stack:** TypeScript (NodeNext), Solid, vite (build the host page), Playwright `chromium` (real browser), `@tanstack/ai-mcp` (real MCP), `@mandarax/core` `start()` (real server), vitest (runner).

## Global Constraints

- No mocks, no stubs, no fakes anywhere (incl. build config). Real server, real browser, real drivers. (`no-stubs-or-mocks`)
- No `window.*` test hooks, no test-ids / `data-testid`, no exposed internals. (`no-test-ids-in-code`)
- Tests assert via `getByRole`/`getByText`/`getByLabel` + ARIA. Never `querySelector`, class/attribute selectors, or `toBe(true)` on DOM. (`test-assertions-native`)
- No whiteboard/extension UI tests in the example app. They live in the extension package's `test/`. (user rule, this session)
- Production code: zero narration comments, functions not classes, no `any`/casts beyond the existing `as unknown as` bridge helpers, no IIFE, no `else`, no non-null assertion (`x!`). (`code-style-hard-rules`, `no-non-null-assertion`)
- No new npm dependency without asking the user first. (`ask-before-installing`)
- Use `npx turbo build --filter=<pkg>` after editing package src that other packages load from `dist`. (`use-turbo-build`)
- Work only from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/canvas-comments`. (`worktree-stay-in-worktree`)
- Subagents (if used) run on Opus. (`subagent-model-opus`)

---

## File Structure

```
packages/extension/src/
  mount-extension.tsx        (NEW) shared mountExtension(extension, {clientApi, hostContext, slot, root})
  extension-api.ts           (exists) installClientApi — reused by mountExtension
  runtime-context.ts         (exists) ExtensionRuntimeContext — reused by mountExtension

packages/widget/src/extension/
  extension-slots.tsx        (MODIFY) call mountExtension instead of inlining the Provider+render

packages/extension-testkit/   (NEW package: @mandarax/extension-testkit)
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    get-extension-test-api.ts   getExtensionTestApi(extension) → ExtensionTestApi (orchestrator)
    boot-server.ts              bootExtensionServer(extension) → {apiBase, stop}  (core start())
    session.ts                  resolveSession(apiBase) → string
    call-tool.ts                makeCallTool(apiBase, session) → (name, input) => Promise<unknown>
    host/
      host-entry.tsx            browser entry: build real ClientApi + ExtensionHostContext, mountExtension
      grab.ts                   real grab + page resolution over data-mandarax-source
      fixture-element.tsx       one real source-mapped element for grab to pick
    build-host.ts               vite build of host/ → a served dir
    serve.ts                    tiny node http static server for the built host dir
    launch.ts                   chromium.launch + newPage + navigate
  test/
    smoke.it.test.ts            getExtensionTestApi(whiteboard) → open canvas → toolbar visible
```

---

## Task 1: Extract `mountExtension` into `@mandarax/extension`

**Files:**

- Create: `packages/extension/src/mount-extension.tsx`
- Modify: `packages/widget/src/extension/extension-slots.tsx`
- Test: `packages/extension/test/mount-extension.it.test.ts`

**Interfaces:**

- Consumes: `installClientApi` (from `./extension-api.js`), `ExtensionRuntimeContext` (from `./runtime-context.js`), `ExtensionHostContext` + `AnyExtension` types.
- Produces:

  ```ts
  export type MountExtensionOptions = {
    clientApi: ClientApi
    hostContext: Omit<ExtensionHostContext, 'currentSlot'>
    clientValue: object
    slot: string
    root: HTMLElement
  }
  export function mountExtension(extension: AnyExtension, options: MountExtensionOptions): () => void
  ```

- [ ] **Step 1: Read the current render site** — open `packages/widget/src/extension/extension-slots.tsx` and copy the exact `ExtensionRuntimeContext.Provider value={{...bag, ...clientValue, currentSlot}}` + `<Show when={extension.Component}>` render shape. `mountExtension` reproduces it for a single extension+slot.

- [ ] **Step 2: Write the failing test** (`packages/extension/test/mount-extension.it.test.ts`) — mount a trivial real extension defined inline with a `Component` that renders a button `aria-label="Ping"`, assert it appears in the root. Real Solid `render` into a real `document` element (this package test runs in the existing browser/jsdom-free IT harness — if none exists in this package, this is the FIRST browser IT here; use Playwright `chromium` like the testkit will, or defer this test to Task 8's smoke and mark Step 2-4 N/A with a note). Test body:

  ```ts
  // pseudo: render mountExtension(pingExt, {clientApi, hostContext, clientValue, slot:'composer', root})
  // then getByRole('button', {name: 'Ping'}) is present
  ```

- [ ] **Step 3: Run test, verify it fails** — `npx vitest run test/mount-extension.it.test.ts` from `packages/extension`. Expected: FAIL (mountExtension not defined).

- [ ] **Step 4: Implement `mountExtension`** in `mount-extension.tsx`:

  ```tsx
  import {render} from 'solid-js/web'
  import {Show} from 'solid-js'
  import {installClientApi} from './extension-api.js'
  import {ExtensionRuntimeContext} from './runtime-context.js'
  import type {ClientApi, ExtensionHostContext, AnyExtension} from './types.js'

  export type MountExtensionOptions = {
    clientApi: ClientApi
    hostContext: Omit<ExtensionHostContext, 'currentSlot'>
    clientValue: object
    slot: string
    root: HTMLElement
  }

  export function mountExtension(extension: AnyExtension, options: MountExtensionOptions): () => void {
    installClientApi(options.clientApi)
    return render(
      () => (
        <Show when={extension.Component}>
          {(Component) => (
            <ExtensionRuntimeContext.Provider
              value={{...options.hostContext, ...options.clientValue, currentSlot: options.slot}}
            >
              <Component />
            </ExtensionRuntimeContext.Provider>
          )}
        </Show>
      ),
      options.root,
    )
  }
  ```

  Note: match the exact prop spread order used in `extension-slots.tsx` so widget behavior is unchanged.

- [ ] **Step 5: Refactor `extension-slots.tsx`** to call `mountExtension` for each instance/slot rather than inlining the Provider+render, keeping the widget's existing per-panel `bag` construction. Confirm `installClientApi` is still called exactly once at widget mount (do not double-install — if `mountExtension` installs it, remove the widget's separate `installClientApi` call, or make install idempotent; pick whichever the existing code supports and note it).

- [ ] **Step 6: Run the test + widget build** — `npx vitest run test/mount-extension.it.test.ts` (PASS), then `npx turbo build --filter=@mandarax/extension --filter=@mandarax/widget` (clean).

- [ ] **Step 7: Commit**
  ```bash
  git add packages/extension/src/mount-extension.tsx packages/extension/test/mount-extension.it.test.ts packages/widget/src/extension/extension-slots.tsx
  git commit -m "feat(extension): shared mountExtension; widget slots use it"
  ```

---

## Task 2: Scaffold `@mandarax/extension-testkit`

**Files:**

- Create: `packages/extension-testkit/package.json`, `tsconfig.json`, `vitest.config.ts`

**Interfaces:**

- Produces: an installable workspace package `@mandarax/extension-testkit` with `"test": "vitest run"`, NodeNext, depending on `@mandarax/core`, `@mandarax/extension`, `@mandarax/grab`, `@mandarax/protocol`, `@tanstack/ai-mcp`, `vite`, `solid-js`, `playwright`. **Before adding any dependency not already in the monorepo, ask the user.** (All listed are already used elsewhere in the repo — confirm with `grep` in other package.json files; if any is new, stop and ask.)

- [ ] **Step 1:** Copy `packages/extensions/whiteboard/vitest.config.ts` as the template (node env, serial, `test/**/*.it.test.ts`). Set `name: 'extension-testkit'`.
- [ ] **Step 2:** Write `package.json` mirroring another internal package's shape (`type: module`, exports `./src/get-extension-test-api.ts` or a built `dist` — match how `@mandarax/extension` exposes its entry). Single public export `getExtensionTestApi`.
- [ ] **Step 3:** `tsconfig.json` extends the repo base (copy from `@mandarax/extension`).
- [ ] **Step 4:** `pnpm install` at repo root to link the workspace package. Expected: resolves clean.
- [ ] **Step 5: Commit** `chore(testkit): scaffold @mandarax/extension-testkit package`.

---

## Task 3: Real server boot (`boot-server.ts`)

**Files:**

- Create: `packages/extension-testkit/src/boot-server.ts`
- Test: `packages/extension-testkit/test/boot-server.it.test.ts`

**Interfaces:**

- Consumes: `start` from `@mandarax/core/engine`, `AnyExtension`.
- Produces: `export async function bootExtensionServer(extension: AnyExtension): Promise<{apiBase: string; stop: () => Promise<void>}>`

- [ ] **Step 1: Failing test** — boot whiteboard, assert `GET ${apiBase}/api/chat/models` responds 2xx (real server up), then `stop()`.
  ```ts
  const {apiBase, stop} = await bootExtensionServer(whiteboard)
  const res = await fetch(`${apiBase}/api/chat/models`)
  expect(res.ok).toBe(true)
  await stop()
  ```
- [ ] **Step 2: Run, verify fail** (function missing).
- [ ] **Step 3: Implement**

  ```ts
  import {mkdtemp} from 'node:fs/promises'
  import {tmpdir} from 'node:os'
  import {join} from 'node:path'
  import {start} from '@mandarax/core/engine'
  import type {AnyExtension} from '@mandarax/extension'

  export async function bootExtensionServer(
    extension: AnyExtension,
  ): Promise<{apiBase: string; stop: () => Promise<void>}> {
    const root = await mkdtemp(join(tmpdir(), 'mandarax-testkit-'))
    const engine = await start({options: {stateRoot: root}, root, extensions: [extension], launchEditor: () => {}})
    return {apiBase: `http://localhost:${engine.port}`, stop: () => engine.stop()}
  }
  ```

  Verify `start`'s exact option names against `packages/core/src/engine.ts` (`StartOpts`): `options`, `root`, `extensions`, `launchEditor`, optional `port`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat(testkit): boot a real extension server`.

---

## Task 4: Real session (`session.ts`)

**Files:**

- Create: `packages/extension-testkit/src/session.ts`
- Test: `packages/extension-testkit/test/session.it.test.ts`

**Interfaces:**

- Produces: `export async function resolveSession(apiBase: string): Promise<string>`

- [ ] **Step 1: Failing test** — boot server, `resolveSession(apiBase)` returns a string matching `/^mandarax_/`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `POST ${apiBase}/api/chat/session/resolve` with `{}` body, parse `{sessionId}`. Confirm the route + response shape against `packages/core/src/api/chat/session.ts` (`/api/chat/session/resolve`).
  ```ts
  export async function resolveSession(apiBase: string): Promise<string> {
    const res = await fetch(`${apiBase}/api/chat/session/resolve`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({}),
    })
    const body = (await res.json()) as {sessionId: string}
    return body.sessionId
  }
  ```
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** `feat(testkit): resolve a real session`.

---

## Task 5: Real MCP (`call-tool.ts`)

**Files:**

- Create: `packages/extension-testkit/src/call-tool.ts`
- Test: `packages/extension-testkit/test/call-tool.it.test.ts`

**Interfaces:**

- Consumes: `createMCPClient` from `@tanstack/ai-mcp`, `MANDARAX_SESSION_HEADER` from `@mandarax/protocol/chat-types`.
- Produces: `export function makeCallTool(apiBase: string, session: string): (name: string, input: unknown) => Promise<unknown>`

- [ ] **Step 1: Failing test** — boot whiteboard, resolve session, `callTool('canvas.read', {})` returns `{elements: []}` (or the real shape) without throwing.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** (pattern from the old `run-tool.ts`):

  ```ts
  import {createMCPClient} from '@tanstack/ai-mcp'
  import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'

  export function makeCallTool(apiBase: string, session: string) {
    return async (name: string, input: unknown): Promise<unknown> => {
      const mcp = await createMCPClient({
        transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[MANDARAX_SESSION_HEADER]: session}},
      })
      try {
        const tool = (await mcp.tools()).find((entry) => entry.name === name)
        if (!tool?.execute) throw new Error(`tool ${name} not on /api/mcp`)
        return await tool.execute(input)
      } finally {
        await mcp.close()
      }
    }
  }
  ```

- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** `feat(testkit): real MCP callTool`.

---

## Task 6: Real grab + source over `data-mandarax-source` (`host/grab.ts`, `host/fixture-element.tsx`)

**Files:**

- Create: `packages/extension-testkit/src/host/fixture-element.tsx`, `packages/extension-testkit/src/host/grab.ts`
- Test: covered by the smoke IT (Task 8) — grab has no node-only seam, it runs in the browser.

**Interfaces:**

- Produces:

  ```ts
  // grab.ts
  export function makeHostGrab(doc: Document): GrabApi // GrabApi from @mandarax/grab
  export function makeHostPage(doc: Document): ClientApi['page'] // elementAt/describe/locate over data-mandarax-source
  ```

- [ ] **Step 1:** `fixture-element.tsx` — a real Solid component rendering one labelled element (`aria-label="Comment target"`); because the host build runs the mandarax source transform (Task 7), it carries a real `data-mandarax-source`.
- [ ] **Step 2:** `grab.ts` — `pick()` returns a Promise that resolves when the picked element is clicked, reading `element.getAttribute('data-mandarax-source')` (`path:line:col`) into `ElementSource` and `element.getBoundingClientRect()` into `ElementRect`, and building the `Grab` (`snapshot` = a real cloned node, `text`, `source`, `rect`). Match `GrabApi` exactly (`pick`, `comment`, `cancel`, `isActive`, `stage`) from `packages/grab/src/grab.ts`. Implement `pick`/`comment` to await a real click on the fixture element; `cancel`/`isActive`/`stage` real and minimal.
- [ ] **Step 3:** No standalone test — exercised by Task 8 (comment-on-element). Commit with Task 7.

---

## Task 7: Host entry + build + serve + launch (`host/host-entry.tsx`, `build-host.ts`, `serve.ts`, `launch.ts`)

**Files:**

- Create: `packages/extension-testkit/src/host/host-entry.tsx`, `src/build-host.ts`, `src/serve.ts`, `src/launch.ts`
- Test: covered by Task 8.

**Interfaces:**

- Produces:

  ```ts
  // build-host.ts — vite build the host entry (source transform ON) into an outDir; return outDir
  export async function buildHost(extensionEntry: string): Promise<string>
  // serve.ts — node http static server for a dir; return {origin, close}
  export function serveDir(dir: string): {origin: string; close: () => Promise<void>}
  // launch.ts — chromium.launch + page; return {page, close}
  export async function launch(url: string): Promise<{page: Page; close: () => Promise<void>}>
  ```

- [ ] **Step 1:** `host-entry.tsx` (browser): read `apiBase` + `session` from injected `<meta>` (stamped into the served HTML, mirroring `pw-api-base`). Build the real `ClientApi` (`apiBase`, `activeSession: () => session`, real `surface` shadow host appended to `document.body`, `env: {doc, win, reducedMotion}`, `toast`, `page` from `makeHostPage`). Build `hostContext` bag (`grab` from `makeHostGrab`, plus the other `ExtensionHostContext` capabilities the extension reads — enumerate from `packages/extension/src/types.ts` / `catalog.ts`: `insert`, `notify`, `setBusy`, `newSession`, `harnessId`, `client`; provide real minimal implementations, e.g. `harnessId` from a meta, `insert`/`notify` real DOM/no-throw — **none stubbed to fake values; provide real behavior or omit if the contract allows optional**). Render the fixture element AND call `mountExtension(extension, {...})` with `slot: 'composer'`.
- [ ] **Step 2:** `build-host.ts` — programmatic `vite.build` with the mandarax source-injection transform applied to the host entry (import `addSourceToJsx` usage from the plugin, or run the plugin's serve transform; confirm the exact transform entry in `packages/plugin/src/core/inject-source.ts`). Output to a temp dir; emit an `index.html` with the two `<meta>` placeholders.
- [ ] **Step 3:** `serve.ts` — minimal `node:http` static file server over the build dir, substituting the real `apiBase`/`session` into the `<meta>` tags at request time. Return `{origin, close}`.
- [ ] **Step 4:** `launch.ts` — `import {chromium} from 'playwright'`; `launch()`, `newPage()` (not `newContext`, per `widget-it-newpage-not-newcontext`), `goto(url, {waitUntil: 'domcontentloaded'})` (not `networkidle`, per `playwright-networkidle-hangs-live-widget`). Return `{page, close}`.
- [ ] **Step 5: Commit** `feat(testkit): host entry, build, serve, launch` (with Task 6 files).

---

## Task 8: `getExtensionTestApi` orchestrator + smoke IT

**Files:**

- Create: `packages/extension-testkit/src/get-extension-test-api.ts`
- Test: `packages/extension-testkit/test/smoke.it.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type ExtensionTestApi = {
    page: Page
    callTool: (name: string, input: unknown) => Promise<unknown>
    session: string
    apiBase: string
    dispose: () => Promise<void>
  }
  export async function getExtensionTestApi(extension: AnyExtension): Promise<ExtensionTestApi>
  ```

- [ ] **Step 1: Failing smoke test** (`test/smoke.it.test.ts`), a11y-only, against the **whiteboard** extension:

  ```ts
  import {test, expect} from 'vitest' // or the package's runner
  import whiteboard from '@mandarax/extension-whiteboard'
  import {getExtensionTestApi} from '../src/get-extension-test-api.js'

  test('whiteboard mounts and opens its canvas', async () => {
    const api = await getExtensionTestApi(whiteboard)
    await api.page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
    await expect(api.page.getByRole('radio', {name: 'Rectangle'})).toBeVisible({timeout: 30_000})
    await api.dispose()
  })
  ```

- [ ] **Step 2: Run, verify fail** (orchestrator missing).
- [ ] **Step 3: Implement orchestrator** — compose Tasks 3-7: `bootExtensionServer` → `resolveSession` → `buildHost` → `serveDir` (inject apiBase+session) → `launch` → `makeCallTool`; return the api with `dispose` that closes browser, server, and the static server.
- [ ] **Step 4: Run, verify pass.** Use Playwright's `expect` for the visibility assertion if vitest's `expect` lacks locators — confirm which `expect` the package uses; the locator assertions need `@playwright/test`'s `expect`.
- [ ] **Step 5: Commit** `feat(testkit): getExtensionTestApi + smoke IT`.

---

## Self-Review notes (addressed)

- **Spec coverage:** server (T3), session (T4), framework mount/extraction (T1), grab over data-mandarax-source (T6), MCP (T5), host page (T7), single `getExtensionTestApi` (T8) — all mapped.
- **`ExtensionHostContext` completeness (open):** Task 7 Step 1 must enumerate every field an extension reads via `useContext` and provide a **real** value (no fake constants). If a capability cannot be provided really at the package level, that is a contract smell to raise with the user, not to stub.
- **Source transform (open):** Task 7 Step 2 must confirm the exact way to apply the plugin's `data-mandarax-source` transform inside a programmatic `vite.build`. If the plugin only runs `apply:'serve'`, the host may need `vite` dev middleware instead of a static build — resolve during T7.
- **`expect` with locators:** smoke/UI assertions require `@playwright/test`'s `expect`, not vitest's. Confirm in T8.
