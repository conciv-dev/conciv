# Widget-Native Connect (try-it extension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The widget mounts on conciv.dev from the first frame; a site-loaded `try-it` extension renders connect steps inside the widget panel; agent connect swaps panel content to live chat via child-route navigation — frame never remounts.

**Architecture:** Per `docs/superpowers/specs/2026-07-17-widget-native-connect-design.md` (rev 2). New client-only extension package owns all demo UI + probing; widget gains a generic connect boot (deferred rpc, memory history, `/panel/connect` route rendering the `connect` extension slot); site mounts embed as a library and deletes the React stand-in; extension-testkit gains a deferred-core flow.

**Tech Stack:** Solid (widget/extension), TanStack solid-router (`tsr generate` for routes), oRPC (contract), vitest + Playwright (real browser, prebuilt bundles), TanStack Start React (site).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-widget-native-connect-design.md`.
- Zero code comments; no classes; no IIFEs; no `any`/`as`/non-null `!`; guard clauses over `else`.
- Build via turbo only. Widget ITs load PREBUILT bundles — rebuild embed (`pnpm turbo run build --filter=@conciv/embed`) before running them.
- Solid vitest configs pin `test: {environment: 'node'}`.
- Widget UI tested in a REAL browser (Playwright/Chromium), never jsdom. `browser.newPage()`, `domcontentloaded` waits only (live widget SSE keeps networkidle busy forever).
- Commit with pathspec, never push. Run every command from the worktree root `/Users/omrikatz/Public/web/aidx/.claude/worktrees/try-connect-polish`.
- `packages/extensions/try-it` is `"private": true` — NOT added to `PUBLIC_PACKAGES`.
- After route file changes in `apps/conciv`: `pnpm --filter conciv run generate-routes` regenerates `routeTree.gen.ts`.
- Copy strings must match the spec exactly (steps, headline, hints, privacy line).

---

### Task 1: `@conciv/contract` deferred rpc client

**Files:**

- Modify: `packages/contract/src/client.ts`
- Test: `packages/contract/test/deferred-client.test.ts` (create; mirror existing test setup in `packages/contract`)

**Interfaces:**

- Produces:

```ts
export type DeferredRpcClient = {rpc: RpcClient; bind: (apiBase: string) => void; bound: () => boolean}
export function makeDeferredRpcClient(): DeferredRpcClient
```

`rpc` is a stable object; calls before `bind` reject with `Error('conciv core not connected yet')`; after `bind(base)` calls delegate to a real `makeRpcClient(base)` client. `bind` twice throws.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {makeDeferredRpcClient} from '../src/client.js'

describe('makeDeferredRpcClient', () => {
  it('rejects calls before bind', async () => {
    const {rpc, bound} = makeDeferredRpcClient()
    expect(bound()).toBe(false)
    await expect(rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
  })
  it('keeps the same rpc reference across bind', () => {
    const deferred = makeDeferredRpcClient()
    const before = deferred.rpc
    deferred.bind('http://127.0.0.1:1')
    expect(deferred.rpc).toBe(before)
    expect(deferred.bound()).toBe(true)
  })
  it('throws on double bind', () => {
    const deferred = makeDeferredRpcClient()
    deferred.bind('http://127.0.0.1:1')
    expect(() => deferred.bind('http://127.0.0.1:2')).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/contract exec vitest run test/deferred-client.test.ts`
Expected: FAIL — `makeDeferredRpcClient` not exported. (If the package has no test script/vitest yet, add devDep `vitest` + `"test": "vitest run"` + `vitest.config.ts` with `test: {environment: 'node'}` in this step.)

- [ ] **Step 3: Implement** (append to `client.ts`)

The RPCLink `url` option accepts a FUNCTION resolved per request (`Value<Promisable<string | URL>>` — verified in `@orpc/client@1.14.7` types), and throwing inside it is oRPC's own documented pattern for "client not usable yet" (their SSR guide throws inside `origin()`). So the deferred client is a REAL typed client with a lazy url — no Proxy, no casts:

