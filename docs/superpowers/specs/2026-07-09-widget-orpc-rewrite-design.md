# Widget rewrite: UI-only client, oRPC everywhere, core owns all logic

Status: approved design, pending implementation plan.
Supersedes: `2026-07-09-widget-rewrite-design.md` (TrailBase + TanStack DB domain plane). The user
dropped TrailBase later the same day in favor of a single comms stack; the `@conciv/db` TrailBase
work on `feat/widget-rewrite` is replaced by this design.

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
   `newSession`, `setModel`, `respondApproval`, `stop`, `closeSession`, `focusPane`. Fire and
   forget; results come back as synced rows or message parts, never as client bookkeeping.
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
  (append). Iterators carry `withEventMeta` ids; the retry plugin resumes from `lastEventId`, which
  kills the reconnect/`bump()` class of bugs.

| Today                                            | Becomes                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `@conciv/api-client` hand-written fetch wrappers | Deleted. Typed oRPC client from the contract.                                          |
| Per-route `zValidator` wiring in core            | Contract schemas validate both directions.                                             |
| `/attach` hand-rolled SSE + client parse loop    | `chat.attach` event iterator yielding native TanStack AI `StreamChunk`s.               |
| Page bus `EventSource` + JSON parse + reply POST | `page.queries` event iterator (typed `PageQuery`) + `page.reply` procedure, resumable. |
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
`/rpc/ext/<id>`; their client components consume a typed client for their router. This replaces
the TrailBase `ext_<id>_*` table story.

## Storage: core-owned sqlite via drizzle

Core owns one sqlite file in conciv's state dir. Access through **drizzle ORM** on the built-in
**`node:sqlite` driver** (`drizzle-orm/node-sqlite` + `DatabaseSync`): zero install-time
dependency, no native compile, no prebuilt binaries; stable drizzle only (never `@rc`). Node 22
needs `--experimental-sqlite` (already Node >= 22 in this repo; vitest gets it via `execArgv`).
Row types: drizzle tables are the source of truth; zod schemas
in the contract are pinned to them with `expectTypeOf` type tests; columns are explicit-null, no
implicit undefined. Migrations run at core boot (drizzle-kit generated SQL, applied
programmatically). Extension tables are namespaced (`ext_<id>_*`) and migrated from manifest
declarations at boot.

No sidecar process, no records API, no second sync protocol. Live queries are core pushing rows
over event iterators after its own writes (single writer, so invalidation is trivial: the writer
emits).

Replaces: `store/session-store.ts` (unstorage fs-lite) and the entire TrailBase plane (binary
download/supervision, `@tanstack/trailbase-db-collection`, records HTTP API).

## Backend changes (each one deletes client code)

1. **Native TanStack AI over oRPC.** `chat.attach` iterator replays snapshot + live chunks from the
   existing `turn-hub` with stable ids and clean stop/error semantics so the `useChat` state
   machine needs no `guardChat`, no `onSnapshot`/`setMessages`, no `bump()`.
2. **Engine writes session rows.** `sessions` (id, title, status: idle|thinking|streaming|
   compacting, model, usage snapshot, origin, messageCount, updatedAt) updated by core during
   turns. Kills every `on*Change` callback chain and the client session cache.
3. **Server-owned per-session UI state.** `drafts` (text, selection, grabs), `markers` (afterTurn,
   kind: new|compact), `panes` (layer, sessionId, order, focused). Written via intents; read via
   live queries. Kills `ui-snapshot.ts`, divider machinery, pane restore parsing.
4. **Compaction server-side.** `sessions.compact` procedure: core runs the /compact turn, sets
   `status='compacting'`, writes the marker, updates usage. Client renders a spinner off status.
5. **Model policy server-side.** `sessions.model` column; core validates against the harness list,
   applies defaults, uses it per turn. Kills `requestMeta` threading and the persisted model
   signal.
6. **Gen-UI and tool timing become message parts.** Emitted inside the turn stream as data parts,
   not side-channel custom events. Client renders parts; zero event demux/buffering.

## Deletion ledger (client code → what deletes it)

| Client code                                                                            | Lines | Deleted by   |
| -------------------------------------------------------------------------------------- | ----- | ------------ |
| `client/attach-connection.ts`                                                          | 118   | change 1     |
| `chat-panel.tsx` onSnapshot/chatRef/guardChat/lastSession/seenSession/reconnect        | ~115  | change 1     |
| `client/session-store-client.ts`                                                       | 70    | change 2     |
| `chat-panel.tsx` usage/duration parsing, wasWorking, invalidation, on\*Change emission | ~80   | changes 2, 6 |
| `shell/pane-content.ts` (callback catcher)                                             | 39    | change 2     |
| `shell/shell-contract.ts` (registration types)                                         | 71    | changes 2, 5 |
| `modal-panes.ts` + `quick-panes.ts` threading/restore/persistence                      | ~200  | changes 2, 3 |
| `lib/ui-snapshot.ts`                                                                   | 110   | change 3     |
| `chat-panel.tsx` snapshot/restore/persist block + divider machinery                    | ~125  | change 3     |
| `chat-panel.tsx` compact + waitForIdle/waitForGenerating                               | ~65   | change 4     |
| `composer/*` requestMeta/persisted-signal/busy juggling                                | ~135  | changes 4, 5 |
| `session-selector.tsx` store wiring/status machine/rename revert                       | ~90   | change 2     |
| `chat-panel.tsx` onConcivUi demux + genUi buffer + durations                           | ~55   | change 6     |
| `page/page-bus.ts` + `api-client` bus/fetch wrappers                                   | ~150  | oRPC         |

