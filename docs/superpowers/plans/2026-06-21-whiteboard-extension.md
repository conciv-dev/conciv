# Whiteboard Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@mandarax/whiteboard` — a default-on first-party extension giving the user and the AI an equal, transparent, infinite Excalidraw canvas over the dev app, with source-anchored comments, a drift doctor, and one cross-store undo stack — built entirely on the shipped `mx` platform API.

**Architecture:** One monorepo package exporting a single `MandaraxExtension`. The data layer is **TanStack DB** (`mx.db`) for every durable/queryable thing (comment rows, parts, status, anchors). The **only** live CRDT surface is **Yjs** (`mx.sync`) for the canvas: drawing elements, pin geometry, and ephemeral presence (awareness). React appears in exactly **one ~30-line file** — a dumb `<Excalidraw>` shim exposing an imperative handle; every line of feature logic (Yjs↔scene glue, pins, threads, anchoring, undo, doctor, presence) is plain TS + Solid living outside React. A Phase 0 lands seven small public-API additions the platform is missing before any feature consumes them.

**Tech Stack:** Solid (widget), React 19 + `@excalidraw/excalidraw` 0.18.x (island only), Yjs + `y-websocket` + `y-indexeddb` (`mx.sync`), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection` over `trail` (`mx.db`), `oxc-parser` + shell `git` (anchoring), `solid-sonner` (toasts), zod, h3.

## Grounding notes (read before starting)

- `docs/superpowers/notes/platform-phase0-gaps.md` — the 7 gaps with exact file:line + signature changes, plus Extra A (EffectCtx expansion), Extra B (loader hook precedent), Extra C (react/react-dom not installed).
- `docs/superpowers/notes/excalidraw-react-island.md` — Excalidraw 0.18 API (props, `ExcalidrawImperativeAPI`, `updateScene`/`captureUpdate`, `Collaborator`, `convertToExcalidrawElements`, Mermaid package split, CSS path), React-in-shadow mounting, bundling findings.
- `docs/superpowers/notes/trailbase-api.md`, `docs/superpowers/notes/tanstack-db-contract.md` — the data layer (UUID PK + `cid TEXT UNIQUE` join key, `parse`/`serialize`, `cidKeyedApi` shim, realtime).
- `docs/superpowers/specs/2026-06-21-canvas-comments-extension-v2-design.md` — the feature spec.

## Global Constraints

Every task implicitly includes these (copied verbatim from the house rules / spec — values are exact):

- **Code style (hard):** functions not classes; NO IIFE; ZERO comments in code; no `any`, no casts, no `else`; prefer generics over type-only deps; clear names. Production code is functional (map/reduce, not if/else chains).
- **Deps:** `@excalidraw/excalidraw` (0.18.x), `react`, `react-dom`, `solid-sonner`, `@excalidraw/mermaid-to-excalidraw` are **new** and require explicit user approval **before install** (house rule — react/react-dom are NOT currently installed). Already present: `yjs`, `y-indexeddb`, `y-websocket`, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/trailbase-db-collection`, `trailbase`, `oxc-parser`, `zod`, `solid-js`. **No `y-excalidraw`** (own ~40-line glue). **No vendoring third-party source.** Never patch deps or deviate approach without asking.
- **Testing:** real `trail` (spawned via `createTrailSupervisor`) + real Chromium (Playwright `chromium.launch()` → `browser.newPage()`, NEVER `newContext()`); no mocks, no jsdom, no stubs. Native assertions only (`getByRole`/`getByText`/`toBeVisible`/ARIA); reach the widget shadow root via `getByRole().getRootNode()`; never `querySelector`/class selectors/`toBe(true)` on DOM. Widget ITs live in `packages/*/test/**/*.it.test.ts`, `environment: 'node'`, drive Chromium. Parallel browser tests need a unique `browser.api.port` — pass distinct ports per fixture server (use `get-port`). Run widget/whiteboard ITs with `SKIP_STORYBOOK_TESTS=1`.
- **Build/typecheck:** via turborepo from the repo root (`turbo run build`/`typecheck` `--filter @mandarax/whiteboard`), not manual dist rebuilds. Reproduce CI with the real `turbo … --filter` command.
- **Commits:** TDD cycle per step (failing test → run → impl → pass → commit). `oxfmt` reformats on the first commit of a file — when a commit's pre-hook reformats, `git add -A` and re-run the **same** commit. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Workflow:** run every command from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/canvas-comments`; never `cd` to the main repo (silent branch switch corrupts work). Work inline; no dispatched subagents. **If any Phase-0 gap turns out bigger than a small public-API addition, STOP and ask before expanding it.** (Gap 5 is now confirmed small — reuse the shipped `permission.ts`/`ApprovalModal`; do not rebuild AI approval.)

## File Structure

### Platform changes (Phase 0) — existing packages

- `packages/extensions/src/contract.ts` — add `ToolExecuteCtx`; widen `execute` on `ToolDefinition` + `ExtensionServerTool`; add `runTool`/`previewId`/`sessionId`/`headers` to `ClientApi`; add `runTool`/`db`/`sync`/`previewId`/`sessionId` to `EffectCtx`; add `awareness` to nothing here (that is protocol).
- `packages/extensions/src/discovery.ts` — `wrapToolDefinition` forwards ctx; `collectServerContributions` unchanged in shape.
- `packages/protocol/src/sync-types.ts` — add `awareness: Awareness` to `SyncRoom` + `ClientRoom`.
- `packages/core/src/sync/sync.ts` — surface `state.awareness` on the engine room.
- `packages/widget/src/sync/client-sync.ts` — surface `provider.awareness` on `ClientRoom`.
- `packages/core/src/api/tools/run.ts` — pass `{sessionId, previewId}` to execute; add the approval decision/resume path; record history `{label, inverse}`.
- `packages/core/src/api/mcp/mcp.ts` — accept + pass `previewId`; pass `{sessionId, previewId}` to execute.
- `packages/core/src/history/history.ts` (new) — per-session `{label, inverse}` stack + `undo`/`redo`.
- `packages/core/src/api/cors.ts` — add `'PATCH'` to methods.
- `packages/widget/src/mount.tsx` — read `pw-preview-id`; wire `runTool` headers to the active session; put `runTool`/`previewId`/`sessionId`/`headers` on `clientApi`; apply the built-in whiteboard extension.
- `packages/widget/src/effects-host.ts` — `makeEffectCtx` supplies the new `EffectCtx` fields.
- `packages/plugin/src/core/services.ts` — prepend the first-party `[whiteboardExtension]` to discovered server contributions.

### New package `packages/whiteboard`

```
packages/whiteboard/
  package.json · tsconfig.json · tsconfig.build.json · vite.config.ts · vitest.config.ts
  src/
    index.ts                 -- the MandaraxExtension: defineExtension({id,tools,effects}).server(fn).client(fn)
    schema.ts                -- Comment type, zod schema, columns SQL, parse/serialize, limits
    room.ts                  -- roomId(previewId, sessionId), Yjs key constants, ORIGIN re-use
    tools/
      canvas.ts              -- canvas.read/draw/connect/diagram/export/update/delete/clear
      comment.ts             -- comment.create/list/read/reply/resolve/delete/reanchor/move + pin.setState
      element.ts             -- element.pick (client) / element.reference (server)
      anchor.ts              -- anchor.resolve
      doctor-tool.ts         -- doctor.run
      history-tool.ts        -- history.undo / history.redo (thin wrappers over core history)
    canvas/
      island.tsx             -- THE ONLY React file: <Excalidraw> shim → imperative handle (~30 lines)
      glue.ts                -- Yjs Y.Map<id,element> <-> scene diff/apply (plain TS, ~40 lines)
      presence.ts            -- Yjs awareness <-> Excalidraw collaborators Map
      canvas-effect.tsx      -- defineEffect: Solid host, lazy-imports island, mounts react root, pins overlay
      zoom-controls.tsx      -- Solid in/out/reset/fit controls
    pins/
      pins.tsx               -- Solid pin + tether rendering, pinState geometry from Yjs
      thread.tsx             -- Solid thread panel, parts via @mandarax/tool-ui ToolCallCard, reply/resolve
      drag-prompt.tsx        -- disconnect / keep-drift / cancel prompt
    anchor/
      resolver.ts            -- default React/TSX AnchorResolver (capture/resolve/reanchor)
      oxc-capture.ts         -- oxc parse @ file:line:col -> normalized AST-subtree hash + salt + snippet
      git-track.ts           -- shell git line-tracking
      confine.ts             -- project-root confinement + secret denylist + snippet redaction
    doctor/
      sweep.ts               -- doctor sweep over comments (resolve each, reconcile join)
    undo/
      inverses.ts            -- inverse descriptors for each mutating tool (create<->delete, move<->move, …)
    test/
      *.it.test.ts · fixtures/*
  cli (in @mandarax/cli): packages/cli/src/doctor.ts + bin wiring
  skill: skills/whiteboard/SKILL.md (+ examples)
```

**Server/client import boundary (critical):** `index.ts` may statically import `tools/*` (node deps: oxc, git, zod — fine under jiti server load) and `canvas/canvas-effect.tsx` (light; returns Solid JSX in `render()` only). `canvas-effect.tsx` must **dynamically** `import('./island.js')` inside `render()` so the static graph never pulls `react`/`@excalidraw/excalidraw` into the jiti server load or the initial widget bundle. `pins/*` and `thread.tsx` are Solid (no react). Verified by the Phase-1 bridge spike.

## The extension API model (the executor MUST follow this exactly)

Verified against `packages/extensions/src/contract.ts` + `discovery.ts` + the consumers (`mount.tsx`, `services.ts`). The whole extension is one plain object built by `defineExtension({id, tools?, effects?}).server(fn).client(fn)` → `MandaraxExtension = {id, tools?, effects?, clientFn?, serverFn?}`. No classes, no central registry, each unit self-describes.

1. **All tools go in the `meta.tools` array passed to `defineExtension` — one definition, dual-consumed.**
   - `collectServerContributions(exts, services)` (`discovery.ts:63`) iterates `ext.tools`: every tool with `execute` is wrapped (`wrapToolDefinition`) into the wire/MCP `ExtensionServerTool`; `promptSnippet`/`promptGuidelines` append to the system prompt. Then it calls `ext.serverFn(serverApi)`.
   - `collectClientContributions(exts)` (`discovery.ts:90`) iterates the SAME `ext.tools`: every tool with `renderCall`/`renderResult` joins the client tool-ui render list (matched by `part.name`). `mount.tsx` separately calls `ext.clientFn(clientApi)`.
   - So a single `defineTool({name, parameters, execute, renderResult, promptSnippet})` serves both the MCP execute path and the Solid card. **Never register a tool twice** (not in `serverFn` AND `meta.tools`).
2. **`.server(fn: ServerApi)` and `.client(fn: ClientApi)` are wiring only**, not tool registration:
   - `serverFn`: `mx.db.collection(...)`, `mx.sync.room(...)`, `mx.on('session_start', …)`, `mx.approval(name,'ask')`, `mx.systemPrompt.append`.
   - `clientFn`: client `mx.db.collection(...)`, `mx.registerComposerAction`, `mx.ui.*`, and (post-Phase-0) `mx.runTool`/`mx.previewId`/`mx.sessionId`.
3. **Effects** (`meta.effects`) are client-only; `render(ctx: EffectCtx)` returns Solid JSX mounted by `effectsHost`. `EffectCtx` is NOT `ClientApi` — that is why Phase-0 Extra-A widens `EffectCtx` with `runTool`/`db`/`sync`/`previewId`/`sessionId`.
4. **Server tools get `(input, ctx: ToolExecuteCtx)`** after Gap 1; `ctx = {sessionId, previewId}` → `roomId(previewId, sessionId)`.
5. **Import boundary (restated):** the server half is jiti-loaded and the client half bundles the whole `index.ts` graph, so `index.ts`/`tools/*`/`canvas-effect.tsx` carry NO static `react`/`react-dom`/`@excalidraw` import — those load only via `await import(...)` inside `render()`/`execute()`.

---

## Post-review revisions (2026-06-21) — these SUPERSEDE conflicting task text

A five-angle review against the real code surfaced fixes folded into the tasks above; the cross-cutting ones are consolidated here. Apply them.

