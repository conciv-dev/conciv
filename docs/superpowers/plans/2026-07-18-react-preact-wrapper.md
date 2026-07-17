# React/Preact Widget Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@conciv/react` and `@conciv/preact` packages exposing `<ConcivWidget />`, backed by a new framework-free `createConciv` mount/unmount handle in `@conciv/embed`.

**Architecture:** TanStack-devtools pattern. `@conciv/embed` gains `createConciv(init) → {mount, unmount}`: an SSR-safe, abortable state machine whose heavy Solid graph lives in a dynamically-imported `mount-impl.tsx`. The wrapper packages are ~20-line components that create the handle once and mount/unmount it from an effect. Spec: `docs/superpowers/specs/2026-07-18-react-preact-wrapper-design.md`.

**Tech Stack:** Solid (precompiled in embed dist), React ≥16.8 / Preact ≥10 peers, vite lib builds, tsdown, vitest + Playwright/Chromium (real browser, never jsdom).

## Global Constraints

- Implementation happens in a git worktree (EnterWorktree), never on the main checkout. Run every command from the worktree path.
- Before substantial work, run the repo skill check per AGENTS.md (`pnpm dlx @tanstack/intent@latest list`) and load any skill matching your task. Verify library APIs against installed dependency source/types or official docs — never from memory (the build-tool facts in this plan were verified against tsdown 0.22.4 and rolldown 1.1.5 installed types).
- Code style: functions not classes; no IIFEs; ZERO comments in TS/JS (lint deletes them); no `any`/`as`/`@ts-ignore`/non-null `!`; oxfmt (no semicolons, single quotes, trailing commas, printWidth 120).
- Tests: real browser via Playwright/Chromium; `browser.newPage()` never `newContext()`; wait for `domcontentloaded` never `networkidle`; assert roles/text, never CSS/classes/test-ids; vitest `environment: 'node'` pinned.
- Build via turbo only (`pnpm turbo run build --filter=<pkg>`); never hand-rebuild `dist/`. `pnpm test` builds first.
- Commit with pathspec: `git commit -- <paths>`. Do not push.
- Versions: all `@conciv/*` are fixed at `0.0.11` (changesets `fixed` group).
- New deps are listed exactly in the tasks below; add nothing beyond them.

---

### Task 1: `createConciv` handle in `@conciv/embed`

**Files:**
- Create: `packages/embed/src/mount.ts` (new lightweight entry)
- Create: `packages/embed/src/mount-impl.tsx` (heavy Solid graph, moved from old entry)
- Delete: `packages/embed/src/mount.tsx`
- Modify: `packages/protocol/src/config-types.ts` (add `ConcivSettingsInit`)
- Modify: `packages/page/src/page-handlers.ts` + `packages/page/src/page-driver.ts` (disposable console buffer/driver)
- Modify: `apps/conciv/src/lib/api-base.ts` (loopback guard on `?core=`)
- Modify: `apps/conciv/src/lib/shadow.ts` (`createShadowRoot` takes the claimed host)
- Modify: `packages/embed/vite.config.ts`
- Modify: `packages/embed/test/mount-externals.test.ts` (repoint at the mount-impl chunk)
- Modify: `packages/embed/package.json` (description mentions the framework wrappers)
- Test: `packages/embed/test/mount-node.test.ts`

**Interfaces:**
- Consumes: existing `boot` internals from `packages/embed/src/mount.tsx`, `startPagePlane` (`packages/page/src/index.ts:49`, returns `{dispose: () => void}`), `createShadowRoot` (`conciv/shadow`, returns `{host, root}`).
- Produces (later tasks import these from `@conciv/embed`):
  - `interface ConcivSettingsInit extends WidgetConfig {defaultOpen?: boolean}` — declared in `@conciv/protocol/config-types` next to the existing `WidgetConfig` (`{modal?: boolean | ModalConfig; quickTerminal?: boolean | QuickTerminalConfig}`) so there is ONE widget-config shape, re-exported from `@conciv/embed`
  - `type ConcivInit = {extensions?: AnyExtension[]; settings?: ConcivSettingsInit; apiBase?: string}`
  - `type ConcivHandle = {mount: () => Promise<void>; unmount: () => void}`
  - `function createConciv(init?: ConcivInit): ConcivHandle`
  - `function mountConciv(extensions: AnyExtension[]): void` (unchanged signature)
  - `function mountImpl(init: ConcivInit, hostElement: HTMLElement): () => void` (internal, from `mount-impl.tsx`)
  - `PageDriver` gains a required `dispose: () => void` (`packages/page`); `startConsoleBuffer` returns `{buf, dispose}`
  - `createShadowRoot(host: HTMLElement)` (`conciv/shadow`) now decorates a caller-provided host instead of creating one

- [ ] **Step 1: Write the failing node test**

`packages/embed/test/mount-node.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {createConciv, mountConciv} from '../src/mount.js'

describe('createConciv outside a browser', () => {
  it('mount resolves and unmount is a no-op without document', async () => {
    const handle = createConciv()
    await expect(handle.mount()).resolves.toBeUndefined()
    expect(() => handle.unmount()).not.toThrow()
  })

  it('mountConciv is safe to call without document', () => {
    expect(() => mountConciv([])).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from worktree root): `pnpm --filter @conciv/embed exec vitest run test/mount-node.test.ts`
Expected: FAIL — `createConciv` is not exported (module `../src/mount.js` does not exist yet; the old file is `mount.tsx`).

- [ ] **Step 2b: Add `ConcivSettingsInit` to `@conciv/protocol` and make the page driver disposable**

In `packages/protocol/src/config-types.ts`, directly below `WidgetConfig`:

```ts
export interface ConcivSettingsInit extends WidgetConfig {
  defaultOpen?: boolean
}
```

In `packages/page/src/page-handlers.ts`, replace `startConsoleBuffer` — today it monkey-patches `console.log/info/warn/error` and adds two `window` listeners it never removes, so every remount would stack another wrapper layer (unbounded leak):

```ts
export function startConsoleBuffer(): {buf: ConsoleEntry[]; dispose: () => void} {
  const buf: ConsoleEntry[] = []
  const push = (level: string, args: unknown[]): string => {
    const text = args.map((a) => String(a)).join(' ')
    buf.push({level, ts: Date.now(), text})
    if (buf.length > CONSOLE_CAP) buf.shift()
    return text
  }
  const originals = (['log', 'info', 'warn', 'error'] as const).map((level) => {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      const text = push(level, args)
      if (!FORWARD_MARKER.test(text)) original(...args)
    }
    return {level, original}
  })
  const onError = (e: ErrorEvent): void => {
    push('error', [e.message])
  }
  const onRejection = (e: PromiseRejectionEvent): void => {
    push('error', [String(e.reason)])
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return {
    buf,
    dispose: () => {
      for (const {level, original} of originals) console[level] = original
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    },
  }
}
```

In `packages/page/src/page-driver.ts`:

```ts
export type PageDriver = {execute: (query: PageQuery) => Promise<PageResult>; refs: Refs; dispose: () => void}
```

and inside `makeDomPageDriver`, replace the `consoleBuf` line and the return:

```ts
  const {buf: consoleBuf, dispose} = startConsoleBuffer()
