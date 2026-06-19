# Next.js Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the mandarax dev agent inside a Next.js (App Router, Turbopack) app via three one-line convention touchpoints, plus a `create-next-app`-scaffolded example.

**Architecture:** Next owns HTML rendering, so there is no bundler injection seam. Integration uses Next's framework conventions: `instrumentation.ts` `register()` boots the engine server-side; `instrumentation-client.ts` runs client code on every page to mount the widget; `withMandarax(nextConfig)` pins a fixed engine port and inlines it for the client via Next's `env`. No proxy, no React component, no BundlerBridge.

**Tech Stack:** TypeScript, pnpm workspaces, tsdown (plugin build), Next.js 16 (App Router + Turbopack), SolidJS widget, srvx/h3 engine, Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-06-14-nextjs-integration-design.md`

---

## File Structure

- `packages/protocol/src/config-types.ts` — add `port?: number` to `MandaraxConfig`.
- `packages/core/src/engine.ts` — `StartOpts.port?: number`; `serve({port})`.
- `packages/plugin/src/core/boot.ts` — forward `options.port` to `start`.
- `packages/widget/src/mount.tsx` — resolve apiBase from `window.__MANDARAX_API_BASE__` fallback.
- `packages/plugin/src/core/nextjs.ts` — NEW: `withMandarax` + `register`.
- `packages/plugin/src/nextjs.ts` — NEW: server entry (re-exports `withMandarax`, `register`).
- `packages/plugin/src/nextjs-widget.ts` — NEW: client entry (sets apiBase, mounts widget).
- `packages/plugin/package.json` — add `./nextjs` + `./nextjs/widget` exports, `next` peer dep.
- `packages/plugin/tsdown.config.ts` — add the two new entries.
- `apps/examples/nextjs-app/` — NEW: scaffolded example wired to the three touchpoints.
- `apps/examples/nextjs-app/tests/widget.smoke.spec.ts` — NEW: Playwright smoke.

---

### Task 1: Engine accepts a fixed port

**Files:**

- Modify: `packages/core/src/engine.ts:11-17` (StartOpts), `:52` (serve call)
- Test: `packages/core/test/engine-port.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/engine-port.test.ts
import {test, expect} from 'vitest'
import {start} from '../src/engine.js'

