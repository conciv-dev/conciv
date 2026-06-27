# Plan — Remove `previewId`; reactive session model

## Outcome

- `grep -rn "previewId"` over shipped code = **0**.
- `'local'` as a session/room fallback = **0**. Room identity has exactly one source: the real `sessionId`.
- The async session/config window is handled with idiomatic Solid (`createResource` + `<Suspense>` + `<Show>`), not imperative `await`/fallback glue.
- **No new extension API** — no `requiresSession`, no `whenSession`, no `ensureSession`. Those were hand-rolled re-implementations of Solid primitives. Deleted from consideration.

## Decisions (locked)

1. **`previewId` deleted entirely.** No deprecation, no shim. v0, break freely; no data migration (orphaned session dirs / dropped `comments.previewId` rows are fine).
2. **`roomId` helper deleted.** Once previewId is gone it collapses to the identity `sessionId => sessionId`, so the room value _is_ the `sessionId`. Callers use `request.sessionId` / `sessionId()` directly. (Pins/cursors/canvas still keep a `room` column; its value is the session id.)
3. **Comments + pins scope per chat session.** Room = `sessionId`, so switching chat sessions switches the visible comment/pin set. This is the direct, intended consequence of dropping the preview scope.
4. **Client is reactive.** `ClientApi.activeSession(): string | null` stays exactly as-is — the `| null` is honest. Session-bound UI is gated by a **`keyed`** `<Show>` whose function child narrows the id to `Accessor<NonNullable<string>>` (so the room value is passed through, never re-fabricated with `?? ''`); async loads (jazz config) run through `createResource` under `<Suspense>` with a real loading state, wrapped in an `<ErrorBoundary>` for config-fetch rejection. No `?? ''`, no `'local'`. (NB: the `ClientApi.client → activeSession()` plumbing is already landed uncommitted in the widget — Phases 1-6 below assume it as the new baseline.)
5. **Server fails loud on empty session.** The whiteboard server context's session accessor throws when `request.sessionId` is empty (covers the real "agent forgot the `mandarax-session-id` header" bug — see memory `agent-mcp-needs-session-header`). This is whiteboard-local, not a core flag.

---

## The reactive redesign (the novel part)

Today (`overlay.tsx`) the room is computed imperatively and the null window is papered over with `?? ''` → `'local'`:

```tsx
// client.tsx
sessionId: () => api.activeSession() ?? '' // <- hack
// overlay.tsx
const room = (): string => roomId(props.previewId, props.sessionId()) // <- hack
```

After: async config is a resource under Suspense; the session-bound board only exists when a real id exists; the room is derived and re-subscribes reactively on session switch (no Excalidraw remount).

```tsx
// client.tsx — no previewId, no config prefetch, no ?? '' . Just mount.
const dispose = mountOverlay({api, open, registerComment})
// Also delete the now-vestigial doStart/startPromise/`config = await fetchJazzConfig(...)`
// wrapper (client.tsx:49-63) + its fetchJazzConfig import — config now loads inside Board.

// overlay.tsx mountOverlay render tree:
<EnvironmentProvider value={() => layer.getRootNode()}>
  <ErrorBoundary fallback={(err) => <OverlayError error={err} onToast={api.toast}/>}>
    <Suspense fallback={<OverlayLoading/>}>
      <Board api={api} open={open} .../>        {/* reads the config resource -> suspends */}
    </Suspense>
  </ErrorBoundary>
</EnvironmentProvider>

function Board(props) {
  const [config] = createResource(() => fetchJazzConfig(`${props.api.apiBase}/api/ext/whiteboard`))
  return (
    <WhiteboardJazzProvider config={config()}>   {/* reading config() suspends until loaded; rejects -> ErrorBoundary */}
      {/* function child: Solid narrows to Accessor<NonNullable<string>>, so NO `?? ''` anywhere */}
      <Show when={props.api.activeSession()} keyed fallback={<SessionPending/>}>
        {(session) => <Canvas api={props.api} sessionId={() => session} .../>}
      </Show>
    </WhiteboardJazzProvider>
  )
}

// Canvas: bindings live here, so they never run without a session.
function Canvas(props) {
  const room = props.sessionId                              // Accessor<string>, already non-null. No memo, no `?? ''`.
  useCanvasBinding({handle: props.handle, room})           // re-subscribes when room changes
  useCursorPresence({handle: props.handle, room, self: props.self})
  ...
}
```