```

```ts
  return {execute, refs, dispose}
}
```

Run `pnpm typecheck` afterward; if any other `PageDriver` implementer (testkits, fakes) fails the new required `dispose`, give it a no-op `dispose: () => {}`.

- [ ] **Step 2c: Guard the `?core=` api-base query param**

The `?core=` query param is attacker-influenceable (a crafted link can point the widget's RPC + page-plane at a hostile server). Constrain it to loopback or same-origin; the prop/meta/global paths are developer-controlled and stay unrestricted. In `apps/conciv/src/lib/api-base.ts`:

```ts
function queryCore(): string {
  const raw = new URLSearchParams(window.location.search).get('core')
  if (!raw) return ''
  try {
    const url = new URL(raw, window.location.origin)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (loopback || url.origin === window.location.origin) return raw
  } catch {}
  console.warn('[conciv] ignoring non-loopback cross-origin ?core= api base')
  return ''
}

export function resolveApiBase(): string {
  return window.__CONCIV_API_BASE__ ?? (metaContent('pw-api-base') || queryCore()) ?? ''
}
```

Existing e2e/testkit flows pass `?core=http://127.0.0.1:<port>` — loopback, still allowed.

- [ ] **Step 2d: Make `createShadowRoot` accept the claimed host**

In `apps/conciv/src/lib/shadow.ts`, `createConciv` now creates the `[data-conciv-root]` element synchronously (see Step 4) and hands it over; `createShadowRoot` decorates it instead of creating its own:

```ts
export function createShadowRoot(host: HTMLElement): {host: HTMLElement; root: ShadowRoot} {
  registerWind4Properties()
  registerFonts()
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '2147483000'
  const root = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = styles
  root.appendChild(style)
  return {host, root}
}
```

(The `data-conciv-root` attribute set + `document.body.appendChild` move to the caller.) Run `pnpm typecheck` and fix any other `createShadowRoot()` call site the compiler flags by creating-and-appending a `div[data-conciv-root]` first, mirroring Step 4's `mount()`.

- [ ] **Step 3: Create `packages/embed/src/mount-impl.tsx`**

Move the heavy code out of `mount.tsx`. New file content:

```tsx
import {render} from 'solid-js/web'
import {RouterProvider} from '@tanstack/solid-router'
import {makeRpcClient} from '@conciv/contract'
import {createWebStorageHistory} from '@conciv/storage-history'
import {installReactBridge, makeDomPageDriver, reactBridge, startPagePlane, type PageDriver} from '@conciv/page'
import {createConcivRouter} from 'conciv/router'
import {parseConcivSettings} from 'conciv/settings'
import {createShadowRoot} from 'conciv/shadow'
import {resolveApiBase} from 'conciv/api-base'
import {makeNavigationStorage} from './navigation-storage.js'
import type {ConcivInit} from './mount.js'

declare global {
  interface Window {
    __CONCIV_PAGE_DRIVER__?: PageDriver
    __CONCIV_REACT_BRIDGE__?: typeof reactBridge
  }
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

async function boot(root: ShadowRoot, init: ConcivInit): Promise<() => void> {
  const apiBase = init.apiBase ?? resolveApiBase()
  const rpc = makeRpcClient(apiBase)
  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver

  const storage = await makeNavigationStorage(rpc)
  const hostRouter = window.__TSR_ROUTER__
  const router = createConcivRouter({
    rpc,
    history: createWebStorageHistory({storage}),
    environment: {rootNode: root, document},
    settings: parseConcivSettings(init.settings ? JSON.stringify(init.settings) : metaContent('pw-widget')),
    extensions: init.extensions ?? [],
  })
  window.__TSR_ROUTER__ = hostRouter

  const container = document.createElement('div')
  root.appendChild(container)
  const disposeApp = render(() => <RouterProvider router={router} />, container)
  const plane = startPagePlane({rpc, document, driver})
  const disposers = [
    () => plane.dispose(),
    disposeApp,
    () => router.options.context.queryClient.clear(),
    driver.dispose,
  ]
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (error) {
        console.error('[conciv] teardown step failed', error)
      }
    }
  }
}

export function mountImpl(init: ConcivInit, hostElement: HTMLElement): {ready: Promise<void>; teardown: () => void} {
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const hostRouter = window.__TSR_ROUTER__
  const {host, root} = createShadowRoot(hostElement)
  let disposed = false
  let disposeBoot: (() => void) | undefined
  const ready = boot(root, init).then((dispose) => {
    if (disposed) {
      dispose()
      return
    }
    disposeBoot = dispose
  })
  const teardown = (): void => {
    disposed = true
    try {
      disposeBoot?.()
    } finally {
      host.remove()
      window.__TSR_ROUTER__ = hostRouter
      window.__CONCIV_PAGE_DRIVER__ = undefined
      window.__CONCIV_REACT_BRIDGE__ = undefined
    }
  }
  return {ready, teardown}
}
```

