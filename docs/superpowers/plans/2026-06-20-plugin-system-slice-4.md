# Plugin System — Slice 4 (reach tiers 2-3 + catalog/legibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's house rule is to work inline, not via subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the extension client surface from "theme + one button" to the full reach tiers — a reactive keyed UI store (`ui.setWidget/setHeader/setFooter/setStatus`), an open tool-renderer registry (`registerToolRenderer`), and a typed component-override registry (`ui.setComponent`) — then make the whole surface AI-legible with a computed catalog and a `mandarax_extensions` agent tool (`catalog`/`scaffold`/`validate`), a skill, and worked examples.

**Architecture:** The authoring contract stays single-sourced in `@mandarax/extensions` (node-safe): it owns the `ClientApi`/`ServerApi` types, the `OverridableComponents` props interface (augmented by the widget at each component's site), the `OVERRIDABLE_COMPONENTS` metadata list, and the pure catalog/scaffold/validate functions. The widget owns the _runtime_ of the new surfaces: a module-level Solid signal store (`ui-store.tsx`), a component-override registry (`component-registry.tsx`), and the slot-rendering inside `ChatPanel`. The tool-renderer registry lives in `@mandarax/tool-ui` (where the dispatch `Switch` is today), replacing it with a `Dynamic` lookup. `mount.tsx` adapts the live shell + shadow root + registries into the public `mx` exactly as it does for `setTheme`/`registerComposerAction` today. The catalog is a projection computed from node-safe sources (`TOKENS`, `OVERRIDABLE_COMPONENTS`, the surface consts) — not the live browser registries, which a node-side MCP tool cannot import.

**Tech Stack:** SolidJS (module-level signals, `Dynamic`, `ErrorBoundary`), TypeScript (declaration-merging for typed overrides), Vite lib build (multi-entry for a node-safe `tokens` export), tsdown (extensions bundle), `@tanstack/ai` `toolDefinition`, Storybook play-tests + Playwright real-browser ITs.

## Global Constraints

- Always use functions, never classes. Never hand-write IIFEs in source (the Vite _output_ bundle is exempt).
- Production code: zero narration comments; prefer map/reduce over if/else; clear names; any necessary comment is one concise line.
- Fully typed by the end: no `unknown`, no `any`, no type assertions/casts. Run whole-repo `pnpm turbo typecheck` before claiming done.
- No node unit tests for behavior: verify UI in a real browser (Playwright `newPage()`, never `newContext()`) or Storybook play-tests. Native assertions only (`getByRole`/`getByText`/`toBeVisible`/aria); no `querySelector`/class selectors/`toBe(true)` on DOM. No jsdom/happy-dom. No mocks/stubs (real http server + real browser + real bundle). Pure functions (catalog/scaffold/validate) may use a vitest unit test — they are plain logic, not UI or LLM glue.
- Keep extension logic in `@mandarax/extensions`; do not smear it across packages. The widget/tool-ui consume the contract; they do not redefine it.
- Pre-release, no users: break APIs freely, no back-compat shims, update all call sites.
- No new npm dependencies without asking. This slice adds only _workspace_ deps (`@mandarax/tool-ui` → extensions, type-only) — no third-party installs.
- Build/typecheck via turbo: `pnpm turbo build --filter=<pkg>` / `pnpm turbo typecheck`. Widget changes are served per-request, and the ITs read the _built_ global bundle — rebuild the widget before running a widget IT.
- Run every command from the worktree path `/Users/dev/Public/web/aidx/.claude/worktrees/plugin-system-design`. Never `cd` to the main repo root.
- Commit per logical step; the oxfmt pre-commit hook reflows files — re-stage and recommit after it runs. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Design Notes (grounded in a read of real Pi source: `@mariozechner/pi-coding-agent` + `pi-mono/examples/extensions`)

1. **Tool renderer co-located on the tool def (Task 2), Pi-faithful across our split.** Pi's `ToolDefinition` carries `renderCall`/`renderResult` and overrides a built-in by re-registering the same name (`built-in-tool-renderer.ts`). We can't co-locate in one runtime — `execute` is node/MCP, the renderer is a browser Solid component. The solve: `defineTool(...).server(execute).render(Component)` holds both halves on one object; `defineExtension({tools:[…]})` auto-wires execute server-side and the renderer client-side as the file loads in each runtime. The string `registerToolRenderer(name, Component)` is the substrate, not the authoring surface. Built-in renderer override = a render-only tool (no `.server`) keyed to the built-in name — strictly more capable than Pi (restyle a tool you don't own, because rendering is decoupled from execution).
2. **Named override setters (Task 3), not a generic `setComponent(id)`.** Pi overrides surfaces with named, individually-typed setters (`setHeader`/`setFooter`/`setEditorComponent`), never a string-keyed generic registry. We follow it: `ui.setEmptyState(factory)` this slice, one named setter per surface going forward. This sidesteps the cross-package generic-typing/declaration-merging problem entirely — each setter is concretely typed in the contract.
3. **Tools self-document into the prompt (Pi parity).** Pi tool defs carry `promptSnippet` (one-liner injected into the Available-tools section) + `promptGuidelines`. Our `defineTool` adopts both; `collectServerContributions` appends them when a tool is registered, so a tool documents itself instead of a separate manual `systemPrompt.append`.
4. **New `mandarax_extensions` agent tool, not overloaded `mandarax_ui`.** `mandarax_ui` already exists as the in-chat interactive-UI tool (choices/confirm/diff/form) with its own schema. A dedicated `mandarax_extensions` tool with a `verb` discriminator (`catalog`/`scaffold`/`validate`) is cleaner. (Pi has no catalog tool — it relies on the typed API + `getAllTools()` introspection; our catalog is a justified net-add because our theming is token-level and our surface is visual, neither of which Pi exposes.)
5. **Catalog computed from node-safe metadata, not live browser registries.** A node-side MCP tool can't import the widget's Solid registries. So the catalog reads node-safe sources: `TOKENS` (new `@mandarax/ui-kit-system/tokens` subpath), `OVERRIDABLE_COMPONENTS` + `CLIENT_SURFACES`/`SERVER_SURFACES` consts in `@mandarax/extensions`. Tokens stay single-source (one object → CSS + type + catalog). Registered server tools are already visible via MCP `tools/list`, so the catalog doesn't re-enumerate them.
6. **Deferred (matches spec):** the two-sided event bus (`mx.on`) — Pi's `ExtensionEvent` union is the reference taxonomy for that later slice. A build-time `.client/.server` strip transform (the `__toolSide` marker) is a bundle-size optimization, not needed for correctness here; the file-convention split (`*.client.tsx`/`*.server.ts`) is the documented fallback when a renderer pulls a browser-only import.

---

## File Structure

- `packages/extensions/src/contract.ts` **(modify)** — extend `ClientApi` with `ui.setWidget/setHeader/setFooter/setStatus`, `ui.setEmptyState`, `registerToolRenderer`; add `UiFactory`, `EmptyStateProps/Factory`, `ToolRenderer`, the `defineTool` builder (`.server`/`.render`), `defineExtension({tools})`. One responsibility: the authoring contract + types.
- `packages/extensions/src/catalog.ts` **(create)** — `OVERRIDABLE_COMPONENTS`, `CLIENT_SURFACES`, `SERVER_SURFACES` consts; `buildCatalog()`, `scaffold(kind, opts)`, `validateSource(source)` pure functions; `Catalog`/`ScaffoldKind` types.
- `packages/extensions/src/index.ts` **(modify)** — re-export the new types + catalog functions.
- `packages/extensions/package.json` **(modify)** — add `@mandarax/tool-ui` (workspace, type-only use for `ToolCardProps`).
- `packages/ui-kit-system/vite.config.ts` **(modify)** — second lib entry so `dist/tokens.js` is emitted node-safe.
- `packages/ui-kit-system/package.json` **(modify)** — add the `./tokens` subpath export.
- `packages/widget/src/ui-store.tsx` **(create)** — the reactive keyed UI store (widgets/header/footer/statuses signals), the setter functions, and the slot components (`ExtHeaderSlot`, `ExtFooterSlot`, `ExtWidgetsSlot`, `ExtStatusSlot`), each error-boundaried.
- `packages/widget/src/component-registry.tsx` **(create)** — the override signal, `setComponentOverride`, and the `<Overridable>` renderer.
- `packages/widget/src/empty-state.tsx` **(create)** — `EmptyState` component extracted from `chat-panel.tsx`, rendered through the registry; augments `OverridableComponents`.
- `packages/widget/src/chat-panel.tsx` **(modify)** — render the four extension slots; render the empty state via `<Overridable>`.
- `packages/widget/src/mount.tsx` **(modify)** — wire the new `mx` methods to the store/registries.
- `packages/tool-ui/src/registry.ts` **(create)** — `BUILTIN_TOOL_RENDERERS` map, the override signal, `registerToolRenderer`, `rendererFor`.
- `packages/tool-ui/src/tool-call.tsx` **(modify)** — replace the `<Switch>` with a `<Dynamic component={rendererFor(name)}>`.
- `packages/tool-ui/src/index.tsx` **(modify)** — export `registerToolRenderer`.
- `packages/tools/src/extensions-tool.ts` **(create)** — the `mandarax_extensions` `toolDefinition` + input schema.
- `packages/tools/src/server.ts` **(modify)** — register the new tool in `mandaraxTools(ctx)`.
- `packages/tool-ui/src/tool-call.stories.tsx` **(create)** — play-tests: a built-in routes through the registry; a registered custom renderer wins.
- `packages/widget/test/extension-ui.it.test.ts` **(create)** — real-browser IT for the UI store (header/footer/status/widget) + `setComponent` override.
- `packages/extensions/test/catalog.test.ts` **(create)** — pure-function tests: token projection, scaffold output parses, validate catches a bad token.
- `apps/examples/tanstack-start/mandarax/extensions/blue.ts` **(modify)** — exercise the new client surface (status + a setComponent) so the example app typechecks against the real types.
- `skills/mandarax-extensions/SKILL.md` **(create)** + `apps/examples/.../mandarax/extensions/` worked examples — AI legibility.

---

## Task 1: Reactive keyed UI store (`ui.setWidget/setHeader/setFooter/setStatus`)

**Files:**

- Create: `packages/widget/src/ui-store.tsx`
- Modify: `packages/extensions/src/contract.ts`
- Modify: `packages/widget/src/chat-panel.tsx` (render slots: after line 718 `<>` and after line 800 scroll-log close)
- Modify: `packages/widget/src/mount.tsx:82-91` (the `clientApi` literal)
- Test: `packages/widget/test/extension-ui.it.test.ts` (added in this task; `setComponent` assertions appended in Task 3)

**Interfaces:**

- Produces (contract.ts):
  - `type UiFactory = () => JSX.Element`
  - `ClientApi.ui` gains: `setWidget: (key: string, factory: UiFactory | null) => void`, `setHeader: (factory: UiFactory | null) => void`, `setFooter: (factory: UiFactory | null) => void`, `setStatus: (key: string, text: string | null) => void`. (`null` removes.)
- Produces (ui-store.tsx): `setExtWidget(key, factory)`, `setExtHeader(factory)`, `setExtFooter(factory)`, `setExtStatus(key, text)`, and slot components `ExtHeaderSlot()`, `ExtFooterSlot()`, `ExtWidgetsSlot()`, `ExtStatusSlot()` (each `(): JSX.Element`).
- Consumes: `UiFactory` from `@mandarax/extensions`.

- [ ] **Step 1: Extend the contract**

In `packages/extensions/src/contract.ts`, add the `JSX` type import and `UiFactory`, and extend `ClientApi.ui`. Replace the import line `import type {Component} from 'solid-js'` with `import type {Component, JSX} from 'solid-js'`, and add near the other types:

```ts
// A live UI region an extension paints into a named widget slot / header / footer (Pi-style setters).
export type UiFactory = () => JSX.Element
```

Replace the `ClientApi` `ui` member so it reads:

```ts
export type ClientApi = {
  ui: {
    setTheme: (tokens: ThemeTokens) => void
    setWidget: (key: string, factory: UiFactory | null) => void
    setHeader: (factory: UiFactory | null) => void
    setFooter: (factory: UiFactory | null) => void
    setStatus: (key: string, text: string | null) => void
  }
  registerComposerAction: (action: ExtComposerAction) => void
}
```

(Tasks 2 and 3 add `registerToolRenderer` and `ui.setComponent` to this same type.)

- [ ] **Step 2: Build the store**

```tsx
// packages/widget/src/ui-store.tsx
// The reactive keyed UI store the widget renders for extension ui.setWidget/setHeader/setFooter/
// setStatus. Module-level signals (one widget instance per page); slot components render them inside
// the chat panel, each behind an error boundary so one bad factory can't crash the widget.
import {createSignal, ErrorBoundary, For, Show, type JSX} from 'solid-js'
import type {UiFactory} from '@mandarax/extensions'

type Keyed<T> = {key: string; value: T}

const upsert = <T,>(list: Keyed<T>[], key: string, value: T | null): Keyed<T>[] => {
  const without = list.filter((e) => e.key !== key)
  return value === null ? without : [...without, {key, value}]
}

const [widgets, setWidgets] = createSignal<Keyed<UiFactory>[]>([])
const [statuses, setStatuses] = createSignal<Keyed<string>[]>([])
const [header, setHeader] = createSignal<UiFactory | null>(null)
const [footer, setFooter] = createSignal<UiFactory | null>(null)

export const setExtWidget = (key: string, factory: UiFactory | null): void =>
  setWidgets((prev) => upsert(prev, key, factory))
export const setExtStatus = (key: string, text: string | null): void => setStatuses((prev) => upsert(prev, key, text))
export const setExtHeader = (factory: UiFactory | null): void => setHeader(() => factory)
export const setExtFooter = (factory: UiFactory | null): void => setFooter(() => factory)

function Slot(props: {factory: UiFactory | null}): JSX.Element {
  return <Show when={props.factory}>{(f) => <ErrorBoundary fallback={null}>{f()()}</ErrorBoundary>}</Show>
}

export const ExtHeaderSlot = (): JSX.Element => <Slot factory={header()} />
export const ExtFooterSlot = (): JSX.Element => <Slot factory={footer()} />

export function ExtWidgetsSlot(): JSX.Element {
  return (
    <For each={widgets()}>
      {(w) => (
        <div data-pw-ext-widget={w.key}>
          <ErrorBoundary fallback={null}>{w.value()}</ErrorBoundary>
        </div>
      )}
    </For>
  )
}

export function ExtStatusSlot(): JSX.Element {
  return (
    <Show when={statuses().length > 0}>
      <div class="text-[0.75rem] text-pw-text-2 leading-[1.4] font-medium font-pw mx-3 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <For each={statuses()}>{(s) => <span data-pw-ext-status={s.key}>{s.value}</span>}</For>
      </div>
    </Show>
  )
}
```

- [ ] **Step 3: Render the slots in the chat panel**

In `packages/widget/src/chat-panel.tsx`, add the import near the other local imports (after line 23's `widget-shell` import):

```ts
import {ExtHeaderSlot, ExtFooterSlot, ExtWidgetsSlot, ExtStatusSlot} from './ui-store.js'
```

Insert the header + widgets slots at the very top of the returned fragment. Change line 717-719 from:

```tsx
  return (
    <>
      <div class="p-3.5 flex flex-1 flex-col gap-2.5 relative overflow-y-auto" role="log" aria-live="off" ref={logRef}>
```

to:

```tsx
  return (
    <>
      <ExtHeaderSlot />
      <ExtWidgetsSlot />
      <div class="p-3.5 flex flex-1 flex-col gap-2.5 relative overflow-y-auto" role="log" aria-live="off" ref={logRef}>
```

Insert the status + footer slots between the scroll-log close (line 800 `</div>`) and the `notice()` block (line 801). Change:

```tsx
        </Show>
      </div>
      <Show when={notice()}>
```

to:

```tsx
        </Show>
      </div>
      <ExtStatusSlot />
      <ExtFooterSlot />
      <Show when={notice()}>
```

Note: `ChatPanel` mounts once per visited session (multiple panes, only the active visible). The store is a module singleton, so each pane renders the same extension slots; this is intentional and harmless (Solid, cheap, error-boundaried) — the visible pane shows them.

- [ ] **Step 4: Wire the setters into `mx`**

In `packages/widget/src/mount.tsx`, add the import (after line 16's `applyThemeOverrides`):

```ts
import {setExtWidget, setExtHeader, setExtFooter, setExtStatus} from './ui-store.js'
```

Extend the `clientApi.ui` literal (lines 82-91) so `ui` reads:

```ts
        ui: {
          setTheme: (tokens) => applyThemeOverrides(root, tokens),
          setWidget: (key, factory) => setExtWidget(key, factory),
          setHeader: (factory) => setExtHeader(factory),
          setFooter: (factory) => setExtFooter(factory),
          setStatus: (key, text) => setExtStatus(key, text),
        },
```

- [ ] **Step 5: Typecheck + build the widget**

Run: `pnpm turbo build --filter=@mandarax/extensions && pnpm turbo build --filter=@mandarax/widget`
Expected: both build clean (`dist/mandarax-widget.global.js` rebuilt with the store).

- [ ] **Step 6: Write the failing IT**

```ts
// packages/widget/test/extension-ui.it.test.ts
// The widget driven in a REAL browser; an extension seeded via window.__MANDARAX__.queue paints a
// header, footer, status, and keyed widget (factories return real DOM nodes — Solid inserts them, so
// the page can author them in plain JS). Real bundle, real browser, native assertions.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import type {AddressInfo} from 'node:net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const widgetBundle = fs.readFileSync(path.join(dirname, '../dist/mandarax-widget.global.js'), 'utf8')

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>
      function node(tag, text, attrs) {
        var el = document.createElement(tag)
        el.textContent = text
        if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k])
        return el
      }
      window.__MANDARAX__ = { queue: [ {
        id: 'acme',
        clientFn: function (mx) {
          mx.ui.setHeader(function () { return node('div', 'Acme banner') })
          mx.ui.setFooter(function () { return node('div', 'Acme footer') })
          mx.ui.setStatus('tokens', 'Tokens: 42')
          mx.ui.setWidget('deploy', function () { return node('button', 'Deploy now', {type: 'button'}) })
        },
      } ] }
    </script>
  </head><body>
    <script>${widgetBundle}</script>
  </body></html>`
}

function writeJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {'content-type': 'application/json', 'access-control-allow-origin': '*'})
  res.end(JSON.stringify(body))
}

describe('widget extension UI store (it) — real browser', () => {
  let browser: Browser
  let server: Server
  const state = {base: ''}

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? ''
      if (url.startsWith('/api/chat/session/resolve') && req.method === 'POST') {
        return writeJson(res, {sessionId: 'mandarax_new_1'})
      }
      if (url.startsWith('/api/chat/session') && !url.startsWith('/api/chat/sessions')) {
        return writeJson(res, {
          sessionId: 'mandarax_new_1',
          harnessSessionId: null,
          name: null,
          origin: 'chat',
          cwd: '/app',
          lock: {held: false, role: null},
          usage: null,
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/models')) {
        return writeJson(res, {
          models: [{id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced', group: 'Claude'}],
          defaultModel: 'sonnet',
          harness: {id: 'claude', name: 'Claude', canLaunch: false},
        })
      }
      if (url.startsWith('/api/chat/sessions')) return writeJson(res, {sessions: []})
      if (url.startsWith('/api/chat/history')) return writeJson(res, [])
      if (url === '/api/page/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        })
        return
      }
      res.writeHead(200, {'content-type': 'text/html'})
      res.end(pageHtml())
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
  })

  it('paints header, footer, status, and a keyed widget from an extension', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await expect(page.getByText('Acme banner')).toBeVisible()
    await expect(page.getByText('Acme footer')).toBeVisible()
    await expect(page.getByText('Tokens: 42')).toBeVisible()
    await expect(page.getByRole('button', {name: 'Deploy now'})).toBeVisible()
    await page.close()
  })
})
```

- [ ] **Step 7: Run the IT**

Run: `pnpm --filter @mandarax/widget exec vitest run test/extension-ui.it.test.ts`
Expected: PASS — all four slots visible.

- [ ] **Step 8: Regression + commit**

Run: `pnpm --filter @mandarax/widget exec vitest run`
Expected: PASS (existing ITs unaffected).

```bash
git add packages/extensions/src/contract.ts packages/widget/src/ui-store.tsx packages/widget/src/chat-panel.tsx packages/widget/src/mount.tsx packages/widget/test/extension-ui.it.test.ts
git commit -m "feat(extensions): reactive keyed UI store (ui.setWidget/setHeader/setFooter/setStatus)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Re-stage + recommit if the oxfmt hook reflows files.)

---

## Task 2: Tool-renderer registry + co-located `.render()` on the tool (Pi-faithful)

**Pi parity:** Pi co-locates a tool's renderer with its definition (`ToolDefinition.renderResult`) and overrides a built-in by re-registering the same name. We can't co-locate in one runtime — our tool `execute` runs server-side (MCP/node) and the renderer is a browser Solid component. The solve: the tool object carries **both halves** (`defineTool(...).server(execute).render(Component)`); the extension file is loaded twice (node + browser) and each loader reads its half. The string-keyed registry below is the _substrate_; `defineExtension({tools:[...]})` auto-wires each tool's renderer into it by name, so the author writes the name once. Built-in renderer override = a render-only tool (`.render` without `.server`) keyed to the built-in name — strictly more capable than Pi (restyle a tool you don't own, because rendering is decoupled from execution).

**Files:**

- Create: `packages/tool-ui/src/registry.ts`
- Modify: `packages/tool-ui/src/tool-call.tsx`
- Modify: `packages/tool-ui/src/index.tsx`
- Modify: `packages/extensions/src/contract.ts` (the `defineTool` builder + `defineExtension({tools})` + `ClientApi`), `packages/extensions/src/discovery.ts` (drain tools both sides), `packages/extensions/package.json`
- Modify: `packages/widget/src/mount.tsx`, `packages/widget/src/extension-runtime.ts`
- Test: `packages/tool-ui/src/tool-call.stories.tsx` (registry render), `packages/extensions/test/discovery.test.ts` (auto-wire, pure)

**Interfaces:**

- Produces (registry.ts): `BUILTIN_TOOL_RENDERERS: Record<string, Component<ToolCardProps>>`, `registerToolRenderer(name: string, renderer: Component<ToolCardProps>): void`, `rendererFor(name: string): Component<ToolCardProps>`.
- Produces (contract.ts): `ToolRenderer = Component<ToolCardProps>`; `ExtensionTool` (erased: `{name, description, inputSchema, promptSnippet?, promptGuidelines?, serverExecute?, clientRender?}`); `ToolBuilder<S>` with `.server(execute)` + `.render(component)`; `defineTool<S>(def) => ToolBuilder<S>`; `defineExtension({id, tools?})`; `ClientApi.registerToolRenderer`.
- Produces (discovery.ts): `collectClientContributions(extensions) => {toolRenderers: {name: string; render: ToolRenderer}[]}`; `collectServerContributions` also drains `ext.tools`.
- Consumes: `ToolCardProps` from `@mandarax/tool-ui`; the existing card components.

- [ ] **Step 1: Build the registry**

```ts
// packages/tool-ui/src/registry.ts
// The open tool-renderer registry: built-in cards seed it by tool name; registerToolRenderer adds or
// overrides entries; rendererFor resolves a name to a card (GenericCard is the fallback). Overrides
// live in a signal so a post-mount extension registration re-renders already-mounted cards. This
// replaces the static by-name Switch that tool-call.tsx used to hold.
import {createSignal, type Component} from 'solid-js'
import type {ToolCardProps} from './types.js'
import {GenericCard} from './cards/generic.js'
import {ShellCard} from './cards/shell.js'
import {FileEditCard} from './cards/file-edit.js'
import {FileReadCard} from './cards/file-read.js'
import {SearchCard} from './cards/search.js'
import {TodoCard} from './cards/todo.js'
import {PageActionCard} from './cards/page-action.js'
import {UiCard} from './cards/ui-chip.js'
import {TestCard} from './cards/test.js'

export const BUILTIN_TOOL_RENDERERS: Record<string, Component<ToolCardProps>> = {
  Bash: ShellCard,
  Edit: FileEditCard,
  MultiEdit: FileEditCard,
  Write: FileEditCard,
  Read: FileReadCard,
  mandarax_open: FileReadCard,
  Grep: SearchCard,
  Glob: SearchCard,
  TodoWrite: TodoCard,
  mandarax_page: PageActionCard,
  mandarax_ui: UiCard,
  mandarax_test: TestCard,
}

const [overrides, setOverrides] = createSignal<Record<string, Component<ToolCardProps>>>({})

export function registerToolRenderer(name: string, renderer: Component<ToolCardProps>): void {
  setOverrides((prev) => ({...prev, [name]: renderer}))
}

export function rendererFor(name: string): Component<ToolCardProps> {
  return overrides()[name] ?? BUILTIN_TOOL_RENDERERS[name] ?? GenericCard
}
```

- [ ] **Step 2: Replace the Switch with a Dynamic lookup**

Rewrite `packages/tool-ui/src/tool-call.tsx` so `ByName` resolves through the registry (drop the `Switch`/`Match` + per-card imports; keep `ToolCallCard` + `ApprovalBar`):

```tsx
import {type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardProps} from './types.js'
import {ApprovalBar} from './approval-bar.js'
import {rendererFor} from './registry.js'

// Render a tool-call part as a card, dispatched by tool name through the open renderer registry
// (built-ins seed it; extensions add/override via registerToolRenderer; GenericCard is the fallback).
// When the part is in tanstack's native approval-requested state, an approval bar renders below the
// card (uniform across every tool — approval is a property of the call, not of any one renderer).
export function ToolCallCard(props: ToolCardProps): JSX.Element {
  return (
    <>
      <ByName {...props} />
      <ApprovalBar part={props.part} ctx={props.ctx} />
    </>
  )
}

function ByName(props: ToolCardProps): JSX.Element {
  return <Dynamic component={rendererFor(props.part.name)} {...props} />
}
```

- [ ] **Step 3: Export from the index**

In `packages/tool-ui/src/index.tsx`, add after the `ToolCallCard` export (line 3):

```ts
export {registerToolRenderer, BUILTIN_TOOL_RENDERERS} from './registry.js'
```

- [ ] **Step 4: Add the contract method + workspace dep**

In `packages/extensions/package.json`, add to `dependencies`:

```json
    "@mandarax/tool-ui": "workspace:^",
```

In `packages/extensions/src/contract.ts`, add the import and turn `defineTool` into a builder carrying both halves. Add near the top:

```ts
import type {ToolCardProps} from '@mandarax/tool-ui'

// A client-side renderer for a tool's call/result cards (the browser half of a tool definition).
export type ToolRenderer = Component<ToolCardProps>

// The erased tool shape collected from an extension (per-tool generics dropped for the array).
export type ExtensionTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  promptSnippet?: string
  promptGuidelines?: string[]
  serverExecute?: (input: unknown) => Promise<unknown>
  clientRender?: ToolRenderer
}

// The builder: .server(execute) attaches the node half, .render(Component) the browser half. Both
// live on one object so the renderer is co-located with the definition (Pi-style), and each runtime
// loader reads its own half.
export type ToolBuilder<S extends z.ZodObject<z.ZodRawShape>> = ExtensionTool & {
  inputSchema: S
  server: (execute: (input: z.infer<S>) => Promise<unknown> | unknown) => ToolBuilder<S>
  render: (renderer: ToolRenderer) => ToolBuilder<S>
}
```

Replace the existing `defineTool` with the builder form (inline `execute` moves to `.server()`):

```ts
// Define a tool: name + schema declared once; .server(execute) re-parses args at the node boundary,
// .render(Component) supplies the browser card. promptSnippet/promptGuidelines self-document the tool
// into the system prompt when it is registered (Pi parity).
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string
  description: string
  inputSchema: S
  promptSnippet?: string
  promptGuidelines?: string[]
}): ToolBuilder<S> {
  const builder: ToolBuilder<S> = {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    promptSnippet: def.promptSnippet,
    promptGuidelines: def.promptGuidelines,
    server(execute) {
      builder.serverExecute = async (raw: unknown) => execute(def.inputSchema.parse(raw))
      return builder
    },
    render(renderer) {
      builder.clientRender = renderer
      return builder
    },
  }
  return builder
}
```

Change `ServerApi.registerTool` to accept the builder result, accept `tools` on `defineExtension`, carry it on the extension, and add `registerToolRenderer` to `ClientApi`:

```ts
// ServerApi.registerTool now takes an ExtensionTool (builder result):
  registerTool: (tool: ExtensionTool) => void
```

```ts
// ClientApi gains (alongside registerComposerAction):
  registerToolRenderer: (name: string, renderer: ToolRenderer) => void
```

```ts
// MandaraxExtension gains:
  tools?: ExtensionTool[]
```

```ts
// defineExtension accepts declarative tools and stores them on the builder:
export function defineExtension(meta: {id: string; tools?: ExtensionTool[]}): ExtensionBuilder {
  const builder: ExtensionBuilder = {
    id: meta.id,
    tools: meta.tools,
    client(fn) {
      builder.clientFn = fn
      return builder
    },
    server(fn) {
      builder.serverFn = fn
      return builder
    },
  }
  return builder
}
```

In `packages/extensions/package.json`, the `@mandarax/tool-ui` workspace dep added above (Step 4 head) covers the `ToolCardProps` type import.

- [ ] **Step 5: Drain tools on both sides in discovery**

In `packages/extensions/src/discovery.ts`, make `collectServerContributions` also drain `ext.tools` (execute + prompt text) and add a client collector. Replace the file's collector functions with:

```ts
import type {
  MandaraxExtension,
  ServerApi,
  ExtensionServerContributions,
  ExtensionServerTool,
  ExtensionTool,
  ToolRenderer,
} from './contract.js'

// Convert one collected tool into the wire shape core's MCP server registers; append its prompt text.
function addServerTool(tools: ExtensionServerTool[], systemPrompt: string[], t: ExtensionTool): void {
  if (t.serverExecute) {
    tools.push({name: t.name, description: t.description, inputSchema: t.inputSchema, execute: t.serverExecute})
  }
  if (t.promptSnippet) systemPrompt.push(t.promptSnippet)
  if (t.promptGuidelines?.length) systemPrompt.push(...t.promptGuidelines)
}

export function collectServerContributions(extensions: MandaraxExtension[]): ExtensionServerContributions {
  const tools: ExtensionServerTool[] = []
  const systemPrompt: string[] = []
  const api: ServerApi = {
    registerTool: (t) => addServerTool(tools, systemPrompt, t),
    systemPrompt: {append: (text) => systemPrompt.push(text)},
  }
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) addServerTool(tools, systemPrompt, t)
    ext.serverFn?.(api)
  }
  return {tools, systemPrompt}
}

// The client half of declared tools: each tool's renderer, keyed by name, for the renderer registry.
export function collectClientContributions(extensions: MandaraxExtension[]): {
  toolRenderers: {name: string; render: ToolRenderer}[]
} {
  const toolRenderers: {name: string; render: ToolRenderer}[] = []
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) {
      if (t.clientRender) toolRenderers.push({name: t.name, render: t.clientRender})
    }
  }
  return {toolRenderers}
}
```

Keep `extensionsModuleSource()` unchanged. Export `collectClientContributions` from `packages/extensions/src/index.ts`.

- [ ] **Step 6: Auto-wire renderers client-side + add the escape hatch**

In `packages/widget/src/mount.tsx`, add imports:

```ts
import {registerToolRenderer} from '@mandarax/tool-ui'
import {collectClientContributions} from '@mandarax/extensions'
```

Add `registerToolRenderer` to the `clientApi` literal (imperative escape hatch, sibling of `registerComposerAction`):

```ts
        registerToolRenderer: (name, renderer) => registerToolRenderer(name, renderer),
```

Change the `installExtensionGlobal` callback so applying an extension also drains its declared tool renderers:

```ts
installExtensionGlobal((ext: MandaraxExtension) => {
  ext.clientFn?.(clientApi)
  for (const t of collectClientContributions([ext]).toolRenderers) registerToolRenderer(t.name, t.render)
})
```

- [ ] **Step 7: Update the sample extension to the new `defineTool` form**

`apps/examples/tanstack-start/mandarax/extensions/blue.ts` uses inline `execute`; move it to `.server()` so the repo stays green:

```ts
mx.registerTool(
  defineTool({
    name: 'acme_hello',
    description: 'Return a friendly greeting for a name',
    inputSchema: z.object({name: z.string()}),
  }).server(({name}) => ({greeting: `Hello, ${name}!`})),
)
```

- [ ] **Step 8: Typecheck + build**

Run: `pnpm turbo build --filter=@mandarax/tool-ui && pnpm turbo build --filter=@mandarax/extensions && pnpm turbo typecheck --filter=@mandarax/widget`
Expected: clean.

- [ ] **Step 9: Write the play-test stories**

```tsx
// packages/tool-ui/src/tool-call.stories.tsx
// The dispatch goes through the open registry now: a built-in name resolves to its card; a custom
// renderer registered via registerToolRenderer wins for its name. Storybook play-tests in a real
// browser, native assertions.
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import type {JSX} from 'solid-js'
import {ToolCallCard} from './tool-call.js'
import {registerToolRenderer} from './registry.js'
import {callPart, resultPart, noopCtx} from './fixtures.js'

const meta: Meta<typeof ToolCallCard> = {title: 'tool-ui/ToolCallCard', component: ToolCallCard}
export default meta
type Story = StoryObj<typeof ToolCallCard>

// A built-in tool name (Bash) resolves to the shell card through the registry.
export const Builtin: Story = {
  args: {part: callPart({name: 'Bash', input: {command: 'echo hi'}}), result: resultPart('hi'), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('echo hi')).toBeInTheDocument()
  },
}

function AcmeCard(): JSX.Element {
  return <div>Acme custom renderer</div>
}

// A custom renderer registered for a name wins over the generic fallback.
export const CustomRenderer: Story = {
  args: {part: callPart({name: 'acme_deploy', input: {env: 'staging'}}), result: resultPart('{}'), ctx: noopCtx()},
  play: async ({canvasElement}) => {
    registerToolRenderer('acme_deploy', AcmeCard)
    const c = within(canvasElement)
    await expect(await c.findByText('Acme custom renderer')).toBeInTheDocument()
  },
}
```

Note: `registerToolRenderer` runs in `play` (after mount) to prove the registry signal re-renders a live card; if `findByText` flakes because the override lands before first paint, move the `registerToolRenderer` call into a `beforeEach`/decorator — the signal path is what's under test either way.

- [ ] **Step 10: Write the auto-wire test (pure)**

Proves the co-location path: a `defineTool(...).server(...).render(...)` placed in `defineExtension({tools})` surfaces server-side as an MCP tool (+ prompt text) and client-side as a renderer keyed by name — no string typed twice.

```ts
// packages/extensions/test/discovery.test.ts
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {JSX} from 'solid-js'
import {defineExtension, defineTool, collectServerContributions, collectClientContributions} from '../src/index.js'

function Card(): JSX.Element {
  return null
}

const ext = defineExtension({
  id: 'acme',
  tools: [
    defineTool({
      name: 'acme_deploy',
      description: 'Deploy',
      inputSchema: z.object({env: z.string()}),
      promptSnippet: 'Use acme_deploy to deploy.',
    })
      .server(({env}) => ({url: `https://${env}`}))
      .render(Card),
  ],
})

