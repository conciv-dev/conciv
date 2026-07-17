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
- Modify: `packages/embed/vite.config.ts`
- Modify: `packages/embed/vite.global.config.ts`
- Test: `packages/embed/test/mount-node.test.ts`

**Interfaces:**
- Consumes: existing `boot` internals from `packages/embed/src/mount.tsx`, `startPagePlane` (`packages/page/src/index.ts:49`, returns `{dispose: () => void}`), `createShadowRoot` (`conciv/shadow`, returns `{host, root}`).
- Produces (later tasks import these from `@conciv/embed`):
  - `type ConcivSettingsInit = {modal?: false | {position?: TriggerPosition}; quickTerminal?: false | {hotkey?: string | string[]}; defaultOpen?: boolean}`
  - `type ConcivInit = {extensions?: AnyExtension[]; settings?: ConcivSettingsInit; apiBase?: string}`
  - `type ConcivHandle = {mount: () => void; unmount: () => void}`
  - `function createConciv(init?: ConcivInit): ConcivHandle`
  - `function mountConciv(extensions: AnyExtension[]): void` (unchanged signature)
  - `function mountImpl(init: ConcivInit): () => void` (internal, from `mount-impl.tsx`)

- [ ] **Step 1: Write the failing node test**

`packages/embed/test/mount-node.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {createConciv, mountConciv} from '../src/mount.js'

describe('createConciv outside a browser', () => {
  it('mount and unmount are no-ops without document', () => {
    const handle = createConciv()
    expect(() => handle.mount()).not.toThrow()
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
  return () => {
    plane.dispose()
    disposeApp()
  }
}

export function mountImpl(init: ConcivInit): () => void {
  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const {host, root} = createShadowRoot()
  let disposed = false
  let disposeBoot: (() => void) | undefined
  void boot(root, init).then(
    (dispose) => {
      if (disposed) {
        dispose()
        return
      }
      disposeBoot = dispose
    },
    (error: unknown) => {
      console.error('[conciv] failed to boot widget', error)
    },
  )
  return () => {
    disposed = true
    disposeBoot?.()
    host.remove()
  }
}
```