Notes for the implementer:
- This is the old `mount.tsx` `boot` with these changes: `init.apiBase ?? resolveApiBase()`, settings from `init.settings` (serialized through the existing `parseConcivSettings` parser) with the `pw-widget` meta as fallback, `init.extensions ?? []`, and a teardown covering the previously-dropped `render()` dispose plus `startPagePlane(...).dispose`, `queryClient.clear()`, and the new `driver.dispose()`.
- Teardown is fault-isolated via the disposers loop (and `try`/`finally` in `mountImpl`): one throwing `onCleanup` inside the Solid dispose must never skip the remaining disposers or `host.remove()` — a leftover `[data-conciv-root]` host would permanently block remount. Failures are logged, never rethrown.
- Boot failures propagate through `ready` so `createConciv`'s `mount()` promise rejects; `mountImpl` itself does not log (the caller does).
- The inner `window.__TSR_ROUTER__` capture/restore around router creation is load-bearing (embedded TanStack Router clobbers the host app's global otherwise) — keep it exactly. The outer capture in `mountImpl` + restore in teardown handles the newly-possible unmount path for hosts that themselves use TanStack Router.
- `installReactBridge()` is intentionally NOT torn down: `installTracker` is idempotent (`state.installed` guard in `packages/page/src/render-tracker.ts`), so remount is safe and uninstalling the RDT hook would be riskier than leaving it.
- `createShadowRoot` also injects font + `@property` styles into `document.head`; they are deliberately left on unmount (both `register*` helpers are idempotent via their `data-*` guards, so remount reuses them). The READMEs document this.

- [ ] **Step 4: Create `packages/embed/src/mount.ts` and delete `mount.tsx`**

```ts
import type {AnyExtension} from '@conciv/extension'
import type {ConcivSettingsInit} from '@conciv/protocol/config-types'

export type {ConcivSettingsInit} from '@conciv/protocol/config-types'

export type ConcivInit = {
  extensions?: AnyExtension[]
  settings?: ConcivSettingsInit
  apiBase?: string
}

export type ConcivHandle = {
  mount: () => Promise<void>
  unmount: () => void
}

type MountState = 'unmounted' | 'mounting' | 'mounted'

export function createConciv(init: ConcivInit = {}): ConcivHandle {
  let state: MountState = 'unmounted'
  let abort: AbortController | undefined
  let host: HTMLElement | undefined
  let teardown: (() => void) | undefined

  async function mount(): Promise<void> {
    if (typeof document === 'undefined') return
    if (state !== 'unmounted') return
    if (document.querySelector('[data-conciv-root]')) {
      console.warn('[conciv] widget already mounted, skipping mount')
      return
    }
    const claim = document.createElement('div')
    claim.setAttribute('data-conciv-root', '')
    document.body.appendChild(claim)
    host = claim
    state = 'mounting'
    const controller = new AbortController()
    abort = controller
    try {
      const {mountImpl} = await import('./mount-impl.js')
      if (controller.signal.aborted) return
      const impl = mountImpl(init, claim)
      teardown = impl.teardown
      state = 'mounted'
      await impl.ready
    } catch (error) {
      if (controller.signal.aborted) return
      teardown?.()
      teardown = undefined
      claim.remove()
      host = undefined
      state = 'unmounted'
      console.error('[conciv] failed to start widget', error)
      throw error
    }
  }

  function unmount(): void {
    if (state === 'unmounted') return
    abort?.abort()
    teardown?.()
    teardown = undefined
    host?.remove()
    host = undefined
    state = 'unmounted'
  }

  return {mount, unmount}
}

export function mountConciv(extensions: AnyExtension[]): void {
  void createConciv({extensions})
    .mount()
    .catch(() => undefined)
}
```

`mount()` returns a promise that resolves once the widget has fully booted and rejects on chunk-load or boot failure (after cleaning up the claim and logging) — callers get a real programmatic signal, not console-only. Abort during mount resolves silently. `mountConciv` swallows the rejection (the error is already logged; the script-tag path has no caller to signal).

No module-level state: the `[data-conciv-root]` host element IS the singleton guard, and it is claimed synchronously in `mount()` — check + insert happen in the same tick, so two handles mounting concurrently (or the script-tag inject racing a `<ConcivWidget/>`) cannot both pass; the loser warns and no-ops. This also works across separate bundle copies on one page, which no in-module flag could. All remaining state (`state`/`abort`/`host`/`teardown`) lives in the `createConciv` closure. The failed-import path removes the claim so a later mount can retry.

Then: `git rm packages/embed/src/mount.tsx`

The type-only imports mean the emitted `mount.js` has zero static runtime imports — it is import-safe under SSR/node. `ConcivSettingsInit` lives in `@conciv/protocol` (published), so the public `.d.ts` never references the private `conciv` app package. Note this deviates intentionally from the spec's `settings?: ConcivSettings` — the parsed type lives in the private app and must not leak into public typings; do not "reconcile" it back.

Also update `packages/embed/package.json` `description`: append " Also powers the @conciv/react and @conciv/preact wrapper components." after the "do not install directly" sentence, so the dependency graph and messaging agree.

- [ ] **Step 5: Update the two vite configs**

`packages/embed/vite.config.ts` — change the lib entry to the new `.ts` file:

```ts
    lib: {
      entry: fileURLToPath(new URL('src/mount.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'mount.js',
    },
```

Leave `rollupOptions` untouched (`external: isExternal` only). Do NOT set a global `chunkFileNames: '[name].js']` — the dist already emits several anonymous vendor chunks and stripping their content hashes risks name collisions and kills cache-busting. The mount-impl chunk gets a default `mount-impl-<hash>.js` name; nothing hard-codes it (vite rewrites the dynamic-import specifier), and the tests locate it by glob.

`packages/embed/vite.global.config.ts` — the iife format cannot code-split, so inline the dynamic import. Add to its `build` block (vite 8 is rolldown-based: `codeSplitting: false` is the current spelling; `inlineDynamicImports` is deprecated — verified against rolldown 1.1.5 types):

```ts
    rollupOptions: {output: {codeSplitting: false}},
```

- [ ] **Step 6: Run the node test to verify it passes**

Run: `pnpm --filter @conciv/embed exec vitest run test/mount-node.test.ts`
Expected: PASS (2 tests). The test imports `src/mount.ts` in the node environment; `typeof document === 'undefined'` short-circuits before the dynamic import fires.

- [ ] **Step 7: Build and typecheck the package**

Run: `pnpm turbo run build --filter=@conciv/embed && pnpm --filter @conciv/embed typecheck`
Expected: build succeeds; `dist/` now contains `mount.js`, a `mount-impl-<hash>.js` chunk, `mount.d.ts`, and `conciv-widget.global.js`. Verify the chunk exists: `ls packages/embed/dist/mount-impl*.js`.

- [ ] **Step 7b: Repoint `mount-externals.test.ts` at the mount-impl chunk**

This test is the ONLY guard against a consumer bundling a second Solid/Ark copy (the context-split landmine). After the split, `dist/mount.js` no longer contains the app graph, so every "externalizes X" assertion would fail — and the "inlines" assertions would pass vacuously, silently disabling the guard. The guard must follow the code into the chunk. Replace the file's header (keep the five `it` blocks unchanged) and add an entry-lightness test:

```ts
import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const chunkName = readdirSync(distDir).find((name) => /^mount-impl.*\.js$/.test(name)) ?? ''
const mount = chunkName ? readFileSync(distDir + chunkName, 'utf8') : ''
const entry = readFileSync(distDir + 'mount.js', 'utf8')

const externalized = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(mount)
```

and append inside the describe:

```ts
  it('emits the app graph as a mount-impl chunk', () => {
    expect(chunkName).not.toBe('')
  })

  it('keeps the mount entry free of static runtime imports (SSR-safe)', () => {
    expect(/^import\s/m.test(entry)).toBe(false)
  })
```

- [ ] **Step 8: Run the full embed test suite (existing ITs must stay green)**

Run: `pnpm turbo run test --filter=@conciv/embed --force`
Expected: PASS — `embed.it.test.ts`, `page-plane.it.test.ts`, `reload-continuity.it.test.ts`, `mount-externals.test.ts` (now reading the chunk), `mount-node.test.ts`. These load the freshly-rebuilt global bundle, proving the script-tag path (`mountConciv`) is behavior-identical.

- [ ] **Step 9: Commit**

```bash
git add packages/embed packages/protocol/src/config-types.ts packages/page/src/page-handlers.ts packages/page/src/page-driver.ts apps/conciv/src/lib/api-base.ts apps/conciv/src/lib/shadow.ts
git rm packages/embed/src/mount.tsx
git commit -m "feat(embed): createConciv mount/unmount handle with lazy mount-impl split" -- packages/embed packages/protocol packages/page apps/conciv
```

---

### Task 2: Browser IT for the `createConciv` lifecycle

**Files:**
- Create: `packages/embed/vite.handle.config.ts`
- Create: `packages/embed/test/fixtures/handle-entry.ts`
- Modify: `packages/embed/test/helpers/host.ts`
- Modify: `packages/embed/package.json` (test script)
- Test: `packages/embed/test/create-conciv.it.test.ts`

**Interfaces:**
- Consumes: `createConciv`, `ConcivHandle` from Task 1; existing `bootEmbedKit` (`test/helpers/boot.ts`) and `serveHost` (`test/helpers/host.ts`).
- Produces: test-only iife bundle `test/dist/conciv-handle.global.js` exposing `window.ConcivHandle.makeHandle(apiBase)`; helper `handleHostPage(): string`.

- [ ] **Step 1: Create the fixture entry**

`packages/embed/test/fixtures/handle-entry.ts`:

```ts
import terminal from '@conciv/extension-terminal/client'
import {createConciv, type ConcivHandle} from '../../src/mount.js'

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [terminal], apiBase})
}
```

- [ ] **Step 2: Create `packages/embed/vite.handle.config.ts`**

```ts
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  define: {'define.amd': 'false', 'process.env.NODE_ENV': '"production"'},
  build: {
    lib: {
      entry: fileURLToPath(new URL('test/fixtures/handle-entry.ts', import.meta.url)),
      formats: ['iife'],
      name: 'ConcivHandle',
      fileName: () => 'conciv-handle.global.js',
    },
    outDir: 'test/dist',
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {output: {codeSplitting: false}},
  },
})
```

`test/dist/` is covered by the root `.gitignore` `dist/` pattern — nothing to ignore-list.

- [ ] **Step 3: Build the fixture as part of the test script**

In `packages/embed/package.json`, change the test script (turbo caches `test` by log, and the fixture lives outside `dist/**`, so it must be produced inside the test run, not the build):

```json
    "test": "vite build --config vite.handle.config.ts && vitest run",
```

- [ ] **Step 4: Add the handle host page helper**

Append to `packages/embed/test/helpers/host.ts`:

```ts
export function handleHostPage(): string {
  const handleBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-handle.global.js'), 'utf8')
  return `<!doctype html><html><head></head><body>
    <div id="probe">page-bus-ok</div>
    <script>${handleBundle}</script>
  </body></html>`
}
```

(Read lazily inside the function — the file only exists after the fixture build, and other suites import this module too.)

- [ ] **Step 5: Write the IT**

`packages/embed/test/create-conciv.it.test.ts`:

```ts
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'

const ASSISTANT_TEXT = 'Hello from conciv'

type Handle = {mount: () => Promise<void>; unmount: () => void}

declare global {
  interface Window {
    ConcivHandle: {makeHandle: (apiBase: string) => Handle}
    __handle: Handle
    __TSR_ROUTER__?: unknown
  }
}

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => handleHostPage())
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openPage(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

describe('createConciv lifecycle', () => {
  it('mounts, unmounts, and remounts the widget', async () => {
    const page = await openPage()
    await page.evaluate((apiBase) => {
      window.__handle = window.ConcivHandle.makeHandle(apiBase)
      void window.__handle.mount()
    }, kit.base)
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    await page.evaluate(() => void window.__handle.mount())
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.close()
  })

  it('two handles mounting in the same tick yield exactly one widget', async () => {
    const page = await openPage()
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.evaluate((apiBase) => {
      void window.ConcivHandle.makeHandle(apiBase).mount()
      void window.ConcivHandle.makeHandle(apiBase).mount()
    }, kit.base)
    await expect.poll(() => fab(page).count(), {timeout: 15_000}).toBe(1)
    expect(warnings.some((text) => text.includes('[conciv] widget already mounted'))).toBe(true)
    expect(await fab(page).count()).toBe(1)
    await page.close()
  })

  it('unmount during mount leaves nothing behind', async () => {
    const page = await openPage()
    await page.evaluate((apiBase) => {
      const handle = window.ConcivHandle.makeHandle(apiBase)
      void handle.mount()
      handle.unmount()
    }, kit.base)
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    expect(await page.evaluate(() => document.querySelector('[data-conciv-root]') === null)).toBe(true)
    await page.close()
  })

  it('restores the host __TSR_ROUTER__ global on unmount', async () => {
    const page = await openPage()
    await page.evaluate((apiBase) => {
      window.__TSR_ROUTER__ = {hostSentinel: true}
      window.__handle = window.ConcivHandle.makeHandle(apiBase)
      void window.__handle.mount()
    }, kit.base)
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    const restored = await page.evaluate(() => {
      const value = window.__TSR_ROUTER__
      return typeof value === 'object' && value !== null && 'hostSentinel' in value
    })
    expect(restored).toBe(true)
    await page.close()
  })

  it('unmounts cleanly with an open panel and a completed turn', async () => {
    const page = await openPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.evaluate((apiBase) => {
      window.__handle = window.ConcivHandle.makeHandle(apiBase)
      void window.__handle.mount()
    }, kit.base)
    await fab(page).click()
    const box = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => box.isVisible(), {timeout: 15_000}).toBe(true)
    await box.fill('hello')
    await box.press('Enter')
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).first().isVisible(), {timeout: 20_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    expect(pageErrors).toEqual([])
    await page.close()
  })
})
```

Notes: `ASSISTANT_TEXT` is a const passed to `bootEmbedKit({text: ASSISTANT_TEXT})` in `beforeAll` (mirror `embed.it.test.ts`, value `'Hello from conciv'`). Presence/removal is asserted via the FAB role, not DOM structure; the one `[data-conciv-root]` query left is the non-visual claim-element invariant in the abort test. The `__TSR_ROUTER__` test augments the test file's `Window` interface with `__TSR_ROUTER__?: unknown` in its `declare global` block — narrow with `typeof`/`in`, no casts.

- [ ] **Step 6: Run the new IT**

Run: `pnpm --filter @conciv/embed test`
Expected: fixture builds, then all suites PASS including the 3 new lifecycle tests.

- [ ] **Step 7: Commit**

```bash
git add packages/embed/vite.handle.config.ts packages/embed/test/fixtures/handle-entry.ts packages/embed/test/helpers/host.ts packages/embed/test/create-conciv.it.test.ts packages/embed/package.json
git commit -m "test(embed): browser IT for createConciv mount/unmount lifecycle" -- packages/embed
```

---

### Task 3: `@conciv/react` package

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsdown.config.ts`
- Create: `packages/react/vitest.config.ts`
- Create: `packages/react/vite.fixture.config.ts`
- Create: `packages/react/src/index.ts`
- Create: `packages/react/README.md`
- Create: `packages/react/test/fixtures/host/index.html`
- Create: `packages/react/test/fixtures/host/main.tsx`
- Create: `packages/react/test/helpers/boot.ts`
- Create: `packages/react/test/helpers/host.ts`
- Test: `packages/react/test/widget.it.test.ts`

**Interfaces:**
- Consumes: `createConciv`, `ConcivInit`, `ConcivSettingsInit` from `@conciv/embed` (Task 1).
- Produces: `function ConcivWidget(props: ConcivWidgetProps): null` where `type ConcivWidgetProps = ConcivInit`; re-exports `ConcivInit`, `ConcivSettingsInit`.

- [ ] **Step 1: Scaffold the package**

`packages/react/package.json`:

```json
{
  "name": "@conciv/react",
  "version": "0.0.11",
  "description": "React component for the conciv widget: render <ConcivWidget /> to mount the conciv dev agent in any React app.",
  "keywords": ["ai", "chat", "conciv", "react", "widget"],
  "homepage": "https://conciv.dev",
  "bugs": "https://github.com/conciv-dev/conciv/issues",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/conciv-dev/conciv.git",
    "directory": "packages/react"
  },
  "files": ["dist"],
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "publishConfig": {"access": "public"},
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vite build --config vite.fixture.config.ts && vitest run",
    "publint": "publint",
    "attw": "attw --pack . --profile esm-only"
  },
  "dependencies": {
    "@conciv/embed": "workspace:^",
    "@conciv/protocol": "workspace:^"
  },
  "peerDependencies": {
    "@types/react": ">=16.8",
    "react": ">=16.8"
  },
  "peerDependenciesMeta": {
    "@types/react": {"optional": true}
  },
  "devDependencies": {
    "@conciv/core": "workspace:^",
    "@conciv/extension-terminal": "workspace:^",
    "@conciv/harness-testkit": "workspace:^",
    "@types/node": "^26.1.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "playwright": "^1.61.1",
    "publint": "^0.3.14",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tsdown": "^0.22.4",
    "typescript": "^6.0.3",
    "vite": "^8.0.16",
    "vitest": "^4.1.8"
  },
  "engines": {"node": ">=22.13"}
}
```

`packages/react/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "jsx": "react-jsx",
    "types": ["vite/client", "node"]
  },
  "include": [
    "src/**/*.ts",
    "test/**/*.ts",
    "test/**/*.tsx",
    "tsdown.config.ts",
    "vite.fixture.config.ts",
    "vitest.config.ts"
  ]
}
```

`packages/react/tsdown.config.ts` (the banner puts `'use client'` at the top of the emitted module so RSC frameworks treat it as a client component — do not rely on directive preservation from source; tsdown 0.22.4 has a top-level `banner` option of shape `{js?, css?, dts?}`, verified against its installed types):

```ts
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@conciv\//, 'react'],
  banner: {js: "'use client';"},
})
```

`packages/react/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
})
```

- [ ] **Step 2: Write the component**

`packages/react/src/index.ts`:

```ts
import {useEffect} from 'react'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): null {
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const extensions = props.extensions
  useEffect(() => {
    const handle = createConciv({apiBase: props.apiBase, settings: props.settings, extensions})
    void handle.mount().catch(() => undefined)
    return () => {
      handle.unmount()
    }
  }, [configKey, extensions])
  return null
}
```

Props are fully reactive: the effect keys on a value-stable serialization of `apiBase`/`settings` plus the `extensions` array identity, so any prop change tears the widget down and boots it with the new configuration (conciv settings and extensions feed router creation at boot — remount IS the correct live-update, there is no partial-update surface). Inline `settings` objects are fine (value-keyed); `extensions` must be identity-stable (module constant or `useMemo`) or every render remounts. Mount rejections are swallowed here because `createConciv` already logged them and an effect has no error channel. The component renders `null`: the widget owns its own body-level shadow root.

- [ ] **Step 3: Write the README**

`packages/react/README.md`:

````markdown
# @conciv/react

React component for the [conciv](https://conciv.dev) widget.

```tsx
import {ConcivWidget} from '@conciv/react'