describe('co-located tool: server execute + client renderer from one definition', () => {
  it('server contribution carries the executable tool + its prompt snippet', async () => {
    const {tools, systemPrompt} = collectServerContributions([ext])
    expect(tools.map((t) => t.name)).toContain('acme_deploy')
    expect(systemPrompt).toContain('Use acme_deploy to deploy.')
    const out = await tools[0].execute({env: 'staging'})
    expect(out).toEqual({url: 'https://staging'})
  })

  it('client contribution carries the renderer keyed by the same name', () => {
    const {toolRenderers} = collectClientContributions([ext])
    expect(toolRenderers).toHaveLength(1)
    expect(toolRenderers[0].name).toBe('acme_deploy')
    expect(toolRenderers[0].render).toBe(Card)
  })

  it('a render-only tool (no .server) wires a renderer but registers no MCP tool', () => {
    const override = defineExtension({
      id: 'compact-bash',
      tools: [defineTool({name: 'Bash', description: '', inputSchema: z.object({}).passthrough()}).render(Card)],
    })
    expect(collectServerContributions([override]).tools).toHaveLength(0)
    expect(collectClientContributions([override]).toolRenderers[0].name).toBe('Bash')
  })
})
```

- [ ] **Step 11: Run the tests**

Run: `pnpm turbo build --filter=@mandarax/extensions && pnpm --filter @mandarax/extensions exec vitest run test/discovery.test.ts && pnpm --filter @mandarax/tool-ui test`
Expected: PASS — the auto-wire test (3) and the Storybook `Builtin`/`CustomRenderer` plus existing card stories.

- [ ] **Step 12: Commit**

```bash
git add packages/tool-ui/src/registry.ts packages/tool-ui/src/tool-call.tsx packages/tool-ui/src/index.tsx packages/tool-ui/src/tool-call.stories.tsx packages/extensions/src/contract.ts packages/extensions/src/discovery.ts packages/extensions/src/index.ts packages/extensions/package.json packages/extensions/test/discovery.test.ts packages/widget/src/mount.tsx apps/examples/tanstack-start/mandarax/extensions/blue.ts
git commit -m "feat(extensions): co-located tool renderer (.render) + open renderer registry

