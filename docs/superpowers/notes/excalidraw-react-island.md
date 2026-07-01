# Excalidraw 0.18.x API + React-island-in-Solid-shadow-root (characterized 2026-06-21)

Characterized against the **published** package `@excalidraw/excalidraw@0.18.0` (npm-packed to scratchpad,
`dist/types/excalidraw/*.d.ts` read directly — the authoritative API we code against). 0.18.1 also exists;
0.18.0 is the floor. Not installed in the repo (ask before installing).

## Package facts

- `"type": "module"`; peerDeps `react`/`react-dom` `^17 || ^18 || ^19` — **React 19 works** (we target 19.x).
- Entry types: `./dist/types/excalidraw/index.d.ts`. Subpath types map: `@excalidraw/excalidraw/*` →
  `dist/types/excalidraw/*.d.ts`.
- **CSS:** `@excalidraw/excalidraw/index.css` (exports condition resolves dev/prod). Under Vite, import
  `@excalidraw/excalidraw/index.css?inline` to get the text and inject it into the widget shadow root
  (same pattern as `styles.css?inline` at `effects-host.ts:22`). Excalidraw renders its own fonts via CSS.
- Bundled deps include `@excalidraw/mermaid-to-excalidraw@1.1.2` (see Mermaid below).

## `<Excalidraw>` props (the ones we use) — `types.d.ts` ExcalidrawProps

```ts
onChange?: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => void
excalidrawAPI?: (api: ExcalidrawImperativeAPI) => void   // grab the imperative handle once on mount
initialData?: MaybePromise<ExcalidrawInitialDataState | null> | (() => …)
viewModeEnabled?: boolean        // empty-state / read-only
zenModeEnabled?: boolean         // hides chrome → transparent overlay look
theme?: Theme                    // THEME.LIGHT | THEME.DARK
isCollaborating?: boolean        // show collaborator cursors
onPointerUpdate?: (p: {pointer:{x,y,tool}; button; pointersMap}) => void  // local cursor → awareness
```

- **Transparent background:** there is no `viewBackgroundColor` prop. Set it via
  `initialData.appState.viewBackgroundColor = 'transparent'` (AppState field, `appState.d.ts`).
- `pointer-events` flip (idle `none` ↔ active `auto`) is done on our host element, not an Excalidraw prop
  (same idea as the effects host marker at `effects-host.ts`).

## `ExcalidrawImperativeAPI` (the handle the thin React shim hands to plain TS) — `types.d.ts`

```ts
updateScene: (sceneData: {
  elements?: SceneData['elements']
  appState?: Pick<AppState, K> | null
  collaborators?: Map<SocketId, Collaborator>
  captureUpdate?: CaptureUpdateActionType
}) => void
getSceneElements: () => readonly NonDeletedExcalidrawElement[]
getSceneElementsIncludingDeleted: () => readonly OrderedExcalidrawElement[]
onChange: (cb: (elements, appState, files) => void) => UnsubscribeCallback   // alt to the prop
setActiveTool / setCursor / scrollToContent / addFiles / refresh
history: { clear: () => void }
id: string
```

This handle is the ENTIRE React→TS boundary. The thin shim (one file, ~30 lines) renders `<Excalidraw>`,
forwards `excalidrawAPI(api)` to a callback, and forwards `onChange`. All glue (diff → Yjs, Yjs → updateScene)
is plain TS that holds the `api` reference.

## `updateScene` + `captureUpdate` — the feedback-loop / undo guard

`CaptureUpdateAction` is exported from the main entry (`index.d.ts:35` re-exports from `./store`):

```ts
import {CaptureUpdateAction} from '@excalidraw/excalidraw'
CaptureUpdateAction.IMMEDIATELY // local user edits → Excalidraw's own undo (we DISABLE/ignore this)
CaptureUpdateAction.NEVER // remote / AI / rehydrate updates → never enter local undo
CaptureUpdateAction.EVENTUALLY
```

- Inbound (Yjs → scene): `api.updateScene({elements, captureUpdate: CaptureUpdateAction.NEVER})` for
  `remote`/`ai`/`core-rehydrate` origins — keeps them out of Excalidraw's internal undo, matching the
  design's single cross-store stack.
- Outbound (scene → Yjs): the `onChange` writer fires only for `user`-origin local edits (guard with an
  "applying remote" flag set around `updateScene`), diffs against last-known elements by `id`, writes
  changed/added/removed into the Yjs `Y.Map<element>` with `ORIGIN.USER`.

## Collaborators / presence (AI + user cursors) — `types.d.ts`