test('start boots on the requested fixed port', async () => {
  const engine = await start({
    options: {harnessBin: 'true'},
    root: process.cwd(),
    launchEditor: () => {},
    port: 41799,
  })
  expect(engine.port).toBe(41799)
  await engine.stop()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/core test -- engine-port`
Expected: FAIL — `port` is not an accepted option / engine boots on a random port (not 41799).

- [ ] **Step 3: Add `port` to StartOpts and pass it to `serve`**

In `packages/core/src/engine.ts`, add to `StartOpts` (after `childEnv`):

```ts
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: number
```

Change the `serve` call (currently `port: 0`):

```ts
const server = serve({fetch: app.fetch, port: opts.port ?? 0, hostname: '127.0.0.1'})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/core test -- engine-port`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine.ts packages/core/test/engine-port.test.ts
git commit -m "feat(core): start accepts a fixed port"
```

---

### Task 2: Thread `port` through config + booter

**Files:**

- Modify: `packages/protocol/src/config-types.ts:4-16`
- Modify: `packages/plugin/src/core/boot.ts:21-26`

- [ ] **Step 1: Add `port` to MandaraxConfig**

In `packages/protocol/src/config-types.ts`, add inside the interface (after `testRunner`):

```ts
  /** Fixed engine port. Used by the Next.js integration so server boot + client widget agree. */
  port?: number
```

- [ ] **Step 2: Forward the port in the booter**

In `packages/plugin/src/core/boot.ts`, update the `start({...})` call to pass the port:

```ts
booting = start({
  options,
  root,
  port: options.port,
  launchEditor: openInEditor,
  childEnv: (corePort) => ({...process.env, PATH: agentPath, MANDARAX_PORT: String(corePort)}),
})
```

- [ ] **Step 3: Typecheck both packages**

Run: `pnpm --filter @mandarax/protocol typecheck && pnpm --filter @mandarax/plugin typecheck`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/config-types.ts packages/plugin/src/core/boot.ts
git commit -m "feat(protocol,plugin): plumb fixed port through config + booter"
```

---

### Task 3: Widget resolves apiBase without a meta tag

**Files:**

- Modify: `packages/widget/src/mount.tsx:11-19`, `:28-32`
- Test: `packages/widget/test/api-base.test.ts`

The Next client entry cannot inject a `<meta>` tag (no bundler HTML seam). It sets `window.__MANDARAX_API_BASE__` instead. The widget must prefer that global, falling back to the existing meta tag (Vite path unchanged).

- [ ] **Step 1: Write the failing test**

```ts
// packages/widget/test/api-base.test.ts
import {test, expect, beforeEach} from 'vitest'
import {resolveApiBase} from '../src/mount.js'

beforeEach(() => {
  document.head.innerHTML = ''
  delete (window as Window & {__MANDARAX_API_BASE__?: string}).__MANDARAX_API_BASE__
})

test('prefers window.__MANDARAX_API_BASE__ over the meta tag', () => {
  document.head.innerHTML = '<meta name="pw-api-base" content="http://meta:1">'
  ;(window as Window & {__MANDARAX_API_BASE__?: string}).__MANDARAX_API_BASE__ = 'http://global:2'
  expect(resolveApiBase()).toBe('http://global:2')
})

test('falls back to the meta tag when the global is unset', () => {
  document.head.innerHTML = '<meta name="pw-api-base" content="http://meta:1">'
  expect(resolveApiBase()).toBe('http://meta:1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/widget test -- api-base`
Expected: FAIL — `resolveApiBase` is not exported.

- [ ] **Step 3: Add the resolver and use it**

In `packages/widget/src/mount.tsx`, extend the global declaration and add `resolveApiBase`:

```ts
declare global {
  interface Window {
    __MANDARAX_RENDER_TEST_CARD__?: () => void
    __MANDARAX_API_BASE__?: string
  }
}

// apiBase comes from a global (Next has no HTML-injection seam) or the meta tag (Vite path).
export function resolveApiBase(): string {
  return window.__MANDARAX_API_BASE__ ?? metaContent('pw-api-base')
}
```

In `mountWidget`, replace the apiBase line:

```ts
const apiBase = resolveApiBase()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/widget test -- api-base`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/mount.tsx packages/widget/test/api-base.test.ts
git commit -m "feat(widget): resolve apiBase from window global, meta fallback"
```

---

### Task 4: `withMandarax` + `register` core

**Files:**

- Create: `packages/plugin/src/core/nextjs.ts`
- Test: `packages/plugin/test/nextjs.test.ts`

`withMandarax` is pure config transformation (testable). `register` boots the engine and is exercised by the example smoke (Task 7), not unit-tested here.

- [ ] **Step 1: Write the failing test**

```ts
// packages/plugin/test/nextjs.test.ts
import {test, expect} from 'vitest'
import {withMandarax, MANDARAX_DEFAULT_PORT} from '../src/core/nextjs.js'

test('withMandarax inlines the default port for the client', () => {
  const cfg = withMandarax({reactStrictMode: true})
  expect(cfg.reactStrictMode).toBe(true)
  expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBe(String(MANDARAX_DEFAULT_PORT))
  expect(JSON.parse(cfg.env?.MANDARAX_OPTIONS ?? '{}').port).toBe(MANDARAX_DEFAULT_PORT)
})

test('withMandarax honours an explicit port', () => {
  const cfg = withMandarax({}, {port: 5000})
  expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBe('5000')
})

test('withMandarax is a no-op passthrough when disabled', () => {
  const cfg = withMandarax({reactStrictMode: true}, {enabled: false})
  expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/plugin test -- nextjs`
Expected: FAIL — `../src/core/nextjs.js` does not exist.

- [ ] **Step 3: Implement `core/nextjs.ts`**

```ts
// packages/plugin/src/core/nextjs.ts
import type {MandaraxConfig} from '@mandarax/protocol/config-types'

// Next owns HTML rendering, so mandarax integrates via conventions, not a bundler hook:
// withMandarax pins a fixed engine port and inlines it for the client; register() boots the engine.
export const MANDARAX_DEFAULT_PORT = 41700

type NextConfig = Record<string, unknown> & {env?: Record<string, string>}

export function withMandarax<T extends NextConfig>(nextConfig: T = {} as T, options: MandaraxConfig = {}): T {
  if (options.enabled === false) return nextConfig
  const port = options.port ?? MANDARAX_DEFAULT_PORT
  const resolved: MandaraxConfig = {...options, port}
  return {
    ...nextConfig,
    env: {
      ...nextConfig.env,
      NEXT_PUBLIC_MANDARAX_PORT: String(port),
      MANDARAX_OPTIONS: JSON.stringify(resolved),
    },
  }
}

// Server-startup hook for instrumentation.ts. Node runtime + dev only; boots the engine once.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'production') return
  const options = JSON.parse(process.env.MANDARAX_OPTIONS ?? '{}') as MandaraxConfig
  if (options.enabled === false) return
  const {makeEngineBooter} = await import('./boot.js')
  await makeEngineBooter(options, process.cwd())()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/plugin test -- nextjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src/core/nextjs.ts packages/plugin/test/nextjs.test.ts
git commit -m "feat(plugin): withMandarax config wrapper + instrumentation register"
```

---

### Task 5: Next.js entries + packaging

**Files:**

- Create: `packages/plugin/src/nextjs.ts`, `packages/plugin/src/nextjs-widget.ts`
- Modify: `packages/plugin/tsdown.config.ts:7`, `packages/plugin/package.json:10-35,57-59`

- [ ] **Step 1: Create the server entry**

```ts
// packages/plugin/src/nextjs.ts
export {withMandarax, register, MANDARAX_DEFAULT_PORT} from './core/nextjs.js'
export type {MandaraxConfig} from '@mandarax/protocol/config-types'
```

- [ ] **Step 2: Create the client entry**

Imported from `instrumentation-client.ts`; runs client-side, on every page. Sets apiBase from the inlined port, then loads the self-mounting widget once the DOM is ready. Dev only. No IIFE.

```ts
// packages/plugin/src/nextjs-widget.ts
// Client entry for instrumentation-client.ts: mount the mandarax widget against the pinned engine port.
const port = process.env.NEXT_PUBLIC_MANDARAX_PORT

function startWidget(): void {
  window.__MANDARAX_API_BASE__ = `http://127.0.0.1:${port}`
  void import('@mandarax/widget')
}

if (typeof window !== 'undefined' && port && process.env.NODE_ENV !== 'production') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWidget, {once: true})
  } else {
    startWidget()
  }
}

declare global {
  interface Window {
    __MANDARAX_API_BASE__?: string
  }
}

export {}
```

- [ ] **Step 3: Add both entries to the tsdown build**

In `packages/plugin/tsdown.config.ts`, extend the `entry` array:

```ts
  entry: ['src/index.ts', 'src/vite.ts', 'src/webpack.ts', 'src/rspack.ts', 'src/rollup.ts', 'src/esbuild.ts', 'src/nextjs.ts', 'src/nextjs-widget.ts'],
```

- [ ] **Step 4: Add the exports + peer dep to package.json**

In `packages/plugin/package.json`, add to `exports` (after the `./esbuild` block):

```json
    "./nextjs": {
      "types": "./dist/nextjs.d.ts",
      "import": "./dist/nextjs.js"
    },
    "./nextjs/widget": {
      "types": "./dist/nextjs-widget.d.ts",
      "import": "./dist/nextjs-widget.js"
    }
```

Add a `peerDependenciesMeta` so `next` stays optional, and list `next` under `peerDependencies`:

```json
  "peerDependencies": {
    "vite": "^6.0.0 || ^7.0.0 || ^8.0.0",
    "next": "^15.3.0 || ^16.0.0"
  },
  "peerDependenciesMeta": {
    "vite": {"optional": true},
    "next": {"optional": true}
  },
```

- [ ] **Step 5: Build the plugin and verify the new artifacts exist**

Run: `pnpm --filter @mandarax/plugin build && ls packages/plugin/dist/nextjs.js packages/plugin/dist/nextjs-widget.js`
Expected: both files listed, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin/src/nextjs.ts packages/plugin/src/nextjs-widget.ts packages/plugin/tsdown.config.ts packages/plugin/package.json
git commit -m "feat(plugin): @mandarax/plugin/nextjs server + client entries"
```

---

### Task 6: Scaffold and wire the example app

**Files:**

- Create: `apps/examples/nextjs-app/` (via `create-next-app`)
- Create/modify: `next.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `package.json`

- [ ] **Step 1: Scaffold with create-next-app**

Run from the repo root:

```bash
pnpm create next-app@latest apps/examples/nextjs-app --ts --app --turbopack --no-tailwind --no-src-dir --eslint --import-alias "@/*" --use-pnpm
```

Expected: a Next.js App Router + TypeScript + Turbopack project under `apps/examples/nextjs-app`.

- [ ] **Step 2: Add the plugin dependency**

Edit `apps/examples/nextjs-app/package.json` to add the workspace dependency, then install:

```json
  "dependencies": {
    "@mandarax/plugin": "workspace:*"
  }
```

Run: `pnpm install`
Expected: workspace link resolves; no errors.

- [ ] **Step 3: Wrap the Next config**

Replace `apps/examples/nextjs-app/next.config.ts` with:

```ts
import type {NextConfig} from 'next'
import {withMandarax} from '@mandarax/plugin/nextjs'

const nextConfig: NextConfig = {}

export default withMandarax(nextConfig)
```

- [ ] **Step 4: Add the server instrumentation**

Create `apps/examples/nextjs-app/instrumentation.ts`:

```ts
export {register} from '@mandarax/plugin/nextjs'
```

- [ ] **Step 5: Add the client instrumentation**

Create `apps/examples/nextjs-app/instrumentation-client.ts`:

```ts
import '@mandarax/plugin/nextjs/widget'
```

- [ ] **Step 6: Verify the dev server boots and the engine answers**

Run (background): `pnpm --filter nextjs-app dev` (note the actual package name from its package.json `name`).
Then in another shell: `curl -s http://127.0.0.1:41700/api/chat/available` (use the engine's known route; adjust to the route `probeChatAvailable` calls).
Expected: dev server compiles; the curl returns a 200/JSON, proving the engine booted on the pinned port. Stop the dev server afterward.

- [ ] **Step 7: Commit**

```bash
git add apps/examples/nextjs-app
git commit -m "feat(examples): Next.js App Router example wired to mandarax"
```

---

### Task 7: Browser smoke test

**Files:**

- Create: `apps/examples/nextjs-app/tests/widget.smoke.spec.ts`
- Modify: `apps/examples/nextjs-app/package.json` (add `playwright` devDep + `test:smoke` script)

Mirrors the repo's existing real-browser Playwright ITs: start `next dev`, load the page, assert the widget mounts into its Shadow DOM. The engine boots at server start and `probeChatAvailable` only needs the routes live (no harness process required), so the widget renders without `claude` installed.

- [ ] **Step 1: Add Playwright + script**

In `apps/examples/nextjs-app/package.json` add:

```json
  "devDependencies": {
    "@playwright/test": "^1.60.0"
  },
  "scripts": {
    "test:smoke": "playwright test"
  }
```

Run: `pnpm install && pnpm --filter nextjs-app exec playwright install chromium`
Expected: chromium installed.

- [ ] **Step 2: Write the smoke test**

```ts
// apps/examples/nextjs-app/tests/widget.smoke.spec.ts
import {test, expect} from '@playwright/test'
import {spawn, type ChildProcess} from 'node:child_process'

let dev: ChildProcess

test.beforeAll(async () => {
  dev = spawn('pnpm', ['dev'], {cwd: process.cwd(), stdio: 'inherit'})
  // wait for the dev server to answer
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3000')
      if (r.ok) break
    } catch {}
    await new Promise((res) => setTimeout(res, 1000))
  }
})

test.afterAll(() => {
  dev?.kill('SIGTERM')
})

test('mandarax widget mounts into the shadow root', async ({page}) => {
  await page.goto('http://127.0.0.1:3000')
  const root = page.locator('[data-mandarax-root]')
  await expect(root).toBeAttached({timeout: 15000})
})
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm --filter nextjs-app test:smoke`
Expected: PASS — the `[data-mandarax-root]` element attaches, proving `instrumentation-client.ts` loaded the widget and it mounted against the pinned port.

- [ ] **Step 4: Commit**

```bash
git add apps/examples/nextjs-app/tests apps/examples/nextjs-app/package.json
git commit -m "test(examples): browser smoke for Next.js widget mount"
```

---

### Task 8: Regression + production-gating check

**Files:** none (verification only)

- [ ] **Step 1: Vite path unchanged**

Run: `pnpm --filter @mandarax/plugin test && pnpm --filter @mandarax/widget test`
Expected: all existing tests still pass.

- [ ] **Step 2: Production build omits the widget/engine**

Run: `pnpm --filter nextjs-app build && pnpm --filter nextjs-app start &` then `curl -s http://127.0.0.1:41700/api/chat/available`
Expected: build succeeds; the curl FAILS to connect (engine not booted — `register` is dev-gated), confirming zero production footprint. Stop the server.

- [ ] **Step 3: Commit (if any doc tweaks needed)**

No code change expected. If verification surfaced a gap, fix it under the relevant task above and re-run.

---

## Notes for the implementer

- **Package name in `--filter`:** `create-next-app` names the package after the directory (`nextjs-app`). Confirm via `apps/examples/nextjs-app/package.json` `name` before using `pnpm --filter`.
- **The probe route:** Step 6 of Task 6 and Task 8 use the route `probeChatAvailable` hits. Open `packages/widget/src/chat-api.ts` to confirm the exact path and adjust the `curl`.
- **`env` inlining caveat:** `withMandarax` relies on Next's `env` config to expose `NEXT_PUBLIC_MANDARAX_PORT` (client) and `MANDARAX_OPTIONS` (server `process.env`). If a future Next version stops inlining non-`NEXT_PUBLIC_` keys into the server runtime, move `MANDARAX_OPTIONS` reading to a `serverRuntimeConfig` or a generated file. Not expected for Next 15.3–16.
- **No IIFEs, functions over classes, one-line comments** — per repo conventions; the code above follows them.