- **Gap 8 (NEW Phase-0 gap) — column for the source anchor.** The composer pick (`react-grab` `adapter.comment`) delivers `{componentName, filePath, lineNumber}` with **no column** (`react-grab/grab-types.ts`), but `PickedTarget`/`SourceAnchor` need `file:line:col` (a shared-line JSX node is otherwise ambiguous). Fix in Phase 0: thread `column` through the grab sink by reading the build-injected `data-mandarax-source` attr (the same source `react-bridge.ts:121-130` `locate()` uses, which DOES carry column) at pick time — extend `ElementSource`/`Grab` with `column: number | null`. Where column is genuinely absent, make `PickedTarget.column` optional and degrade instance identity to rect/position (flag `drifted`, never silent), per the spec's accepted limitation. Do this before Task 3.6.
- **Task 0.8 (NEW) — port the IT harness into `packages/whiteboard`.** Every whiteboard IT says "reuse the probe harness", but that harness (`packages/widget/test/probe-extension.it.test.ts` + `it-fixture.ts` + `fixtures/probe-fixture.ts` + `helpers/widget-server.ts`) lives in `@mandarax/widget` and bundles a widget fixture. Add an explicit task at the end of Phase 0: create `packages/whiteboard/test/helpers/` with a `bootStack()` (real `createTrailSupervisor` + `createLiveDb` + `createSnapshotStore` + `createSync` + `start({extensions: collectServerContributions([whiteboard], {db, sync}), dbProxyTarget, syncHooks})`), an esbuild fixture bundler, and a page server on a fresh `getPort()`. Every later `*.it.test.ts` in the package builds on this. **The fixture's `runTool` MUST send a real `MANDARAX_SESSION_HEADER`** (the probe fixture uses empty headers, which collapses every session to `''` and makes the session-scoped undo/approval ITs vacuous).
- **`browser.api.port` wording is wrong for these ITs.** The whiteboard/widget ITs run `environment: 'node'` and drive Chromium via `playwright` directly (not the vitest browser provider). The real parallel-safety requirement is a fresh `await getPort()` per suite for the trail port AND the page-server port (as the probe harness already does). Read every "unique `browser.api.port`" in this plan as that.
- **`session.switch` needs a real `defineTool`.** It is in the spec's capability list; add it as a small tool in Task 3.6 (or a dedicated micro-task): `session.switch({sessionId})` → asks the shell to activate that session (reads/writes the active-session signal from Gap 4) and re-scopes the canvas room + comment query. Not just prose.
- **Dual-write ordering (Task 3.3).** Write the Yjs pin only AFTER `mx.db.comments.insert(row)` resolves (TanStack DB rolls back an optimistic row on persist failure, but the Yjs pin has no rollback → orphan). Additionally run the doctor's pin-without-row reconciliation on **canvas mount**, not only `session_start`.
- **`git-track` argv safety (Task 4.3).** Use `execFile` (no shell) AND put `--` before path args in every `git` invocation so a crafted `file` can't become a flag. Pass the confined absolute path as a single argv element.
- **sessionId is the only access control on rooms/comments (document it).** `run.ts` derives `sessionId` from a forgeable header and `cors.ts` trusts ALL loopback origins (every local dev port), so cross-port-loopback is inside the trust boundary; room isolation (`previewId:sessionId`) and the y-websocket relay (no ACL) rest entirely on session-id unguessability. Add to Task 7.5: assert the session token has sufficient entropy and is not enumerable; document the single-developer-localhost trust assumption explicitly.
- **AI presence is best-effort (Task 2.6).** Server-side `engine.room(id).awareness` only reaches browsers currently connected to that exact room; an AI cursor set with no client connected is GC'd. Scope it as cosmetic/opportunistic; the two-page IT (which has a live client) is the valid test.
- **Task 0.7 scaffold `serverFn` must stay service-free.** `collectServerContributions([whiteboard])` (no `services`) falls back to `NO_DB`/`NO_SYNC` which throw on use (`discovery.ts:50-59`). The unit "loads" test only passes while `.server(() => {})` touches nothing; once real `mx.db`/`mx.sync` wiring lands (Phase 2+), those assertions move to the booted-stack harness (Task 0.8).
- **`harness-logger` entrypoint (Task 7.5).** Name the exact export when wiring observability (`packages/core/src/runtime/harness-logger.ts` exposes a debug config, not an obvious `log()` — confirm the function before claiming "logs through harness-logger").

---

## Phase 0 — Platform additions (land + test before any feature phase)

Order: smallest/most-isolated first (CORS, awareness), then the execute-ctx + client-surface changes the feature depends on, then history + approval (the two heaviest), then the package scaffold + loader hook proven end-to-end.

### Task 0.1: CORS allows PATCH (Gap 7)

**Files:**

- Modify: `packages/core/src/api/cors.ts:45`
- Test: `packages/core/test/cors.test.ts` (create if absent)

**Interfaces:**

- Consumes: `registerCors(app, allowedOrigins)` (existing).
- Produces: preflight `OPTIONS` for a loopback origin returns `access-control-allow-methods` including `PATCH`.

- [ ] **Step 1: Write the failing test**

```ts
import {H3} from 'h3'
import {describe, expect, it} from 'vitest'
import {registerCors} from '../src/api/cors.js'

describe('cors PATCH', () => {
  it('advertises PATCH in the preflight method allowlist', async () => {
    const app = new H3()
    registerCors(app)
    app.get('/x', () => 'ok')
    const res = await app.fetch(
      new Request('http://127.0.0.1/x', {
        method: 'OPTIONS',
        headers: {origin: 'http://localhost:3000', 'access-control-request-method': 'PATCH'},
      }),
    )
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})
```

- [ ] **Step 2: Run it — Expected FAIL** (`PATCH` absent)

Run: `pnpm --filter @mandarax/core test -- cors`

- [ ] **Step 3: Implement** — `packages/core/src/api/cors.ts:45`

```ts
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
```

- [ ] **Step 4: Run it — Expected PASS**
- [ ] **Step 5: Commit** — `feat(core): allow PATCH in CORS method allowlist`

---

### Task 0.2: Awareness handle on `mx.sync` (Gap 3)

**Files:**

- Modify: `packages/protocol/src/sync-types.ts:13-29`
- Modify: `packages/core/src/sync/sync.ts:120-132`
- Modify: `packages/widget/src/sync/client-sync.ts:14-30`
- Test: `packages/widget/test/sync-awareness.it.test.ts`

**Interfaces:**

- Produces: `SyncRoom.awareness: Awareness` and `ClientRoom.awareness: Awareness` (both from `y-protocols/awareness`).
- Consumes (Phase 2): `room.awareness.setLocalStateField(...)` / `.on('change', …)` / `.getStates()`.

- [ ] **Step 1: Write the failing IT.** Two in-process `createClientSync` instances do NOT share state (each opens its own `WebsocketProvider`; they only converge through a running relay). So model this on the existing `packages/widget/test/client-sync.it.test.ts` two-**browser-page** pattern over a booted core (`start({syncHooks})` + the probe `beforeAll`): page A `room('aw-room').awareness.setLocalStateField('cursor', {x:10,y:20})`; poll until page B's `room('aw-room').awareness.getStates()` contains it (assert via a visible projection of the awareness state on the page, reached through the shadow root — not a Node boolean). Plus a Node-side assertion that `engine.room('aw-room').awareness` is a defined `Awareness` (the server-side handle). Drive the awareness from page script exposed by the fixture, not two Node clients.

- [ ] **Step 2: Run it — Expected FAIL** (`awareness` is `undefined`; type error)

Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/widget test -- sync-awareness`

- [ ] **Step 3: Implement**

`packages/protocol/src/sync-types.ts`:

```ts
import type {Doc} from 'yjs'
import type {Awareness} from 'y-protocols/awareness'

export type SyncRoom = {
  doc: Doc
  awareness: Awareness
  observe: (cb: (update: Uint8Array, origin: unknown) => void) => () => void
  apply: (update: Uint8Array, origin: unknown) => void
  snapshot: () => Uint8Array
}

export type ClientRoom = {doc: Doc; awareness: Awareness; connected: () => boolean; disconnect: () => void}
```

`packages/core/src/sync/sync.ts` — in `engine.room` (around line 122) add `awareness: state.awareness,` to the returned object.

`packages/widget/src/sync/client-sync.ts` — in `createRoom` return `awareness: provider.awareness,` (the `WebsocketProvider` already owns it).

- [ ] **Step 4: Run it — Expected PASS**
- [ ] **Step 5: Typecheck** — `turbo run typecheck --filter @mandarax/protocol --filter @mandarax/core --filter @mandarax/widget`
- [ ] **Step 6: Commit** — `feat(sync): surface Awareness on SyncRoom and ClientRoom`

---

### Task 0.3: Tool `execute` gets `{sessionId, previewId}` (Gap 1)

**Files:**

- Modify: `packages/extensions/src/contract.ts` (add `ToolExecuteCtx`; widen `ToolDefinition.execute` + `ExtensionServerTool.execute`)
- Modify: `packages/extensions/src/discovery.ts:32-41` (`wrapToolDefinition`)
- Modify: `packages/core/src/api/tools/run.ts:28`
- Modify: `packages/core/src/api/mcp/mcp.ts:20,32-46` (+ wherever `registerMcpRoutes` is called — grep `registerMcpRoutes`)
- Test: `packages/extensions/test/execute-ctx.test.ts`

**Interfaces:**

- Produces: `export type ToolExecuteCtx = {sessionId: string; previewId: string}`. `execute(input, ctx: ToolExecuteCtx)` on both tool types. `wrapToolDefinition` forwards ctx. `registerMcpRoutes(app, makeCtx, extensionTools, previewId)`.
- Consumes (feature): every server tool's `execute(input, {sessionId, previewId})` builds `roomId(previewId, sessionId)` and scopes `session_id`.

- [ ] **Step 1: Write the failing test** (a defined tool sees the ctx through `wrapToolDefinition`)

```ts
import {z} from 'zod'
import {describe, expect, it} from 'vitest'
import {defineTool} from '../src/contract.js'
import {wrapToolDefinition} from '../src/discovery.js'