Of ~2,100 lines of client state/orchestration, ~250 survive (≈90% deleted). The remainder of the
package is rendering (relocates) or the page driver (inherently client).

## Component homes (embed owns none)

| Component                                                                                                                               | Home                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `FabRobot`                                                                                                                              | `@conciv/mascot` (its rig/assets already live there)                                                  |
| `QuickTerminalLayout`                                                                                                                   | `@conciv/ui-kit-terminal`                                                                             |
| Floating panel, drag position, resize handles, PiP host, live-region announcer                                                          | `@conciv/ui-kit-system`                                                                               |
| Chat panel assembly (~120 lines of primitives), `SessionSelector`, `ModelSelector`, `ContextTracker`, `ApprovalModal`/HUD, panel header | `@conciv/ui-kit-chat` styled layer                                                                    |
| `GenUi`, `ToolFallbackCard`, `TriggerMenus`                                                                                             | `ui-kit-chat` / `ui-kit-chat-tools`                                                                   |
| Extension slots/views host                                                                                                              | `@conciv/extension` (beside `mountExtension`)                                                         |
| Page driver, react-bridge, grab picker, mirror, dehydrate                                                                               | `@conciv/page`, mostly as-is; the react-bridge pre-hydration global is its private, versioned concern |

`@conciv/embed` is a composition root only (~100 lines): read meta config, construct the oRPC
client + TanStack Query client + `PageAgent` + extension instances, render the imported tree into
the shadow root. JSX component definitions inside embed are a review smell. The bundle
externalizes every `@conciv/extension/*` subpath and shared Ark/Solid deps (mount-externals test
moves here).

## Final package map

- `core`: all logic. Hono + oRPC mount, turn hub, sqlite via drizzle, session/draft/marker/pane
  writers, compaction, model policy, page-bus brain, gen-UI as parts.
- `contract`: oRPC contract + zod schemas (client and server both import it).
- `ui-kit-system`, `ui-kit-chat`, `ui-kit-chat-tools`, `ui-kit-terminal`, `mascot`: every component.
- `page`: DOM execution half of the page plane.
- `embed`: bootstrap.
- `extension`: manifest contract + client host; extensions add oRPC routers server-side.
- Deleted: `packages/widget`, `packages/api-client`, the TrailBase `@conciv/db` plane (replaced by
  core-internal drizzle + contract procedures).
- `publish/guards.ts` `PUBLIC_PACKAGES` updated to match.

## Composition, not registration

No `register*` APIs anywhere. Embed renders a static JSX tree; extension contributions are data
collected from manifests. Panes render `<For each={usePanes()}>`; each pane owns its `useChat`;
session switch is component swapping, never connection surgery. Provider order at the root:
`EnvironmentProvider(shadowRoot)` → theme → query client → host context. All async data resolves
through TanStack Query with skeletons and error boundaries with retry; the fab renders instantly.

## Testing and rollout

Order: contract + core storage/oRPC mount → backend changes 1–6 with ITs → component moves into
ui-kits → `page` + `embed` → rewire built-in extensions (terminal, test-runner, whiteboard) →
`git rm -r packages/widget packages/api-client` in the same task.

- Core ITs: real sqlite file, real oRPC client, event-iterator resume (kill and re-attach
  mid-turn). Procedure-level tests use oRPC's `call()` for direct invocation, no HTTP.
- `extension-testkit` fake host: `implement(contract)` mock handlers — contract-typed test doubles
  instead of a hand-built fake server.
- Drizzle↔zod pins: `expectTypeOf` type tests in the contract package.
- Widget ITs move to `embed`: real browser against the prebuilt bundle, `browser.newPage()`,
  `domcontentloaded` (never `networkidle`).
- Gates: `pnpm typecheck && pnpm build && pnpm test`, `fallow audit --changed-since main` clean of
  INTRODUCED findings.

## Risks and open questions

- oRPC maturity: verify the Hono adapter body-parse proxy and event-iterator resume against our
  Hono version early (first spike of the implementation plan).
- Event-iterator fan-out: one iterator per open browser tab per stream; core already handles
  multi-subscriber replay in `turn-hub`; sessions/panes live streams reuse the same pattern.
- `node:sqlite` is flagged experimental on Node 22 (`--experimental-sqlite`); every entry point
  that opens the db (core server, vitest, CI) must carry the flag until the Node floor rises.
- Draft typing latency: composer input is local UI state while focused; the drafts row is a
  debounced intent. Reconciliation rule: server row only replaces local text when the composer is
  not focused.
