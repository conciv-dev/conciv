# Widget rewrite: state-first surface on TrailBase + TanStack AI

Status: approved design, pending implementation plan.

## Why

`packages/widget` grew into an imperative tangle: a 846-line `chat-panel.tsx` god component, 31 `createEffect`s (mostly pushing derived state up through callback props), registration APIs (`registerPanel`, `registerComposerAction`), window globals, hand-rolled SSE transport, client-side compaction orchestration built from `createRoot`+`createEffect` promise hacks, and a localStorage persistence layer wired through manual event listeners. The package is deleted and replaced. No back-compat, no coexistence period (v0 rule). Rollback is `git revert`.

## Stack decision

Four sync stacks were spiked end to end on the same slice (engine writes sessions and approvals, foreign-origin browser page live-renders, user decides an approval, engine sees the decision, server killed and restarted mid-run):

|                       | Triplit                                                         | Convex local                                                                  | Zero + embedded PG                                    | TrailBase |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| E2E slice             | pass                                                            | pass                                                                          | pass                                                  | pass      |
| Optimistic latency    | 114ms                                                           | 82ms                                                                          | 47ms                                                  | 66ms      |
| Extra processes / RSS | 0 / 59MB                                                        | 1 / 59MB                                                                      | ~20 / 537MB                                           | 1 / 30MB  |
| Verdict               | dead upstream (last publish 2025-07, team absorbed by Supabase) | works, but 157MB binary per version and state lives in their function runtime | works, heaviest chain, most concepts, beta PG spawner | chosen    |

**Chosen: TrailBase** (v0.30+, single 23MB static binary, sqlite file we own, admin UI included, OSL-3.0 server / Apache-2.0 clients) synced to the widget via **TanStack DB** with the official `@tanstack/trailbase-db-collection` adapter. This matches the whiteboard extension's existing TanStack DB patterns. Constraints honored: no Docker, no native compile, no hand-rolled sync protocol, sqlite storage.

Known adapter friction (verified in spike): TrailBase record API primary keys must be UUIDv7 blobs or integers; `trailBaseCollectionOptions` requires `parse: {}` and `serialize: {}` despite docs marking them optional (npm client 0.13 lags server 0.30). Hedge: the widget only sees TanStack DB collections, so the sync backend is swappable via a different collection factory.

## Architecture: two planes, hard boundary

**AI protocol plane — TanStack AI, native, untouched.** TanStack AI is conciv's AI feature parity: everything conversational stays in `useChat` per session (messages, tool parts, approval-requested states, gen-UI custom events, tool timing events, streaming, snapshot on attach). The widget is a faithful TanStack AI client. `attach-connection.ts` is deleted; the widget uses the stock `fetchServerSentEvents` connection adapter from `@tanstack/ai-client` pointed at core's existing endpoints. No custom transport, no `guardChat`, no `onSnapshot` hack, no `bump()`. Approvals stay derived from message parts (that is the TanStack AI approval feature).

**Domain plane — TrailBase via TanStack DB.** Workspace state that is about sessions rather than inside a conversation:

| Table                                                                                           | Writer              | Replaces                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions` (name, status: idle/thinking/streaming/compacting, model, usage snapshot, updatedAt) | core engine         | `onWorkingChange`/`onUsageChange`/`onSessionLabel` callback chains, `session-store-client` invalidation, usage SSE parsing in the panel |
| `drafts` (sessionId, text, selection, grabs JSON, scrollTop)                                    | widget (optimistic) | `ui-snapshot.ts` localStorage layer, manual listener persistence                                                                        |
| `markers` (sessionId, afterTurn, kind: new/compact)                                             | core + widget       | `dividers` signal + seq counter                                                                                                         |
| `ext_<id>_*`                                                                                    | extensions          | ad-hoc extension persistence                                                                                                            |

Device-local ergonomics (fab position, panel size, open layer) stay in localStorage.

Core's `store/session-store.ts` (unstorage fs-lite) is replaced by the TrailBase-backed store. Core spawns and supervises the `trail` binary (downloaded on first run into conciv's state dir, Playwright-style), applies migrations, and writes via the records HTTP API on localhost.

**Compaction moves server-side.** `POST /api/sessions/:id/compact`: core orchestrates the /compact turn, sets `sessions.status = 'compacting'`, writes the marker row, updates usage when done. The widget renders a spinner off status. Deletes `waitForIdle`/`waitForGenerating` and the raw fetch in the panel.

## Package map

`packages/widget` is deleted. Replacements:

- **`@conciv/state`**: zod row types + TanStack DB collection factories. `./server` = TrailBase lifecycle for core (binary fetch/spawn, migrations incl. extension tables, engine write client). `./solid` = shared hooks (`useSessions`, `useSession`, `useDraft`) as thin `useLiveQuery` wrappers. No UI.
- **`@conciv/surface`**: the visible product. Dock chrome (fab, floating panel, quick terminal, PiP, approval HUD), chat panel, composer. Thin Solid components over `ui-kit-*`, reading hooks only.
- **`@conciv/page`**: the page half (react-bridge, picker/grab, mirror/snapshot, bus/driver, open-source) behind one typed `PageAgent` interface of plain functions (no components, no collections; it paints overlays internally). Internals move mostly as-is; rewrite deferred; end state is to become an extension once the contract supports provider extensions.
- **`@conciv/embed`**: ~40-line bundle entry the vite plugin injects. Reads meta config, creates the shadow root, constructs the runtime (state client, PageAgent, extension instances), renders `<Surface>`. No `.then()` boot, no window globals (the react-bridge pre-hydration global lives inside `@conciv/page`, versioned).

Kept: `ui-kit-*`, `protocol`, `grab`, `api-client` (REST), `extension` (contract rewritten in place). `publish/guards.ts` `PUBLIC_PACKAGES` updated accordingly.

## Composition, not registration

No `register*` APIs. `embed` renders a static JSX tree; contributions from extensions are data collected from manifests at runtime creation:

- `Dock` owns chrome and the open/closed layer signal (persisted).
- Session panes render with `<For each={useSessions()}>`; each pane owns its `useChat`. Session switch is component swapping, never connection surgery. `modal-panes.ts` / `quick-panes.ts` / `pane-content.ts` collapse into one pane component rendered by two layouts.
- Composer actions and controls are arrays of data: built-ins are imports, extension contributions come from manifests. `PanelDef`/`ComposerActionDef` registration types die.

Provider stack at the surface root, in order: `EnvironmentProvider(shadowRoot)` (Ark requirement), theme, `HostProvider`. PiP renders through a dedicated `PiPSurface` subtree: cloned shadow styles + `EnvironmentProvider(pipDocument)` + `createRoot` with owner. All async data (models, config, collection readiness) resolves through `createResource` + `Suspense` with skeletons and error boundaries with retry; the fab renders instantly.

## Host access: hooks only

One doorway for first-party components and extensions alike, delivered via context from `@conciv/extension/client`. Never passed as props:

```ts
useSlot() // where am I mounted
useHost() // all planes, or individually:
//   state: sessions collection, active session accessor, table<T>(name) for ext_<id>_* tables
//   chat:  send(text), insert(text), respondApproval(id, approved)
//   ui:    notify, dialog(), popover(), surface()
//   page:  PageAgent
```

First-party surface components consume the same hooks; the chat panel is architecturally an extension that ships in the box. That is the strength test of the contract. Props are for local parent-child data only.

Removed from the old `ExtensionHostContext` because state replaced them: `setBusy`, `addDivider`, `compact`, `resetUsage`, `requestMeta` threading, and all `on*Change` callbacks.

The manifest stays declarative and gains capability typing (compile-time, like `HarnessAdapter`): declaring `views` requires view components; declaring `tables` requires migrations. Server side (`tools`, `commands`, `server(cfg)`, `turnEnd`) keeps its shape.

Acid test deferred but named: `@conciv/page` as an extension requires "provider extensions" (an extension that provides a plane rather than consumes it). Not designed now; the contract must not preclude it.

## Chat panel: compound components

Identical visuals to today; each piece subscribes to exactly the one source it renders (fine-grained Solid updates):

```tsx
<Chat.Root sessionId={id}>
  {' '}
  // owns useChat, provides via context; renders wrapper
  <Chat.Viewport>
    {' '}
    // scroll container, stick-to-bottom, scroll restore
    <Chat.Thread /> // messages: bubbles, tool cards (ui-kit-chat Thread)
    <Chat.Markers /> // divider lines, markers table
    <Chat.GenUi /> // interactive question cards, gen_ui events
    <Chat.NowLine /> // activity line + thinking dots, chat status
    <Chat.Error /> // error row + retry, reconnect line
  </Chat.Viewport>
  <Composer.Root>
    {' '}
    // input dock; reads/writes drafts row
    <Composer.Grabs /> // element reference chips
    <Composer.Input /> // textarea + trigger menus
    <Composer.Actions /> // icon buttons from manifest data
    <Composer.Controls /> // model selector + extension controls
  </Composer.Root>
</Chat.Root>
```

Default assembly is one ~40-line `ChatPanel`. Effects survive only for genuine DOM concerns (focus, scroll); zero `createEffect` for data flow.

Deleted outright from today's panel: usage/duration/gen-ui/divider/draft signal machinery (state plane), compaction orchestration (server), `attach-connection`/`guardChat`/`chatRef`/`onSnapshot`/`lastSession`/`seenSession` (native TanStack AI).

## Testing and rollout

Order: `@conciv/state` + core TrailBase lifecycle + compaction endpoint, then extension contract v2, then `surface` + `embed`, then rewire built-in extensions (terminal, test-runner, whiteboard), then `git rm -r packages/widget` in the same task.

- Widget ITs move to `surface`: real browser, prebuilt bundle, `browser.newPage()`, `domcontentloaded` (never `networkidle`).
- `state` ITs run against a real spawned TrailBase (spike proved the harness pattern).
- `extension-testkit` provides a fake host implementing the hook API.
- The mount-externals bundle test moves to `embed` (externalize every `@conciv/extension/*` subpath + shared Ark/Solid deps).
- Gates: `pnpm typecheck && pnpm build && pnpm test`, `fallow audit --changed-since main` clean of INTRODUCED findings.

## Risks and open questions

- TrailBase is 0.x from a small team; releases weekly. Hedged by the collection-factory seam.
- npm client (0.13) lags server (0.30); pin both, add an IT that exercises subscribe + CRUD against the pinned binary.
- `@tanstack/trailbase-db-collection` requires explicit `parse`/`serialize`; upstream issue worth filing.
- Auth model for the records API on localhost (world ACLs vs service tokens) decided during implementation; core dev server stays 127.0.0.1-only.
- Provider extensions (page as extension) explicitly out of scope.