Why this is the right shape:

- **Null window** → `<Show fallback>` renders a waiting state; nothing binds. No fabricated id.
- **First config load** → `createResource` + `<Suspense fallback>` shows a real loader. No `await` in the factory.
- **Config reject (plain app, no server)** → the resource read _throws_; `<Suspense>` does NOT catch it, only `<ErrorBoundary>` does. The `ErrorBoundary` fallback surfaces a real error toast and never writes. (The old `client.tsx` papered this over as an un-awaited `startPromise` rejection — no toast, no crash — so the new shape is only correct WITH the boundary. This is a behavior fix, not "already true today.")
- **Session switch** → because `<Show>` is **`keyed`**, `Canvas` re-mounts on every id change. This is deliberate: `useCursorPresence` holds per-room write identity (`rowId` + a heartbeat `setInterval`) as hook-lifetime state; a non-keyed `<Show>` would keep `Canvas` mounted, the hook would never re-run, `onCleanup` would never fire, and the heartbeat would keep the OLD room's cursor row alive forever (ghost cursor in the room you left). `keyed` makes `onCleanup` delete the old room's cursor row and the new mount subscribe to the new room. Excalidraw itself is mounted imperatively into a separate `host` div _outside_ this Solid tree (see overlay.tsx mountOverlay), so re-keying `Canvas` re-runs the bindings but does **not** remount/reseed the Excalidraw React island.

> Note: `Overlay`'s `useDb()`-dependent bindings (`useCanvasBinding`/`useCursorPresence`) currently sit at the top level and run unconditionally. The refactor splits them into the `Canvas` child so they only mount inside `<Show when={session} keyed>`. This split is the real structural change in the file. `useCanvasBinding`'s internal `appliedRemote`/`draining` state self-heals on re-key (cleared on every `elements.data` change); `useCursorPresence`'s `rowId`/heartbeat does NOT self-heal, which is exactly why the `<Show>` is keyed.

---

## Phase 1 — Protocol + core config

1. **`packages/protocol/src/config-types.ts`** — drop `previewId?` from `MandaraxConfig`.
2. **`packages/core/src/config.ts`** — drop `previewId` field + its resolution line + `MANDARAX_PREVIEW_ID` env.
3. **`packages/core/src/store/session-store.ts`** — `createFsSessionStore({stateRoot, now})`; base path `${stateRoot}/.mandarax/sessions` (drop the `/${previewId}` segment); fix the L73 comment.

## Phase 2 — Core wiring + injection

4. **`packages/core/src/widget-tags.ts`** — `htmlTags(corePort, {widget})`; remove `previewId` param + the `pw-preview-id` meta tag.
5. **`packages/core/src/app.ts`** — stop passing `previewId` to `registerChatRoutes` (L66) and `registerMcpRoutes` (L125).
6. **`packages/core/src/api/chat/chat.ts`** — drop `previewId` field + doc comment (L18); `createFsSessionStore` call (L53) drops it.
7. **`packages/core/src/api/mcp/mcp.ts`** — drop `previewId` param (L36) and the `previewId` key in the `ToolRequest` (L41). `ToolRequest` becomes `{sessionId}`.
8. **`packages/extension/src/types.ts`** — `ToolRequest = {sessionId: string}`.

## Phase 3 — Plugin

9. **`packages/plugin/src/core/widget-middleware.ts`** — `widgetTags(apiBase, widgetConfig?)` + `makeWidgetInject(apiBase, widgetConfig?)`; remove `previewId` param + `pw-preview-id` meta tag (L21/24/88-89).
10. **`packages/plugin/src/core/vite.ts`** — `mountWidget(server, apiBase, widgetConfig)`; drop `previewId` from `htmlTags(...)` (L188), `mountWidget(...)` (L197), AND the `makeWidgetInject(previewId, apiBase, widgetConfig)` call (L65) — that internal call site also passes `previewId` and breaks typecheck if missed.
11. **`apps/examples/tanstack-start/vite.config.ts`** — drop `previewId` from the example comment (L8).