describe('execute ctx', () => {
  it('forwards {sessionId, previewId} to a tool execute', async () => {
    let seen: {sessionId: string; previewId: string} | null = null
    const tool = defineTool({
      name: 't',
      label: 'T',
      description: 'd',
      parameters: z.object({}),
      execute: async (_input, ctx) => {
        seen = ctx
        return 'ok'
      },
    })
    const wire = wrapToolDefinition(tool)
    await wire.execute({}, {sessionId: 's1', previewId: 'p1'})
    expect(seen).toEqual({sessionId: 's1', previewId: 'p1'})
  })
})
```

- [ ] **Step 2: Run it — Expected FAIL** (ctx arg type error / `undefined`)

Run: `pnpm --filter @mandarax/extensions test -- execute-ctx`

- [ ] **Step 3: Implement**

`contract.ts`:

```ts
export type ToolExecuteCtx = {sessionId: string; previewId: string}
```

`ExtensionServerTool.execute`: `execute: (input: unknown, ctx?: ToolExecuteCtx) => Promise<unknown>` — **ctx OPTIONAL** (so call sites that don't pass it still type-check).
`ToolDefinition.execute`: `execute?(input: z.infer<TParams>, ctx?: ToolExecuteCtx): Promise<TResult> | TResult`.
**Co-widen `@mandarax/tools`** (REQUIRED — `wrapToolDefinition`'s result is also typed as `MandaraxServerTool` and spread at `mcp.ts:14`): in `packages/tools/src/types.ts` widen `MandaraxServerTool.execute` to `(input: unknown, ctx?: ToolExecuteCtx) => Promise<unknown>` and re-export/import `ToolExecuteCtx`. Without this, `packages/tools/src/tools.ts:48` (`.map(wrapToolDefinition)`) and the `mcp.ts` spread fail with TS2322.

`discovery.ts` `wrapToolDefinition`:

```ts
export function wrapToolDefinition(def: ToolDefinition): ExtensionServerTool {
  const run = def.execute
  if (!run) throw new Error(`tool ${def.name} has no execute`)
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.parameters,
    execute: (input, ctx) => run(def.parameters.parse(input), ctx),
  }
}
```

`run.ts:26-29`:

```ts
const sessionId = sessionIdFromHeaders(event.req.headers) ?? ''
deps.fire('tool_execution_start', {sessionId, previewId: deps.previewId, tool: name})
return {result: await tool.execute(input, {sessionId, previewId: deps.previewId})}
```

`mcp.ts` — add `previewId: string` param to `registerMcpRoutes`, pass into `buildServer`, and at the execute site:

```ts
const result = await tool.execute(args, {sessionId, previewId})
```

Thread `previewId` from the call site (grep `registerMcpRoutes(` — it is wired in `packages/core/src/app.ts`; pass `opts.cfg.previewId`).

- [ ] **Step 4: Run it — Expected PASS**
- [ ] **Step 5: Typecheck** — `turbo run typecheck --filter @mandarax/extensions --filter @mandarax/core --filter @mandarax/tools` (the `@mandarax/tools` filter is REQUIRED to catch the `MandaraxServerTool` co-widening; existing tool definitions with `(input)`-only handlers stay assignable since the extra param is optional).
- [ ] **Step 6: Commit** — `feat(extensions): thread {sessionId,previewId} into tool execute`

---

### Task 0.4: `runTool` + identity on `ClientApi` and `EffectCtx` (Gaps 2, 4 + Extra A)

**Files:**

- Modify: `packages/extensions/src/contract.ts` (`ClientApi`, `EffectCtx`)
- Modify: `packages/widget/src/mount.tsx` (read preview id, wire headers, populate clientApi)
- Modify: `packages/widget/src/effects-host.ts:26-73` (`makeEffectCtx` supplies new fields)
- Test: `packages/widget/test/client-api-runtool.it.test.ts`

**Interfaces:**

- Produces on `ClientApi`: `runTool: (name: string, input: unknown) => Promise<unknown>`, `previewId: string`, `sessionId: () => string | null`. On `EffectCtx`: `runTool`, `db: ClientDb`, `sync: ClientSync`, `previewId: string`, `sessionId: () => string | null`.
- Consumes (feature): pins/threads call `mx.runTool('comment.resolve', …)`; the canvas effect builds `roomId(previewId, sessionId())` and calls `ctx.sync.room(...)`.

- [ ] **Step 1: Write the failing IT** (a registered effect receives a working `runTool` + identity)

```ts
// boot the real widget bundle (probe harness); register a probe effect whose render() calls
// ctx.runTool('probe.add', {...}) and prints ctx.previewId; assert the row renders live and the
// preview id text is visible. Reuse fixtures/__probe.ts extended with an effect.
```

- [ ] **Step 2: Run it — Expected FAIL** (`ctx.runTool`/`ctx.previewId` undefined)

Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/widget test -- client-api-runtool`

- [ ] **Step 3: Implement**

`contract.ts` `ClientApi`:

```ts
export type ClientApi = {
  ui: {
    /* unchanged */
  }
  registerComposerAction: (action: ExtComposerAction) => void
  db: ClientDb
  sync: ClientSync
  runTool: (name: string, input: unknown) => Promise<unknown>
  previewId: string
  sessionId: () => string | null
}
```

`EffectCtx` — add the same four (`runTool`, `db`, `sync`, `previewId`, `sessionId`) alongside the existing fields. Import `ClientDb`/`ClientSync` types.

`mount.tsx`:

- `const previewId = metaContent('pw-preview-id')`.
- Build a session accessor wired to the shell's active chat client. The chat client owns `sessionId()` + `chatHeaders()` (`session-client.ts`). Expose `const activeSessionId = () => shell.activeClient()?.sessionId() ?? null` and `const activeHeaders = () => shell.activeClient()?.chatHeaders() ?? {}` (add a minimal `activeClient()` getter to the shell if absent; otherwise track the last-activated client id signal already present at `widget-shell.tsx`).
- `const runTool = createRunTool(apiBase, activeHeaders)` (was `() => ({})` — now sends `MANDARAX_SESSION_HEADER`).
- Add `runTool, previewId, sessionId: activeSessionId` to `clientApi`.

`effects-host.ts` `makeEffectCtx` — accept `previewId`, `sessionId`, `runTool`, `db`, `sync` via deps and include them in the returned ctx; `createEffectsHost` deps gain those and are passed from `mount.tsx`.

- [ ] **Step 4: Run it — Expected PASS**
- [ ] **Step 5: Typecheck** — `turbo run typecheck --filter @mandarax/extensions --filter @mandarax/widget`
- [ ] **Step 6: Commit** — `feat(extensions): runTool + session/preview identity on ClientApi and EffectCtx`

---

### Task 0.5: Per-session history + undo/redo capabilities (Gap 6)

**Files:**

- Create: `packages/core/src/history/history.ts`
- Modify: `packages/core/src/api/tools/run.ts` (record on execute)
- Modify: `packages/core/src/app.ts` (construct the per-preview history, expose undo/redo as built-in run-route capabilities)
- Test: `packages/core/test/history.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export type HistoryEntry = {sessionId: string; label: string; undo: () => Promise<void>; redo: () => Promise<void>}
  export type History = {
    record: (e: HistoryEntry) => void
    undo: (sessionId: string) => Promise<{label: string} | null>
    redo: (sessionId: string) => Promise<{label: string} | null>
  }
  export function createHistory(opts?: {limit?: number}): History
  ```
  `limit` default 200 (spec). A tool execute that returns `{__history?: {label, undo, redo}}` appends to the stack; a new mutation clears the redo branch. **Both directions are carried explicitly** — a single `inverse` thunk cannot reconstruct redo (the create→delete→re-create asymmetry); each mutating tool supplies `undo` AND `redo` closures capturing its before/after state at execute time.
- **Record at BOTH chokepoints (not just `run.ts`):** the AI executes over `/api/mcp` (`mcp.ts:20`), so `mcp.ts` must record history too — and it must do so on the **in-process result object before `JSON.stringify`** (`mcp.ts:21` serializes, which would drop the live closures), then strip `__history` from the serialized payload. Same `__history`-strip in `run.ts`. Without the MCP path, AI draws never enter the shared undo stack (the spec's "one stack, AI + user" promise).
- Consumes (Phase 6): the feature's mutating tools return `{__history:{label, undo, redo}}`; `history.undo`/`history.redo` tools call `History.undo/redo`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {createHistory} from '../src/history/history.js'

describe('history', () => {
  it('undoes the last recorded entry per session and supports redo', async () => {
    const log: string[] = []
    const h = createHistory()
    h.record({sessionId: 's', label: 'create', inverse: async () => void log.push('undo-create')})
    expect(await h.undo('s')).toEqual({label: 'create'})
    expect(log).toEqual(['undo-create'])
    expect(await h.redo('s')).toEqual({label: 'create'})
  })

  it('isolates stacks per session and bounds to the limit', async () => {
    const h = createHistory({limit: 1})
    h.record({sessionId: 'a', label: 'x', inverse: async () => {}})
    h.record({sessionId: 'a', label: 'y', inverse: async () => {}})
    expect(await h.undo('a')).toEqual({label: 'y'})
    expect(await h.undo('a')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — Expected FAIL**

Run: `pnpm --filter @mandarax/core test -- history`

- [ ] **Step 3: Implement** `packages/core/src/history/history.ts` (functional, redo via a forward stack; `record` clears redo; bound undo stack to `limit`). Wire into `run.ts`: after a successful execute, if the result carries `{__history}` record it; expose `history.undo`/`history.redo` as run-route capabilities scoped by the request `sessionId`. (The redo descriptor is captured when `undo` runs — `undo` re-pushes a redo entry whose inverse re-applies. For the feature's purposes the tools supply both directions; core stores opaque `inverse` thunks.)

- [ ] **Step 4: Run it — Expected PASS**
- [ ] **Step 5: Commit** — `feat(core): per-session undo/redo history at the execute chokepoint`

---

### Task 0.6: Approval decision/resume (Gap 5)

> **Scope correction (verified against shipped code):** AI-origin approval ALREADY EXISTS — `packages/core/src/api/chat/permission.ts` is the harness PreToolUse hook gate: claude POSTs `/api/chat/permission`, the gate injects an `approval-requested` part and BLOCKS (`pending.await`), the widget renders `ApprovalModal`, the human decides via `/api/chat/permission-decision` → `gate.resolve` ([[native-approval-hybrid]]). So `mcp.ts` correctly has NO `mx.approval` check and must NOT gain one (double-gating the AI would deadlock against the harness hook). This task ONLY adds the **widget-direct** confirm-then-run: a pin/composer button calling `runTool` for an `ask` verb (which bypasses the agent loop) hits the 403, shows the EXISTING `ApprovalModal`, and re-runs on confirm. Small; reuse, not new infrastructure.

**Files:**

- Modify: `packages/core/src/api/tools/run.ts` (decision-aware gate + resume)
- Modify: `packages/widget/src/run-tool.ts` (distinguish needs-approval; expose a decide path)
- Reuse: `packages/widget/src/approval-modal.tsx` (display), native `part.approval` (AI-origin).
- Test: `packages/core/test/approval-resume.test.ts` + `packages/widget/test/approval-resume.it.test.ts`

**Interfaces (widget-direct path ONLY):**

- Produces: `POST /api/tools/run` for an `ask` tool with no confirm → 403 `{needsApproval:true, name, input}`; the client surfaces the existing `ApprovalModal`; on confirm, re-POST executes. Client `runTool` returns a typed `{needsApproval: true, name, input}` discriminant instead of throwing on 403; `createRunTool` gains `runToolApproved(name, input)`. A `decisionId` is NOT required — the only caller of `/api/tools/run` is the widget (same-origin/loopback, CORS-gated); the AI uses the agent loop, gated separately by `permission.ts`. (If we ever expose `/api/tools/run` more broadly, add a server-minted single-use `decisionId` then — note it, don't build it now.)
- AI-origin: NO change. Reuse the shipped `permission.ts` hook gate + `ApprovalModal` for AI destructive verbs.
- Consumes: the existing `ApprovalModal` (`packages/widget/src/approval-modal.tsx`) and its decision plumbing; `mx.approval` policies on `/api/tools/run`.

- [ ] **Step 1: Write the failing test** (server resume)

```ts
// boot core with one approval('danger','ask') tool. POST without confirmed -> 403 needsApproval.
// POST with {name, input, confirmed:true} -> 200 and the tool ran exactly once.
```

- [ ] **Step 2: Run it — Expected FAIL**
- [ ] **Step 3: Implement** the confirm-then-run on `run.ts` (widget-direct only — leave `mcp.ts` untouched):

```ts
const RunBody = z.object({name: z.string(), input: z.unknown(), confirmed: z.boolean().optional()})
// ...
if (deps.approvals[name] === 'ask' && !body.confirmed)
  return new Response(
    JSON.stringify({error: `tool ${name} requires approval`, needsApproval: true, name, input: body.input}),
    {status: 403, headers: jsonType},
  )
```

Client `run-tool.ts`: on 403 with `needsApproval`, return `{needsApproval: true as const, name, input}` (do not throw); add `runToolApproved(name, input)` that re-POSTs with `confirmed:true`. The pin/composer caller shows the existing `ApprovalModal` and calls `runToolApproved` on confirm. `mcp.ts` is NOT modified — AI approval stays with `permission.ts`.

- [ ] **Step 4: Write the failing widget IT** — user clicks confirm in `approval-modal` → tool runs; assert via visible result text.
- [ ] **Step 5: Implement** the modal wiring (composer/pin calls `runTool`; on `needsApproval`, open `approval-modal`; on confirm call `runToolApproved`).
- [ ] **Step 6: Run both — Expected PASS**

Run: `pnpm --filter @mandarax/core test -- approval-resume` and `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/widget test -- approval-resume`

- [ ] **Step 7: Commit** — `feat(core): approval decision and resume at the tools/run chokepoint`

---

### Task 0.7: `packages/whiteboard` scaffold + first-party loader hook (Extra B)

**Files:**

- Create: `packages/whiteboard/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `vitest.config.ts`, `src/index.ts`
- Modify: `packages/plugin/src/core/services.ts` (prepend first-party)
- Modify: `packages/widget/src/mount.tsx` (apply built-in whiteboard client half)
- Test: `packages/whiteboard/test/loads.it.test.ts`

**Interfaces:**

- Produces: `export default` a `MandaraxExtension` with `id:'whiteboard'`. Initially carries one trivial server tool (`whiteboard.ping` → `'pong'`) + one trivial effect (renders a marker) so loading is observable end-to-end before real features land.
- Consumes: `collectServerContributions([whiteboardExtension, ...discovered], services)`; `mount.tsx` applies `whiteboardExtension.clientFn?.(clientApi)` + `collectClientContributions([whiteboardExtension])`.

- [ ] **Step 1: Scaffold the package** — `package.json` name `@mandarax/whiteboard`, `"type":"module"`, exports `./dist/index.js` + types, scripts `build`/`typecheck`/`test` mirroring `@mandarax/widget`. deps: `@mandarax/extensions`, `@mandarax/protocol`, `@mandarax/tool-ui` (exports `ToolCallCard`, the render-by-`part.name` pipeline), `@mandarax/widget` (effects host / shadow helpers), `yjs`, `zod`, `solid-js`, `@tanstack/solid-db`; (react/excalidraw/solid-sonner deferred to their phases — DO NOT add until approved). `tsconfig*` extend the repo base; `vitest.config.ts` mirrors the widget's node+browser projects.

- [ ] **Step 2: Write the failing IT** (the built-in extension loads on both halves)

```ts
import {describe, expect, it} from 'vitest'
import whiteboard from '../src/index.js'
import {collectServerContributions} from '@mandarax/extensions'

describe('whiteboard loads', () => {
  it('contributes a server tool through collectServerContributions', () => {
    const c = collectServerContributions([whiteboard])
    expect(c.tools.map((t) => t.name)).toContain('whiteboard.ping')
  })
})
```

- [ ] **Step 3: Run it — Expected FAIL** (no package / no tool)

Run: `pnpm --filter @mandarax/whiteboard test -- loads`

- [ ] **Step 4: Implement `src/index.ts`**

```ts
import {z} from 'zod'
import {defineExtension, defineTool, defineEffect} from '@mandarax/extensions'

const ping = defineTool({
  name: 'whiteboard.ping',
  label: 'Whiteboard ping',
  description: 'Health check for the whiteboard extension.',
  parameters: z.object({}),
  execute: async () => 'pong',
})

const marker = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: () => <div data-whiteboard-marker>whiteboard</div>,
})

export default defineExtension({id: 'whiteboard', tools: [ping], effects: [marker]})
  .server(() => {})
  .client(() => {})
```

- [ ] **Step 5: Run it — Expected PASS**

- [ ] **Step 6: Wire the server loader** — `packages/plugin/src/core/services.ts`:

```ts
import whiteboard from '@mandarax/whiteboard'
// ...
const discovered = await loadServerExtensions(root) // refactor loadServerContributions to return raw exts
const extensions = collectServerContributions([whiteboard, ...discovered], {db, sync: sync.engine})
```

(Refactor `extensions.ts` `loadServerContributions` to split discovery from collection: add `loadServerExtensions(root): Promise<MandaraxExtension[]>`, keep `loadServerContributions` delegating to it for back-compat, and have `bootServices` prepend the first-party list.)

- [ ] **Step 7: Wire the client loader** — `packages/widget/src/mount.tsx`, after `clientApi` is built:

```ts
import whiteboard from '@mandarax/whiteboard'
// ...
whiteboard.clientFn?.(clientApi)
const builtin = collectClientContributions([whiteboard])
for (const t of builtin.tools) addTool(t)
if (builtin.effects.length) effectsHost.applyEffects(builtin.effects)
```

- [ ] **Step 8: Boot IT** — extend `packages/plugin/test/boot.it.test.ts` (or add `packages/whiteboard/test/loads.it.test.ts` second case) to assert `whiteboard.ping` is reachable via `POST /api/tools/run` on a booted real stack (200, `"pong"`).

- [ ] **Step 9: Run** `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/plugin test -- boot` and `turbo run typecheck --filter @mandarax/whiteboard --filter @mandarax/plugin --filter @mandarax/widget`

- [ ] **Step 10: Commit** — `feat(whiteboard): scaffold package + first-party loader hook on both halves`

**Phase 0 exit gate:** `turbo run typecheck` clean across changed packages (incl. `@mandarax/tools`); `turbo run test --filter @mandarax/core --filter @mandarax/extensions --filter @mandarax/protocol` green; the whiteboard package loads built-in and `whiteboard.ping` returns `"pong"` on a booted stack; **Gap 8 (column threading) and Task 0.8 (whiteboard IT harness with session-header `runTool`) landed**; **history** recorded at BOTH `run.ts` and `mcp.ts` (so AI mutations enter the shared undo stack); **approval** = the shipped `permission.ts` harness gate for AI-origin (unchanged) + a thin widget-direct confirm-then-run reusing `ApprovalModal` (`mcp.ts` NOT modified for approval).

---

## Phase 1 — Bridge spike: Excalidraw React island in the Solid shadow root

The highest-risk integration, proven in isolation in a real browser before anything builds on it.

> **INSTALL-APPROVAL GATE (house rule):** before Task 1.1, ASK the user to approve adding, to
> `packages/whiteboard`: `react@^19`, `react-dom@^19`, `@excalidraw/excalidraw@^0.18.1`. Do not install
> until approved. (`solid-sonner` and `@excalidraw/mermaid-to-excalidraw` are approved later, in their
> phases.) The widget package also needs `react`/`react-dom` as the island is bundled there — confirm
> whether the island ships from `@mandarax/whiteboard` or is re-exported through `@mandarax/widget`;
> recommendation: keep react+excalidraw deps in `@mandarax/whiteboard` only, lazy-imported, so the widget
> core bundle stays react-free.

### Task 1.1: The thin React island (`island.tsx`) — the ONLY React file

**Files:**

- Create: `packages/whiteboard/src/canvas/island.tsx`
- Create: `packages/whiteboard/src/canvas/island-types.ts`
- Test: `packages/whiteboard/test/island.it.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type IslandHandle = {
    updateScene: ExcalidrawImperativeAPI['updateScene']
    getSceneElements: ExcalidrawImperativeAPI['getSceneElements']
    updateCollaborators: (m: Map<string, Collaborator>) => void
    destroy: () => void
  }
  export type IslandOpts = {
    container: HTMLElement
    initialElements: readonly ExcalidrawElement[]
    onUserChange: (elements: readonly OrderedExcalidrawElement[]) => void
    onPointer: (p: {x: number; y: number}) => void
    theme: 'light' | 'dark'
  }
  export function mountIsland(opts: IslandOpts): IslandHandle
  ```

  `mountIsland` does `createRoot(container)` + `root.render(<Island …/>)`, grabs the `ExcalidrawImperativeAPI` via the `excalidrawAPI` prop, and returns the handle. `destroy()` calls `root.unmount()`. The component sets `initialData.appState.viewBackgroundColor='transparent'`, `zenModeEnabled`, `viewModeEnabled:false`, and forwards `onChange`/`onPointerUpdate`. NO feature logic — pure adapter.

- [ ] **Step 1: Write the failing IT** (island mounts inside a shadow root and renders the Excalidraw canvas)

```ts
import {describe, expect, it, beforeAll, afterAll} from 'vitest'
import {chromium, type Browser} from 'playwright'
// serve a page that imports the bundled island, attaches a shadow root, injects index.css?inline,
// and calls mountIsland({container, initialElements: [], onUserChange(){}, onPointer(){}, theme:'light'}).
describe('excalidraw island', () => {
  it('renders the Excalidraw canvas inside a shadow root', async () => {
    const page = await browser.newPage()
    await page.goto(`${base}/`)
    const host = page.getByRole('img', {includeHidden: true}).first() // excalidraw canvas
    // robust assertion: reach the shadow root and find Excalidraw's toolbar/canvas region by role
    await page.locator('canvas').first().waitFor({state: 'visible', timeout: 20_000})
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    await page.close()
  })
})
```

(Assert via Excalidraw's rendered `canvas` element reached through the shadow root; prefer role/text where Excalidraw exposes them. Confirm transparent background by reading the host computed style, not a class.)

- [ ] **Step 2: Run it — Expected FAIL** (no island module)

Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- island`

- [ ] **Step 3: Implement `island.tsx`**

```tsx
import {createRoot} from 'react-dom/client'
import {createElement} from 'react'
import {Excalidraw, THEME} from '@excalidraw/excalidraw'
import type {ExcalidrawImperativeAPI, Collaborator} from '@excalidraw/excalidraw/types'
import type {IslandHandle, IslandOpts} from './island-types.js'

export function mountIsland(opts: IslandOpts): IslandHandle {
  const root = createRoot(opts.container)
  let api: ExcalidrawImperativeAPI | null = null
  root.render(
    createElement(Excalidraw, {
      initialData: {elements: opts.initialElements, appState: {viewBackgroundColor: 'transparent'}},
      zenModeEnabled: true,
      theme: opts.theme === 'dark' ? THEME.DARK : THEME.LIGHT,
      isCollaborating: true,
      excalidrawAPI: (instance) => void (api = instance),
      onChange: (elements) => opts.onUserChange(elements),
      onPointerUpdate: ({pointer}) => opts.onPointer({x: pointer.x, y: pointer.y}),
    }),
  )
  return {
    updateScene: (data) => api?.updateScene(data),
    getSceneElements: () => api?.getSceneElements() ?? [],
    updateCollaborators: (m) => api?.updateScene({collaborators: m}),
    destroy: () => root.unmount(),
  }
}
```

- [ ] **Step 4: Configure the widget/whiteboard Vite build** for the island bundle (in `packages/whiteboard/vite.config.ts`): `resolve.dedupe: ['react','react-dom']`; `define: {'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.IS_PREACT': JSON.stringify('false')}`. Wrap `<Island>` in a React error boundary (a tiny class is the one allowed class — React error boundaries require a class; note this exception explicitly in the commit message).

- [ ] **Step 5: Run it — Expected PASS**
- [ ] **Step 6: Commit** — `feat(whiteboard): thin Excalidraw React island (only React file)`

---

### Task 1.2: Canvas effect host mounts the island in the effect shadow root

**Files:**

- Create: `packages/whiteboard/src/canvas/canvas-effect.tsx`
- Modify: `packages/whiteboard/src/index.ts` (add the effect)
- Test: `packages/whiteboard/test/canvas-effect.it.test.ts`

**Interfaces:**

- Produces: a `defineEffect({name:'whiteboard', render(ctx)})` whose `render` returns Solid JSX containing a host `<div>`; `onMount` lazy-`import('./island.js')` then `mountIsland({container, …})`; injects `@excalidraw/excalidraw/index.css?inline` into the effect shadow root once; `onCleanup`/`ctx.disable` → `handle.destroy()`. Pointer-events flip `none↔auto` on the effect host marker.
- Consumes: `EffectCtx` (`env.doc`, `env.reducedMotion`, `previewId`, `sessionId`, `sync`, `runTool` from Phase 0).

- [ ] **Step 1: Write the failing IT** — toggle the `whiteboard` effect via the page `effect` verb → the Excalidraw canvas appears in the widget effect shadow root; toggle off → it unmounts. Assert by reaching the effect shadow root and counting `canvas`.

- [ ] **Step 2: Run it — Expected FAIL**
- [ ] **Step 3: Implement `canvas-effect.tsx`** — Solid `render` returns `<div ref={hostRef} data-whiteboard-canvas style="position:fixed;inset:0" />`; `onMount`: inject CSS string (imported `import css from '@excalidraw/excalidraw/index.css?inline'`) as a `<style>` in `hostRef.getRootNode()`, then `const {mountIsland} = await import('./island.js')` and store the handle in a closure; `onCleanup(() => handle?.destroy())`. NO static `react`/`@excalidraw` import in this file — only the dynamic island import and the `?inline` CSS string.
- [ ] **Step 4: Run it — Expected PASS** (verify in the REAL built app shadow root, per [[ark-ui-shadow-dom-environment]] — Excalidraw popovers need the shadow root; if a popover renders at 0,0 or escapes, fix the portal target here, in-phase).
- [ ] **Step 5: Commit** — `feat(whiteboard): canvas effect mounts the island in the widget shadow root`

**Phase 1 exit gate:** the Excalidraw canvas renders transparently inside the live widget shadow root, lazy-loaded behind the effect toggle, with React+Excalidraw absent from the widget core bundle (verify the built widget bundle has no `react-dom` — `grep` the dist). One bad element is caught by the error boundary.

---

## Phase 2 — Canvas: Yjs glue, multi-tab sync, AI draw, presence

### Task 2.1: Room identity + Yjs keys (`room.ts`)

**Files:** Create `packages/whiteboard/src/room.ts`; Test `packages/whiteboard/test/room.test.ts`.

**Interfaces:**

- Produces: `export const roomId = (previewId: string, sessionId: string): string => \`${previewId}:${sessionId}\``; `export const ELEMENTS_KEY = 'elements'`(the`Y.Map<string, ExcalidrawElementData>`); `export const PINS_KEY = 'pins'`(the`Y.Map<cid, PinGeometry>`); `export type PinGeometry = {cid: string; x: number; y: number; elementId: string | null; pinState: 'locked' | 'offset'}`. Re-export `ORIGIN`from`@mandarax/protocol/sync-types`.

- [ ] Step 1: failing test asserting `roomId('p','s') === 'p:s'` and key constants. Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): room identity and Yjs key constants`.

---

### Task 2.2: Yjs ↔ Excalidraw scene glue (`glue.ts`) — own ~40 lines, no y-excalidraw

**Files:** Create `packages/whiteboard/src/canvas/glue.ts`; Test `packages/whiteboard/test/glue.it.test.ts` (real two `Y.Doc`s + real `mx.sync` room is heavier; first prove the pure diff/apply unit, then the live convergence in Task 2.3).

**Interfaces:**

- Produces:

  ```ts
  export type SceneElement = OrderedExcalidrawElement
  export function bindScene(opts: {
    doc: Y.Doc
    handle: IslandHandle
    onLocalElements: (apply: () => void) => void // registered by canvas-effect from island onUserChange
  }): () => void // returns an unbind/dispose
  ```

  Internals (functional, no class):
  - `elements = doc.getMap<SceneElement>(ELEMENTS_KEY)`.
  - **Inbound** `elements.observe((event, txn) => …)`: when `txn.origin !== ORIGIN.USER`, set `applyingRemote=true`, `handle.updateScene({elements: [...elements.values()], captureUpdate: CAPTURE_NEVER})`, then `applyingRemote=false`. **Import boundary:** do NOT `import {CaptureUpdateAction} from '@excalidraw/excalidraw'` (a VALUE import pulls Excalidraw into `glue.ts` → into `index.ts`'s static graph → into the jiti server load and the react-free widget bundle). `CaptureUpdateAction.NEVER === 'NEVER'`; define a local `const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'` and use `import type` only for Excalidraw types. `glue.ts`/`presence.ts` carry ZERO Excalidraw value imports.
  - **Outbound** `handleUserChange(next)`: if `applyingRemote` return; diff `next` vs `elements` by `id` + `version`; `doc.transact(() => { for changed/added: elements.set(id, el); for removed: elements.delete(id) }, ORIGIN.USER)`. **The diff-by-`version` is the real feedback-loop safety net** (not the `applyingRemote` flag alone — Excalidraw `onChange` may fire async after the flag resets): an inbound apply that equals the current map produces an empty diff and no-ops. The bridge spike (Task 2.3) must confirm no echo loop under concurrent edits.

- [ ] **Step 1: Write the failing test** (pure diff/apply against an in-memory `Y.Doc` + a fake handle capturing `updateScene` calls — the handle is a plain object recording args, NOT a mock framework)

```ts
import * as Y from 'yjs'
import {describe, expect, it} from 'vitest'
import {bindScene} from '../src/canvas/glue.js'
import {ELEMENTS_KEY, ORIGIN} from '../src/room.js'

const fakeHandle = () => {
  const scenes: unknown[] = []
  return {
    scenes,
    updateScene: (d: {elements?: unknown[]}) => void scenes.push(d.elements),
    getSceneElements: () => [],
    updateCollaborators: () => {},
    destroy: () => {},
  }
}

describe('glue', () => {
  it('applies a remote element into the scene with captureUpdate NEVER', () => {
    const doc = new Y.Doc()
    const handle = fakeHandle()
    let userChange = (_e: readonly unknown[]) => {}
    bindScene({doc, handle, onLocalElements: (apply) => void (userChange = apply as never)})
    doc.transact(() => doc.getMap(ELEMENTS_KEY).set('e1', {id: 'e1', version: 1}), ORIGIN.AI)
    expect(handle.scenes.at(-1)).toEqual([{id: 'e1', version: 1}])
  })

  it('writes a user-added element into the Yjs map under USER origin without echoing', () => {
    const doc = new Y.Doc()
    const handle = fakeHandle()
    let userChange: (e: readonly {id: string; version: number}[]) => void = () => {}
    bindScene({doc, handle, onLocalElements: (apply) => void (userChange = apply as never)})
    userChange([{id: 'u1', version: 1}])
    expect(doc.getMap(ELEMENTS_KEY).get('u1')).toEqual({id: 'u1', version: 1})
    expect(handle.scenes.length).toBe(0) // no inbound echo for own USER write
  })
})
```

- [ ] **Step 2: Run — Expected FAIL.** Run: `pnpm --filter @mandarax/whiteboard test -- glue`
- [ ] **Step 3: Implement `glue.ts`** per the interface above (origin guard + `applyingRemote` flag; diff by `id`+`version`; `OrderedExcalidrawElement` carries a monotonic `version`).
- [ ] **Step 4: Run — Expected PASS. Step 5: Commit** `feat(whiteboard): own Yjs<->Excalidraw scene glue`

---

### Task 2.3: Wire glue into the canvas effect — live multi-tab sync + reload rehydrate

**Files:** Modify `packages/whiteboard/src/canvas/canvas-effect.tsx`; Test `packages/whiteboard/test/canvas-sync.it.test.ts`.

**Interfaces:**

- Consumes: `ctx.sync.room(roomId(ctx.previewId, ctx.sessionId() ?? ''))` → `{doc, awareness, …}`; `bindScene`; `mountIsland`.
- Produces: a canvas where local draws persist (platform saves the snapshot on last-peer close) and converge across tabs.

- [ ] **Step 1: Write the failing IT** — two `browser.newPage()` on the same room: draw an element in page A (drive Excalidraw: select rectangle tool, drag on canvas); assert page B's scene gains an element (poll `getSceneElements().length`); reload page A → element rehydrates from the trail snapshot. Use a unique `browser.api.port` per fixture server. (Drawing via real pointer events; if brittle, drive via the island handle exposed on `window` for the test seam only — but PREFER real pointer input; see [[no-test-ids-in-code]] — remove any test seam after.)
- [ ] **Step 2: FAIL. Step 3:** in `onMount`, open the room, `bindScene({doc: room.doc, handle, onLocalElements})`, set `handle` initial elements from `[...room.doc.getMap(ELEMENTS_KEY).values()]`. Wire `island.onUserChange` → the bound outbound writer; `onPointer` → presence (Task 2.6).
- [ ] **Step 4: PASS.** Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- canvas-sync`
- [ ] **Step 5: Commit** `feat(whiteboard): live multi-tab canvas sync with snapshot rehydrate`

---

### Task 2.4: Solid zoom controls

**Files:** Create `packages/whiteboard/src/canvas/zoom-controls.tsx`; Modify `canvas-effect.tsx`; Test `packages/whiteboard/test/zoom.it.test.ts`.

**Interfaces:** Produces a Solid component with in / out / reset-100% / zoom-to-fit buttons (ARIA-labelled) driving `handle` (`updateScene({appState:{zoom}})` / `scrollToContent`). Consumes the island handle.

- [ ] Steps: failing IT (click "Zoom to fit" → `getAppState().zoom` changes; assert via a visible zoom-percent readout, role `status`) → FAIL → implement (Solid buttons, motion on press only, reduced-motion respected) → PASS → Commit `feat(whiteboard): canvas zoom controls`.

---

### Task 2.5: AI / server-side canvas tools (`canvas.read/draw/update/delete/clear`)

**Files:** Create `packages/whiteboard/src/tools/canvas.ts`; Modify `src/index.ts` (register + approvals); Test `packages/whiteboard/test/canvas-tools.it.test.ts`.

**Interfaces:**

- Produces `defineTool`s:
  - `canvas.read({})` → current elements (`server room.snapshot()` decoded, or read the `Y.Map`).
  - `canvas.draw({elements: ElementSkeleton[]})` → server-side `convertToExcalidrawElements(skeleton, {regenerateIds:true})` (pure, no DOM) → for each, `room.doc.transact(() => elementsMap.set(id, el), ORIGIN.AI)` via `mx.sync` server `room.apply`/direct doc mutation. Returns `{added: id[]}`.
  - `canvas.update({id, patch})`, `canvas.delete({id})` `[ask]`, `canvas.clear({})` `[ask]`.
  - `canvas.connect({fromId, toId})` → a binding arrow skeleton through `canvas.draw`.
  - `canvas.export({})` → returns serialized scene JSON (no DOM-only export in v1; flag PNG/SVG export as needing the island, deferred).
- All carry `promptSnippet` + `promptGuidelines`. Approvals: `mx.approval('canvas.delete','ask')`, `mx.approval('canvas.clear','ask')`.
- Consumes: `ctx.previewId`/`ctx.sessionId` (execute ctx, Gap 1) → `roomId` → `mx.sync.room`. `convertToExcalidrawElements` is pure but lives in the react-coupled package. **HARD RULE (not optional):** import it ONLY via `const {convertToExcalidrawElements} = await import('@excalidraw/excalidraw')` inside `execute` — a static top-level import in `canvas.ts` defeats the entire boundary at the jiti server load (`extensions.ts:43` evaluates the full static graph of `index.ts → tools/canvas.ts`). Do not rely on a "React-free subpath"; even if true today it is not guaranteed.

- [ ] **Step 1: Write the failing IT** — booted real stack; `POST /api/tools/run {name:'canvas.draw', input:{elements:[{type:'rectangle',x:0,y:0,width:100,height:100}]}}` → a `browser.newPage()` on that room shows the rectangle live (poll `getSceneElements().length === 1`). Also `canvas.delete` returns 403 without approval.
- [ ] **Step 2: FAIL. Step 3: Implement** `canvas.ts`. **Step 4: PASS.** Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- canvas-tools`
- [ ] **Step 5: Commit** `feat(whiteboard): server-side canvas tools with AI draw into the Yjs room`

---

### Task 2.6: Presence cursors via Yjs awareness

**Files:** Create `packages/whiteboard/src/canvas/presence.ts`; Modify `canvas-effect.tsx`, `tools/canvas.ts` (AI presence on draw); Test `packages/whiteboard/test/presence.it.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export function bindPresence(opts: {
    awareness: Awareness
    handle: IslandHandle
    self: {id: string; name: string; color: {background: string; stroke: string}}
  }): {setCursor: (x: number, y: number) => void; dispose: () => void}
  ```
  `setCursor` → `awareness.setLocalStateField('cursor', {x,y})` + identity fields. An `awareness.on('change', …)` maps all remote states → `Map<SocketId, Collaborator>` → `handle.updateCollaborators(map)`. AI presence: the server `canvas.draw` publishes a transient awareness entry (named "AI") via the server room awareness while drawing.
- Consumes: `ClientRoom.awareness` / `SyncRoom.awareness` (Gap 3); `island.onPointer`.

- [ ] **Step 1: Failing IT** — two pages on a room; move pointer on page A; page B's `getAppState()` collaborators map (or a visible cursor label) shows A. Assert via the rendered collaborator cursor (role/text "AI" for the AI case).
- [ ] **Step 2: FAIL. Step 3: Implement** `presence.ts`; wire `island.onPointer` → `setCursor`. **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): presence cursors over Yjs awareness (user + AI)`

---

### Task 2.7: Mermaid diagrams (`canvas.diagram`)

> **INSTALL-APPROVAL GATE:** ASK to add `@excalidraw/mermaid-to-excalidraw@^1.1.2` to `packages/whiteboard` (it is a transitive dep of excalidraw but not re-exported; we import it directly). Do not install until approved.

**Files:** Modify `tools/canvas.ts` (`canvas.diagram`), `canvas-effect.tsx` (island-side conversion); Test `packages/whiteboard/test/mermaid.it.test.ts`.

**Interfaces:**

- Produces `canvas.diagram({mermaid: string})`: server writes `{__mermaid: source, origin:'ai'}` marker into the doc (a `Y.Map` `pending-diagrams` entry). The island observes pending diagrams, runs `parseMermaidToExcalidraw(source)` (from `@excalidraw/mermaid-to-excalidraw`, needs DOM) → `convertToExcalidrawElements` → writes elements with `ORIGIN.AI`, clears the marker. `maxEdges: 500` limit (spec) → reject with a clear error past it.
- Consumes: the island (DOM), the doc observer.

- [ ] Steps: failing IT (`canvas.diagram {mermaid:'graph TD; A-->B'}` → two nodes + an edge appear in the browser canvas) → FAIL → implement server marker + island converter → PASS → Commit `feat(whiteboard): AI Mermaid diagrams converted in the island`.

**Phase 2 exit gate:** user and AI both draw into the same room; draws converge across tabs and survive reload; AI `canvas.draw`/`canvas.diagram` appear live; presence cursors show for both; destructive canvas verbs gated.

---

## Phase 3 — Comments: collection, dual-write join, pins, threads, composer

### Task 3.1: Comment schema + columns + parse/serialize (`schema.ts`)

**Files:** Create `packages/whiteboard/src/schema.ts`; Test `packages/whiteboard/test/schema.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export type Comment = {
    cid: string
    preview_id: string
    session_id: string
    thread_id: string
    parent_id: string | null
    parts: unknown[]
    author_kind: 'human' | 'ai'
    author_model: string | null
    status: 'open' | 'resolved' | 'drifted' | 'orphaned'
    kind: 'source-linked' | 'floating'
    anchor: unknown | null
    anchor_file: string | null
    anchor_component: string | null
    anchor_hash: string | null
    last_resolved_commit: string | null
    last_resolved_file_hash: string | null
    created_at: Date
    updated_at: Date
    resolved_at: Date | null
    resolved_by: string | null
  }
  export const CommentSchema: z.ZodType<Comment>
  export const COMMENT_COLUMNS: string // the SQL column defs (everything except platform id/cid)
  export const commentParse: Conversions<RecordShape, Comment> // ts->Date, json string->parts/anchor
  export const commentSerialize: Conversions<Comment, RecordShape> // inverse
  export const LIMITS = {partBytes: 16_384, threadReplies: 500, sessionComments: 2_000, snippetBytes: 2_048} as const
  ```
- Consumes: TrailBase scalar shape (notes/trailbase-api.md: UUID PK + `cid TEXT UNIQUE`; FTS over `parts` text); `Conversions` from `@tanstack/trailbase-db-collection` (notes/tanstack-db-contract.md). `parts`/`anchor` stored as JSON strings; `*_at` as unix ints ↔ `Date`.

- [ ] Steps: failing test (`commentSerialize(commentParse(record))` round-trips; `parts` JSON survives; a 17 KB part rejects via the limit guard) → FAIL → implement (zod + Conversions, functional) → PASS → Commit `feat(whiteboard): comment schema, columns, parse/serialize`.

---

### Task 3.2: Declare the `comments` collection on both halves

**Files:** Modify `src/index.ts` (server `.server`: `mx.db.collection('comments', {schema, columns, fts:['parts']})`; client `.client`: `mx.db.collection('comments', {schema, parse, serialize})`); Test `packages/whiteboard/test/comments-collection.it.test.ts`.

**Interfaces:**

- Produces: a server `ServerCollection<Comment>` (agent writes + `query`) and a client TanStack DB `Collection<Comment>` (optimistic + realtime). The client collection is created in `clientFn` and stored in a module accessor so pins/threads read it via `useLiveQuery`.
- Consumes: `mx.db` (`LiveDb` server / `ClientDb` client), the `cidKeyedApi` shim (already in `createClientDb`).

- [ ] **Step 1: Failing IT** — booted real stack: `mx.db.list()` includes `comments`; a server `insert` then a `browser.newPage` `useLiveQuery` over `comments` renders the row (reuse the probe pattern). Realtime: a second server insert appears live.
- [ ] **Step 2: FAIL. Step 3: Implement** the declarations. **Step 4: PASS.** Run: `SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- comments-collection`
- [ ] **Step 5: Commit** `feat(whiteboard): declare comments collection on mx.db`

---

### Task 3.3: `comment.create` / `comment.delete` — single execute, dual-writes row + Yjs pin

**Files:** Create `packages/whiteboard/src/tools/comment.ts`; Modify `src/index.ts` (register + `mx.approval('comment.delete','ask')`); Test `packages/whiteboard/test/comment-dualwrite.it.test.ts`.

**Interfaces:**

- Produces:
  - `comment.create({cid, kind, parts, anchor?, x, y, elementId?, author_kind, author_model?})` — ONE execute that (1) `mx.db.comments.insert(row)` with the client `cid` verbatim and (2) writes the Yjs pin `pins.set(cid, {cid, x, y, elementId, pinState:'locked'})` into the room doc with the appropriate origin. `cid` is the `getKey` for both — never swapped (notes: trailbase-adapter-cid-shim).
  - `comment.delete({cid})` `[ask]` — removes BOTH the row and the pin.
- Consumes: `ctx` (Gap 1) → `roomId` → server `mx.sync.room`; `mx.db` server collection; returns a `{__history:{label, inverse}}` (Phase 6 will rely on this — for now record `create↔delete`).

- [ ] **Step 1: Failing IT** — `comment.create` with a fresh `cid` → the row is queryable AND the Yjs pin exists in the room (a `browser.newPage` shows the pin geometry); `comment.delete` removes both; `comment.delete` without approval → 403.
- [ ] **Step 2: FAIL. Step 3: Implement** (both writes in one execute; the browser optimistic path uses the same `cid` for row+pin). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): comment.create/delete dual-write row + Yjs pin by cid`

---

### Task 3.4: Solid pins + tether (`pins.tsx`)

**Files:** Create `packages/whiteboard/src/pins/pins.tsx`; Modify `canvas-effect.tsx` (render pins layer over the canvas); Test `packages/whiteboard/test/pins.it.test.ts`.

**Interfaces:**

- Produces a Solid component reading the Yjs `pins` map + the `comments` collection (`useLiveQuery`) to render a pin per `cid`. Appearance is a pure function of `row.status` + Yjs geometry (no second write). `pinState:'locked'` derives screen pos from the element rect; `'offset'` floats with a faint tether line. Pins are keyboard-navigable (focus ring, Enter opens thread, Esc closes), ARIA `button` with author+status label.
- Consumes: the room `pins` `Y.Map` (observe → Solid signal), `comments` live query, `ctx.page.elementAt`/rect for `locked` placement.

- [ ] **Step 1: Failing IT** — after `comment.create`, a pin renders at the geometry; `getByRole('button', {name:/comment/i})` reachable through the shadow root; status `resolved` changes its appearance (assert via aria/text, not class).
- [ ] **Step 2: FAIL. Step 3: Implement** (Solid `<For>` over pins; tether line for offset; motion on state transitions only, reduced-motion respected). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): Solid pins and tether rendering`

---

### Task 3.5: Threads + parts via tool-ui (`thread.tsx`); `comment.list/read/reply/resolve`

**Files:** Create `packages/whiteboard/src/pins/thread.tsx`; Modify `tools/comment.ts` (`comment.list/read/reply/resolve`); Test `packages/whiteboard/test/thread.it.test.ts`.

**Interfaces:**

- Produces:
  - `thread.tsx` — a Solid panel: replies via `parent_id`; each comment/reply renders `parts[]` through `@mandarax/tool-ui`'s `ToolCallCard` (`tool-call.tsx:29`, `props.tools?.().find(matches part.name)` → `renderCall`/`renderResult`; read `part.arguments` since `part.input` is often empty — [[tanstack-part-input-empty]], [[tool-ui-tanstack-convention]]). Pass the whiteboard tool definitions as the `tools` accessor so their cards render. Reply box → `mx.runTool('comment.reply', …)`; resolve button → `mx.runTool('comment.resolve', …)` (which is `ask`, drives the approval flow from Gap 5).
  - tools: `comment.list({scope:'session'|'all', file?, status?})`, `comment.read({cid})`, `comment.reply({cid, parts})`, `comment.resolve({cid})` `[ask]`, with `promptSnippet`/`promptGuidelines`.
- Consumes: `@mandarax/tool-ui` `ToolCallCard` (verified export, `packages/tool-ui/src/index.tsx:12`), `mx.runTool`, the `comments` live query.

- [ ] **Step 1: Failing IT** — `comment.create` then `comment.reply` (AI author) → the reply renders in the thread; a reply carrying a tool part renders the tool card via tool-ui (assert by the card's visible title/role). `comment.list({scope:'session'})` returns the session's comments.
- [ ] **Step 2: FAIL. Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): comment threads with tool-ui parts, list/read/reply/resolve`

---

### Task 3.6: Composer "Comment" action + `element.pick` / `element.reference`

**Files:** Create `packages/whiteboard/src/tools/element.ts`; Modify `src/index.ts` (`mx.registerComposerAction`); Test `packages/whiteboard/test/comment-pick.it.test.ts`.

**Interfaces:**

- Produces:
  - A composer action "Comment" (`registerComposerAction`) that runs the react-grab pick (`getReactGrabAdapter().comment(onGrab)` — exposes `LocateResult.source = file:line:col`), captures the source anchor (Phase 4 resolver `capture`), and calls `ctx.runTool('comment.create', {cid: crypto.randomUUID(), kind:'source-linked', …, anchor})`.
  - `element.pick` (client capability mirroring the action) and `element.reference({file, component})` (AI, server, **project-root-confined** — Phase 4 confinement) so the AI can target an element by source without a mouse.
- Consumes: `react-grab` adapter (`packages/widget/src/react-grab/adapter.ts`), the AnchorResolver (Phase 4), `ctx.runTool`.

- [ ] **Step 1: Failing IT** — in the real widget, trigger the Comment action, pick an element (drive the react-grab pick), submit text → a source-linked comment row + pin is created with an `anchor_file` badge. (Pick driving may need a deterministic element; assert the resulting pin + `file:line` badge by text.)
- [ ] **Step 2: FAIL. Step 3: Implement** (depends on Phase 4 `capture`; if sequencing inline, stub `capture` to return `{source}` only and enrich in Phase 4 — but PREFER doing Phase 4 first if executing strictly; the plan orders anchoring next, so this task's `capture` call is satisfied). **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(whiteboard): Comment composer action + element.pick/reference`

---

### Task 3.7: Pin drag → drift prompt; `comment.move` / `pin.setState`

**Files:** Create `packages/whiteboard/src/pins/drag-prompt.tsx`; Modify `pins.tsx`, `tools/comment.ts`; Test `packages/whiteboard/test/pin-drag.it.test.ts`.

**Interfaces:**

- Produces: dragging a source-linked pin opens a prompt — **Disconnect** (→ `kind:'floating'`, source dropped) · **Keep link, accept drift** (→ source-linked at custom offset, `pinState:'offset'`, tether) · **Cancel** (snap back). Floating pins drag freely. Tools `comment.move({cid, x, y})` and `pin.setState({cid, pinState})` are the AI equivalents. Pin drift (`pinState:'offset'`) and source drift (`status:'drifted'`) are independent and coexist; resolving source drift never re-snaps a user offset.
- Consumes: the Yjs `pins` map (geometry writes), `mx.runTool`.

- [ ] Steps: failing IT (drag a locked pin → prompt appears with three options by role/text; choosing "Keep link" sets `pinState:'offset'` and draws a tether) → FAIL → implement → PASS → Commit `feat(whiteboard): pin drag drift prompt + comment.move/pin.setState`.

**Phase 3 exit gate:** user pins a source-linked comment from a pick; AI creates/reads/replies/resolves via the same tools; threads render parts via tool-ui; delete/resolve gated; pin drag handles drift; the row↔pin join is consistent (no orphans in the happy path — doctor reconciles edge cases in Phase 5).

---

## Phase 4 — Source anchoring (oxc + git, project-root-confined)

> Note on ordering: Task 3.6 calls the resolver's `capture()`. If executing strictly in order, land `confine.ts` + `oxc-capture.ts` + `resolver.capture` (Tasks 4.1–4.3) before wiring 3.6's anchor enrichment, or accept 3.6 shipping with `capture` returning `{source}` only and enriching here. The `AnchorResolver` seam is extension-owned and React/TSX-specific by default.

### Task 4.1: Project-root confinement + secret denylist (`confine.ts`)

**Files:** Create `packages/whiteboard/src/anchor/confine.ts`; Test `packages/whiteboard/test/confine.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  export function confineToRoot(root: string, file: string): string // throws on escape
  export function isSecretPath(file: string): boolean // .env, *.pem, id_rsa, *.key, etc.
  export function redactSnippet(text: string): string // strips obvious secrets from a snippet
  export const SNIPPET_LIMIT = 2_048
  ```

  `confineToRoot` MUST `await fs.realpath(root)` and `await fs.realpath(file)` (NOT `path.resolve`) before the prefix assert — `resolve()` does not dereference symlinks, so a symlink `<root>/x.tsx -> /etc/passwd` resolves inside root and escapes on read. The existing `packages/core/src/page/symbolicate.ts` (note: `core/src/page/`, not `api/page/`) uses `resolve()` and is **vulnerable** — do NOT copy it verbatim; harden it the same way as part of this task ([[page-bus-security-gaps]]). Read through the realpath'd handle to minimize TOCTOU. `isSecretPath` is the denylist applied at snippet-capture; a secret path → no snippet captured (anchor still records file:line for the badge, but never the file contents). `redactSnippet` must do more than strip an `X=secret` line: detect high-entropy tokens + known prefixes (`sk_`/`pk_`/`ghp_`/`AKIA`), JWT shape, and `Bearer ...`, because hardcoded secrets in NON-denylisted source files (e.g. `App.tsx`) otherwise egress into comment bodies → the LLM. Residual inline-secret risk is documented-accepted for a localhost dev tool.

- [ ] **Step 1: Failing test** (real temp dir, real symlink) — `confineToRoot(root, '../etc/passwd')` throws; `confineToRoot(root, 'src/A.tsx')` returns the absolute realpath; **a symlink `<root>/escape.tsx -> /etc/passwd` throws** (the realpath check, not a string-prefix check); a `file://` path throws; `isSecretPath('.env')` / `'id_rsa'` / `'k.pem'` / `'a.key'` → true; `redactSnippet` strips an `AWS_SECRET=...` line AND a high-entropy `sk_live_…`/JWT token inline; a 3 KB snippet truncates to `SNIPPET_LIMIT`.
- [ ] Step 2: FAIL (`pnpm --filter @mandarax/whiteboard test -- confine`). Step 3: implement (functional, no regex backtracking pitfalls). Step 4: PASS. Step 5: Commit `feat(whiteboard): project-root confinement + secret denylist`.

---

### Task 4.2: oxc capture — AST-subtree hash + ancestor salt + snippet (`oxc-capture.ts`)

**Files:** Create `packages/whiteboard/src/anchor/oxc-capture.ts`; Test `packages/whiteboard/test/oxc-capture.test.ts`.

**Interfaces:**

- Produces:

  ```ts
  export type SourceAnchor = {
    file: string
    line: number
    column: number
    component: string | null
    hash: string // normalized AST-subtree hash of the JSX node at file:line:col
    salt: string // ancestor-path salt (so identical leaves under different parents differ)
    snippet: string
    commit: string | null
  }
  export function captureSource(opts: {
    root: string
    file: string
    line: number
    column: number
    commit: string | null
  }): Promise<SourceAnchor>
  export function hashAt(
    source: string,
    line: number,
    column: number,
  ): {hash: string; salt: string; component: string | null; snippet: string}
  ```

  Uses `oxc-parser` (already a repo dep) to parse the file, finds the JSX element whose span covers `line:col`, normalizes it (drop whitespace/positions, keep tag + structural shape), hashes (a stable string hash) for `hash`; walks ancestors for `salt`; nearest component name for `component`; the raw node text (≤ `SNIPPET_LIMIT`, redacted) for `snippet`. Pure over a source string in `hashAt` (testable without fs); `captureSource` reads the confined file.

- [ ] **Step 1: Failing test** — given a TSX string with `<Foo><Bar/></Foo>`, `hashAt` at `Bar`'s position returns a stable `hash`, a `salt` differing from a sibling `<Baz><Bar/></Baz>`, and `component` = the enclosing function component. Re-running on the same source yields the same hash; whitespace edits do not change it; a structural change does.
- [ ] Step 2: FAIL (`pnpm --filter @mandarax/whiteboard test -- oxc-capture`). Step 3: implement against the real `oxc-parser` AST (characterize the node shape first — `oxc-parser`'s `parseSync` returns `{program}`; walk `JSXElement` nodes; use `node.start`/`node.end` spans). Step 4: PASS. Step 5: Commit `feat(whiteboard): oxc AST-subtree capture (hash + salt + snippet)`.

---

### Task 4.3: git line-tracking (`git-track.ts`)

**Files:** Create `packages/whiteboard/src/anchor/git-track.ts`; Test `packages/whiteboard/test/git-track.it.test.ts` (real temp git repo — no mocks).

**Interfaces:**

- Produces:

  ```ts
  export function headCommit(root: string): Promise<string | null>
  export function fileHash(root: string, file: string): Promise<string> // working-tree content hash
  export function isCommittedClean(root: string, file: string): Promise<boolean>
  export function mapLineAcrossCommits(opts: {
    root: string
    file: string
    fromCommit: string
    line: number
  }): Promise<number | null>
  ```

  Shell `git` only (no new dep): spawn `git` with `cwd: root` (`git rev-parse HEAD`, `git hash-object`, `git status --porcelain`, `git log -L` / `git blame --reverse` for line mapping). Commit-granularity; no-ops for uncommitted edits (the content-hash is the dev-loop workhorse).

- [ ] **Step 1: Failing IT** — create a temp repo (`git init`, commit `A.tsx` with a JSX node on line 5), then insert lines above it and commit; `mapLineAcrossCommits({fromCommit: first, line: 5})` returns the new line. `headCommit` returns the SHA; `isCommittedClean` true after commit, false after an uncommitted edit.
- [ ] Step 2: FAIL (`pnpm --filter @mandarax/whiteboard test -- git-track`). Step 3: implement (spawn via `node:child_process` `execFile`, parse output functionally). Step 4: PASS. Step 5: Commit `feat(whiteboard): shell-git line tracking`.

---

### Task 4.4: `AnchorResolver` (default React/TSX impl) + `anchor.resolve` tool

**Files:** Create `packages/whiteboard/src/anchor/resolver.ts`, `src/tools/anchor.ts`; Modify `src/index.ts`; Test `packages/whiteboard/test/resolver.it.test.ts`.

**Interfaces:**

- Produces (matches the spec seam verbatim):
  ```ts
  export type Anchor = {source: SourceAnchor; instance?: {selector?: string; rect?: Rect; instanceKey?: string}}
  export type ResolveResult = {
    status: 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
    anchor?: Anchor
    dom?: {selector: string; rect: Rect; instanceKey?: string}
    candidates?: Anchor[]
    diff?: {before: string; after: string}
  }
  export type PickedTarget = {file: string; line: number; column: number; rect?: Rect; selector?: string}
  export type AnchorResolver = {
    capture(target: PickedTarget): Promise<Anchor>
    resolve(anchor: Anchor): Promise<ResolveResult>
    reanchor(anchor: Anchor, target: PickedTarget): Promise<Anchor>
  }
  export function createReactAnchorResolver(opts: {root: string}): AnchorResolver
  ```
  `resolve` implements the layered authority (spec): (1) re-hash at stored `file:line:col` vs working tree → match = `fresh`; (2) mismatch → search file for the hash: exactly one = `moved` (re-anchor), >1 → tie-break by nearest line + instance agreement, still ambiguous = `ambiguous` (surface `candidates`, never auto-pick); (3) working-tree miss + committed-clean → `mapLineAcrossCommits` (commit-granularity); (4) all fail → `dom` placement, flag `drifted` (+`diff`) or `orphaned`. Instance placement resolves **in parallel**, not as a fallback. Every `file` goes through `confineToRoot`; secret paths skip snippet capture.
- `anchor.resolve({cid})` tool → loads the comment's `anchor`, runs `resolver.resolve`, returns the status + candidates/diff (does not mutate — doctor mutates).

- [ ] **Step 1: Failing IT** (real oxc + real temp git repo) — capture an anchor on a JSX node; **move** the node (edit) → `resolve` returns `moved` with a re-anchored `anchor`; **duplicate** the JSX → `ambiguous` with `candidates`, never silent; an **uncommitted edit** that shifts the node → content-hash relocates where git can't (`moved`); a **`.env`** target → confinement/denylist rejects (no snippet).
- [ ] Step 2: FAIL (`SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- resolver`). Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): React/TSX AnchorResolver + anchor.resolve`.

**Phase 4 exit gate:** capture/resolve/reanchor work against real oxc + real git; ambiguous never silently re-pins; secrets never egress into snippets; every file path is confined to the project root.

---

## Phase 5 — Doctor (drift sweep + session_start auto-run + CLI)

### Task 5.1: Doctor sweep (`sweep.ts`)

**Files:** Create `packages/whiteboard/src/doctor/sweep.ts`, `src/tools/doctor-tool.ts`; Modify `src/index.ts` (register `doctor.run`, `mx.on('session_start', …)`); Test `packages/whiteboard/test/doctor.it.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  export type DoctorReport = {fresh: number; reanchored: number; drifted: number; orphaned: number}
  export function runDoctor(opts: {
    root: string
    previewId: string
    sessionId: string
    comments: ServerCollection<Comment>
    resolver: AnchorResolver
    room: SyncRoom
  }): Promise<DoctorReport>
  ```
  Sweeps comments (skips `kind:'floating'`). Per comment runs `resolver.resolve`: `fresh`→no-op; `moved`→re-anchor (`comments.update(cid, {anchor, anchor_file, anchor_component, anchor_hash, last_resolved_commit, last_resolved_file_hash})`, keep `open`); `drifted`/`ambiguous`→`comments.update(cid, {status:'drifted'})` + store diff/candidates in `anchor`; `orphaned`→`status:'orphaned'`. **Incremental & content-addressed:** re-resolve only when `current_commit != last_resolved_commit` OR `current_file_hash != last_resolved_file_hash` (mtime as a fast pre-filter). Reconciles the row↔pin join: pin with no row → drop pin (`room` `pins.delete`); row with no pin → re-materialize from the anchor's visual rect or mark `orphaned`. Idempotent. A resolver failure on one comment flags it `drifted`/`orphaned`, never throws the sweep.
- `doctor.run({})` tool returns the `DoctorReport`. `mx.on('session_start', (ctx) => runDoctor(...))` auto-runs.

- [ ] **Step 1: Failing IT** (real oxc + git + trail) — create a source-linked comment; edit the source so the node drifts; run the sweep → the comment flips to `drifted` with a diff; create a Yjs pin with no row → the sweep drops it; the report counts are correct. Re-running with no changes is a no-op (incrementality: assert the resolver is not re-invoked when commit+file-hash unchanged).
- [ ] Step 2: FAIL (`SKIP_STORYBOOK_TESTS=1 pnpm --filter @mandarax/whiteboard test -- doctor`). Step 3: implement. Step 4: PASS. Step 5: Commit `feat(whiteboard): doctor sweep + session_start auto-run`.

---

### Task 5.2: `mandarax doctor` CLI command

**Files:** Create `packages/cli/src/doctor.ts`; Modify `packages/cli/src/bin.ts` (register the command); Test `packages/cli/test/doctor.it.test.ts`.

**Interfaces:**

- Produces a `mandarax doctor` command (citty, matching the other `packages/cli/src/*` commands — they hit `cli-http`/`request.ts`) that calls `doctor.run` via the core tools/run endpoint and prints `N fresh · M re-anchored · K drifted (review) · J orphaned`. Manual + CI invocable (exit non-zero is NOT required — drift is informational; print and exit 0 unless `--strict`).
- Consumes: the existing CLI HTTP client (`packages/cli/src/cli-http.ts`/`request.ts`).

- [ ] **Step 1: Failing IT** — boot a stack with the whiteboard extension + a drifted comment; run the CLI command against it; assert stdout contains the report line and the drift count.
- [ ] Step 2: FAIL. Step 3: implement (follow the existing CLI command shape; `--strict` exits 1 if drift > 0). Step 4: PASS. Step 5: Commit `feat(cli): mandarax doctor command`.

**Phase 5 exit gate:** drift is detected on session start and on demand; the join is reconciled; the CLI reports it; incremental re-resolution avoids redundant work; one bad comment never throws the sweep.

---

## Phase 6 — Undo / redo: one cross-store stack

### Task 6.1: Inverse descriptors for every mutating tool (`inverses.ts`)

**Files:** Create `packages/whiteboard/src/undo/inverses.ts`; Modify each mutating tool in `tools/*` to return `{__history:{label, inverse}}`; Test `packages/whiteboard/test/inverses.it.test.ts`.

**Interfaces:**

- Produces inverse builders (functional) for: `comment.create↔delete`, `comment.move↔move-back`, `comment.resolve↔reopen`, pin `disconnect↔reconnect`, `anchor.reanchor↔restore`, `canvas.draw↔erase` (scene delta), `canvas.delete↔restore`, `canvas.clear↔restore-all`. Each tool's `execute` returns `{result, __history: {label, inverse: () => Promise<void>}}` where `inverse` re-runs the opposite mutation (capturing the before-state at execute time). The core `History` (Gap 6) stores the opaque `inverse` thunks per session.
- Consumes: the Phase-0 `History.record` (already invoked by `run.ts` when a result carries `__history`).

- [ ] **Step 1: Failing IT** — `comment.create` then core `history.undo` (via the run route, same session) removes BOTH the row and the pin; `canvas.draw` then `history.undo` erases the scene delta (the element disappears in a `browser.newPage`). A new mutation invalidates the redo branch.
- [ ] Step 2: FAIL. Step 3: implement (each tool captures the inverse closure over its before-state; Excalidraw internal undo stays disabled — we already apply remote/AI with `captureUpdate: NEVER`, and the cross-store stack is authoritative). Step 4: PASS. Step 5: Commit `feat(whiteboard): cross-store inverse descriptors for undo/redo`.

---

### Task 6.2: `history.undo` / `history.redo` capabilities + UI hotkeys

**Files:** Create `packages/whiteboard/src/tools/history-tool.ts`; Modify `canvas-effect.tsx` (⌘Z/⇧⌘Z); Test `packages/whiteboard/test/undo-ui.it.test.ts`.

**Interfaces:**

- Produces `history.undo({})`/`history.redo({})` tools (thin wrappers calling the core history for the request session — they POST to the core history capability from Gap 6) so both AI and user reverse the last action regardless of store. UI: `⌘Z`/`⇧⌘Z` bound in the canvas effect call `mx.runTool('history.undo'/'redo')`. Bounded to 200 entries/session (Gap 6 limit). AI- and user-origin share the stack.
- Consumes: core `History` (Gap 6), `mx.runTool`.

- [ ] **Step 1: Failing IT** — draw an element, press `⌘Z` in the widget → it disappears; `⇧⌘Z` → it returns; an AI `canvas.draw` then user `⌘Z` reverses the AI's draw (shared stack).
- [ ] Step 2: FAIL. Step 3: implement (keydown handler in the effect host, reduced-motion-aware feedback). Step 4: PASS. Step 5: Commit `feat(whiteboard): history.undo/redo capabilities + ⌘Z hotkeys`.

**Phase 6 exit gate:** a single `⌘Z` reverses the last action across stores (scene delta, Yjs pin, comment row); redo works; a new mutation invalidates redo; AI and user share one bounded stack.

---

## Phase 7 — Polish: limits, empty state, notifications, a11y, security, skill

### Task 7.1: Limits enforced with clear errors (never silent truncation)

**Files:** Modify `schema.ts` (already has `LIMITS`), `tools/comment.ts`, `tools/canvas.ts`; Test `packages/whiteboard/test/limits.it.test.ts`.

**Interfaces:** enforce, with explicit thrown errors surfaced to the caller: comment text 16 KB/part · thread 500 replies · comments/session soft 2,000 (warn, not block) · canvas 5,000 elements/scene · Mermaid `maxEdges` 500 · blob 5 MB · anchor snippet 2 KB · undo history 200 entries/session (Gap 6). No silent truncation — over-limit returns a clear error; soft limits log a warning via `harness-logger`.

- [ ] Steps: failing IT (a 17 KB part → error by message; the 501st reply → error; 5,001st element → error) → FAIL → implement guards (functional, at each tool boundary) → PASS → Commit `feat(whiteboard): enforce limits with explicit errors`.

---

### Task 7.2: Empty state

**Files:** Create `packages/whiteboard/src/canvas/empty-state.tsx`; Modify `canvas-effect.tsx` (or `mx.ui.setEmptyState`); Test `packages/whiteboard/test/empty-state.it.test.ts`.

**Interfaces:** when a session's canvas is empty, render a hand-drawn Excalidraw sketch ("Draw here, or ⌘-click an element to pin a comment →") — ephemeral, `viewModeEnabled` elements, non-persisted (never written to the Yjs doc); removed on first real interaction, never returns for that session (track a per-session "dismissed" flag in memory).

- [ ] Steps: failing IT (fresh session → prompt visible by text; draw once → prompt gone and does not return on reload of that session) → FAIL → implement → PASS → Commit `feat(whiteboard): ephemeral canvas empty state`.

---

### Task 7.3: Notifications via solid-sonner

> **INSTALL-APPROVAL GATE:** ASK to add `solid-sonner` to `packages/whiteboard` (or `@mandarax/widget` if shared). Do not install until approved.

**Files:** Create `packages/whiteboard/src/notify.tsx`; Modify the relevant tools/effects; Test `packages/whiteboard/test/notify.it.test.ts`.

**Interfaces:** `solid-sonner` toasts mounted in the shadow root (EnvironmentProvider for shadow DOM — [[ark-ui-shadow-dom-environment]]). Fired on: AI left/replied a comment, doctor found drift, sync reconnected, sync failure. Clicking a toast jumps to the comment (pan/zoom, switching session if needed via the existing session selector + `mx.sessionId`). Animate on entry/exit only ([[motion-settled-not-constant]]).

- [ ] Steps: failing IT (AI `comment.reply` → a toast with the author appears by role/text; clicking it focuses the pin) → FAIL → implement (Toaster in the effect shadow root) → PASS → Commit `feat(whiteboard): solid-sonner notifications in the shadow root`.

---

### Task 7.4: Accessibility pass

**Files:** Modify `pins.tsx`, `thread.tsx`, `zoom-controls.tsx`; Test `packages/whiteboard/test/a11y.it.test.ts`.

**Interfaces:** pins/threads keyboard-navigable (focus ring, Enter opens, Esc closes), ARIA roles, author + status announced (`aria-label`/`aria-live`); zoom controls labelled. Pin/tether motion animates on state transitions only; respects reduced-motion (`ctx.env.reducedMotion()`).

- [ ] Steps: failing IT (Tab reaches a pin; Enter opens its thread; Esc closes; the pin's accessible name includes author + status; with reduced-motion set, no transition animation runs) → FAIL → implement → PASS → Commit `feat(whiteboard): pin/thread keyboard nav + ARIA + reduced-motion`.

---

### Task 7.5: Security verification (closes the known gap classes)

**Files:** Test-only `packages/whiteboard/test/security.it.test.ts`; small hardening edits if a check fails.

**Interfaces:** asserts the spec's security guarantees end to end: `element.reference`/resolver confine every `file` to the project root (reject `../`/`file://`/symlink escape); the secret denylist blocks `.env`/`*.pem`/`id_rsa`/key files from snippet egress; cross-origin `comment.update`/resolve/delete works (CORS `PATCH`, Gap 7) only from an allowed loopback origin and is rejected from a disallowed origin; the approval gate blocks destructive verbs until decided (Gap 5). Observability: doctor runs, sync failures, resolver errors, relay disconnects log through `harness-logger`; no telemetry egress.

- [ ] Steps: failing IT (a `../` file in `element.reference` → rejected; a disallowed Origin → 403; `comment.delete` blocked until approval) → FAIL (or PASS if already enforced — then assert it stays enforced) → harden if needed → Commit `test(whiteboard): security guarantees (confinement, denylist, CORS, approval)`.

---

### Task 7.6: AI legibility — skill + prompt self-documentation

**Files:** Create `skills/whiteboard/SKILL.md` (+ worked examples); confirm every `defineTool` carries `promptSnippet` + `promptGuidelines`; Test: catalog check.

**Interfaces:** a `whiteboard` skill describing the canvas + comment loop with worked examples (pin a comment, draw a Mermaid diagram, re-anchor a drifted comment, list comments on a file). Each tool's `promptSnippet`/`promptGuidelines` self-document into the system prompt on registration (already required per tool); tools/renderers/effects appear in the extension system's generated catalog (`buildCatalog` in `@mandarax/extensions`). Docs follow the house style ([[docs-writing-style]]: no em dashes, concise, example-first).

- [ ] Steps: write the skill + examples; assert (a test or the catalog command) that all whiteboard tools expose a `promptSnippet`; Commit `docs(whiteboard): whiteboard skill + tool prompt self-documentation`.

**Phase 7 exit gate:** limits are explicit; empty state is ephemeral and non-returning; toasts fire and navigate; pins/threads are accessible and reduced-motion-aware; confinement/denylist/CORS/approval all verified; the AI can discover and drive the feature from the prompt + skill.

---

## Self-Review (run against the spec before handoff)

- **Spec coverage** — every spec section maps to a task: infinite/transparent canvas (1.1–1.2), draw/pan/zoom/persist/multi-tab (2.1–2.4), AI co-equal draw + presence (2.5–2.7), comment kinds + record + cid join (3.1–3.3), pins/threads/parts/streaming-via-reply (3.4–3.5), composer + element.pick/reference (3.6), pin drag/drift (3.7), source anchoring two-coordinate + layered resolve + seam (4.1–4.4), doctor + session_start + CLI (5.1–5.2), undo/redo one stack (6.1–6.2), approval (Gap 5 + 7.5), security/limits/empty/a11y/notifications (7.1–7.5), AI legibility (7.6). Platform Phase-0 covers the 7 gaps + EffectCtx + loader.
- **Resolved-unknowns honored:** streaming AI replies = one-shot `comment.reply` with full `parts` (3.5); AI draw conversion split (server `convertToExcalidrawElements`, island Mermaid) (2.5/2.7); per-turn context push deferred, pull via `comment.list` (3.5); tool-ui reuse via `@mandarax/tool-ui` `ToolCallCard` (3.5); `session.switch` is a real tool (3.6) over `mx.sessionId` + the existing selector.
- **Type consistency:** `IslandHandle`/`IslandOpts` (1.1) consumed by glue (2.2), presence (2.6), canvas-effect (1.2/2.3); `roomId`/`PinGeometry`/`ELEMENTS_KEY`/`PINS_KEY` (2.1) used in glue/canvas/comment/doctor; `Comment`/`COMMENT_COLUMNS`/`commentParse`/`commentSerialize`/`LIMITS` (3.1) used in 3.2–3.5/5.1/7.1; `SourceAnchor`/`Anchor`/`AnchorResolver`/`ResolveResult`/`PickedTarget` (4.1–4.4) used in 3.6/5.1; `ToolExecuteCtx` (0.3) used by every server tool; `History`/`HistoryEntry` (0.5) used by 6.1–6.2.
- **No placeholders:** Phase-0 and the novel logic (glue, capture, resolver, doctor, dual-write) carry real test + impl code; mechanical Solid/CLI tasks carry exact interfaces, file paths, assertions, and commands.

## Open risks carried into execution

- The React-island bridge (Phase 1) is the highest-risk integration; it is proven first, in the real built app shadow root, before anything builds on it. Excalidraw's own popovers may need shadow-root portal handling ([[ark-ui-shadow-dom-environment]]).
- Gap 5 is smaller than the spec implied: AI-origin approval is already shipped (`permission.ts` + `ApprovalModal`); this task only adds a thin widget-direct confirm-then-run. Do NOT add `mx.approval` to `mcp.ts` (would double-gate the AI).
- Instance anchoring degrades to rect/position heuristics (no stable selector/fiber/key across the react-grab seam, confirmed) — flag `drifted`, never silently re-pin (4.4).
- New deps (`react`, `react-dom`, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`, `solid-sonner`) each have an explicit install-approval gate before their phase.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-whiteboard-extension.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration. (Note: the canvas-comments memory says "work inline, not subagents" for this project — if that holds, choose Inline.)
2. **Inline Execution** — execute tasks in this session with checkpoints (superpowers:executing-plans).

Which approach?