export function App() {
  return (
    <>
      <YourApp />
      <ConcivWidget />
    </>
  )
}
```

Renders nothing in the React tree; mounts the conciv widget in its own shadow root on `document.body` and removes it when the component unmounts. SSR-safe (`'use client'`, no-op without a DOM). No Solid tooling or build plugin required.

Props (all optional): `extensions` (conciv extensions to load), `settings` (same shape as the `pw-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution).

Prop changes remount the widget with the new configuration. Keep the `extensions` array identity-stable (module constant or `useMemo`) — a fresh array each render remounts each render; `settings`/`apiBase` are compared by value, inline literals are fine. Passing `apiBase` explicitly is the recommended secure usage — the `?core=` query-param fallback is restricted to loopback/same-origin URLs. The widget's font and CSS `@property` registrations stay in `document.head` after unmount (idempotent, reused on remount).
````

- [ ] **Step 4: Install and build**

Run: `pnpm install && pnpm turbo run build --filter=@conciv/react`
Expected: lockfile picks up the new package; tsdown emits `dist/index.js` + `dist/index.d.ts`.
Verify the directive: `head -1 packages/react/dist/index.js` → `'use client';`

- [ ] **Step 5: Write the failing IT with its host fixture**

`packages/react/test/fixtures/host/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>conciv react host</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`packages/react/test/fixtures/host/main.tsx` (imports the built package by self-reference — this exercises the real consumer path through `exports`; StrictMode needs a development React build, hence the fixture builds in development mode):

```tsx
import {StrictMode, useState} from 'react'
import {createRoot} from 'react-dom/client'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/react'