## Phase 4 — Whiteboard: kill room helper + previewId, add reactive session model

12. **`packages/extensions/whiteboard/src/shared/room.ts`** — **delete `roomId`** (and the file if it holds nothing else). Room value = `sessionId` at call sites.
13. **`packages/extensions/whiteboard/src/shared/schema.ts`** — drop `previewId: col.string()` from the `comments` table (L16).
14. **`packages/extensions/whiteboard/src/server/context.ts`** — this file holds only the **type** `WhiteboardToolContext` (no `room` _function_ lives here). Add `sessionId: (req: ToolRequest) => string` to the type alongside `room`. The throwing _implementation_ lands in `server.ts` (task 15), not here.
15. **`packages/extensions/whiteboard/src/server.ts`** — the `room` impl currently lives here (`server.ts:35`: `room: (req) => roomId(req.previewId, req.sessionId)`). Replace it + add the throwing session accessor; drop the `roomId` import (`server.ts:6`):
    ```ts
    sessionId: (req: ToolRequest) => {
      if (!req.sessionId) throw new Error('whiteboard tools require an active session')
      return req.sessionId
    }
    room: (req: ToolRequest) => ctx.sessionId(req)
    ```
16. **`packages/extensions/whiteboard/src/tool/comment/server.ts`** — drop `previewId` from all inserts/queries (L26, L44, L76, L81, L101, L103, L116-117, L131, L140). **Route EVERY session read through `ctx.sessionId(request)` — never read `request.sessionId` raw.** Today only `commentCreate`/`commentMove`/`pinSetState` go through `ctx.room` (the throwing path); `commentReply`/`Read`/`Resolve`/`Delete`/`List` read `request.sessionId` directly, so an empty session silently degrades to `[]`/"not found" — exactly the [[agent-mcp-needs-session-header]] bug Decision 5 exists to kill. Derive `const sessionId = ctx.sessionId(request)` once per handler and thread it. `commentByCid(ctx, sessionId, cid)` query `{sessionId, cid}`. **`commentList` scoping must be consistent with the act-tools:** `scope==='session'` → `{sessionId}`; the `scope==='all'` branch must ALSO filter `{sessionId}` (vary only by file/status), otherwise `list` surfaces comments from other chat sessions that `read`/`resolve`/`delete` then reject with "not found" (dead listings). Per-session scope is Decision 3; no cross-session list branch.
17. **`packages/extensions/whiteboard/src/tool/anchor/server.ts`** — query `{cid}` only (L30). This stays session-global on purpose: the server-side `subscribeAll` enrichment worker resolves anchors without a request/session (cids are UUIDs, result is source-code only, no cross-session leak of user content). Document this as the one deliberate exception to Decision 3's per-session scoping.
18. **`packages/extensions/whiteboard/src/client.tsx`** — delete `previewIdOf` + meta read; `mountOverlay({api, open, registerComment})` only (no previewId/sessionId/config).
19. **`packages/extensions/whiteboard/src/client/overlay.tsx`** — the big one:
    - `mountOverlay` drops `config`, `previewId`, `sessionId` options.
    - Wrap the tree in `<ErrorBoundary fallback={...toast...}>` then `<Suspense fallback={<OverlayLoading/>}>` (config reject must hit the boundary, not crash).
    - Introduce `Board` (config `createResource` + `<Suspense>`) and `Canvas` (session-gated **`<Show ... keyed>`** with a **function child** `{(session) => <Canvas sessionId={() => session} .../>}`, bindings moved here).
    - `room = props.sessionId` directly — `Accessor<string>`, already non-null via the narrowing child. **No `createMemo`, no `?? ''`.** `useCanvasBinding`/`useCursorPresence` consume `room`.
    - `<Show>` is `keyed` so `Canvas` re-mounts on session switch → `useCursorPresence`'s `onCleanup` deletes the old room's cursor row (prevents ghost-cursor heartbeat into the abandoned room). Excalidraw is mounted imperatively outside this tree, so re-keying does not remount/reseed it.
    - comment insert drops `previewId`; `room` is `props.sessionId`.
    - drop `previewId` props passed to `PinsLayer` / `Thread`.
    - In `client.tsx`: delete the now-vestigial `doStart`/`startPromise`/`await fetchJazzConfig(...)` wrapper (L49-63) and its `fetchJazzConfig` import — config now loads inside `Board`.