```ts
type SocketId = string & {…}                       // branded string
type Collaborator = Readonly<{
  pointer?: { x: number; y: number; tool: 'pointer'|'laser'; renderCursor?: boolean }
  username?: string | null
  color?: { background: string; stroke: string }
  selectedElementIds?: AppState['selectedElementIds']
  id?: string; socketId?: SocketId; userState?: UserIdleState
}>
```

Set via `api.updateScene({collaborators: Map<SocketId, Collaborator>})` (or the SceneData on updateScene).
Presence flows over **Yjs awareness** (Gap 3): each client/agent publishes its cursor as an awareness
state; an observer maps awareness states → the `collaborators` Map → `updateScene`. AI gets one entry
(named cursor). Awareness is ephemeral — never written to the durable doc.

## AI draw — conversion location (resolved)

```ts
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'  // PURE, in main entry
convertToExcalidrawElements(skeleton: ExcalidrawElementSkeleton[], {regenerateIds: boolean})
  : OrderedExcalidrawElement[]
```

- `convertToExcalidrawElements` is pure (no DOM) → runs **server-side** in `canvas.draw`'s execute; the
  resulting id-keyed elements are written into the Yjs doc with `ORIGIN.AI` (`captureUpdate: NEVER` on the
  browser apply). This is the element-skeleton path.
- **Mermaid is different:** `parseMermaidToExcalidraw` is NOT exported from `@excalidraw/excalidraw` (the
  main entry only exports `isMaybeMermaidDefinition`, `mermaid.d.ts`). It lives in the separate package
  `@excalidraw/mermaid-to-excalidraw` (a transitive dep). It needs the DOM (mermaid render) → runs in the
  browser island. So `canvas.diagram` stores the Mermaid **source + an `ai` marker** in the doc; the
  island converts on receipt via `@excalidraw/mermaid-to-excalidraw`. (Adding that package is part of the
  Mermaid task; flag it at install-approval time.)

## React island inside the Solid widget shadow root

No React root exists in the repo today (`react-bridge.ts` is bippy host-app introspection, not a root).
The island is the first `react-dom/client` root. Mounting mechanism, grounded in the real effect host:

- The canvas is a `defineEffect`; `effect.render(ctx)` returns **Solid JSX** that is `render(...)`-ed into
  the shared effect shadow mount (`page-effects.ts:59`, into the `[data-effect-root]` container inside the
  `[data-conciv-effects]` host's shadow root, z-index `2147483000`).
- Inside that Solid JSX: create a host `<div ref={el}>`; on mount, `createRoot(el)` (from
  `react-dom/client`) and `root.render(<ExcalidrawIsland onApi=… onChange=…/>)`. On Solid cleanup
  (`onCleanup`) and on `ctx.disable()`, call `root.unmount()`. One React root, lazy-imported.
- **CSS into the shadow root:** inject `@excalidraw/excalidraw/index.css?inline` as a `<style>` into the
  effect shadow root (Excalidraw styles its portals/popovers within that root). Ark/Zag-style
  shadow-environment caveats apply to Excalidraw's own popovers; verify in the bridge spike, in the REAL
  built app, not Storybook ([[ark-ui-shadow-dom-environment]], [[ark-collapsible-animation]]).

### Bundling (proven findings to apply in the widget Vite config)

- `resolve.dedupe(['react', 'react-dom'])` — one React instance (react-grab also touches React internals;
  dedupe avoids a second copy).
- `define`: `process.env.NODE_ENV = '"production"'` and `process.env.IS_PREACT = '"false"'` (Excalidraw
  reads these; without them it throws/branches wrong).
- The island (~1 MB with Excalidraw) **lazy-loads** behind the composer canvas toggle via dynamic
  `import()` — never in the initial widget bundle (mirrors the `react-grab` dynamic import at
  `adapter.ts:37`).
- Wrap the island in a React error boundary so one bad element can't crash the widget.

## Yjs ↔ scene glue (our own ~40 lines, no y-excalidraw)

- `Y.Map<string, ExcalidrawElementData>` keyed by Excalidraw element `id`.
- Outbound: `onChange` (user origin only) → diff vs last snapshot → `ymap.set/delete` per changed id,
  inside a `doc.transact(fn, ORIGIN.USER)`.
- Inbound: `ymap.observe((event, txn) => …)` where `txn.origin !== ORIGIN.USER` → batch into
  `api.updateScene({elements: [...ymap.values()], captureUpdate: NEVER})` guarded by an `applyingRemote`
  flag so it doesn't re-enter the outbound writer.
- Pins are a separate `Y.Map<cid, {x,y,elementId,pinState}>` in the same doc; rendered by Solid, not React.