Notes for the implementer:
- This is the old `mount.tsx` `boot` with three changes: `init.apiBase ?? resolveApiBase()`, settings from `init.settings` (serialized through the existing `parseConcivSettings` parser) with the `pw-widget` meta as fallback, `init.extensions ?? []`, and the previously-dropped `render()` dispose + `startPagePlane(...).dispose` captured into a returned teardown.
- The `window.__TSR_ROUTER__` capture/restore is load-bearing (embedded TanStack Router clobbers the host app's global otherwise) — keep it exactly.

- [ ] **Step 4: Create `packages/embed/src/mount.ts` and delete `mount.tsx`**

```ts
import type {AnyExtension} from '@conciv/extension'
import type {TriggerPosition} from '@conciv/protocol/config-types'

export type ConcivSettingsInit = {
  modal?: false | {position?: TriggerPosition}
  quickTerminal?: false | {hotkey?: string | string[]}
  defaultOpen?: boolean
}

export type ConcivInit = {
  extensions?: AnyExtension[]
  settings?: ConcivSettingsInit
  apiBase?: string
}

export type ConcivHandle = {
  mount: () => void
  unmount: () => void
}

type MountState = 'unmounted' | 'mounting' | 'mounted'

export function createConciv(init: ConcivInit = {}): ConcivHandle {
  let state: MountState = 'unmounted'
  let abort: AbortController | undefined
  let teardown: (() => void) | undefined

  function mount(): void {
    if (typeof document === 'undefined') return
    if (state !== 'unmounted') return
    if (document.querySelector('[data-conciv-root]')) {
      console.warn('[conciv] widget already mounted, skipping mount')
      return
    }
    state = 'mounting'
    const controller = new AbortController()
    abort = controller
    void import('./mount-impl.js')
      .then(({mountImpl}) => {
        if (controller.signal.aborted) return
        teardown = mountImpl(init)
        state = 'mounted'
      })
      .catch((error: unknown) => {
        state = 'unmounted'
        console.error('[conciv] failed to load widget', error)
      })
  }

  function unmount(): void {
    if (state === 'unmounted') return
    abort?.abort()
    teardown?.()
    teardown = undefined
    state = 'unmounted'
  }

  return {mount, unmount}
}

export function mountConciv(extensions: AnyExtension[]): void {
  createConciv({extensions}).mount()
}
```

Then: `git rm packages/embed/src/mount.tsx`

The type-only imports mean the emitted `mount.js` has zero static runtime imports — it is import-safe under SSR/node. `TriggerPosition` comes from `@conciv/protocol` (published), so the public `.d.ts` never references the private `conciv` app package.

- [ ] **Step 5: Update the two vite configs**

`packages/embed/vite.config.ts` — change the lib entry to the new `.ts` file and give the dynamic chunk a stable name. Replace the `build` block's `lib.entry` and `rollupOptions`:

```ts
    lib: {
      entry: fileURLToPath(new URL('src/mount.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'mount.js',
    },
```

```ts
    rollupOptions: {
      external: isExternal,
      output: {chunkFileNames: '[name].js'},
    },
```

`packages/embed/vite.global.config.ts` — the iife format cannot code-split, so inline the dynamic import. Add to its `build` block (vite 8 is rolldown-based: `codeSplitting: false` is the current spelling; `inlineDynamicImports` is deprecated — verified against rolldown 1.1.5 types):

```ts
    rollupOptions: {output: {codeSplitting: false}},
```

- [ ] **Step 6: Run the node test to verify it passes**

Run: `pnpm --filter @conciv/embed exec vitest run test/mount-node.test.ts`
Expected: PASS (2 tests). The test imports `src/mount.ts` in the node environment; `typeof document === 'undefined'` short-circuits before the dynamic import fires.

- [ ] **Step 7: Build and typecheck the package**

Run: `pnpm turbo run build --filter=@conciv/embed && pnpm --filter @conciv/embed typecheck`
Expected: build succeeds; `dist/` now contains `mount.js`, `mount-impl.js` (chunk), `mount.d.ts`, `mount-impl.d.ts`, and `conciv-widget.global.js`. Verify the chunk exists: `ls packages/embed/dist/mount-impl.js`.

- [ ] **Step 8: Run the full embed test suite (existing ITs must stay green)**

Run: `pnpm turbo run test --filter=@conciv/embed --force`
Expected: PASS — `embed.it.test.ts`, `page-plane.it.test.ts`, `reload-continuity.it.test.ts`, `mount-externals.test.ts`, `mount-node.test.ts`. These load the freshly-rebuilt global bundle, proving the script-tag path (`mountConciv`) is behavior-identical.

- [ ] **Step 9: Commit**

```bash
git add packages/embed/src/mount.ts packages/embed/src/mount-impl.tsx packages/embed/vite.config.ts packages/embed/vite.global.config.ts packages/embed/test/mount-node.test.ts
git rm packages/embed/src/mount.tsx
git commit -m "feat(embed): createConciv mount/unmount handle with lazy mount-impl split" -- packages/embed
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

type Handle = {mount: () => void; unmount: () => void}

declare global {
  interface Window {
    ConcivHandle: {makeHandle: (apiBase: string) => Handle}
    __handle: Handle
  }
}

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit()
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

describe('createConciv lifecycle', () => {
  it('mounts, unmounts, and remounts the widget', async () => {
    const page = await openPage()
    await page.evaluate((apiBase) => {
      window.__handle = window.ConcivHandle.makeHandle(apiBase)
      window.__handle.mount()
    }, kit.base)
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    await expect.poll(() => page.locator('[data-conciv-root]').count(), {timeout: 5_000}).toBe(0)
    await page.evaluate(() => window.__handle.mount())
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.close()
  })

  it('second concurrent mount warns and keeps a single root', async () => {
    const page = await openPage()
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.evaluate((apiBase) => {
      window.ConcivHandle.makeHandle(apiBase).mount()
    }, kit.base)
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.evaluate((apiBase) => {
      window.ConcivHandle.makeHandle(apiBase).mount()
    }, kit.base)
    await expect
      .poll(() => warnings.some((text) => text.includes('[conciv] widget already mounted')), {timeout: 5_000})
      .toBe(true)
    expect(await page.locator('[data-conciv-root]').count()).toBe(1)
    await page.close()
  })

  it('unmount during mount leaves nothing behind', async () => {
    const page = await openPage()
    await page.evaluate((apiBase) => {
      const handle = window.ConcivHandle.makeHandle(apiBase)
      handle.mount()
      handle.unmount()
    }, kit.base)
    await expect.poll(() => page.locator('[data-conciv-root]').count(), {timeout: 5_000}).toBe(0)
    await page.close()
  })
})
```

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
    "@conciv/embed": "workspace:^"
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
import {useEffect, useState} from 'react'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): null {
  const [handle] = useState(() => createConciv(props))
  useEffect(() => {
    handle.mount()
    return () => {
      handle.unmount()
    }
  }, [handle])
  return null
}
```

Props are captured once (first render); changing them later is intentionally unsupported in v0 — remount the component instead. The component renders `null`: the widget owns its own body-level shadow root.

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

function App() {
  const [enabled, setEnabled] = useState(true)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      {enabled ? <ConcivWidget extensions={[terminal]} apiBase={apiBase} /> : null}
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
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    expect(await page.locator('[data-conciv-root]').count()).toBe(1)
    await page.close()
  })

  it('removing the component removes the widget, re-adding restores it', async () => {
    const page = await openPage()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect.poll(() => page.locator('[data-conciv-root]').count(), {timeout: 10_000}).toBe(0)
    await page.getByRole('button', {name: 'toggle widget'}).click()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 15_000})
      .toBe(true)
    await page.close()
  })
})
```

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
import {useEffect, useState} from 'preact/hooks'
import {createConciv, type ConcivInit} from '@conciv/embed'