20. **`packages/extensions/whiteboard/src/client/pins/pins.tsx`** — drop `previewId` prop; room = `props.sessionId`; query `{sessionId}` (L9/42/44).
21. **`packages/extensions/whiteboard/src/client/pins/thread.tsx`** — drop `previewId` prop; queries `{sessionId}`; reply insert (L11/52/70).
22. Add small `OverlayLoading` / `SessionPending` / `OverlayError` fallback components (use existing ui-kit spinner/empty-state; "nice loading" per the brief). `OverlayError` drives `api.toast(...)` on the config-reject path.

## Phase 5 — Tests

23. Whiteboard: delete `test/room.test.ts` (helper gone). Update `test/canvas-tools.it.test.ts`, `test/enrich-worker.it.test.ts`, `test/pin-move.it.test.ts` — request fixtures `{sessionId}`, no `previewId`, no `roomId`.
    - **Fixtures importing the deleted `roomId` (ALL must be updated, not just overlay — else `room.ts` deletion breaks the test build while greps stay green):**
      - `test/fixtures/overlay-fixture.tsx` — also drop the top-level `await fetchJazzConfig` + `config` prop (mountOverlay no longer takes `config`); make `session` a **settable signal** (start from URL, expose `window.setSession`) so switch/null can be driven; capture `toast` calls instead of stubbing to no-op.
      - `test/fixtures/presence-fixture.tsx` (L5,19) — `roomId('local', 'mandarax_x')` → bare `'mandarax_x'`.
      - `test/fixtures/canvas-binding-fixture.tsx` (L6,20) — same; make `room` settable to exercise re-subscribe on room change.
      - `test/fixtures/jazz-client-fixture.tsx` (L5,14) — same.
    - **New test cases:**
      - Unit on the new `server.ts` accessor: `ctx.room({sessionId:'X'})==='X'`; `ctx.sessionId({sessionId:''})` **throws** (targets the new impl, not the deleted helper).
      - **MCP no-header IT (the real Decision-5 bug):** add a no-header variant to `test/helpers/run-tool.ts` (`callTool` always sends `mandarax-session-id`); call a comment tool over `/api/mcp` with the header omitted and assert an **error returns to the caller**, not a silent green result. This is the [[agent-mcp-needs-session-header]] failure that unit-throwing alone won't catch.
      - **Session-switch IT** (`overlay.it.test.ts` or new): mount with session A (pin A visible), flip `window.setSession` to B, assert A's pin disappears and B's pin appears (Decision 3 set-swap), AND assert the Excalidraw island is NOT remounted (set a JS expando on the element handle before switching, verify it survives — the `excalidraw-initialdata-clobbers-seed` / `excalidraw-needs-light-dom` reseed class is recurring).
      - Null-session loader: mount with `activeSession()===null`, assert `SessionPending` renders (role/text), set a session, assert board mounts.
      - No-server toast: point fixture at a dead/410 jazz-config endpoint, assert a `toast` fires (captured) and no pin/write occurs.
