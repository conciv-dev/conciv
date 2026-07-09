# Widget rewrite: UI-only client, oRPC everywhere, core owns all logic

Status: approved design, pending implementation plan.
Supersedes: `2026-07-09-widget-rewrite-design.md` (previous same-day design; the abandoned work on
`feat/widget-rewrite` is replaced by this design).

## Why

`packages/widget` (~5.8k lines) is an imperative tangle doing five jobs: chat glue, shell chrome,
page driver, extension host, bootstrap. The chat glue alone is an 847-line god component with 31
`createEffect`s, a hand-rolled SSE transport (`attach-connection.ts`), snapshot events force-fed
through `setMessages()`, compaction orchestrated by raw fetch plus `createRoot`/`createEffect`
promise hacks, localStorage persistence wired through manual DOM listeners, and module-global
session caches. Roughly 90% of the client logic exists to compensate for a backend that does not
speak the client's language. The package is deleted; no back-compat (v0 rule); rollback is
`git revert`.

## The rule: client is UI components only

Client code may do exactly three things:

1. **Render server rows and message parts.** Live queries and `useChat` output. Pure display
   derivations (day-bucketing, grouping, filtering visible items) are allowed inside components.
2. **Forward user intents.** One typed procedure call per gesture: `send`, `rename`, `compact`,
   `newSession`, `setModel`, `respondApproval`, `stop`, `closeSession`. Fire and forget; results
   come back as synced rows or message parts, never as client bookkeeping.
3. **Physical device concerns** that cannot leave the browser: focus, scroll physics, drag/resize,
   animation, and DOM execution for the page driver (the hands; the brain that decides what to
   query lives server-side behind the page bus).

Client may NOT: cache, retry, reconcile, sequence, orchestrate, mint ids, persist domain state, or
hold any state machine. A `createEffect` that is not focus/scroll/animation is a review defect.

Device-local ergonomics (fab position, panel size) stay in localStorage: syncing one browser's
pixel geometry to another viewport is the wrong data to share.

## Comms: oRPC for everything

One contract package (`@conciv/contract`): oRPC procedures + zod schemas. Core mounts it on Hono at
`/rpc/*` via `RPCHandler` middleware (mind the body-parse-once caveat: let the oRPC handler read
the raw request, or proxy body methods to Hono's parsed copies). Server-to-server callers (plugin
dev server, cli, testkits) use the same contract over localhost.

Client data layer is the official oRPC TanStack Query integration (Solid is supported):

- Queries: `useQuery(orpc.x.queryOptions(...))`.
- Intents: `mutationOptions()`.
- Live data: event iterators consumed via `liveOptions` (latest value) or `streamedOptions`
  (append). Reconnect design (revised 2026-07-10): NO `lastEventId` resume anywhere — `chat.attach`
  is snapshot-first (the first chunk replays settled history, hub replay covers the in-flight
  turn), so a reconnect is simply a fresh attach; the other live iterators re-emit current state on
  first yield. This kills the reconnect/`bump()` class of bugs without event-id bookkeeping.