defineTool(...).server(execute).render(Component) carries both halves; declarative
defineExtension({tools}) auto-wires execute server-side and the renderer client-side
across the .client/.server split. registerToolRenderer stays as the imperative substrate
(replaces tool-call.tsx's by-name Switch). Built-in renderer override = render-only tool.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Named component-override setters (Pi-faithful — `ui.setEmptyState`)

**Pi parity:** Pi overrides surfaces with named, individually-typed setters (`setHeader`, `setFooter`, `setEditorComponent`), not a generic string-keyed `setComponent(id)`. We follow that: one named setter per swappable surface. This slice ships `ui.setEmptyState(factory)` (the empty chat state) as the pattern; future overridable surfaces add their own named setter the same way. No generic registry, no declaration-merging, no cross-package augmentation visibility problem — each setter is concretely typed in the contract.

**Files:**

- Modify: `packages/extensions/src/contract.ts` (`EmptyStateProps`/`EmptyStateFactory` + `ClientApi.ui.setEmptyState`)
- Create: `packages/widget/src/empty-state.tsx` (default component + override signal + setter + slot)
- Modify: `packages/widget/src/chat-panel.tsx` (the empty-state fallback + remove the moved `STARTERS`)
- Modify: `packages/widget/src/mount.tsx`
- Modify: `apps/examples/tanstack-start/mandarax/extensions/blue.ts` (contract typecheck proof)
- Test: append to `packages/widget/test/extension-ui.it.test.ts`

**Interfaces:**

- Produces (contract.ts): `EmptyStateProps = {onStarter: (text: string) => void}`; `EmptyStateFactory = Component<EmptyStateProps>`; `ClientApi.ui.setEmptyState: (factory: EmptyStateFactory | null) => void` (`null` restores default).
- Produces (empty-state.tsx): `DefaultEmptyState: Component<EmptyStateProps>`; `setEmptyStateOverride(factory: EmptyStateFactory | null): void`; `EmptyStateSlot(props: {onStarter: (text: string) => void}): JSX.Element`.

- [ ] **Step 1: Add the typed setter to the contract**

In `packages/extensions/src/contract.ts`, add (near the other client types):

```ts
// The empty chat state (greeting + starters). An extension swaps it with ui.setEmptyState(factory).
export type EmptyStateProps = {onStarter: (text: string) => void}
export type EmptyStateFactory = Component<EmptyStateProps>
```

Add to `ClientApi.ui`:

```ts
    setEmptyState: (factory: EmptyStateFactory | null) => void
```

- [ ] **Step 2: Default component + override seam in one file**

```tsx
// packages/widget/src/empty-state.tsx
// The empty chat state (greeting + starter prompts) and its override seam: ui.setEmptyState(factory)
// stores a replacement in a signal; EmptyStateSlot renders the override if set, else the default.
// Named, concretely-typed setter (Pi-style), not a generic id registry.
import {createSignal, For, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {EmptyStateProps, EmptyStateFactory} from '@mandarax/extensions'

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]

export const DefaultEmptyState: Component<EmptyStateProps> = (props) => (
  <div class="m-auto text-center">
    <p class="text-[1.125rem] tracking-[-0.015em] font-semibold mb-3.5 anim-rise-d">How can I help you today?</p>
    <div class="flex flex-col gap-2">
      <For each={STARTERS}>
        {(s, i) => (
          <button
            type="button"
            class="text-[0.8125rem] text-pw-text px-3.5 py-2.5 border border-pw-line rounded-pw-pill min-h-9.5 cursor-pointer bg-transparent anim-rise trans-input hover:border-pw-accent hover:bg-pw-accent-08 active:scale-[0.97]"
            style={{'animation-delay': `${100 + i() * 60}ms`}}
            onClick={() => props.onStarter(s)}
          >
            {s}
          </button>
        )}
      </For>
    </div>
  </div>
)

const [override, setOverride] = createSignal<EmptyStateFactory | null>(null)
export const setEmptyStateOverride = (factory: EmptyStateFactory | null): void => setOverride(() => factory)

export function EmptyStateSlot(props: {onStarter: (text: string) => void}): JSX.Element {
  return <Dynamic component={override() ?? DefaultEmptyState} onStarter={props.onStarter} />
}
```

- [ ] **Step 3: Render the empty state through the slot**

In `packages/widget/src/chat-panel.tsx`:

- Delete the `STARTERS` const (line 70 — now lives in `empty-state.tsx`).
- Add the import:

```ts
import {EmptyStateSlot} from './empty-state.js'
```

- Replace the `fallback={…}` block (lines 722-742, the `<div class="m-auto text-center">…</div>`) with:

```tsx
          fallback={<EmptyStateSlot onStarter={(s) => void chat.sendMessage(s)} />}
```

- [ ] **Step 4: Wire `setEmptyState` into `mx`**

In `packages/widget/src/mount.tsx`, add the import:

```ts
import {setEmptyStateOverride} from './empty-state.js'
```

and add to the `clientApi.ui` literal:

```ts
          setEmptyState: (factory) => setEmptyStateOverride(factory),
```

- [ ] **Step 5: Typecheck + build the widget**

Run: `pnpm turbo build --filter=@mandarax/extensions && pnpm turbo build --filter=@mandarax/widget`
Expected: clean.

- [ ] **Step 6: Append the override case to the IT**

Add a second `it(...)` to `packages/widget/test/extension-ui.it.test.ts`. First extend the page's `clientFn` (in `pageHtml`) to also override the empty state — add inside the existing `clientFn` body (the `node` helper returns a real DOM node Solid inserts):

```js
mx.ui.setEmptyState(function () {
  return node('div', 'Custom welcome!')
})
```

Then add the test:

```ts
it('overrides the empty state via ui.setEmptyState', async () => {
  const page = await browser.newPage()
  await page.goto(state.base)
  await page.getByRole('button', {name: 'Open mandarax chat'}).click()
  await expect(page.getByText('Custom welcome!')).toBeVisible()
  await expect(page.getByText('How can I help you today?')).toHaveCount(0)
  await page.close()
})
```

- [ ] **Step 7: Run the IT**

Run: `pnpm --filter @mandarax/widget exec vitest run test/extension-ui.it.test.ts`
Expected: PASS — both the UI-store case and the empty-state override case.

- [ ] **Step 8: Prove the contract from the example app**

Add a `setStatus` call to `apps/examples/tanstack-start/mandarax/extensions/blue.ts`'s `.client` half so a real extension file exercises the new contract (the empty-state runtime override is proven by the IT; authoring a `setEmptyState` factory needs JSX, i.e. a `.tsx` file — out of scope for the `.ts` sample):

```ts
mx.ui.setStatus('theme', 'Blue theme active')
```

Run: `pnpm turbo typecheck --filter=<example app package name>`
Expected: clean — `mx.ui.setStatus` / the new contract resolves from a real extension file.

- [ ] **Step 9: Commit**

```bash
git add packages/extensions/src/contract.ts packages/widget/src/empty-state.tsx packages/widget/src/chat-panel.tsx packages/widget/src/mount.tsx packages/widget/test/extension-ui.it.test.ts apps/examples/tanstack-start/mandarax/extensions/blue.ts
git commit -m "feat(extensions): named component-override setter ui.setEmptyState (Pi-style)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Computed catalog + `mandarax_extensions` agent tool

**Files:**

- Modify: `packages/ui-kit-system/vite.config.ts`, `packages/ui-kit-system/package.json`
- Create: `packages/extensions/src/catalog.ts`
- Modify: `packages/extensions/src/index.ts`
- Create: `packages/tools/src/extensions-tool.ts`
- Modify: `packages/tools/src/server.ts`
- Test: `packages/extensions/test/catalog.test.ts`; one MCP IT assertion in core (see Step 9)

**Interfaces:**

- Produces (ui-kit): node-safe `@mandarax/ui-kit-system/tokens` export (`dist/tokens.js` + `dist/tokens.d.ts`).
- Produces (catalog.ts): `OVERRIDABLE_COMPONENTS`, `CLIENT_SURFACES`, `SERVER_SURFACES` consts; `buildCatalog(): Catalog`; `scaffold(kind: ScaffoldKind, opts: {id: string}): string`; `validateSource(source: string): {ok: boolean; issues: {level: 'error' | 'warn'; message: string}[]}`; types `Catalog`, `ScaffoldKind`.
- Produces (tools): `mandaraxExtensionsToolDef` + `ExtensionsInput` schema; a `mandaraxExtensionsServerTool()` registered in `mandaraxTools()`.

- [ ] **Step 1: Emit a node-safe tokens entry**

In `packages/ui-kit-system/vite.config.ts`, change the `lib` block to two entries:

```ts
    lib: {
      entry: {
        index: fileURLToPath(new URL('src/index.tsx', import.meta.url)),
        tokens: fileURLToPath(new URL('src/tokens.ts', import.meta.url)),
      },
      formats: ['es'],
    },
```

(Remove the `fileName: () => 'index.js'` line; multi-entry uses each entry's name, producing `dist/index.js` + `dist/tokens.js`.)

In `packages/ui-kit-system/package.json` `exports`, add:

```json
    "./tokens": {
      "types": "./dist/tokens.d.ts",
      "import": "./dist/tokens.js"
    },
```

- [ ] **Step 2: Build ui-kit and confirm the node-safe entry**

Run: `pnpm turbo build --filter=@mandarax/ui-kit-system`
Then confirm `packages/ui-kit-system/dist/tokens.js` exists and imports cleanly in node:
Run: `node --input-type=module -e "import('@mandarax/ui-kit-system/tokens').then(m => console.log(Object.keys(m.TOKENS).length))"` (from a context resolving the workspace) — Expected: a number (e.g. `40`), no solid import error.

- [ ] **Step 3: Write the catalog tests (failing)**

```ts
// packages/extensions/test/catalog.test.ts
import {describe, expect, it} from 'vitest'
import {TOKENS} from '@mandarax/ui-kit-system/tokens'
import {buildCatalog, scaffold, validateSource} from '../src/catalog.js'

describe('extension catalog (pure projection)', () => {
  it('projects every token into the catalog', () => {
    const cat = buildCatalog()
    const names = cat.tokens.map((t) => t.name)
    for (const name of Object.keys(TOKENS)) expect(names).toContain(name)
    expect(cat.tokens.find((t) => t.name === 'pw-accent')?.overridable).toBe(true)
  })

  it('lists the overridable EmptyState component', () => {
    expect(buildCatalog().overridableComponents.map((c) => c.id)).toContain('EmptyState')
  })

  it('scaffolds a theme extension that names defineExtension and setTheme', () => {
    const src = scaffold('theme', {id: 'mybrand'})
    expect(src).toContain('defineExtension')
    expect(src).toContain("id: 'mybrand'")
    expect(src).toContain('setTheme')
  })

  it('validate flags an unknown token name', () => {
    const bad = `import {defineExtension} from '@mandarax/extensions'
export default defineExtension({id: 'x'}).client((mx) => { mx.ui.setTheme({'pw-not-real': 'red'}) })`
    const res = validateSource(bad)
    expect(res.ok).toBe(false)
    expect(res.issues.some((i) => i.message.includes('pw-not-real'))).toBe(true)
  })

  it('validate passes a well-formed theme extension', () => {
    const good = `import {defineExtension} from '@mandarax/extensions'
export default defineExtension({id: 'x'}).client((mx) => { mx.ui.setTheme({'pw-accent': 'blue'}) })`
    expect(validateSource(good).ok).toBe(true)
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @mandarax/extensions exec vitest run test/catalog.test.ts`
Expected: FAIL — `Cannot find module '../src/catalog.js'`.

- [ ] **Step 5: Implement the catalog**

```ts
// packages/extensions/src/catalog.ts
// The extension catalog: a projection computed from node-safe sources (TOKENS, the overridable list,
// the surface consts) so the mandarax_extensions agent tool can serialize it without importing the
// browser registries. scaffold writes typed skeletons; validateSource lints a draft against the
// catalog (token + component ids) before it loads. Single-source for tokens holds (one TOKENS object
// → CSS + ThemeTokens type + this list).
import {TOKENS} from '@mandarax/ui-kit-system/tokens'

export const OVERRIDABLE_COMPONENTS = [
  {id: 'EmptyState', description: 'The empty chat state (greeting + starter prompts) shown before any messages.'},
] as const

export const CLIENT_SURFACES = [
  {method: 'ui.setTheme(tokens)', description: 'Override design tokens (e.g. {"pw-accent": "#2563eb"}).'},
  {
    method: 'ui.setWidget(key, factory)',
    description: 'Add/replace/remove a keyed widget in the panel (factory: () => JSX).',
  },
  {method: 'ui.setHeader(factory)', description: 'Set the panel header region (last-wins; null clears).'},
  {method: 'ui.setFooter(factory)', description: 'Set the panel footer region (last-wins; null clears).'},
  {method: 'ui.setStatus(key, text)', description: 'Set a keyed status line (null clears).'},
  {
    method: 'ui.setEmptyState(factory)',
    description: 'Replace the empty chat state (greeting + starters); null restores default.',
  },
  {method: 'registerComposerAction(action)', description: 'Add a button to the composer ({id,label,icon,onClick}).'},
  {
    method: 'registerToolRenderer(name, Component)',
    description: 'Imperative escape hatch; prefer co-locating via defineTool(...).render(Component).',
  },
] as const

export const SERVER_SURFACES = [
  {
    method: 'defineTool({name,description,inputSchema}).server(execute).render(Component)',
    description: 'Define a tool once: .server runs it (node), .render draws its card (browser).',
  },
  {
    method: 'defineExtension({id, tools:[…]})',
    description: 'Declare tools; execute auto-wires server-side, renderer client-side, across the split.',
  },
  {
    method: 'systemPrompt.append(text)',
    description: 'Append text to the agent system prompt (or use defineTool promptSnippet).',
  },
] as const

export type CatalogToken = {name: string; cssVar: string; default: string; description: string; overridable: boolean}
export type Catalog = {
  conventions: {location: string; entry: string}
  tokens: CatalogToken[]
  overridableComponents: {id: string; description: string}[]
  clientSurfaces: {method: string; description: string}[]
  serverSurfaces: {method: string; description: string}[]
}

export function buildCatalog(): Catalog {
  return {
    conventions: {
      location: 'mandarax/extensions/*.{ts,tsx}',
      entry: 'export default defineExtension({id}).client(mx => …).server(mx => …)',
    },
    tokens: Object.entries(TOKENS).map(([name, def]) => ({
      name,
      cssVar: `--${name}`,
      default: def.value,
      description: def.description,
      overridable: def.overridable ?? false,
    })),
    overridableComponents: OVERRIDABLE_COMPONENTS.map((c) => ({id: c.id, description: c.description})),
    clientSurfaces: CLIENT_SURFACES.map((s) => ({method: s.method, description: s.description})),
    serverSurfaces: SERVER_SURFACES.map((s) => ({method: s.method, description: s.description})),
  }
}

export type ScaffoldKind = 'theme' | 'composer-action' | 'tool' | 'tool-renderer' | 'component' | 'full'

const TEMPLATES: Record<ScaffoldKind, (id: string) => string> = {
  theme: (id) => `import {defineExtension} from '@mandarax/extensions'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.ui.setTheme({'pw-accent': '#2563eb'})
})
`,
  'composer-action': (id) => `import {defineExtension} from '@mandarax/extensions'
import {Rocket} from 'lucide-solid'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.registerComposerAction({
    id: '${id}',
    label: 'Do thing',
    icon: Rocket,
    onClick: (ctx) => ctx.insert('…'),
  })
})
`,
  tool: (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

const ${id}Do = defineTool({
  name: '${id}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
}).server(({input}) => ({result: input}))

export default defineExtension({id: '${id}', tools: [${id}Do]})
`,
  'tool-renderer': (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

// Co-locate the renderer with the tool: .render draws its card (browser), .server runs it (node).
const ${id}Do = defineTool({
  name: '${id}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
})
  .server(({input}) => ({result: input}))
  .render((props) => <div>Custom render for {props.part.name}</div>)

export default defineExtension({id: '${id}', tools: [${id}Do]})
`,
  component: (id) => `import {defineExtension} from '@mandarax/extensions'

export default defineExtension({id: '${id}'}).client((mx) => {
  mx.ui.setEmptyState(() => <div>Welcome — ask me anything.</div>)
})
`,
  full: (id) => `import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

const ${id}Do = defineTool({
  name: '${id}_do',
  description: 'Describe what this tool does',
  inputSchema: z.object({input: z.string()}),
  promptSnippet: 'You can use ${id}_do.',
})
  .server(({input}) => ({result: input}))
  .render((props) => <div>${id}: {props.part.name}</div>)

export default defineExtension({id: '${id}', tools: [${id}Do]})
  .client((mx) => {
    mx.ui.setTheme({'pw-accent': '#2563eb'})
    mx.ui.setStatus('${id}', 'ready')
  })
`,
}

export function scaffold(kind: ScaffoldKind, opts: {id: string}): string {
  return TEMPLATES[kind](opts.id)
}

const TOKEN_NAMES = new Set(Object.keys(TOKENS))

// Lint a draft against the catalog: unknown token names in setTheme + a missing defineExtension
// default export. v0 heuristic (string-level) — catches the common mistakes the agent makes before a
// file ever loads; a full typecheck is the build's job.
export function validateSource(source: string): {ok: boolean; issues: {level: 'error' | 'warn'; message: string}[]} {
  const issues: {level: 'error' | 'warn'; message: string}[] = []
  if (!/export\s+default\s+defineExtension\s*\(/.test(source)) {
    issues.push({level: 'error', message: 'No `export default defineExtension({id})` found.'})
  }
  const themeBlocks = [...source.matchAll(/setTheme\s*\(\s*\{([^}]*)\}/g)]
  for (const block of themeBlocks) {
    for (const key of [...block[1].matchAll(/['"]([\w-]+)['"]\s*:/g)]) {
      if (!TOKEN_NAMES.has(key[1])) {
        issues.push({
          level: 'error',
          message: `Unknown theme token '${key[1]}'. Run mandarax_extensions catalog for the token list.`,
        })
      }
    }
  }
  return {ok: issues.every((i) => i.level !== 'error'), issues}
}
```

- [ ] **Step 6: Export from the index**

In `packages/extensions/src/index.ts`, add:

```ts
export {
  buildCatalog,
  scaffold,
  validateSource,
  OVERRIDABLE_COMPONENTS,
  CLIENT_SURFACES,
  SERVER_SURFACES,
  type Catalog,
  type CatalogToken,
  type ScaffoldKind,
} from './catalog.js'
```

- [ ] **Step 7: Run the catalog tests**

Run: `pnpm turbo build --filter=@mandarax/extensions && pnpm --filter @mandarax/extensions exec vitest run test/catalog.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Define + register the agent tool**

```ts
// packages/tools/src/extensions-tool.ts
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const ExtensionsInput = z.object({
  verb: z.enum(['catalog', 'scaffold', 'validate']),
  kind: z.enum(['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']).optional(),
  id: z.string().optional(),
  source: z.string().optional(),
})

export const mandaraxExtensionsToolDef = toolDefinition({
  name: 'mandarax_extensions',
  description:
    'Author mandarax widget/agent extensions. verb=catalog dumps the customization surface (theme tokens, overridable components, client/server APIs); verb=scaffold returns a typed extension skeleton for a kind (theme|composer-action|tool|tool-renderer|component|full) + id; verb=validate lints draft source against the catalog. Write the returned code to mandarax/extensions/<id>.ts — it hot-reloads.',
  inputSchema: ExtensionsInput,
})
```

In `packages/tools/src/server.ts`, add the imports:

```ts
import {buildCatalog, scaffold, validateSource} from '@mandarax/extensions'
import {mandaraxExtensionsToolDef, ExtensionsInput} from './extensions-tool.js'
```

Add the server-tool factory (stateless — no `ctx`), mirroring the existing factories:

```ts
function mandaraxExtensionsServerTool(): MandaraxServerTool {
  const tool = mandaraxExtensionsToolDef.server(async (input) => {
    if (input.verb === 'catalog') return buildCatalog()
    if (input.verb === 'scaffold') {
      if (!input.kind || !input.id) throw new Error('scaffold needs {kind, id}')
      return {code: scaffold(input.kind, {id: input.id})}
    }
    if (!input.source) throw new Error('validate needs {source}')
    return validateSource(input.source)
  })
  const run = tool.execute
  if (!run) throw new Error('mandarax_extensions: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: ExtensionsInput,
    execute: (input) => run(ExtensionsInput.parse(input)),
  }
}
```

Add `mandaraxExtensionsServerTool()` to the array returned by `mandaraxTools(ctx)`.

- [ ] **Step 9: Typecheck, build, and prove via the MCP IT**

Run: `pnpm turbo build --filter=@mandarax/tools && pnpm turbo typecheck --filter=@mandarax/tools`
Expected: clean.

Add one assertion to the existing core MCP IT (`packages/core/test/api/mcp/mcp.it.test.ts`) that `tools/list` now includes `mandarax_extensions`, and a `tools/call` with `{verb:'catalog'}` returns a payload containing the `pw-accent` token. (Follow that file's existing request/response pattern — it already calls `tools/list` and `tools/call`.) Run:

Run: `pnpm --filter @mandarax/core exec vitest run test/api/mcp/mcp.it.test.ts`
Expected: PASS — the new tool lists and `catalog` returns the token set.

- [ ] **Step 10: Commit**

```bash
git add packages/ui-kit-system/vite.config.ts packages/ui-kit-system/package.json packages/extensions/src/catalog.ts packages/extensions/src/index.ts packages/extensions/test/catalog.test.ts packages/tools/src/extensions-tool.ts packages/tools/src/server.ts packages/core/test/api/mcp/mcp.it.test.ts
git commit -m "feat(extensions): computed catalog + mandarax_extensions tool (catalog/scaffold/validate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `mandarax-extensions` skill + worked examples

**Files:**

- Create: `skills/mandarax-extensions/SKILL.md` (or the repo's established skills location — confirm in Step 1)
- Create: `apps/examples/tanstack-start/mandarax/extensions/deploy-button.tsx` (worked example: composer action + status + tool renderer)
- Modify: this slice's example `blue.ts` already exercises theme + tool + status

**Interfaces:** Documentation only — no code contract. The skill teaches the `.client/.server` shape, where files live, the three reach tiers, the `mandarax_extensions catalog → scaffold → validate` loop, and links the examples.

- [ ] **Step 1: Locate the skills convention**

Run: `ls skills/ 2>/dev/null; ls .claude/skills 2>/dev/null; git -C . ls-files | grep -i 'SKILL.md' | head`
Use whichever location the repo already uses for project skills. If none exists, create `skills/mandarax-extensions/SKILL.md`.

- [ ] **Step 2: Write the skill**

```markdown
---
name: mandarax-extensions
description: Author mandarax widget/agent extensions — theme, composer buttons, tool-call renderers, UI regions, component overrides, agent tools, and system-prompt text. Use when asked to customize or extend the mandarax chat widget or its embedded agent.
---

# Authoring mandarax extensions

Extensions are TypeScript files in `mandarax/extensions/*.{ts,tsx}`, committed to the repo. Drop a
file and it hot-reloads into the live widget (client) and the agent engine (server). No manual wiring.

## The loop

1. `mandarax_extensions` with `verb: "catalog"` — see the surface (theme tokens, overridable
   components, client/server APIs). Read it before writing.
2. `mandarax_extensions` with `verb: "scaffold", kind, id` — get a typed skeleton.
3. Edit it into `mandarax/extensions/<id>.ts`. The widget hot-reloads; screenshot to confirm.
4. `mandarax_extensions` with `verb: "validate", source` — lint against the catalog before relying on it.

## Shape

\`\`\`ts
export default defineExtension({id: 'acme'})
.client((mx) => { /_ runs in the browser widget _/ })
.server((mx) => { /_ runs in the agent engine (node) _/ })
\`\`\`

## Tools (renderer co-located with the definition)

\`\`\`ts
const deploy = defineTool({name: 'deploy', description: '…', inputSchema: z.object({env: z.string()})})
.server(({env}) => ({url: …})) // runs in node (MCP)
.render((props) => <DeployCard {...props} />) // draws its card in the browser

export default defineExtension({id: 'acme', tools: [deploy]}) // both halves auto-wired
\`\`\`

To restyle a built-in tool you don't own, define a render-only tool keyed to its name (no `.server`):
`defineTool({name: 'Bash', …}).render(MyBashCard)`.

## Reach tiers

1. Additive surfaces: `registerComposerAction`, declared `tools` (renderer via `.render`), `ui.setWidget/setHeader/setFooter/setStatus`.
2. Overrides: `ui.setTheme` (token-level), named setters like `ui.setEmptyState(factory)` (one per surface).
3. Ejection: copy the source component into your repo and edit wholesale.

Client `mx`: `ui.setTheme`, `ui.setWidget/setHeader/setFooter/setStatus`, `ui.setEmptyState`,
`registerComposerAction`, `registerToolRenderer` (escape hatch — prefer `.render` on the tool).
Server `mx`: `registerTool(defineTool({…}).server(…))`, `systemPrompt.append(text)`.

See `apps/examples/tanstack-start/mandarax/extensions/` for worked examples.
```

(Match the repo's docs style: no em dashes, concise, example-first — see the docs-writing-style memory.)

- [ ] **Step 3: Add a worked example**

```tsx
// apps/examples/tanstack-start/mandarax/extensions/deploy-button.tsx
import {z} from 'zod'
import {Rocket} from 'lucide-solid'
import {defineExtension, defineTool} from '@mandarax/extensions'
import type {ToolCardProps} from '@mandarax/tool-ui'

// One definition: .server runs it (node), .render draws its card (browser), promptSnippet documents it.
const deployRun = defineTool({
  name: 'deploy_run',
  description: 'Deploy the current branch',
  inputSchema: z.object({env: z.enum(['staging', 'prod'])}),
  promptSnippet: 'You can deploy with the deploy_run tool.',
})
  .server(({env}) => ({url: `https://${env}.example.com`}))
  .render((props: ToolCardProps) => <div data-pw-deploy-card>Deploying… ({props.part.name})</div>)

export default defineExtension({id: 'deploy', tools: [deployRun]}).client((mx) => {
  mx.registerComposerAction({
    id: 'deploy',
    label: 'Deploy',
    icon: Rocket,
    onClick: (ctx) => ctx.notify('Deploy requested'),
  })
  mx.ui.setStatus('env', 'env: staging')
})
```

- [ ] **Step 4: Verify the example app typechecks + the extension applies end-to-end**

Run: `pnpm turbo typecheck --filter=<example app package name>`
Expected: clean (the worked example uses the real types).

Then run the example app dev server and confirm in a real browser (per the existing `e2e/extensions.spec.ts` pattern, or manually): the Deploy composer button appears, `env: staging` shows as a status line, and `mandarax_extensions catalog` returns the surface. Extend `e2e/extensions.spec.ts` with an assertion that the Deploy button (`getByRole('button', {name: 'Deploy'})`) is visible.

Run: `pnpm --filter <example app package name> e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/mandarax-extensions/SKILL.md apps/examples/tanstack-start/mandarax/extensions/deploy-button.tsx apps/examples/tanstack-start/e2e/extensions.spec.ts
git commit -m "docs(extensions): mandarax-extensions skill + worked examples

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final whole-repo verification

- [ ] **Step 1: Whole-repo typecheck**

Run: `pnpm turbo typecheck`
Expected: clean across every package (no `unknown`/`any`/casts introduced).

- [ ] **Step 2: Whole-repo build**

Run: `pnpm turbo build`
Expected: clean.

- [ ] **Step 3: Targeted test sweep**

Run: `pnpm --filter @mandarax/widget exec vitest run && pnpm --filter @mandarax/tool-ui test && pnpm --filter @mandarax/extensions exec vitest run && pnpm --filter @mandarax/core exec vitest run test/api/mcp/mcp.it.test.ts`
Expected: PASS.

- [ ] **Step 4: End-to-end against the running example**

Boot `apps/examples/tanstack-start` (`pnpm dev` from its dir per the existing example workflow) and confirm in a real browser: blue accent + status line from `blue.ts`, the Deploy button + env status from `deploy-button.tsx`, and `mandarax_extensions catalog` returning the token list. Clean up the dev server when done.

---

## Self-Review

- **Spec coverage (Slice 4 = reach tiers 2-3 + legibility), reconciled with real Pi:**
  - `ui.setWidget/setHeader/setFooter/setStatus` reactive store ✓ (Task 1) — matches Pi's keyed/scalar `ctx.ui` setters.
  - Tool renderer: open registry + co-located `defineTool(...).render(Component)` + declarative `tools[]` auto-wiring ✓ (Task 2). Replaces `tool-call.tsx`'s Switch (`GenericCard` fallback). Pi-faithful given our server/client split (Design Note 1).
  - Component override: named typed setter `ui.setEmptyState(factory)` ✓ (Task 3) — Pi's named-setter model, not a generic `setComponent(id)` (Design Note 2).
  - Generated/computed catalog (tokens single-source projection + overridable + surfaces) ✓ (Task 4).
  - `mandarax_extensions` catalog/scaffold/validate verbs ✓ (Task 4) — new tool, not `mandarax_ui` (Design Note 4).
  - Tools self-document via `promptSnippet`/`promptGuidelines` ✓ (Task 2/4) — Pi parity (Design Note 3).
  - `mandarax-extensions` skill + worked examples ✓ (Task 5).
  - Error isolation: each slot is error-boundaried ✓ (Task 1). The two-sided event bus (`mx.on`) is deferred (Design Note 6; Pi's `ExtensionEvent` union is the reference).
- **Placeholder scan:** none — every code step carries full source. One deferred-to-runtime check remains: `Dynamic`'s prop-spread typing in `EmptyStateSlot`/the registry (the `<Dynamic component={…} {...props}/>` pattern), resolved at execution with the stated bind-first fallback. No declaration-merging / augmentation-visibility risk remains (named setters removed it).
- **Type consistency:** `UiFactory` defined in Task 1 (contract.ts), consumed in `ui-store.tsx`. `EmptyStateProps`/`EmptyStateFactory` defined in Task 3 (contract.ts), consumed in `empty-state.tsx` + `mount.tsx`. `ToolRenderer`/`ExtensionTool`/`ToolBuilder`/`defineTool`/`defineExtension({tools})` defined in Task 2 (contract.ts); `ExtensionTool` drained in `discovery.ts` (`collectServerContributions` → `ExtensionServerTool`, `collectClientContributions` → renderers) and wired in `mount.tsx`. `ToolCardProps` imported from `@mandarax/tool-ui` in Task 2 (contract.ts), reused in scaffolds/examples. `registerToolRenderer(name, renderer)` identical in registry.ts, contract.ts, mount.tsx. `buildCatalog`/`scaffold`/`validateSource` identical in catalog.ts, tests, tool wrapper. `TOKENS` imported from the new `@mandarax/ui-kit-system/tokens` subpath everywhere node-side.
- **Single-source held:** tokens stay one object → CSS + `ThemeTokens` type + catalog `tokens[]`; adding a token updates all three. A tool is defined once (`defineTool`) and its execute/renderer/promptSnippet project to MCP + the renderer registry + the system prompt — no name typed twice. `OVERRIDABLE_COMPONENTS` is catalog-only metadata (named setters carry their own types in the contract).
