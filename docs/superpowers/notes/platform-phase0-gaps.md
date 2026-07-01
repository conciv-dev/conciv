# Platform Phase-0 gaps — verified against shipped code (2026-06-21)

Verification pass for the Whiteboard extension plan. Every gap below was re-confirmed against the
**current** worktree code (branch `worktree-canvas-comments`), not the spec. Each entry pins the exact
file/line and the exact signature change the plan will make. The spec listed 7 gaps; all 7 are real.
Three extra findings (EffectCtx, first-party loader, React deps) are recorded at the end — they are not
new "gaps" but they change the plan and the spec got two of them wrong.

## Gap 1 — tool `execute` gets no session/preview context

- `packages/extensions/src/contract.ts:36-41` — `ExtensionServerTool.execute = (input: unknown) => Promise<unknown>` (single arg).
- `packages/extensions/src/contract.ts:142` — `ToolDefinition.execute?(input): …` (single arg).
- `packages/extensions/src/discovery.ts:32-41` — `wrapToolDefinition` collapses to `execute: async (input) => run(def.parameters.parse(input))`; the ctx, if added, must be forwarded here.
- `packages/core/src/api/tools/run.ts:28` — calls `tool.execute(input)`; **sessionId IS already resolved one line up** (`sessionIdFromHeaders(event.req.headers) ?? ''`, line 26) and `previewId` is in `deps.previewId` (line 12). So the run route already has both values — it just drops them.
- `packages/core/src/api/mcp/mcp.ts:20` — calls `tool.execute(args)`; sessionId is resolved at line 38 (`sessionIdFromHeaders`), `previewId` is NOT currently passed into `registerMcpRoutes` — must be threaded in.

**Change:** introduce `export type ToolExecuteCtx = {sessionId: string; previewId: string}` in `contract.ts`.
Widen both `execute` signatures to `(input, ctx: ToolExecuteCtx) => …`. `wrapToolDefinition` becomes
`execute: async (input, ctx) => run(def.parameters.parse(input), ctx)`. `run.ts` passes
`{sessionId, previewId: deps.previewId}`; `registerMcpRoutes` gains a `previewId` param and passes
`{sessionId, previewId}`. Room id the tools build = `` `${ctx.previewId}:${ctx.sessionId}` ``.

## Gap 2 — `runTool` only on `ComposerActionCtx`, not the general client surface

- `packages/extensions/src/contract.ts:51-55` — `ComposerActionCtx` has `runTool`.
- `packages/extensions/src/contract.ts:65-77` — `ClientApi = {ui, registerComposerAction, db, sync}` — **no `runTool`**.
- `packages/widget/src/mount.tsx:115` — `runTool` IS already constructed (`createRunTool(apiBase, () => ({}))`) and used in the composer-action adapter (line 130) — it is simply not put on `clientApi`.

**Change:** add `runTool: (name: string, input: unknown) => Promise<unknown>` to `ClientApi` (and to
`EffectCtx` — see Extra A). In `mount.tsx`, set `clientApi.runTool = runTool`. **Header fix required:**
`createRunTool` at line 115 is built with `() => ({})` (empty headers) so it sends NO session header;
`run.ts` would then see `sessionId=''`. Wire it to the active session's headers (see Gap 4) so
`CONCIV_SESSION_HEADER` (`'conciv-session-id'`, `packages/protocol/src/chat-types.ts:9`) is sent.

## Gap 3 — no awareness handle on `mx.sync`

- `packages/protocol/src/sync-types.ts:13-18` — `SyncRoom = {doc, observe, apply, snapshot}`.
- `packages/protocol/src/sync-types.ts:27` — `ClientRoom = {doc, connected, disconnect}`.
- **The awareness already exists and is fully wired** server-side: `packages/core/src/sync/sync.ts:54`
  (`new Awareness(doc)` per room), `:64-71` (relays awareness updates to peers), `:106` (applies inbound
  awareness), `:112` (cleans up on close). Client-side `WebsocketProvider` carries `.awareness`
  (`packages/widget/src/sync/client-sync.ts:16`). The handles are simply not surfaced.