const apiBase = new URLSearchParams(window.location.search).get('core') ?? ''
const extensions = [terminal]

function App() {
  const [enabled, setEnabled] = useState(true)
  const [defaultOpen, setDefaultOpen] = useState(false)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      <button onClick={() => setDefaultOpen(true)}>open by default</button>
      {enabled ? <ConcivWidget extensions={extensions} apiBase={apiBase} settings={{defaultOpen}} /> : null}
    </>
  )
}

const container = document.getElementById('app')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
```

`packages/react/vite.fixture.config.ts`:

```ts
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('test/fixtures/host', import.meta.url)),
  define: {'process.env.NODE_ENV': '"development"'},
  build: {
    outDir: fileURLToPath(new URL('test/dist', import.meta.url)),
    emptyOutDir: true,
    minify: false,
  },
})
```

`packages/react/test/helpers/boot.ts` (same shape as the embed helper — a real core with a fake harness):

```ts
import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'

export type WidgetKit = Kit & {harness: FakeHarness}

export async function bootWidgetKit(): Promise<WidgetKit> {
  const harness = createFakeHarness({id: 'fake-react', text: 'Hello from conciv'})
  const kit = await createTestkit(harness, async (env) => {
    const {app, disposers} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: '',
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: env.cwd,
      openInEditor: () => {},
      harness: env.harness,
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }).setup()
  return {...kit, harness}
}
```

`packages/react/test/helpers/host.ts` (static server over the built fixture):

```ts
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type Server} from 'node:http'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(dirname, '../dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

export async function serveDist(): Promise<{base: string; close: () => Promise<void>}> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const file = path.join(distDir, rel)
    if (!file.startsWith(distDir) || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, {'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'})
    res.end(fs.readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
```

`packages/react/test/widget.it.test.ts`:

```ts
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootWidgetKit, type WidgetKit} from './helpers/boot.js'
import {serveDist} from './helpers/host.js'

let browser: Browser
let kit: WidgetKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootWidgetKit()
  host = await serveDist()
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openPage(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(`${host.base}/?core=${encodeURIComponent(kit.base)}`, {waitUntil: 'domcontentloaded'})
  return page
}

describe('ConcivWidget in a real React app', () => {
  it('mounts exactly one widget under StrictMode', async () => {
    const page = await openPage()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).count(), {timeout: 15_000})
      .toBe(1)
    expect(await page.getByRole('button', {name: 'Open conciv chat'}).count()).toBe(1)
    await page.close()
  })

  it('removing the component removes the widget, re-adding restores it', async () => {
    const page = await openPage()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).count(), {timeout: 10_000})
      .toBe(0)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.close()
  })

  it('a settings prop change remounts the widget with the new configuration', async () => {
    const page = await openPage()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.getByRole('button', {name: 'open by default'}).click()
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(1)
    await page.close()
  })
})
```

The settings-change test proves reactivity end-to-end through an observable behavior: flipping `defaultOpen` to `true` remounts the widget, and the remounted widget auto-opens its panel (the `dialog` role name matches `embed.it.test.ts`).

- [ ] **Step 6: Run the IT**

Run: `pnpm turbo run test --filter=@conciv/react --force`
Expected: fixture builds (development mode), both tests PASS. StrictMode's mount → unmount → mount cycle exercises abort-during-mount for free; a leaked double-mount would fail the `count === 1` assertion.

- [ ] **Step 7: Package checks**

Run: `pnpm --filter @conciv/react publint && pnpm --filter @conciv/react attw && pnpm --filter @conciv/react typecheck && pnpm --filter @conciv/react lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/react pnpm-lock.yaml
git commit -m "feat(react): @conciv/react ConcivWidget component" -- packages/react pnpm-lock.yaml
```

---

### Task 4: `@conciv/preact` package

**Files:** mirror of Task 3 under `packages/preact` — `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `vite.fixture.config.ts`, `src/index.ts`, `README.md`, `test/fixtures/host/{index.html,main.tsx}`, `test/helpers/{boot.ts,host.ts}`, `test/widget.it.test.ts`.