- Errors are part of the contract: procedures declare typed errors (`BUSY`, `NOT_FOUND`,
  `UNKNOWN_MODEL`, `UNSUPPORTED`, `UNKNOWN_REQUEST`) so the client renders semantics ("session
  busy" → disable send), never string-matching.

| Today                                            | Becomes                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `@conciv/api-client` hand-written fetch wrappers | Deleted. Typed oRPC client from the contract.                                          |
| Per-route `zValidator` wiring in core            | Contract schemas validate both directions.                                             |
| `/attach` hand-rolled SSE + client parse loop    | `chat.attach` event iterator yielding native TanStack AI `StreamChunk`s.               |
| Page bus `EventSource` + JSON parse + reply POST | `page.queries` event iterator + `page.reply` procedure (not resumable: dropped in-flight queries time out at the asker, as today). |
| Models/commands/tools/config GET routes          | Contract queries via TanStack Query.                                                   |
| Sessions list GET + client cache                 | `sessions.live` event iterator + `liveOptions`.                                        |

**Chat plane stays native TanStack AI.** The transport is an oRPC event iterator, but the payload
is TanStack AI's own `StreamChunk` stream and the client is `useChat` fed by a ~15-line connection
adapter bridging the typed iterator. Server side is oRPC's documented AI-streaming pattern
(`async function*` handler that `yield*`s an existing async iterable — see the openai-streaming
example): `chat.attach` is essentially `yield snapshot; yield* hub.attach(...)`. Messages are never
re-modeled as rows; approvals stay derived from message parts; TanStack AI remains conciv's AI
feature parity.

Extensions contribute their own oRPC routers (their existing `server(cfg)` hook), mounted under
`/rpc/ext/<id>`; their client components consume a typed client for their router. **DEFERRED
(2026-07-10): extension comms stay on their Hono apps at `/api/ext/<id>` for now — the extension
oRPC story is its own later phase.** The plan-1 contract still covers the extension HOST's two
core calls (`editor.open`, `editor.openFromFrames`).

## Storage: `@conciv/db` package (drizzle on node:sqlite)

All persistence lives in a dedicated **`packages/db`** (`@conciv/db`): the drizzle table schemas,
the sqlite open + migrate (`openDb`), and the row stores (`makeSessionStore`, `makeUiState`). It
is the ONLY package that imports drizzle; core consumes its exported functions and never touches
drizzle or `node:sqlite` directly. One sqlite file in conciv's state dir, opened once per process.

Driver: **drizzle ORM** on the built-in **`node:sqlite`** (`drizzle-orm/node-sqlite` +
`DatabaseSync`): zero install-time dependency, no native compile, no prebuilt binaries.
drizzle-orm and drizzle-kit are pinned EXACT to `1.0.0-rc.4` — the node-sqlite driver ships only
in the 1.0 line (latest stable 0.45.2 lacks it; verified 2026-07-09); swap to `1.0.0` stable when
released. `node:sqlite` is unflagged since Node 22.13 (emits an ExperimentalWarning only), so the
repo's Node floor is `>=22.13` and no `--experimental-sqlite` flag is threaded anywhere — critical
because the core engine loads inside the HOST app's vite process, whose node flags we don't
control.
Row types: drizzle tables are the source of truth; zod schemas
in the contract are pinned to them with `expectTypeOf` type tests; columns are explicit-null, no
implicit undefined. Migrations run at boot inside `openDb` (drizzle-kit generated SQL, committed
in `packages/db/drizzle/`, applied programmatically). Extension tables are namespaced
(`ext_<id>_*`) and migrated from manifest declarations at boot.

No sidecar process, no records API, no second sync protocol. Live queries are core pushing rows
over event iterators after its own writes (single writer, so invalidation is trivial: the writer
emits — the stores expose `watch(listener)` for exactly this).

Replaces: `store/session-store.ts` (unstorage fs-lite).

## Backend changes (each one deletes client code)

1. **Native TanStack AI over oRPC.** `chat.attach` iterator replays snapshot + live chunks from the
   existing `turn-hub` with stable ids and clean stop/error semantics so the `useChat` state
   machine needs no `guardChat`, no `onSnapshot`/`setMessages`, no `bump()`.
2. **Engine writes session rows.** `sessions` (id, title, status: idle|thinking|streaming|
   compacting, model, usage snapshot, origin, messageCount, updatedAt) updated by core during
   turns. Kills every `on*Change` callback chain and the client session cache.
3. **Server-owned per-session UI state.** `drafts` (text, selection, grabs) and `markers`
   (afterTurn, kind: new|compact). Written via intents; read via live queries. Kills
   `ui-snapshot.ts` and the divider machinery. Layout state (open layer, pane set, focus) is NOT a
   table: it is navigation state owned by the router's persisted history (see the router section).
4. **Compaction server-side.** `sessions.compact` procedure: core runs the /compact turn, sets
   `status='compacting'`, writes the marker, updates usage. Client renders a spinner off status.
5. **Model policy server-side.** `sessions.model` column; core validates against the harness list,
   applies defaults, uses it per turn. Kills `requestMeta` threading and the persisted model
   signal.
6. **Gen-UI and tool timing become message parts.** Emitted inside the turn stream as data parts,
   not side-channel custom events. Client renders parts; zero event demux/buffering.

## Deletion ledger (client code → what deletes it)

| Client code                                                                            | Lines | Deleted by        |
| -------------------------------------------------------------------------------------- | ----- | ----------------- |
| `client/attach-connection.ts`                                                          | 118   | change 1          |
| `chat-panel.tsx` onSnapshot/chatRef/guardChat/lastSession/seenSession/reconnect        | ~115  | change 1          |
| `client/session-store-client.ts`                                                       | 70    | change 2          |
| `chat-panel.tsx` usage/duration parsing, wasWorking, invalidation, on\*Change emission | ~80   | changes 2, 6      |
| `shell/pane-content.ts` (callback catcher)                                             | 39    | change 2          |
| `shell/shell-contract.ts` (registration types)                                         | 71    | changes 2, 5      |
| `modal-panes.ts` + `quick-panes.ts` threading/restore/persistence                      | ~200  | change 2 + router |
| `lib/ui-snapshot.ts`                                                                   | 110   | change 3          |
| `chat-panel.tsx` snapshot/restore/persist block + divider machinery                    | ~125  | change 3          |
| `chat-panel.tsx` compact + waitForIdle/waitForGenerating                               | ~65   | change 4          |
| `composer/*` requestMeta/persisted-signal/busy juggling                                | ~135  | changes 4, 5      |
| `session-selector.tsx` store wiring/status machine/rename revert                       | ~90   | change 2          |
| `chat-panel.tsx` onConcivUi demux + genUi buffer + durations                           | ~55   | change 6          |
| `page/page-bus.ts` + `api-client` bus/fetch wrappers                                   | ~150  | oRPC              |

Of ~2,100 lines of client state/orchestration, ~250 survive (≈90% deleted). The remainder of the
package is rendering (relocates) or the page driver (inherently client).

## The widget is a router app

The widget is a TanStack Solid Router app (`@tanstack/solid-router`, pinned alongside
`@tanstack/history`) mounted in the shadow root. Routes replace every layout state machine; when
embedded, the router's history comes from **`@conciv/storage-history`** — its own package: a
custom Web-Storage-persisted history written against `@tanstack/history`'s `createHistory`, same
shape as `createMemoryHistory` (entries + index) but the store is localStorage (storage injectable
for tests/sessionStorage). Being a dedicated package makes the history swappable without touching
the app. The widget never touches the host page's URL or history; restoration after reload is
intrinsic to the history, not a feature we build. The history is injected at the entry, so the
standalone app (see package map) runs the same routes on browser history.

Route tree:

| Route                     | Renders                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__root`                  | Chrome present on every route: fab, approval HUD, live-region announcer; providers (`EnvironmentProvider(shadowRoot)` → theme → query client → host context) |
| `/` (index)               | Closed state — fab only                                                                                                                                      |
| `/panel`                  | Floating panel layout (drag/resize/anchor geometry)                                                                                                          |
| `/panel/$sessionId`       | Chat pane                                                                                                                                                    |
| `/panel/$sessionId/$view` | Extension view tab (whiteboard, terminal, …)                                                                                                                 |
| `/quick`                  | Quick terminal: drop-down multi-pane layer                                                                                                                   |
| `/pip/$sessionId`         | Picture-in-picture surface (style cloning, `EnvironmentProvider(pipDocument)`)                                                                               |

What the router owns that we no longer hand-build: layer/pane/restore signals and their
sessionStorage parsers (custom history), active session threading (`$sessionId` path param),
view-tab switching + slide transitions (route navigation), leave-guards while streaming or a view
is locked (`useBlocker`), Esc-to-close (`history.back()`), data preloading (route loaders call
TanStack Query `queryOptions`). Each pane's `useChat` lives in its route component; session switch
is mount/unmount, never connection surgery.

**Quick terminal, fully covered:**

- `/quick` search params are the pane state, typed and zod-validated:
  `?panes=<sessionId[]>&focus=<index>`. Persisted by the custom history like everything else, so
  the quick layer reopens with the same panes and focus.
- Hotkey (from `settings.quickTerminal.hotkeys`) navigates to `/quick` / `history.back()`. When
  `quickTerminal.enabled` is false the hotkey is not registered and a `beforeLoad` guard redirects
  `/quick` → `/`.
- Add pane = `sessions.create` intent → navigate with the returned id appended to `panes`. Close
  pane = navigate with it removed (+ `closeSession` intent); last pane closed navigates `/`.
- Focus capture on open and restore to the previously-focused host element on close stay as
  device concerns in the route component; Esc inside an xterm still goes to the terminal first
  (existing `terminal-focus` behavior).
- Side-by-side panes render `<For each={search.panes}>`, each owning its `useChat`.

No `register*` APIs anywhere. Extension contributions are data collected from manifests; extension
views are the `$view` route param. All async data resolves through TanStack Query with skeletons
and error boundaries with retry; the fab renders instantly.

## Final package map

- `core`: all logic. Hono + oRPC mount, turn hub, compaction, model policy, page-bus brain,
  gen-UI as parts. Persistence only through `@conciv/db` (`openDb` + store functions).
- `db`: all persistence — drizzle table schemas, sqlite open + committed migrations,
  session/draft/marker stores with `watch`. The only package that imports drizzle.
- `contract`: oRPC contract + zod schemas (client and server both import it).
- `client`: data access, zero UI — oRPC client factory, TanStack Query options, Solid hooks,
  the ~15-line `useChat` connection bridge.
- `storage-history`: the custom Web-Storage-persisted `@tanstack/history` implementation, alone in
  its package so the history strategy is swappable (entries/index round-trip and corrupted-storage
  fallback unit-tested here). Depends only on `@tanstack/history`.
- `apps/conciv` (private, never published — apps/, not packages/; scaffolded with
  `npx @tanstack/cli create --router-only --framework solid`): the conciv app — TanStack Solid
  Router app: route tree above, chat pane assembly, chrome components (fab wiring, panel geometry,
  quick layer, PiP). Consumes `client` hooks and `ui-kit-*` components only. Two entries:
  standalone (`index.html` + vite dev server, browser history, real URLs — the dev loop becomes
  HMR instead of rebuild-bundle-then-hard-reload) and a library export
  (`createWidgetRouter(config)` + root component) consumed by embed. History, root element, and
  environment are injected at the entry: embed passes the custom localStorage history + shadow
  root; standalone passes browser history + document.
- `page`: DOM execution half of the page plane (react-bridge pre-hydration global is its private,
  versioned concern).
- `embed` (packages/, published — it IS the artifact): entry + bundle (~10 lines: create the
  history via `@conciv/storage-history`, create the router from `apps/conciv`'s export, mount into
  the shadow root) + vite bundling config that inlines the private app, externals (every
  `@conciv/extension/*` subpath + shared Ark/Solid deps) and the mount-externals guard test.
- `ui-kit-system`, `ui-kit-chat`, `ui-kit-chat-tools`, `ui-kit-terminal`, `mascot`: generic
  components only, no conciv data wiring (`FabRobot` visuals in `mascot`; drag/resize/PiP-host/
  announcer primitives in `ui-kit-system`; `GenUi`/`ToolFallbackCard`/trigger menus in
  `ui-kit-chat`(`-tools`); xterm stays `ui-kit-terminal` — the quick layer is app chrome, not a
  terminal).
- `extension`: manifest contract + client host; extensions add oRPC routers server-side.
- Deleted: `packages/widget`, `packages/api-client`, and the old REST chat/session routes
  (replaced by contract procedures backed by `@conciv/db`).
- `publish/guards.ts` `PUBLIC_PACKAGES` updated to match.

## Testing and rollout

Order: contract + core storage/oRPC mount → backend changes 1–6 with ITs → `client` →
`apps/conciv` (routes + custom history, component moves into ui-kits alongside) → `page` + `embed` →
rewire built-in extensions (terminal, test-runner, whiteboard) →
`git rm -r packages/widget packages/api-client` in the same task.

- Core ITs: real sqlite file, real oRPC client, event-iterator resume (kill and re-attach
  mid-turn). Procedure-level tests use oRPC's `call()` for direct invocation, no HTTP.
- `extension-testkit` fake host: `implement(contract)` mock handlers — contract-typed test doubles
  instead of a hand-built fake server.
- Drizzle↔zod pins: `expectTypeOf` type tests in the contract package.
- Widget ITs move to `embed`: real browser against the prebuilt bundle, `browser.newPage()`,
  `domcontentloaded` (never `networkidle`).
- `app` tests: real browser (never jsdom); route navigation, quick-terminal search-param
  round-trips, and history persistence drive assertions through visible behavior, with the
  contract mocked via `implement(contract)`.
- Gates: `pnpm typecheck && pnpm build && pnpm test`, `fallow audit --changed-since main` clean of
  INTRODUCED findings.

## Risks and open questions

- oRPC maturity: verify the Hono adapter body-parse proxy and event-iterator resume against our
  Hono version early (first spike of the implementation plan).
- Event-iterator fan-out: one iterator per open browser tab per stream; core already handles
  multi-subscriber replay in `turn-hub`; the sessions live stream reuses the same pattern.
- `@tanstack/solid-router` is newer than the React adapter; pin router + `@tanstack/history`
  versions and cover the custom localStorage history with unit tests (entries/index round-trip,
  corrupted-storage fallback to `/`).
- `node:sqlite` still emits an ExperimentalWarning (harmless); it is unflagged since Node 22.13,
  which is the repo's engines floor — no node flags needed on any entry point.
- Draft typing latency: composer input is local UI state while focused; the drafts row is a
  debounced intent. Reconciliation rule: server row only replaces local text when the composer is
  not focused.