24. Core: `test/config.test.ts`, `test/api/chat/sessions.it.test.ts`, `test/extension-tool-session.it.test.ts`, `test/helpers/server.ts` (drop `previewId` at L33/65/108 or `extension-tool-session.it.test.ts` won't typecheck; that test degrades to a pure session-echo — retitle it). **Add an fs-driver session-store test** asserting `createFsSessionStore({stateRoot})` writes under `${stateRoot}/.mandarax/sessions/` with NO nested preview segment — the existing `test/store/session-store.test.ts` uses the memory driver only and never covers the fs path being changed, so this is a NEW test, not an update.
    24b. **Real-browser e2e** (per [[whiteboard-bug-repro-real-app]] — package ITs bypass the plugin/Jazz wiring where previewId lived): add a spec in `apps/examples/tanstack-start/e2e/` that switches chat sessions through the real plugin and asserts the pin set swaps + Excalidraw stays mounted. NB the existing `whiteboard-draw.spec.ts` / `whiteboard-persist.spec.ts` don't read `previewId`, so removal won't break them, but they also don't cover switch/no-header.

## Phase 5b — Required cleanups (blocking)

27. **Rename the `cursors` presence column.** After the change `cursors.room` holds the chat sessionId while `cursors.sessionId` holds the per-tab presence identity (a sessionStorage UUID, unrelated to the chat session) — two columns both named after "session" meaning different things, a latent mis-filter. Rename the presence column to `peerId` in `shared/schema.ts` (`cursors` table) and update every read/write: `client/canvas/presence.ts` (dedup-self filter + insert), any `useAll(... where)` over cursors. Verify `grep -rn "cursors" packages/extensions/whiteboard/src` has no leftover `sessionId` reference on the cursors table.
28. **Pin down `driver:{type:'memory'}`.** Confirm with intent: it sits ABOVE the session `<Show>` so it's created once and survives session switches (no data loss on switch), but gives no IndexedDB offline cache (reload re-syncs from the server `dataDir`, which is authoritative). Keep it ONLY if intended; either way document the choice in a one-line comment at the client config site (`client/jazz-client.tsx`) so it isn't read as a debugging leftover.

## Phase 6 — Docs

25. **`README.md`** — remove `previewId` from config/option docs.
26. **`docs/superpowers/{plans,specs}/*`** — historical dated records. DECISION: leave as-is (recommended) vs scrub for literal grep===0. Default: leave.

---

## Verification

```
grep -rn "previewId" packages/*/src packages/extensions/*/src README.md apps/examples/*/vite.config.ts | grep -v node_modules        # 0
grep -rn "previewId" packages --include="*.ts" --include="*.tsx" | grep -v node_modules                                              # 0  (NOTE: *.ts not just *.test.ts — else test/helpers/server.ts is grep-blind)
grep -rn "roomId" packages/extensions/whiteboard | grep -v node_modules | grep -v dist                                              # 0  (catches the fixtures that import the deleted helper but contain no literal "previewId")
grep -rn "'local'" packages/extensions/whiteboard/src packages/core/src/api/mcp packages/core/src/config.ts | grep -v node_modules  # 0
pnpm turbo typecheck
pnpm turbo test --filter=@mandarax/core --filter=whiteboard
```

> `grep===0` is necessary, not sufficient — it proves the literal string is gone but not that fixtures compile. The `pnpm turbo typecheck` + `test` runs are the real net (the `roomId` fixtures, the `mountOverlay` signature change, the `ToolRequest` reshape all surface only there). Rebuild before the example-app smoke (`dist/` still holds stale `roomId`/`previewId`).

Then run the example app (memory: `use-turbo-build`, `widget-reload-vs-server-restart`) and confirm in a real browser:

- Open whiteboard before chat resolves → loading state, then board (no blank/`local` writes).
- AI `comment.create` draws a pin on the active session.
- Switch session → comment/pin set switches; Excalidraw does not flicker/remount.
- Two tabs on the same session see each other's pins (sync).
- MCP tool call with no session header → clear thrown error, not a silent vanish.

## Commit slicing

- `refactor(core): drop previewId from config, mcp, session-store path`
- `refactor(plugin): drop previewId injection`
- `refactor(whiteboard): room = sessionId, delete roomId helper, drop previewId`
- `feat(whiteboard): reactive session model — Suspense + Show, no local fallback`
- `test: update fixtures for previewId removal + empty-session throw`

```

```