```ts
export type DeferredRpcClient = {rpc: RpcClient; bind: (apiBase: string) => void; bound: () => boolean}

export function makeDeferredRpcClient(): DeferredRpcClient {
  let base: string | null = null
  const link = new RPCLink({
    url: () => {
      if (!base) throw new Error('conciv core not connected yet')
      return `${base}/rpc`
    },
  })
  return {
    rpc: createORPCClient(link),
    bind: (apiBase) => {
      if (base) throw new Error('deferred rpc already bound')
      base = apiBase
    },
    bound: () => base !== null,
  }
}
```

The pre-bind rejection in the test asserts the thrown error surfaces as a rejected call promise (oRPC resolves `url` inside the request pipeline). If the rejection message arrives wrapped, loosen the first test to `.rejects.toThrow(/not connected/)` — do not wrap the link in try/catch plumbing to force the exact string.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @conciv/contract exec vitest run && pnpm turbo run typecheck build --filter=@conciv/contract`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contract/src/client.ts packages/contract/test/deferred-client.test.ts packages/contract/package.json packages/contract/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(contract): deferred rpc client for pre-connect widget boot" -- packages/contract package.json pnpm-lock.yaml
```

(Adjust the pathspec to the files actually touched.)

---

### Task 2: extension contract — `connect` slot, `connectGate`, host `connect` api

**Files:**

- Modify: `packages/extension/src/types.ts` (ExtensionSlot union)
- Modify: `packages/extension/src/define-extension.ts` (`ExtensionMeta`/`ExtensionBuilder` gain `connectGate`)
- Modify: `packages/extension/src/host-context.ts` (`HostWiring` gains `connect`)
- Modify: `packages/extension/src/hooks.tsx` (hostApi gains `useConnect`)
- Test: extend the package's existing type/unit tests minimally

**Interfaces:**

- Produces:

```ts
export type ExtensionSlot = 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget' | 'surface' | 'connect'
export type ConnectGate = {preflight: () => Promise<string | null>}
export type ConnectHostApi = {origin: string; found: (apiBase: string) => void}
```

`ExtensionMeta`/`ExtensionBuilder` carry `connectGate?: ConnectGate` (pass-through in `defineExtension`, like `theme`). `HostWiring.connect?: ConnectHostApi`; `hostApi.useConnect = () => use('connect', 'useConnect')`.

- [ ] **Step 1: Add types + plumbing** (follow how `theme`/`systemPrompt` flow through `defineExtension` — copy that pass-through pattern for `connectGate`).
- [ ] **Step 2: Typecheck the package and its dependents**

Run: `pnpm turbo run typecheck --filter=@conciv/extension...`
Expected: PASS (additive changes only).

- [ ] **Step 3: Unit test** — in the package's existing test location add:

```ts
it('carries connectGate through defineExtension', () => {
  const gate = {preflight: async () => null}
  const ext = defineExtension({name: 'gate-test', connectGate: gate})
  expect(ext.connectGate).toBe(gate)
})
```

Run the package tests; expected PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src packages/extension/test
git commit -m "feat(extension): connect slot, connectGate capability, host connect api" -- packages/extension
```

---

### Task 3: `packages/extensions/try-it` — package, model, probe

**Files:**

- Create: `packages/extensions/try-it/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `uno.config.ts`, `vitest.config.ts` — COPY the shape from `packages/extensions/terminal` MINUS the server pipeline. Verified terminal build anatomy: NO tsdown for client — `"build": "vite build && tsc -p tsconfig.build.json"` (vite lib build of `src/client.tsx` with `vite-plugin-solid`, externals `[/^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/]`, `emptyOutDir: false`, sourcemap; tsc emits d.ts). Own `uno.config.ts` = terminal's verbatim (`content.filesystem: ['src/**/*.{ts,tsx}']`, `presetConciv`). Name `@conciv/extension-try-it`, `"private": true`, exports only `./client`.
- Modify: `packages/embed/uno.config.ts` — ADD `'../extensions/try-it/src/**/*.{ts,tsx}'` to `content.filesystem` (globs are an explicit per-extension list; without this every pw-\* class used only by try-it is missing from the widget CSS and the pane renders unstyled). Any later class addition needs an embed rebuild before ITs.
- Create: `packages/extensions/try-it/src/shared/try-steps.ts` (MOVE from `apps/site/src/lib/try-steps.ts`, verbatim)
- Create: `packages/extensions/try-it/src/shared/probe.ts`
- Test: `packages/extensions/try-it/test/try-steps.test.ts` (MOVE from `apps/site/test/try-steps.test.ts`, fix import path), `packages/extensions/try-it/test/probe.test.ts`

