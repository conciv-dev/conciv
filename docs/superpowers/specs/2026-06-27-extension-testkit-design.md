# Extension TestKit — design

## Problem

Extension UI (the whiteboard's Excalidraw canvas, pins, comment threads) could not be tested
without faking the host. The deleted fixtures bypassed the extension's real contract: they called
`mountOverlay` directly and injected ad-hoc globals (`window.commentOnElement`, `window.setSession`,
`window.__commentReady`) plus CSS/`[aria-label]` selectors. That is exactly the coupling we want to
forbid, and it let the tests drift worse every edit.

The extension design itself is clean: `client.tsx` owns its trigger UI as a11y-labelled buttons
("Open the whiteboard canvas", "Comment on an element") and takes every capability through a
documented contract — `ClientApi` plus the `ExtensionHostContext` read via `useContext` (`grab`,
`insert`, `notify`, …). The missing piece is infrastructure to mount an extension **through that real
contract** in a real browser against a real server.

## Principle

As close to the real runtime as possible. **No mocks, no stubs, no fakes, no `window.*` test hooks,
no test-ids, no CSS/attribute selectors in tests, never in the example app.** Every seam is the
production object: real spawned server (real Jazz), real Chromium, real framework mount, real
`ClientApi`, real `ExtensionHostContext`. Tests drive the extension's own a11y UI with
`getByRole`/`getByText` and call the real MCP tools over HTTP.

## Public API

New dev-only package `@mandarax/extension-testkit`, single export:

```ts
const api = await getExtensionTestApi(whiteboard)

type ExtensionTestApi = {
  page: Page // real Chromium; the extension mounted
  // via the real framework, real host context
  callTool: (name: string, input: unknown) => Promise<unknown> // real MCP over HTTP to the extension server
  session: string // the real active room the ClientApi reports
  apiBase: string // the spawned server origin
  dispose: () => Promise<void> // tears down browser + server
}
```

A whiteboard IT then reads as a pure user flow, e.g.:

```ts
const {page, callTool, dispose} = await getExtensionTestApi(whiteboard)
await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
await page.getByRole('radio', {name: 'Rectangle'}).click()
// draw / drag with real mouse gestures at viewport coordinates …
await callTool('canvas.diagram', {mermaid: '…'}) // real AI-draw path
await expect(page.getByRole('button', {name: 'Delete'})).toBeVisible()
await dispose()
```

## Architecture

Five real pieces, wired once by `getExtensionTestApi`.

### 1. Real server

Boot the extension's real server half through core's real `start()`:

```ts
const engine = await start({
  options: {},
  root: <temp state dir>,
  extensions: [extension],
  launchEditor: () => {},   // real callback, no-op editor
  // port omitted → getPort picks a free one
})
const apiBase = `http://localhost:${engine.port}`
```

This runs `extension.__server()` inside `makeApp` exactly as production does: real `/api/ext/<name>/*`
routes, real `/api/mcp` carrying the extension's tools, and (for whiteboard) the real spawned Jazz
server its `server.ts` starts. No part of this is stubbed.

### 2. Real session

Resolve a real chat session against the running server (`POST /api/chat/session/resolve`) to obtain
the real `mandarax_…` id. That id is the whiteboard room and the value the host `ClientApi.activeSession()`
will report. Returned as `api.session`.

### 3. Real framework mount (the minimal real host)

The testkit must mount the extension the way the widget does — same framework code path, not a
re-implementation. We **extract the widget's per-extension mount into a real shared helper in
`@mandarax/extension`** so the widget and the testkit mount through identical code:

```ts
// @mandarax/extension (new, used by BOTH widget and testkit)
mountExtension(extension, {
  clientApi: ClientApi,
  hostContext: ExtensionHostContext,   // grab, insert, notify, harnessId, …
  slot: 'composer',
  root: HTMLElement,
}): () => void
```

The testkit serves a minimal real host HTML page (built by vite **with the mandarax source transform
on**, so JSX carries real `data-mandarax-source`). In the browser that page:

- reads its `apiBase` + `session` from injected config the same way production reads `pw-api-base`
  (a meta tag the testkit stamps — host bootstrapping, not a test hook),
- builds the real `ClientApi` (`apiBase`, `activeSession: () => session`, real `surface` shadow host,
  real `env.doc/win`, real `toast`, real `page`),
- builds the real `ExtensionHostContext` (see grab below),
- calls `mountExtension(extension, …)` and renders the extension's `Component` in the `composer` slot
  so its real buttons are present.

Playwright then drives those real buttons and the real canvas.

### 4. Real grab (no react-bridge, real source data)

`grab.pick()` must return a real `{source, rect}`. The source ground truth is **not** the widget's
`react-bridge` (that stays widget-internal); it is the `data-mandarax-source="path:line:col"`
attribute the mandarax plugin stamps on JSX (`inject-source.ts`), which `locate` itself only reads.

The testkit host page renders **one real, source-mapped fixture element** (real component, built with
the source transform, so it carries a real `data-mandarax-source`). The provided `grab.pick()`
activates a real picker; when the test clicks that element, grab reads its real `data-mandarax-source`
together with `getBoundingClientRect()` and returns a real `Grab`. Same data the widget surfaces, no
stub, no react-bridge dependency. The element's source is a real testkit file; tests assert the
comment anchored to it.

`ClientApi.page` (`elementAt`/`describe`/`locate`) is provided by the same real attribute-based
resolution over the host `document`.

### 5. Real MCP

`api.callTool(name, input)` opens a real MCP client (`@tanstack/ai-mcp`) to `apiBase/api/mcp` with the
real `mandarax-session-id` header = `api.session`, and invokes the named tool. This is the real agent
path (the harness MCP seam), an external HTTP call — not a page internal.

### Teardown

`api.dispose()` closes the browser context and calls `engine.stop()` (which stops Jazz + the server).
Files run serially (`vitest.config.ts` already sets `fileParallelism: false`) since each spawns a real
server + browser.

## What the testkit does NOT do

- No widget shell, no chat panel — only the extension under test is mounted.
- No example app. Whiteboard tests live in `packages/extensions/whiteboard/test/`.
- No `window.*` hooks, no test-ids, no CSS/attribute selectors in the tests it enables.

## First consumer (separate plan)

The whiteboard package ITs are rewritten on top of `getExtensionTestApi`, a11y-driven:
draw, drag, persist, AI-draw (`canvas.diagram`/`canvas.draw` via `callTool`), agent comment, and
comment-on-element (real grab). These replace the deleted `overlay`/`island`/`presence`/`canvas-binding`
ITs. The pure unit tests (`schema`, `confine`, `oxc-capture`, resolvers) and the server/tool ITs
(`canvas-tools`, `comment-tools`, …, which already drive MCP over HTTP) are restored unchanged in
spirit.

## Open question for the framework extraction

Extracting `mountExtension` from the widget into `@mandarax/extension` must not pull widget-only deps
(react-bridge, shell) into the framework package. The mount helper takes `clientApi` + `hostContext`
as inputs, so the widget keeps owning react-bridge/grab construction and the testkit owns its
attribute-based versions — the shared helper only does the framework wiring (installClientApi +
runtime-context provider + render `Component` into a slot).