**Interfaces:**
- Consumes: `createConciv`, `ConcivInit`, `ConcivSettingsInit` from `@conciv/embed`.
- Produces: `function ConcivWidget(props: ConcivWidgetProps): null` (same contract as Task 3, Preact runtime).

- [ ] **Step 1: Scaffold**

`packages/preact/package.json` — copy Task 3's file with these differences (everything else identical):

```json
  "name": "@conciv/preact",
  "description": "Preact component for the conciv widget: render <ConcivWidget /> to mount the conciv dev agent in any Preact app.",
  "keywords": ["ai", "chat", "conciv", "preact", "widget"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/conciv-dev/conciv.git",
    "directory": "packages/preact"
  },
  "peerDependencies": {
    "preact": ">=10"
  },
```

Remove `peerDependenciesMeta`, and in `devDependencies` replace the react entries (`@types/react`, `@types/react-dom`, `react`, `react-dom`) with:

```json
    "preact": "^10.29.7",
```

`packages/preact/tsconfig.json` — same as Task 3 plus `jsxImportSource`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["vite/client", "node"]
  },
  "include": [
    "src/**/*.ts",
    "test/**/*.ts",
    "test/**/*.tsx",
    "tsdown.config.ts",
    "vite.fixture.config.ts",
    "vitest.config.ts"
  ]
}
```

`packages/preact/tsdown.config.ts` — no `'use client'` banner (no RSC in Preact):

```ts
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
  external: [/^@conciv\//, 'preact', 'preact/hooks'],
})
```

`packages/preact/vitest.config.ts` and `packages/preact/vite.fixture.config.ts`: identical to Task 3's (the fixture's JSX import source comes from this package's tsconfig, which esbuild discovers).

- [ ] **Step 2: Component**

`packages/preact/src/index.ts`:

```ts
import {useEffect} from 'preact/hooks'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): null {
  const configKey = JSON.stringify({apiBase: props.apiBase, settings: props.settings})
  const extensions = props.extensions
  useEffect(() => {
    const handle = createConciv({apiBase: props.apiBase, settings: props.settings, extensions})
    void handle.mount().catch(() => undefined)
    return () => {
      handle.unmount()
    }
  }, [configKey, extensions])
  return null
}
```

Same reactive contract as the React component (value-keyed `apiBase`/`settings`, identity-keyed `extensions`).

`packages/preact/README.md`: copy Task 3's README with `@conciv/react` → `@conciv/preact`, "React" → "Preact", and drop the `'use client'` mention (the SSR no-op sentence stays).

- [ ] **Step 3: Fixture**

`packages/preact/test/fixtures/host/index.html`: identical to Task 3's (title `conciv preact host`).

`packages/preact/test/fixtures/host/main.tsx`:

```tsx
import {render} from 'preact'
import {useState} from 'preact/hooks'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/preact'