**Interfaces:**

- Produces:

```ts
export function stepStates(opts: {copied: boolean; connected: boolean}): Record<TryStep, StepState>
export function probeCore(token: string, ports: readonly number[], signal?: AbortSignal): Promise<string | null>
export function preflight(token: string, timeoutMs: number): Promise<string | null>
```

`probeCore` = the site's implementation from `apps/site/src/lib/connect-live.ts` (Promise.any over `/t/<token>/health`), using global `fetch`. `preflight(token, 2500)` = one sweep with `AbortSignal.timeout`.

- [ ] **Step 1: Scaffold package + move model + failing probe test**

`test/probe.test.ts`:

```ts
import {createServer} from 'node:http'
import {afterAll, describe, expect, it} from 'vitest'
import {probeCore} from '../src/shared/probe.js'

const servers: Array<() => void> = []
afterAll(() => servers.forEach((close) => close()))

function serveHealth(port: number, token: string): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === `/t/${token}/health`) {
        response.writeHead(200)
        response.end('ok')
        return
      }
      response.writeHead(404)
      response.end()
    })
    servers.push(() => server.close())
    server.listen(port, '127.0.0.1', () => resolve())
  })
}

describe('probeCore', () => {
  it('finds a token-gated core on any candidate port', async () => {
    await serveHealth(45911, 'tok-p')
    expect(await probeCore('tok-p', [45910, 45911])).toBe('http://127.0.0.1:45911/t/tok-p')
  })
  it('resolves null when nothing answers', async () => {
    expect(await probeCore('tok-none', [45907])).toBe(null)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @conciv/extension-try-it exec vitest run` → FAIL (module missing).
- [ ] **Step 3: Implement `probe.ts`**

```ts
export async function probeCore(token: string, ports: readonly number[], signal?: AbortSignal): Promise<string | null> {
  const attempts = ports.map(async (port) => {
    const base = `http://127.0.0.1:${port}/t/${token}`
    const response = await fetch(`${base}/health`, {signal})
    if (!response.ok) throw new Error(`port ${port} unhealthy`)
    return base
  })
  return Promise.any(attempts).catch(() => null)
}

export function preflight(token: string, timeoutMs: number, ports: readonly number[]): Promise<string | null> {
  return probeCore(token, ports, AbortSignal.timeout(timeoutMs))
}
```

(Adjust the exported `preflight` signature everywhere to include `ports` — callers pass `connectPorts()`.)

- [ ] **Step 4: Tests + typecheck green; delete nothing in `apps/site` yet** (site still compiles against its own copy until Task 7).
- [ ] **Step 5: Commit**

```bash
git add packages/extensions/try-it pnpm-lock.yaml
git commit -m "feat(try-it): extension package with step model and core probe" -- packages/extensions/try-it pnpm-lock.yaml
```

---

### Task 4: try-it client UI (Solid steps pane)

**Files:**

- Create: `packages/extensions/try-it/src/client.tsx` + `src/client/connect-pane.tsx`
- Test: visual/behavioral coverage lands in Task 6's IT (no jsdom; no component tests here)

**Interfaces:**

- Produces: `tryIt(config: {token: string}): AnyExtension` (default export of `./client`), with `connectGate: {preflight: () => preflight(config.token, 2500, connectPorts())}`.

- [ ] **Step 1: Implement `client.tsx`**

```tsx
import {defineExtension, getHostApi} from '@conciv/extension'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {Show} from 'solid-js'
import {ConnectPane} from './client/connect-pane.js'
import {preflight} from './shared/probe.js'