export type {ConcivInit, ConcivSettingsInit} from '@conciv/embed'

export type ConcivWidgetProps = ConcivInit

export function ConcivWidget(props: ConcivWidgetProps): null {
  const [handle] = useState(() => createConciv(props))
  useEffect(() => {
    handle.mount()
    return () => {
      handle.unmount()
    }
  }, [handle])
  return null
}
```

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

function App() {
  const [enabled, setEnabled] = useState(true)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      {enabled ? <ConcivWidget extensions={[terminal]} apiBase={apiBase} /> : null}
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

## Release note (no action in this plan)

npm OIDC trusted publishing cannot create NEW packages. Before the next release lands, `@conciv/react` and `@conciv/preact` need the manual first-publish + per-package trusted-publisher bootstrap (same procedure as `@conciv/try`). Flag this to the user at handoff — do not attempt to publish from the laptop.

## Known verification points for the implementer

- After Task 1, `packages/embed/dist/mount.js` must contain no static `import` of the app graph (only the dynamic `import('./mount-impl.js')`) — that is the SSR-safety property the node test relies on.
- `window.__TSR_ROUTER__` capture/restore in `mount-impl.tsx` is load-bearing; removing it breaks host apps using TanStack Router.
- If the `'use client'` banner is missing from `packages/react/dist/index.js` after build, fix the tsdown `banner: {js: ...}` config — do not move the directive into source and hope it survives bundling.
- Preact `useState` supports the lazy-initializer form used in `packages/preact/src/index.ts` (confirmed in the Preact hooks docs).
- The host fixtures import the package by self-reference (`@conciv/react` from inside `packages/react`); if vite fails to resolve the self-reference, fall back to importing `../../../dist/index.js` — never `../../../src`.