const apiBase = new URLSearchParams(window.location.search).get('core') ?? ''
const extensions = [terminal]

function App() {
  const [enabled, setEnabled] = useState(true)
  const [defaultOpen, setDefaultOpen] = useState(false)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      <button onClick={() => setDefaultOpen(true)}>open by default</button>
      {enabled ? <ConcivWidget extensions={extensions} apiBase={apiBase} settings={{defaultOpen}} /> : null}
    </>
  )
}

const container = document.getElementById('app')
if (container) render(<App />, container)
```

`packages/preact/test/helpers/boot.ts`: copy Task 3's with harness id `'fake-preact'`.
`packages/preact/test/helpers/host.ts`: identical to Task 3's.

- [ ] **Step 4: IT**

`packages/preact/test/widget.it.test.ts`: identical to Task 3's except the describe title (`'ConcivWidget in a real Preact app'`) and the first test's name (`'mounts exactly one widget'` — no StrictMode in Preact; the single-root assertion stays).

- [ ] **Step 5: Install, build, test, package checks**

```bash
pnpm install
pnpm turbo run build --filter=@conciv/preact
pnpm turbo run test --filter=@conciv/preact --force
pnpm --filter @conciv/preact publint && pnpm --filter @conciv/preact attw && pnpm --filter @conciv/preact typecheck && pnpm --filter @conciv/preact lint
```

Expected: all pass; both ITs green.

- [ ] **Step 6: Commit**

```bash
git add packages/preact pnpm-lock.yaml
git commit -m "feat(preact): @conciv/preact ConcivWidget component" -- packages/preact pnpm-lock.yaml
```

---

### Task 5: Publishing wiring, fallow, changeset, full gates

**Files:**
- Modify: `packages/publish/src/guards.ts` (PUBLIC_PACKAGES array)
- Modify: `.fallowrc.json` (publicPackages array)
- Create: `.changeset/react-preact-widget-wrappers.md`

**Interfaces:**
- Consumes: package names `@conciv/react`, `@conciv/preact` from Tasks 3–4.
- Produces: release-ready state; one changeset bumps the whole fixed `@conciv/*` set.

- [ ] **Step 1: Add both packages to the publish guard**

In `packages/publish/src/guards.ts`, add to the `PUBLIC_PACKAGES` array (after the `'@conciv/embed',` entry):

```ts
  '@conciv/react',
  '@conciv/preact',
```

- [ ] **Step 2: Add both packages to fallow's publicPackages**

In `.fallowrc.json`, add `"@conciv/react"` and `"@conciv/preact"` to the `publicPackages` array (keep it alphabetically ordered: `"@conciv/preact"` after `"@conciv/plugin"`, `"@conciv/react"` after `"@conciv/protocol"`). Their exports are public API and must never be flagged unused.

- [ ] **Step 3: Write the changeset**

`.changeset/react-preact-widget-wrappers.md`:

```markdown
---
'@conciv/react': patch
---

New @conciv/react and @conciv/preact packages: render <ConcivWidget /> to mount the conciv widget in React/Preact apps, backed by the new createConciv mount/unmount handle in @conciv/embed.
```

(One entry is enough — the `fixed: [["@conciv/*"]]` group bumps every package in lockstep.)

- [ ] **Step 4: Run the publish-guard test**

Run: `pnpm turbo run test --filter=@conciv/publish --force`
Expected: PASS — `assertPublicSet` sees both new `private`-unset packages listed.

- [ ] **Step 5: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. If any appear (dead code, unused exports/deps), fix them before proceeding; verify any suspected-dead export with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'` first.

- [ ] **Step 6: Full gates**

```bash
pnpm typecheck
pnpm build
pnpm turbo run test --force
pnpm release:check
```

Expected: all green. `--force` is mandatory — cached green masks regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/publish/src/guards.ts .fallowrc.json .changeset/react-preact-widget-wrappers.md
git commit -m "chore(release): wire @conciv/react + @conciv/preact into publish guard, fallow, changeset" -- packages/publish/src/guards.ts .fallowrc.json .changeset/react-preact-widget-wrappers.md
```

---

### Task 6: Next.js app-router e2e smoke for the component path

The plugin-inject path is e2e-covered (`e2e/nextjs`), but `<ConcivWidget/>` — the thing these packages exist for — would otherwise ship with zero SSR/RSC coverage. This validates: server import of a `'use client'` package doesn't break the RSC render, the banner directive is honored, the dynamic mount-impl chunk loads under Next's bundler, and there is no hydration mismatch.

**Files:**
- Create: `e2e/nextjs-component/` (copy of `e2e/nextjs` minus `node_modules`, `.next`, `test-results`)
- Modify (within the copy): `package.json`, `instrumentation-client.ts`, `app/layout.tsx`
- Create (within the copy): `app/conciv-widget-client.tsx`

**Interfaces:**
- Consumes: `ConcivWidget` from `@conciv/react` (Task 3); existing `@conciv/e2e-utils/widget` helpers; the `@conciv/it` nextjs plugin (kept for the dev server + `pw-api-base` meta — only the mount-script inject is replaced by the component).
- Produces: e2e coverage of the component path; no exports.

- [ ] **Step 1: Copy the app and rewire the mount**

```bash
cp -R e2e/nextjs e2e/nextjs-component
rm -rf e2e/nextjs-component/node_modules e2e/nextjs-component/.next e2e/nextjs-component/test-results
```

In `e2e/nextjs-component/package.json`: change `name` to the `e2e/nextjs` name with a `-component` suffix, and add to `dependencies`:

```json
    "@conciv/react": "workspace:*",
    "@conciv/extension-terminal": "workspace:*",
```

In `instrumentation-client.ts`: delete the `import '@conciv/it/plugin/nextjs/widget'` line (delete the file if that was its only content and nothing references it).

Create `app/conciv-widget-client.tsx`:

```tsx
'use client'

import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/react'

export function ConcivWidgetClient() {
  return <ConcivWidget extensions={[terminal]} />
}
```

In `app/layout.tsx`: render `<ConcivWidgetClient />` as the last child inside `<body>`. No `apiBase` prop — the `withConciv` next plugin still injects the `pw-api-base` meta, so the default resolution exercises the real mixed setup (plugin serves, component mounts).

The Playwright spec stays byte-identical to `e2e/nextjs`'s — `expectWidgetBoots` already asserts the FAB, opens the panel, and fails on any page/console error (which is what would surface a hydration mismatch or broken client boundary).

- [ ] **Step 2: Register the app per e2e conventions**

Read `e2e/README.md` and mirror whatever registration `e2e/nextjs` has (workspace globs, turbo pipeline, CI matrix). Confirm `pnpm install` picks the new package up.

- [ ] **Step 3: Run it**

Run: `pnpm install && pnpm turbo run test:e2e --filter=<new-package-name>`
Expected: PASS — widget boots from the component render with zero page errors and zero console errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/nextjs-component pnpm-lock.yaml
git commit -m "test(e2e): nextjs app-router coverage for the ConcivWidget component path" -- e2e/nextjs-component pnpm-lock.yaml
```

---

## Grounding vs TanStack devtools (intentional deviations)

The architecture is theirs: framework-free core handle, `typeof document` guard, dynamic import of the Solid impl, abort-on-unmount, thin wrapper mounting from an effect. Four deliberate deviations — do not "fix" these back toward the reference:

1. **`mount(): Promise<void>`** (theirs: `void`, console-only errors). Full-feature requirement: callers get a programmatic failure signal. Wrappers ignore it exactly like their wrappers ignore mount internals.
2. **`unmount()` is a no-op when unmounted** (theirs: throws `'Devtools is not mounted'`). Their behavior breaks React effect cleanup after a failed/aborted mount; ours is safe by construction.
3. **Prop changes remount** (theirs: `setConfig` live-updates plugins without remount). Their plugins are leaf content portaled into a running shell; conciv's `settings`/`extensions`/`apiBase` feed router creation at boot, so a clean teardown + boot IS the live-update. Value-keyed effect deps make it automatic.
4. **Page-level singleton claim** (theirs: per-instance throw, no cross-instance guard). Their devtools mounts into a caller-provided element; our widget owns one body-level shadow root per page, so the synchronous `[data-conciv-root]` claim is required.

## Release note (no action in this plan)

npm OIDC trusted publishing cannot create NEW packages. Before the next release lands, `@conciv/react` and `@conciv/preact` need a manual first-publish bootstrap. First-publish security checklist (flag to the user at handoff — do not publish from the laptop without walking through it):
- npm account 2FA enforced; use a granular per-package publish token, never an org-wide token.
- Run the publish with `--provenance` from CI if at all achievable; a manual publish carries no provenance attestation.
- Configure the per-package trusted publisher IMMEDIATELY after the bootstrap so 0.0.12+ regains OIDC provenance (same procedure as `@conciv/try`).

## Known verification points for the implementer

- After Task 1, `packages/embed/dist/mount.js` must contain no static `import` of the app graph (only the dynamic `import('./mount-impl.js')`) — that is the SSR-safety property the node test relies on.
- `window.__TSR_ROUTER__` capture/restore in `mount-impl.tsx` is load-bearing; removing it breaks host apps using TanStack Router.
- If the `'use client'` banner is missing from `packages/react/dist/index.js` after build, fix the tsdown `banner: {js: ...}` config — do not move the directive into source and hope it survives bundling.
- Preact `useState` supports the lazy-initializer form used in `packages/preact/src/index.ts` (confirmed in the Preact hooks docs).
- The host fixtures import the package by self-reference (`@conciv/react` from inside `packages/react`); if vite fails to resolve the self-reference, fall back to importing `../../../dist/index.js` — never `../../../src`.
- `mount()` rejects on chunk-load or boot failure (after cleanup + one `console.error`); the wrappers swallow the rejection because effects have no error channel and the error is already logged.
- The `codeSplitting: false` output setting in `vite.global.config.ts` (Step 5) is load-bearing — the iife global entry pulls `mount.ts`'s dynamic import and cannot code-split.