export function tryIt(config: {token: string}) {
  const {useSlot} = getHostApi()
  return defineExtension({
    name: 'try-it',
    connectGate: {preflight: () => preflight(config.token, 2500, connectPorts())},
    Component: () => (
      <Show when={useSlot() === 'connect'}>
        <ConnectPane token={config.token} />
      </Show>
    ),
  }).client(() => ({value: {}}))
}

export default tryIt
```

(Import path verified: terminal's client components import `getHostApi` from `'@conciv/extension'` — `packages/extensions/terminal/src/client/terminal-panel-view.tsx:6`.)

- [ ] **Step 2: Implement `connect-pane.tsx`** — Solid port of the interim React panel body (`apps/site/src/components/landing/try-panel.tsx` at commit `0f831cbf` is the reference; port structure exactly, per [[port-means-exact-structure]] discipline):
  - `stepStates({copied, connected})` drives three `Step` items (markers: number → primary check on done, `data-state` styling with pw tokens: `bg-pw-accent`, `text-pw-text-2`, `border-pw-line`).
  - Copy rows: monospace truncated text + `TooltipIconButton` from `@conciv/ui-kit-system` (mandatory for icon buttons) with Copy/Check icons from `lucide-solid`; `navigator.clipboard.writeText`; both rows set `copied`.
  - `<details>` disclosure "or run it yourself" wrapping the npx row.
  - Headline "Drive this page with your agent."; support line; pulsing waiting line; 60s slow-hint (`setTimeout` in `onMount`, cleared `onCleanup`) linking `/docs`; privacy line "Everything stays on your machine — prompts, code, and page snapshots never touch our servers."
  - Probe loop: `onMount` interval-style loop (2s) calling `probeCore(token, connectPorts())`, aborted `onCleanup`; on hit → `setConnected(true)` → 600ms `setTimeout` → `getHostApi().useConnect().found(base)`.
  - Copy strings and step titles verbatim from the spec.
- [ ] **Step 3: Build + typecheck** — `pnpm turbo run typecheck build --filter=@conciv/extension-try-it` → PASS.
- [ ] **Step 4: Commit**

```bash
git add packages/extensions/try-it
git commit -m "feat(try-it): connect pane UI with guided steps and probe loop" -- packages/extensions/try-it
```

---

### Task 5: widget connect boot (embed + apps/conciv)

**Files:**

- Modify: `packages/embed/src/mount.tsx` (boot branch)
- Create: `apps/conciv/src/routes/panel.connect.tsx` (new route; then `pnpm --filter conciv run generate-routes`)
- Modify: `apps/conciv/src/router.ts` (`ConcivRouterConfig`/context gain `connected: () => boolean` and `bindApiBase?: (base: string) => void`)
- Modify: `apps/conciv/src/routes/__root.tsx` (sessions query `enabled`, `conciv:open-panel` listener, `conciv:panel-toggled` dispatch, quick-terminal gate)
- Modify: `apps/conciv/src/shell/empty-state.tsx` (contextual headline)
- Test: `packages/embed/test/connect-boot.it.test.ts` (create)

**Interfaces:**

- Consumes: `makeDeferredRpcClient` (Task 1), `connectGate` (Task 2).
- Produces: connect-mode boot per spec; route `/panel/connect` renders `ExtensionSurface name="connect"` wired with `HostApiProvider connect={{origin: window.location.origin, found}}`.

- [ ] **Step 1: embed boot branch** (`mount.tsx`) — extract today's boot body into `bootNormal(root, extensions, apiBase)`; new logic:

```tsx
async function boot(root: ShadowRoot, extensions: AnyExtension[]): Promise<void> {
  const apiBase = resolveApiBase()
  if (apiBase) return bootNormal(root, extensions, apiBase)
  const gate = extensions.find((extension) => extension.connectGate)
  if (!gate?.connectGate) return bootNormal(root, extensions, apiBase)
  const found = await gate.connectGate.preflight()
  if (found) return bootNormal(root, extensions, found)
  return bootConnect(root, extensions)
}
```

`bootConnect`: `makeDeferredRpcClient()`, `createMemoryHistory({initialEntries: [connectPath(settings)]})` (verified: re-exported from `@tanstack/solid-router`; `initialEntries: Array<string>`) where `connectPath` returns `/panel/connect?open=true` when `settings.defaultOpen` else `/panel/connect` (the `open` search param is already validated at the ROOT route — `__root.tsx:40` `validateSearch` — and inherited, so the connect route declares NO validateSearch of its own); router context gets `{rpc: deferred.rpc, connected: deferred.bound, bindApiBase: deferred.bind}`; no `makeNavigationStorage`; `startPagePlane` deferred until bound (call it inside `bindApiBase` wrapper).

- [ ] **Step 2: route `panel.connect.tsx`**

```tsx
import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {HostApiProvider} from '@conciv/extension'
import type {JSX} from 'solid-js'
import {useInstances, useConnectBinding} from '../app/context.js'
import {ExtensionSurface} from '../extension/extension-slots.js'

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const instances = useInstances()
  const binding = useConnectBinding()
  const router = useRouter()
  const found = (apiBase: string) => {
    void binding
      .bind(apiBase)
      .then((sessionId) => router.navigate({to: '/panel/$sessionId', params: {sessionId}, replace: true}))
  }
  return (
    <HostApiProvider connect={{origin: window.location.origin, found}}>
      <ExtensionSurface name="connect" instances={instances} />
    </HostApiProvider>
  )
}
```

`useConnectBinding` (context helper): `bind(base)` = `bindApiBase(base)` → `rpc.sessions.resolve({})` → returns `sessionId`; on rejection logs and rethrows so the pane can resume (extension keeps polling because `found` failure leaves it mounted — the pane's loop must not stop until unmount).

- [ ] **Step 3: guards + events in `__root.tsx`** — sessions query `enabled: connected()`; `window.addEventListener('conciv:open-panel', openShutter)` (+cleanup); dispatch `conciv:panel-toggled` in `openPanel`/`closePanel`; quick-terminal hotkeys registered only when `connected()` (wrap `createHotkey` calls or gate the handler). Contextual empty state: pass an `arrivedFromConnect` flag (signal set in `useConnectBinding.bind`) through context; `EmptyState` headline switches to "Agent connected — it's driving this page from your machine."
- [ ] **Step 4: `pnpm --filter conciv run generate-routes` then typecheck** — `pnpm turbo run typecheck --filter=conciv --filter=@conciv/embed` → PASS.
- [ ] **Step 5: embed IT** (`connect-boot.it.test.ts`, mirror `embed.it.test.ts` scaffolding): fixture entry mounting `[tryIt({token})]` with no API base; assert panel visible with "Drive this page with your agent."; then boot a token-gated core (`start()` with `accessToken`, `allowedOrigins: [hostOrigin]`, connect-range port) and assert the SAME `[data-pw-panel]` element (capture `page.evaluateHandle` before, compare after) now contains the chat composer. Chromium launch needs `--ip-address-space-overrides=<host>=public` + `local-network-access` permission.
- [ ] **Step 6: Rebuild embed + run** — `pnpm turbo run build --filter=@conciv/embed && pnpm --filter @conciv/embed exec vitest run test/connect-boot.it.test.ts` → PASS.
- [ ] **Step 7: Commit**

```bash
git add packages/embed apps/conciv
git commit -m "feat(widget): connect-gate boot with in-place route handoff" -- packages/embed apps/conciv
```

---

### Task 6: extension-testkit deferred-core flow + try-it IT

**Files:**

- Modify: `packages/extension-testkit/src/get-extension-test-api.ts` (`server` optional; `connect` option; `startCore`)
- Modify: `packages/extension-testkit/src/boot-server.ts` (`accessToken`/`port` options → forwarded to `start()`)
- Modify: `packages/extension-testkit/src/launch.ts` (optional `{lna: {origin: string}}` → Chromium args + permission)
- Modify: host runtime under `src/host/` (settings meta pass-through, no apiBase in connect mode)
- Test: `packages/extension-testkit/test/connect-flow.it.test.ts` (create), `packages/extensions/try-it/test/connect.it.test.ts` (create — the feature's primary IT)

**Interfaces:**

- Produces:

```ts
export type ExtensionUnderTest = {
  server?: AnyExtension
  clientEntry: string
  harness?: HarnessAdapter
  connect?: {token: string}
}
export type ExtensionTestApi = {/* existing */; startCore: () => Promise<{apiBase: string}>}
```

`startCore` only valid with `connect` set: boots `bootExtensionServer(extension.server ?? none, {harness, accessToken: token, portRange: connectPorts()})`.

- [ ] **Step 1: failing testkit IT** (`connect-flow.it.test.ts`): fixture extension with `connectGate` + a trivial connect-slot Component; `getExtensionTestApi({clientEntry, connect: {token: 'tok-kit'}})` → page shows fixture pre-connect content → `await api.startCore()` → page shows chat UI. Also assert `startCore` throws when `connect` was not passed.
- [ ] **Step 2:** implement testkit changes; `bootExtensionServer` port loop over `connectPorts()` mirrors `runConnect`'s EADDRINUSE walk.
- [ ] **Step 3:** run testkit ITs — `pnpm turbo run build --filter=@conciv/embed && pnpm --filter @conciv/extension-testkit exec vitest run` → PASS (existing suites too: server-full flow unchanged).
- [ ] **Step 4: try-it primary IT** (`packages/extensions/try-it/test/connect.it.test.ts`):

```ts
import {afterAll, describe, expect, it} from 'vitest'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'