**Change:** add `awareness: Awareness` to `SyncRoom` (return `state.awareness` at `sync.ts:122`) and to
`ClientRoom` (return `provider.awareness` at `client-sync.ts:21`). `Awareness` from `y-protocols/awareness`.
Pure surfacing — no protocol work.

## Gap 4 — no session/preview identity on `ClientApi`

- `packages/extensions/src/contract.ts:65-77` — `ClientApi` has no `previewId`/`sessionId`.
- Client-side identity today: `previewId` is injected as the `pw-preview-id` meta tag
  (`packages/core/src/widget-tags.ts:17`) but `mount.tsx` does not read it. `sessionId` is a **per-client
  reactive signal** in `packages/widget/src/session-client.ts:24` (`createSignal<SessionId|null>`),
  hydrated by `resolve()`; there can be MANY clients (each quick-terminal pane has one —
  `quick-terminal.tsx:77`). The chat panel owns the "active" one (`chat-panel.tsx:596,670`).

**Change:** add `previewId: string` + `sessionId: () => string | null` (a reactive accessor, NOT a
static string, because the active session changes on switch) + the active session's `headers: () =>
Record<string,string>` to `ClientApi`. In `mount.tsx`, read `previewId` from `metaContent('pw-preview-id')`
and wire `sessionId`/`headers` to the shell's active chat client. The canvas room id is
`` `${previewId}:${sessionId()}` ``; comment queries filter on `session_id`.

## Gap 5 — widget-direct approval has no confirm-then-run (AI-origin already works)

**Correction after deeper read:** the spec framed this as "no confirm-then-run loop exists", but AI-origin
approval IS shipped and complete:

- `packages/core/src/api/chat/permission.ts` — the harness PreToolUse hook gate. Claude POSTs
  `/api/chat/permission`; the gate injects an `approval-requested` part onto the tool card (`uiBus`) and
  BLOCKS (`pending.await(approvalId)`); the widget renders `ApprovalModal`
  (`packages/widget/src/approval-modal.tsx`) and the human decides via `/api/chat/permission-decision`
  → `gate.resolve` (`permission.ts:72-74`), unblocking claude. This is [[native-approval-hybrid]].
- `packages/core/src/api/mcp/mcp.ts:20` has NO `mx.approval` check — correct: the harness hook gates every
  AI tool call in front of MCP. Adding an `mx.approval` 403 to `mcp.ts` would DOUBLE-GATE the AI and
  deadlock against the hook. Do NOT do it.

So the only real gap is the **widget-direct** path: `run.ts:21-25` returns 403 `{needsApproval:true}` and
stops; `run-tool.ts:14` throws on any non-2xx without distinguishing it. A pin/composer button calling an
`ask` tool via `runTool` (which bypasses the agent loop) needs a confirm-then-run.

**Change (small):** `run.ts` accepts an optional `confirmed: boolean`; `ask` + not confirmed → 403
`{needsApproval, name, input}`; confirmed → execute. Client `runTool` returns a typed `{needsApproval}`
discriminant; `runToolApproved` re-POSTs `confirmed:true` after the existing `ApprovalModal` confirms. NO
`decisionId` needed — the only caller of `/api/tools/run` is the widget (CORS-gated loopback); the AI
never uses that route. `mcp.ts` is untouched for approval. (History at `mcp.ts` is a separate concern —
Gap 6 — and IS needed there.)

## Gap 6 — no undo/history hook at the execute chokepoint

- `packages/core/src/api/tools/run.ts:28` — `return {result: await tool.execute(input)}`; nothing records
  `{label, inverse}`. No `history.undo`/`history.redo` capability exists anywhere (grep: none).

**Change:** a per-session history stack recorded by the single `execute`. Tools opt in by returning an
inverse descriptor (or the route wraps known inverses). Add `history.undo`/`history.redo` as extension
tools (capabilities). The cross-store undo (Excalidraw scene delta + Yjs pin + comment row) composes on
top of this in a later phase; Phase 0 lands only the per-session stack + the two capabilities + the
record hook.

## Gap 7 — CORS allowlist omits `PATCH`

- `packages/core/src/api/cors.ts:45` — `methods: ['GET', 'POST', 'DELETE', 'OPTIONS']` — no `PATCH`.
- TrailBase update is `PATCH /api/records/v1/<name>/<id>` (notes/trailbase-api.md). A cross-origin dev page
  doing `comment.update`/resolve via the trailbase adapter fails preflight.

**Change:** add `'PATCH'` to the methods array. One-line; test via an OPTIONS preflight assertion.

---

## Extra A — `EffectCtx` must also carry runTool + db + sync + identity (spec under-specified this)

The canvas overlay is registered as an Effect (`defineEffect`), and effect `render(ctx)` receives
`EffectCtx` (`contract.ts:159-174`), NOT `ClientApi`. Effects are static objects collected separately
from `clientFn` (`discovery.ts:90-101`; applied at `mount.tsx:86,139` AFTER `clientFn`), so a canvas
effect cannot close over the `clientApi` built in `clientFn`. Therefore the canvas effect needs the same
new capabilities on `EffectCtx`: `runTool`, `db` (`ClientDb`), `sync` (`ClientSync`), `previewId`,
`sessionId`. These are added in `makeEffectCtx` (`packages/widget/src/effects-host.ts:26-73`). This is
mechanical (mirror the ClientApi fields) but the plan must do it explicitly — fold into Gaps 2/4.

## Extra B — first-party (built-in) extension loader hook

There is a working precedent for built-in extensions on **both** halves:

- **Client:** `mount.tsx:86` already applies a built-in (`highlightExtension`) via
  `collectClientContributions([highlightExtension]).effects` + `effectsHost.applyEffects`. The plan adds
  the whiteboard extension here: call `whiteboard.clientFn?.(clientApi)` and apply its tools/effects the
  same way, before/independent of the discovered (`installExtensionGlobal`) ones.
- **Server:** `packages/plugin/src/core/services.ts:22` calls `loadServerContributions(root, {db,sync})`,
  which (`extensions.ts:32-47`) only loads discovered files under `conciv/extensions/`. The plan
  prepends the built-in list: `collectServerContributions([...firstParty, ...discovered], services)`,
  where `firstParty = [whiteboardExtension]` imported from `@conciv/whiteboard`.

## Extra C — react / react-dom are NOT installed (spec is wrong)

- `grep '"react"|"react-dom"' packages/*/package.json` → only `react-grab` (bundles its own React) and a
  stray keyword. **No `react`/`react-dom` dependency exists.** The spec's "react + react-dom already
  present" is false. So the new deps requiring install approval are: `react`, `react-dom`,
  `@excalidraw/excalidraw` (0.18.x), and `solid-sonner`. Mermaid also needs
  `@excalidraw/mermaid-to-excalidraw` (it is a transitive dep of excalidraw but NOT re-exported from the
  main entry — see excalidraw-react-island.md).
- **There is no React-root-mount precedent.** `packages/widget/src/react-bridge.ts` is bippy-based
  introspection of the HOST app's React (DevTools hook), NOT a `react-dom/client` root. The bridge spike
  genuinely creates the first React root in the repo.

## react-grab fidelity (accepted limitation, confirmed)

`LocateResult.source?: {file, line, column}` exists (`packages/protocol/src/page-introspect-types.ts:5-13`,
populated from a build-injected `data-conciv-source` attr, `react-bridge.ts:121-130,155`). So the
**source anchor** (file:line:col) is fully capturable. There is **no stable selector / React key / fiber
path** exposed across the seam (`react-grab/grab-types.ts` `ElementSource = {componentName, filePath,
lineNumber}` only — note: no column at the react-grab adapter layer; the column comes from the
`data-conciv-source` attr path, not from react-grab's `getSource`). So the **instance anchor** degrades
to rect/position heuristics → the design's rule holds: flag `drifted` when ambiguous, never silently
re-pin. `adapter.ts` exposes `activate(onGrab)` (select) and `comment(onGrab)` (prompt mode) — the
composer "Comment" action will use the pick flow.