let api: ExtensionTestApi
afterAll(() => api?.dispose())

describe('try-it connect flow', () => {
  it('renders steps, hands off in place, keeps the same panel node', async () => {
    api = await getExtensionTestApi({
      clientEntry: new URL('./fixtures/try-it-entry.tsx', import.meta.url).pathname,
      connect: {token: 'tok-try'},
    })
    const panel = api.page.locator('[data-pw-panel]')
    await panel.getByText('Drive this page with your agent.').waitFor()
    const before = await panel.elementHandle()
    await api.page.getByRole('button', {name: 'Copy agent prompt'}).click()
    await panel.getByText('Run it in your terminal').waitFor()
    await api.startCore()
    await panel.getByText('Agent connected — it’s driving this page from your machine.').waitFor({timeout: 15_000})
    const same = await api.page.evaluate(
      (node) => node === document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('[data-pw-panel]'),
      before,
    )
    expect(same).toBe(true)
  })
})
```

(Locator piercing: shadow DOM — Playwright locators pierce open shadow roots; getByRole does NOT pierce the effects shadow root [[playwright-effects-shadow-role]] — if `getByRole` misses, scope through the panel locator. Fixture `try-it-entry.tsx` mounts `tryIt({token: 'tok-try'})` the way testkit host fixtures do.)

- [ ] **Step 5:** run — embed rebuilt, then `pnpm --filter @conciv/extension-try-it exec vitest run` → PASS. The clipboard click requires `clipboard-write` permission in `launch.ts` grant list — add it alongside LNA.
- [ ] **Step 6: Commit**

```bash
git add packages/extension-testkit packages/extensions/try-it
git commit -m "feat(testkit): deferred-core connect flow; try-it handoff IT" -- packages/extension-testkit packages/extensions/try-it
```

---

### Task 7: site — mount embed as a library, delete the stand-in

**Files:**

- Delete: `apps/site/src/components/landing/try-panel.tsx`, `try-widget.tsx`, `try-launcher.tsx`, `apps/site/src/lib/try-steps.ts`, `apps/site/test/try-steps.test.ts`
- Modify: `apps/site/src/lib/connect-live.ts` → replace with `apps/site/src/lib/mount-live-widget.ts` (token fetch → meta → `mountConciv`), `apps/site/src/lib/try-state.ts` (keep `shouldAutoOpen`), `landing-page.tsx`, `hero.tsx` (TryLiveButton → dispatch `conciv:open-panel`), `apps/site/test/connect-live.test.ts`, `apps/site/test/live-connect.it.test.ts` (rewrite)
- Modify: `apps/site/package.json` (deps: `@conciv/embed`, `@conciv/extension-terminal`, `@conciv/extension-try-it` workspace)

**Interfaces:**

- Consumes: `mountConciv` (embed), `terminal` client, `tryIt({token})`.
- Produces: `mountLiveWidget(): Promise<void>` — client-only (landing `/` is prerendered; per-visitor state stays client-side [[live-widget-connect-shipped]]): skip if `[data-conciv-root]` exists; `getTrySession()` → token + dismissed; compute `defaultOpen = shouldAutoOpen(...) || tryParam`; inject `pw-widget` meta; dynamic-import `@conciv/embed` (lazy — keep the widget out of the landing JS critical path) and `mountConciv([terminal, tryIt({token})])`; dispatch `conciv:widget-mounted`; listen for `conciv:panel-toggled` open:false pre-connect → `dismissTry()`.

- [ ] **Step 1:** implement `mount-live-widget.ts` + wire into `landing-page.tsx` (replace `<TryWidget/>` with a mount-effect component), update hero button.
- [ ] **Step 2:** delete listed files; fix imports; `pnpm turbo run typecheck --filter=site` → PASS.
- [ ] **Step 3: rewrite `live-connect.it.test.ts`:** widget panel visible on load with "Drive this page with your agent."; extract token from the npx `<details>` row (`textContent`, stays in DOM); `runConnect({token, harnessAdapter: fake, origin})` → same-node handoff assertion + chat turn 'hello from e2e' + reload restores; second test: pre-connect close sets dismissal (reload → no auto-open), `?try=1` forces open.
- [ ] **Step 4:** `pnpm turbo run test:e2e --filter=site` (needs own site build; turbo handles) → PASS.
- [ ] **Step 5:** solid-refresh landmine check: the site bundles workspace `@conciv/*` dist through vite — confirm no `vite-plugin-solid` is present in the site's vite config (it is a React app; if any solid transform appears via a shared config, exclude `/packages/.*dist/` per [[solid-refresh-transforms-workspace-dist]]).
- [ ] **Step 6: Commit**

```bash
git add apps/site
git commit -m "feat(site): mount live widget via embed library with try-it extension; drop stand-in" -- apps/site
```

---

### Task 8: gates, fallow, changeset update

- [ ] **Step 1:** update `.changeset/try-connect-polish.md` body to mention the widget-native connect + try-it extension (still one fixed-line patch entry).
- [ ] **Step 2:** `pnpm typecheck && pnpm build && pnpm exec turbo run test --force` → all green (re-run any single flaky package in isolation to confirm flake vs regression before touching anything).
- [ ] **Step 3:** `pnpm exec fallow audit --changed-since main --format json` → nothing INTRODUCED (verify suspected dead exports with `--trace` before deleting).
- [ ] **Step 4:** manual verify (the `verify` discipline): serve the site from the worktree, run the real CLI (`node packages/try/dist/bin.js --token <panel token> --origin http://localhost:<port>`), watch: steps → tick → in-place flip → contextual headline → chat turn; CLI shows "Browser paired ✓". Screenshot states for the user.
- [ ] **Step 5: Commit**

```bash
git add .changeset/try-connect-polish.md
git commit -m "chore: changeset covers widget-native connect" -- .changeset/try-connect-polish.md
```

---

## Verification (whole feature)

1. try-it IT green (same-node invariant is the feature).
2. Site e2e green end to end with a fake harness.
3. Manual: real `npx`-style run against the worktree site, seen by the user.
4. `pnpm exec turbo run test --force` fully green; fallow clean.
