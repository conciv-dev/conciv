# Moving conciv onto Devframe

- **Author:** Omri Katz
- **Status:** Proposed
- **Date:** 2026-11-01

---

## Overview

conciv is a dev-time agent widget. It runs an engine (a Node server next to the user's dev
server) and a Solid widget injected into the user's page. Between the two, conciv maintains
its own plumbing: an oRPC contract and clients, a live push channel, a tool registry, an MCP
endpoint, terminal sessions, editor opening, and per-extension routers and websocket routes.

Devframe (`devframe` and `@devframes/*`, 1.3.0) is a library for building dev tools that
already ships most of that plumbing: two-way RPC over one WebSocket, shared state, streams,
browser login, an MCP route generated from function metadata, docks, commands, messages,
terminals, and ready-made plugins. Vite DevTools is built on it.

This design moves conciv's plumbing onto Devframe: the engine runs one Devframe hub, conciv
core and every conciv extension become Devframe plugins, and the widget becomes a Solid
interface for that hub. Chat stays on `@tanstack/ai`. A spike (branch `spike/devframe-rpc`,
never merged) proved most pieces; what is unproven is listed under Risks and Open Questions.
The source notes are in `docs/specs/devframe-migration.md`.

## The Problem

conciv owns code that is not its product:

- **Transport and RPC.** The oRPC contract has 40 procedures in 11 groups, plus clients,
  TanStack Query wiring, a push channel for server-to-page calls, and per-extension
  routers and websocket routes. About 3,000 lines across these areas exist only to move
  data between the engine and the page.
- **Agent surface.** The tool registry and its walkers (about 930 lines) and the MCP
  endpoint's listing and calling (about 270 lines) re-implement what Devframe derives from
  `agent` metadata on each function.
- **Missing pieces we would otherwise build.** Browser login for the engine (issue #648),
  settings sync between tabs, a shared terminal model, and a plugin model that other tools
  can host. Each would be new conciv code.

The proposed solution: adopt Devframe as the transport, plugin model and agent surface, keep
a thin conciv layer for the parts Devframe does not have (chat, code mode, approvals, cards,
slots), and remove conciv's own versions one group at a time while both paths keep working.

## Goals

- **One transport for tools.** Every engine-to-page call outside chat goes through the
  Devframe hub. At the end, `@orpc/*` and the oRPC parts of `@conciv/contract` are deleted.
- **One plugin model.** Every published conciv extension (terminal, test-runner, ios,
  recorder, page, tanstack, design, whiteboard) is a Devframe plugin built with
  `defineConcivPlugin`.
- **Agent tools from metadata, one way in.** Server and page tools are Devframe functions
  marked `agent`. conciv's `/api/mcp` endpoint stays the only agent entry point: it reads
  Devframe's agent host as an in-process registry and keeps code mode and the approval
  gate. Tool names do not change, so prompts and saved chats keep working.
- **Browser login on every host.** The engine refuses untrusted browsers (#648). Plugin
  iframes share the page's stored login because the hub is served on the page's own
  origin on Vite, Next (webpack and Turbopack), webpack-dev-server and Rspack. No login
  token is ever put in an iframe URL. Each host limits the hub to the local machine as far
  as that host allows (table in Technical Plan).
- **conciv alone, or inside Vite DevTools: the user's choice.** conciv-only is the default
  and works fully. A user with Vite DevTools can show conciv as a dock there, and a
  setting switches between the two.
- **Working after every PR.** Each PR passes the checks in the Verification Plan, with some
  groups and extensions on Devframe and the rest on the old path.
- **Less plumbing of our own.** The case for this migration is login, a plugin model and
  agent tools from metadata, not a line count. New code (forwarders, Solid hub interface,
  login gate, restart handling) offsets part of what is deleted; the real net figure is
  measured after PR 1 and at the end.
- **Tests verify behavior through real plumbing.** Each migrated piece is covered by tests
  that run a real hub and a real client (headless browser for widget and page paths), with
  no mocks, inside the existing one-node-plus-one-browser test file budget per package.

## Non-Goals

- **Chat transport.** The chat plane stays on `@tanstack/ai` (transport, persistence, runs).
  It moves under the separate TanStack AI adoption lane, not this one.
- **Devframe's Vue interface.** conciv does not ship `@devframes/hub-ui`. The widget stays
  Solid and keeps its look. A Vite DevTools look, if wanted later, is a conciv theme.
- **Code mode and approvals.** `execute_typescript`, `discover_tools`, the approval gate,
  result caps and chat mirroring of MCP calls stay conciv's.
- **Page inspection internals.** DOM targeting, element captures, React inspection and
  screenshots keep their implementation; only their transport changes.
- **The #572 settings design.** Set aside. The new settings page follows
  `docs/specs/devframe-settings-mockup.html`.
- **Back-compat shims.** conciv is pre-release (v0) with no external users. Internal APIs
  change freely; no compatibility layer for `defineExtension` survives the migration.
- **Upstream changes to Devframe.** Gaps are covered in the conciv layer or by small local
  patches, not by waiting on upstream releases.
- **Rsbuild.** conciv has no Rsbuild entry today. A small plugin can add it later.
- **Merged Vite DevTools mode.** conciv tabs and login inside Vite DevTools' own hub wait
  until Vite DevTools ships Devframe 1.3.0 (it is on 1.2.6), as a separate PR.
- **WebMCP and Devframe's own MCP route.** Both stay off (see Agent surface).

## Terms

- **Devframe:** see its docs at the source clone or package README. A _devframe_ is one
  plugin definition (`DevframeDefinition`); this document says _plugin_. A _hub_ hosts
  plugins. A _dock_ is a tab in the hub's tab bar. _Shared state_ is server state synced to
  every client. A _stream_ is a server-to-client feed. A _page-script function_ is a
  function a browser tab registers so the server can call it.
- **Harness:** the coding-agent CLI conciv drives (Claude Code, Codex, and so on).
  _Harness children_ are the processes conciv starts for it.
- **Code mode:** the agent reaches tools through two MCP tools: `discover_tools` lists them
  and `execute_typescript` runs a script that calls them. _Approval gate:_ tools marked
  `approval: 'ask'` need the user's yes. _Result caps_ limit reply size. _Chat mirroring_
  shows MCP calls in the chat.
- **Slots, cards, attachments, connect gate:** conciv-only extension parts: UI placed
  inside the panel, tool-result views in chat, chat attachments, and a check that must pass
  before a session connects.
- **Chat plane:** conciv's chat transport on `@tanstack/ai`. It moves under separate
  TanStack AI adoption work, not here.

## Risks and Open Questions

- **Young dependency.** Devframe moves fast. Mitigation: exact version in the pnpm catalog,
  and the existing local-patch policy if it stalls or breaks. No exit plan beyond that.
- **Bundle size.** The Devframe client runtime enters the widget bundle. Measured once in
  PR 1 against `packages/bundle-size`.
- **Large payloads.** A 1 MB call was 1.5 to 2.5 times slower than oRPC in the spike; the cause
  is unprofiled. Recorder keyframes, captures and design frames are measured before PRs 7
  and 13. A fallback (streams) is designed only if a measurement fails.
- **Internal API.** One call into `devframe/node/hub-internals` remains (reading trusted
  tokens for the `/api` gate), in one file, rechecked on every Devframe upgrade.
- **Delegate auth object.** Passing `createInteractiveAuth`'s result through an object filled
  in `configure` is read from source, not run; first step of PR 1. Fallback: seed the token
  through `hub-internals` as the spike did.
- **Fault-helper plugin.** Needs a check that Devframe lets a plugin wrap registered
  functions; first step of PR 1. Fallback: Playwright `page.routeWebSocket`.
- **Vite DevTools live switch.** Whether Vite DevTools 0.8.0 honors a live `when` change on a
  dock is unverified; a `plugin.it` case proves it. Fallback: the switch applies on restart.
- **Token in URLs.** Devframe's client puts the browser token in the WebSocket URL on every
  host, and the `/t/<token>` gate puts tokens in engine URLs. Tokens must not reach logs:
  the engine strips `/t/<token>` and `devframe_auth_token` from anything it logs.

## Technical Plan (Architecture)

### Shape at the end

```text
host page (user's app origin)                    engine (node, 127.0.0.1)
-----------------------------                    ------------------------
conciv widget (Solid, shadow root)               Hono server
  devframe client runtime  --- WS /__conciv/__ws --->  /__conciv/  Devframe hub (initHub)
    dock bar, palette, toasts, settings                    conciv core devframe
    plugin iframes (same origin, shared login)             conciv plugins (terminal, recorder, ...)
  chat  ---------------- @tanstack/ai WS ----------->      Devframe plugins (messages, terminals)
                                                           services: conciv:host, open, shiki, git
host dev server (Vite / Next / wds / Rspack)             /api/chat   @tanstack/ai (stays)
  forwards /__conciv/* to the engine,                    /api/...    oRPC (shrinks to zero)
  loopback clients only                                  MCP route   Devframe agent host
                                                                     + conciv code mode and gate
```

The widget and every plugin iframe talk to the hub from the page's own origin. The browser
therefore keeps one stored login per origin, and iframes reuse it without any token passed
to them.

### Components

**1. The hub in the engine.** `packages/core` creates one hub with `initHub` under
`/__conciv/`, next to the existing Hono routes, sharing the database, harness and runtime
objects. Defaults: Messages and Terminals plugins on; the `open` service installed;
everything else opt-in through `conciv({devframes: {add}})` (a new `devframes` field on
`ConcivConfig` in `packages/protocol/src/config-types.ts`). `initHub` gets `mcp: false`:
leaving it out turns Devframe's route on with no login. `makeApp` owns the plane, because
it needs `chat`, `serverSessions` and `serverHarness`, and returns `{hub, claimUpgrade}` on
`BootedApp`; `serveApp` and `start()` pass them on, and `Engine` gains `hub` and `apiBase`. `allowedOrigins` comes from the same list the engine uses today.

WebSocket upgrades: `serveHono` gains a `claimUpgrade(req, socket, head)` option. It wraps
Hono's `upgrade` listener so Hono stays the only listener: hub paths go to
`hub.handleUpgrade`, everything else to Hono, which keeps rejecting unmatched and forbidden
upgrades. `hub.attach` is not used on the engine. On shutdown, `dispose` terminates agent PTY
sessions and calls `hub.close()` before the server closes; clients see close code 1006, which
the reconnect wrapper treats like any drop.

**2. Same-origin serving per host.** The hub answers on the page origin, limited to the local machine as far as each host allows:

| Host                                    | Mechanism                                                                                                                                                                                                   | Loopback guard                                                                                                                                                                                                     | Status                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Vite                                    | `server.middlewares.use` plus an `upgrade` listener calling `hub.handleUpgrade`                                                                                                                             | Real socket check on `req.socket.remoteAddress`, on both                                                                                                                                                           | Proven (spike), guard not yet built               |
| Vite with Vite DevTools (user's choice) | conciv keeps its own hub and shows as one dock in Vite DevTools (existing #649 path). A merged mode (conciv tabs and login inside Vite DevTools' hub) is a later PR once Vite DevTools is on Devframe 1.3.0 | conciv's own guard and login                                                                                                                                                                                       | Dock works today                                  |
| Next (webpack and Turbopack)            | `rewrites().beforeFiles` maps `/__conciv/:path*` to the engine; `skipTrailingSlashRedirect: true` plus the user-facing slash redirect re-added outside `/__conciv/`                                         | `has` on the Host header (localhost, 127.0.0.1, [::1]). Next gives rewrites no socket address, so a LAN client forging Host gets through to the login, which still refuses it. Stops other sites and DNS rebinding | Proven, both bundlers and a packed install        |
| webpack-dev-server, Rspack dev server   | Our plugin hook prepends one entry to `compiler.options.devServer.proxy`: `pathFilter`, `ws: true`, engine origin looked up per request                                                                     | Real socket check with Node's `BlockList`                                                                                                                                                                          | Proven                                            |
| esbuild, rollup                         | No dev server to forward through. The widget reads the engine origin from `conciv-api-base`, as today, and talks to the hub there                                                                           | Engine binds 127.0.0.1                                                                                                                                                                                             | Plugin iframes unavailable: hidden on these hosts |

**3. The conciv layer** (in `@conciv/extension`, replacing most of that package):

- **`conciv:host` service.** One in-process service the engine provides and every conciv
  plugin reads with `ctx.services.whenAvailable`. It carries `cwd`, `stateDir`, sessions
  (resume token, busy state, model, `onChatTurn`), harness (TTY command, connect plan),
  symbolication, the bundler bridge and the latest session. It replaces the `ServerApi`
  object passed to `extension.__server(...)` today.
- **`defineConcivFunction`** (about 110 lines in the spike). Wraps `defineRpcFunction` to
  close three gaps: it parses arguments with zod so defaults and transforms apply
  (Devframe only rejects invalid input), requires a `returns` schema so client types are
  not `void`, and throws errors as a plain object `{concivError, code, message, data}`
  because structured-clone keeps only an Error's name and message. `concivRpcOptions()`
  gives the client a `deserialize` hook that rebuilds `ConcivError`; Node clients use
  `fromWireError`. `concivCall(client)` types calls against hub, plugin and conciv names
  together, since Devframe's two type views do not merge.
- **`defineConcivPlugin`.** A builder using the existing extension splitter:
  `defineConcivPlugin({id, title, configSchema, systemPrompt, approval, connectGate, dock})`
  `.server((ctx, host, config) => ...)` `.client({views, Surface, Component, cards,
  attachments, tools})`. The server half is a `DevframeDefinition` with node-safe fields.
  The client half is a plain object with today's client shape, so tabs, slots and cards
  work unchanged. Solid never enters the server entry.

  Packages keep today's exports (`.`, `./client`, `./server`). Discovery is unchanged:
  builtins in `packages/it/src/plugin-instance.ts`, the user's `conciv/extensions/*`
  folder, and Next's generated entry. `start()` partitions what it loads: legacy
  extensions go to `makeApp`, plugins go to `initHub({devframes})`, on every host.

  | Today                                                 | On Devframe                                                                |
  | ----------------------------------------------------- | -------------------------------------------------------------------------- |
  | `.server()` router                                    | functions registered in `setup(ctx)`                                       |
  | `.server()` Hono routes and websockets                | functions plus streams                                                     |
  | `.server()` context, dispose, turnEnd                 | shared state or a service; hub teardown; `conciv:host.sessions.onChatTurn` |
  | `views`, `Surface`, `Component`, cards, attachment UI | unchanged, in the client half                                              |
  | attachment `__expand`                                 | returned from `.server()`, read by `createChatPlane`                       |
  | server-bound `tools`                                  | `defineConcivFunction` with `agent`                                        |
  | client-bound `tools`                                  | page-script function with `agent`                                          |
  | system prompt, `approval: 'ask'`, connect gate        | fields on the definition                                                   |

  A `conciv-view` dock type is not needed: the existing tab bar renders `views`.

- **Sessions.** `defineConcivFunction({session: true})` adds an optional `sessionId` to the
  single input object. The wrapper resolves it (explicit value, then the ambient scope that
  MCP and code mode already set, else error `NO_SESSION`) and runs the handler inside
  `host.inSession(id, ...)`, which calls `runWithSession`. Applies to today's 14 `sessionOs`
  procedures. The widget and `ext-rpc` merge the active session; the CLI's `withSession`
  merges `CONCIV_SESSION_ID` at PR 20. `/api/mcp` keeps `CONCIV_SESSION_HEADER`.

- **Widget approval exemption.** Today `widgetCaller` trusts a forgeable Origin. Under
  Devframe the caller's token identifies it: `ctx.rpc.getCurrentRpcSession()?.meta
  .clientAuthToken` is a browser login token for a tab and the engine token for the CLI or
  an agent. `isBrowserCaller(ctx)` in `packages/core/src/devframe-trust.ts` decides; no
  session means not a browser, so the call is gated. The oRPC side keeps `widgetCaller`
  until PR 20.

- **Node client.** Devframe's high-level client reads `location`, so tests, the CLI and
  harness children use `createRpcClient` over WebSocket or SSE with the engine token.

- **Restart handling.** A reconnect wrapper rebuilds the client on disconnect (25 lines in
  the spike). On top of it: every open stream ends with a `DISCONNECTED` error instead of
  hanging, stream owners reopen from current state, and shared state is re-read. The
  connection status feeds the existing offline logic (`packages/client/src/reachability.ts`,
  TanStack Query's `onlineManager`), which stays. A login made in the last 100 ms before a
  stop is lost (Devframe's debounced store); the design accepts that.

**Modes.** conciv-only is the default on every host. With Vite DevTools installed, conciv keeps its own hub and can show as one dock there (the #649 path). The setting `panel.surface` (`page` or `dock`, shown only when Vite DevTools is present, default `dock` there) switches between them. The Vite plugin subscribes to it, flips the dock's `when`, invalidates the extensions module and sends a full reload, so no dev-server restart is needed; page state is lost on the switch.

**4. The widget as a hub interface** (`apps/conciv`, Solid, over
`createDevframeClientRuntime`):

- Dock bar merged into the existing bottom tab bar. Rules from the spike: key docks by id,
  keep opened docks mounted and hide them with a class, hide `when: 'false'` docks and the
  auto-created iframe dock of a devframe with no `clientAssets`, call
  `docks.switchEntry(id)` on selection. The tab bar shows `views` as today plus Devframe
  `iframe` docks.
- Palette (cmd+K) over hub commands; toasts from the Messages plugin feed.
- Authorize card for #648 with Devframe's native `prompt()` off (`simpleAuth: false`),
  shown only when the status is `unauthorized`.
- Settings page per `docs/specs/devframe-settings-mockup.html`. Tabs and Shortcuts edit
  Devframe's shared `devframe:user-settings`, so they match Vite DevTools. conciv's own
  settings live in Devframe's per-project store (`ctx.scope('conciv').settings.project`),
  already synced to every tab as `devframe:settings:project:conciv`. Accepted limits: no
  global layer, writes debounced 100 ms and not flushed on shutdown, file comments not
  kept, hand edits show after a restart.

**5. Agent surface.** Today `packages/core/src/api/mcp.ts` exposes only `discover_tools`,
`execute_typescript` and `approval: 'ask'` tools, and that stays. Server tools are
`defineConcivFunction`s with `agent`; page tools are page-script functions with `agent`.
`/api/mcp` stays on its own server (spike commit `4f62c00b7`). Devframe's route cannot replace it: it lists every `agent` function, including those of Devframe's own Terminals and Messages plugins, has no tool filter, and fixes its instructions at startup while conciv's are per session. Running Devframe's handler on our path works but swaps about 55 lines of SDK wiring for about 100 of ours. Revisit if Devframe adds a tool filter and per-request instructions. Devframe's agent host is used as an in-process registry that `/api/mcp` reads, plugin tools included: agents reach Devframe plugin tools (Terminals, Messages, and any opted-in plugin) through code mode, mirrored and capped. They carry no conciv approval; the harness's own permission mode governs them (decided 2026-11-02). Existing `approval: 'ask'` tools keep their gate. Devframe's
MCP route (`mcp: false`) and WebMCP (`webmcp: false` on the widget's client) stay off, and
plugin iframes never register agent functions. conciv functions are never registered as agent tools in
Vite DevTools' hub, so nothing reaches a tool around the approval gate. The registry's public
types (`@conciv/extension/registry`, used by code mode and `packages/tools`) stay. The old
registry runtime keeps working until every extension has moved: plugin tools are bridged
into it by name, with `mirrors`, `keywords`, `positional`, `icon`, `label` and `reachable`
carried in the `agent` metadata. It is replaced in PR 20.

### Migration path (both paths live until the end)

```text
PR 1a hub beside oRPC, conciv layer, forwarding, testkits; no gate, product unchanged
PR 1b widget login and the /t/<token> gate turn on together, with test and e2e updates
PR 2..9  core procedure groups move, one or two per PR:
        sessions, meta, drafts+markers, navigation, editor, captures+page,
        registry+server (with the agent surface), chat non-streaming
PR 10..18  extensions move, one per PR:
        terminal, test-runner, ios, recorder, page, tanstack, design, whiteboard, try-it
PR 19  settings page (mockup), on Devframe's settings store, with the mode switch
PR 20  delete oRPC, push channel, old registry runtime, old extension runtime
```

- **Engine:** hub and oRPC run in one process, behind one gate (Security). Each group
  publishes shared state only in the PR that moves it, so each TanStack Query key has one
  writer.
- **Widget data layer:** components keep calling
  `appData.utils.<group>.<proc>.queryOptions()`. `makeAppData` gets a second backend; a
  moved group's options call Devframe instead of oRPC, and its shared state is written into
  the same TanStack Query keys. Direct `rpc.*` callers of a group in the widget move in that
  group's PR. The oRPC procedures themselves stay until PR 20, sharing one implementation
  with the Devframe function, so the CLI, embed, extensions and tests keep working.
- **Extensions:** the engine mounts legacy `defineExtension` extensions and new
  `defineConcivPlugin` plugins side by side; the widget shows both in one tab bar; tools
  from both feed code mode and MCP (plugin tools bridged into the old registry by name
  until the agent surface moves). An extension moves in one PR with the same tool names.
- **Push channel:** page queries move with `captures`/`page` to "server asks one tab"
  calls. The oRPC `page.queries` and `page.reply` procedures keep reading the old bus until
  PR 20, so the bus stays too. Chat events become a Devframe stream in PR 9; the
  `@tanstack/ai` chat transport itself is not touched.
- **Terminal:** Devframe's Terminals plugin is the default viewer. The extension starts the
  agent as a hub PTY session and keeps resume, busy detection, injection, idle eviction and
  respawn on the server. conciv's own terminal view is kept, ported onto the hub PTY
  stream, but disabled by default (decided 2026-11-01): turning it on in config shows the
  agent session there and hides it from the Terminals plugin, so one PTY never has two
  viewers. The model picker, view lock, element paste and "open in OS terminal" stay in
  conciv's view. Child env vars are unset through
  `/usr/bin/env -u` because the hub merges `process.env` into children.

### Security

| Credential          | Created by                                                                    | Held by                                                                                                                                                                                                                                                      | Checked where                                                         |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Engine token        | Engine at startup (`randomUUID`, or `accessToken` when given), new each start | `.conciv/mcp-endpoint.json` (mode 0600), `CONCIV_TOKEN` for harness children, native pages and `~/.conciv/dev-endpoint.json` (mode 0600). Never in `server.json` or browser-facing links. A logged-in browser can request a connect command that contains it | `/t/<token>` gate; Devframe `clientAuthTokens`                        |
| Browser login       | One-time code, then a token stored by Devframe                                | Browser localStorage per origin; `.conciv/devframe/global/auth.json`                                                                                                                                                                                         | Devframe; `/t/<token>` gate reads the live store, so revocation works |
| Vite DevTools login | Vite DevTools                                                                 | Vite DevTools                                                                                                                                                                                                                                                | Vite DevTools only; conciv's dock still needs conciv's login          |

- **Gate.** The existing `/t/<token>` prefix becomes permanent for every engine route
  except `/__conciv/*` (Devframe's own login), `/health` and `/native*`; anything else gets 401. CLI, MCP and harness children read the token and use the prefixed base, so their code
  barely changes; `/api/chat` stays gated after PR 20. The fetch wrapper rewrites the path
  at runtime because Hono's `.mount` prefix is static.
- **Two bases.** The widget gets a hub base (the page origin on forwarding hosts, the engine
  on esbuild and rollup) and an API base (the engine), through `conciv-api-base-hub` beside
  the existing meta tag, and `window.__CONCIV_HUB_BASE__` on Next.
- **Server-built links stay token-free.** `basePath` stays empty. The prefixed base is a
  separate `agentBase`, used only for the CLI, agents and native pages. Links the server
  gives the widget (such as the xray URL) are paths the widget prefixes with its own API
  base.
- **Widget.** It logs in first, then uses `${engine}/t/${browserToken}` as `apiBase`, the
  same token-in-one-URL pattern Devframe's own WebSocket uses (decided 2026-11-02). Every
  call derives from `apiBase`, so no call site changes. On try, native and tests, where
  `apiBase` already has `/t/`, the hub client takes that segment as `authToken`. A trust step runs before
  `bootNormal` in `packages/embed/src/mount-impl.tsx`, since a gated widget cannot paint
  without it.
- **Same origin.** Scripts on the app's origin can read the stored login and act as the
  user, including terminals. This is no worse than today, where the widget's routes are
  open on the machine.
- **Limits.** A process that can read `auth.json` can act as a browser; Devframe sets no file
  mode on it. Engine binds 127.0.0.1.

### Testing

Test rules stay as in AGENTS.md: one node and one browser test file per package (core and
apps/conciv allow three), no mocks, real browser for widget and page paths, testkits share
real plumbing. Devframe publishes no testing helpers, and its own tests rely on `vi.fn` and
`vi.mock`, so conciv reuses Devframe's plumbing (`initHub`, `createRpcClient`, the
WebSocket and SSE channels) but not its test style.

**What depends on oRPC today.** Two testkits carry almost all of it:

| Testkit piece                                                                                           | Used by                                                                        | Under Devframe                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness-testkit` `create-testkit.ts` (`Kit.rpc`, built from `session.ts`)                              | every `bootCoreKit` user; core, cli, client, embed, apps/conciv, extension ITs | `Kit.rpc` becomes a Node Devframe client (`createRpcClient` plus `createWsRpcChannel` with the engine token). One edit reaches most callers.                                                                     |
| `harness-testkit` `rpc-websocket-client.ts`, `rpc-mounts.ts`                                            | terminal, test-runner, whiteboard tests                                        | Replaced by a "serve one plugin in a real hub" helper (`initHub({auth: false, devframes: [plugin]})`) plus the Node client. The session moves from a per-call header into the call input.                        |
| `harness-testkit` `call-tool.ts` (approvals, coded-error checks)                                        | every extension IT, core-api.it, core-chat.it                                  | Approvals become a stream subscription plus a call; `code === 'APPROVAL_DENIED'` checks go through `fromWireError`/`ConcivError`. `/api/mcp` does not move.                                                      |
| `extension-testkit` `get-extension-test-api.ts`                                                         | whiteboard, terminal, try-it, recorder, tanstack                               | Public and documented (site docs, `conciv-develop` skill). Keep its shape, swap its internals.                                                                                                                   |
| `extension-testkit` `rpc-fault.ts`, `rpc-observer.ts`, `rpc-counts.ts`, `rpc-wire.ts`, `rpc-payload.ts` | apps/conciv core-control and browser tests, embed.it, recorder, whiteboard     | **Breaks entirely.** These use `page.route` on HTTP `/rpc/*`; Devframe calls are frames on one WebSocket, so `page.route` sees nothing and tests hang instead of failing. Rebuilt as a test-only plugin (below). |
| `extension-testkit` `push-wire.ts`, `page-plane.ts`, `connect-handshake.ts`                             | core-control, embed, tanstack, design.it                                       | Re-point in the PR that moves `captures` and `page` (PR 7).                                                                                                                                                      |

About 140 direct `rpc.<group>.<proc>` call sites exist in tests, 78 of them in
`core-api.it.test.ts`; they change with `Kit.rpc`, not one by one.

**Tests that check oRPC itself (deleted or rewritten in the PR that removes the code they
cover):** `contract.test.ts` client and session-header cases; client `isReachabilityError`
and push-channel cases; extension `rpc websocket route` and tool-registry `ORPCError` code
cases (rewritten to `ConcivError` codes); type pins in `extension-registry.test-d.ts`,
`tool-registry.test-d.ts`, `page-error-map.test-d.ts` (replaced by `defineConcivFunction`
pins); harness-testkit's oRPC stream-abort case; core-api.it's `cors`, `api rpc fetch`,
`api extension router` and mount-isolation cases; cli's fake oRPC error body; apps/conciv's
hard-coded `/rpc/drafts/*` paths; plugin.it's waits on `/rpc/navigation/set`; terminal's
WebSocket and code cases (mostly gone with the terminal UI). The large `rpc wire` block in
core-api.it (chat turns, approvals, sessions, code mode, restart) keeps its behavior checks
and moves onto the Devframe client group by group.

**Shared plumbing to build in PR 1** (in testkit `src/`, not test files):

- `nodeClient({url, transport, token})`: the base of `Kit.hub`, which replaces `Kit.rpc`.
- `serveDevframePlugin(plugin)`: one plugin in a real hub, replacing `serveExtensionRpc`.
- A probe bundle plus host page for browser checks. The spike builds it twice (esbuild in
  core, a Vite build in plugin); keep one.
- `trustedTab`: a real browser login through the one-time code (`getTempAuthCode` from the
  public `devframe/node/auth`).
- `concivCall`, `fromWireError` for coded-error checks.
- Fault and observe helpers as a test-only plugin (decided 2026-11-01). The testkit
  registers its own plugin into the hub that wraps the functions under test to fail,
  hold, gate or count them by name. Nothing is added to the engine or any shipped package,
  and it does not depend on Devframe's wire format, so it works the same for Node clients,
  Playwright pages and Vitest browser mode. Needs a spike check first: that Devframe lets a
  plugin wrap another plugin's functions after registration. Rejected: Playwright
  `page.routeWebSocket` with frame decoding (tied to Devframe's internal wire format, may
  not exist in Vitest browser mode) and a testkit WebSocket proxy (same format coupling,
  plus an extra hop in front of same-origin forwarding).

Spike-only, not carried over: the speed comparison, the "what survives a restart"
exploration, `console.log` reports, the "browser client fails in Node" case, the "oRPC still
works beside it" case. Plugin-package-only: the dev-server Host and upgrade probes.

**Per-PR rule.** Every migration PR moves the tests of what it moves, in the same PR: a
procedure group's behavior cases in core-api.it switch to the Devframe client; an
extension's cases run its plugin in a real hub through `getExtensionTestApi`. No PR leaves a
behavior uncovered between the two paths. The final cleanup PR deletes what is left of the
oRPC-shaped tests.

**Flake rules for the new transport:**

- No `page.route` or URL waits for RPC; observe frames or app state instead.
- Any test that restarts the engine uses the reconnect wrapper and a stream timeout,
  otherwise it hangs.
- Wait more than 100 ms after a browser login before stopping the engine, or use the
  engine token; Devframe's trust store write is debounced.
- Browser clients retry the first connect (engine boot races the page).
- `browser.newPage()`, not `newContext()`; `domcontentloaded` or UI signals, never
  `networkidle`; no `console.log` in tests. The spike breaks the last three and is fixed
  when it becomes real tests.
- Every Devframe upgrade reruns the `/api` gate tests first, since reading trusted tokens goes
  through unstable `hub-internals`.

**Test-file budget.** Every package fits its existing files except core, which is at 3 of 3
(`core-api.it`, `core-chat.it`, `core.test`). Decided 2026-11-01: PR 1 merges `core-chat.it`'s
11 cases into `core-api.it`, and the freed slot becomes core's browser test file, holding
the spike's Devframe checks rewritten to the repo rules. Node checks then live in
`core-api.it` and `core.test`, browser checks in one file, so only that file needs Chromium.
Accepted risk: the TanStack AI lane may rewrite the moved chat cases soon after. Rejected:
folding browser checks into `core-api.it` (mixes node and browser, every shard running it
needs Chromium) and raising core's cap to 4 (weakens the budget rule). apps/conciv is also
at 3 of 3, so the shell browser test (dock switching, palette, toasts) goes into
`conciv.browser.test.tsx`.

**CI.** Browser suites already run on the Chromium shards; core joins them by adding `playwright` to its devDependencies (`packages/vitest-config/src/shards.ts`). Four `describe` runs add dev-server boots
(Next with both bundlers, webpack-dev-server, Rspack) to `plugin.it`, each tens of seconds;
they stay in that package's existing file.

## Alternatives Considered

### Alternative A: Keep oRPC and build the missing pieces ourselves

- **Pros**: No new runtime dependency. oRPC gives typed errors with codes and data, parsed
  inputs, and Node clients with no extra code. The existing tests and testkits keep working.
- **Cons**: conciv would build and own browser login (#648), settings sync between tabs, a
  shared terminal model, a plugin model other tools can host, and an MCP surface that
  derives from function metadata. Inside Vite DevTools users would still see two servers,
  two logins and two dock bars.
- **Reason for Rejection**: Every piece on that list already exists in Devframe and was
  proven in the spike, and the plugin model makes conciv tools usable beside other Devframe
  tools. The cost is the conciv layer and restart handling; the net line count is measured
  after PR 1.

### Alternative B: Devframe only inside Vite DevTools, oRPC everywhere else

- **Pros**: Smallest change. conciv registers into Vite DevTools' hub when it is present and
  keeps its own stack otherwise.
- **Cons**: Two transports, two plugin models and two auth paths forever, one per host.
  Every extension would need both shapes, and tests would have to cover both.
- **Reason for Rejection**: It doubles the surface instead of shrinking it, and still leaves
  login, settings sync and the agent surface to build for non-Vite hosts.

### Alternative C: Ship Devframe's own interface (`@devframes/hub-ui`)

- **Pros**: Docks, palette, toasts and the settings screen (Docks, Appearance, Shortcuts,
  Advanced) come ready-made and match Vite DevTools exactly.
- **Cons**: It is a Vue app; the widget is Solid. Two UI frameworks would ship in one
  widget. conciv's look lives in component shapes, not tokens; a tokens-only skin was
  tried on 2026-10-31 and looked the same as the default. Its settings screen does not fit
  a 480 px panel (tabs clip at 420 px).
- **Reason for Rejection**: conciv draws the hub interface in Solid over
  `createDevframeClientRuntime`. A Vite DevTools look, if wanted, becomes a conciv theme.

### Alternative D: Keep conciv's terminal dock next to Devframe's Terminals plugin

- **Pros**: Keeps the model picker, view lock, element paste and "open in OS terminal"
  inside the terminal view.
- **Cons**: One PTY shown in two viewers at different sizes breaks the CLI's drawing; the
  spike reproduced it with the agent session open in both.
- **Reason for Rejection**: Running both at once is rejected. conciv's view is kept but
  disabled by default; when enabled, the agent session is hidden from the Terminals plugin,
  so there is only ever one viewer.

### Alternative E: Hand the login to plugin iframes in the URL (`buildRemoteDevframeUrl`)

- **Pros**: Native to Devframe, about 3 lines, works across origins.
- **Cons**: The full login token travels in the iframe URL fragment, where it can reach
  history, extensions and screenshots.
- **Reason for Rejection**: The hub is served on the page's own origin on every host
  instead, so iframes reuse the stored login and nothing is handed over. Also rejected:
  `postMessage` hand-off (only works for iframes that listen, which Devframe's own plugin
  pages do not) and a one-time code in the URL (one engine-wide code shared with the
  terminal banner, still a secret in a URL).

### Alternative F: Stable-only Devframe API for the Node client

- **Pros**: No dependency on `devframe/node/hub-internals`, which Devframe marks unstable.
- **Cons**: The public static-token path (`createInteractiveAuth` with `clientAuthTokens`)
  needs the hub context before `initHub` accepts it, and passing a context to `initHub`
  forbids the `devframes` list. A custom auth handler might work but is unproven.
- **Status**: Mostly resolved. The public `createInteractiveAuth` works through a delegate
  object filled in `configure` (Risks), which also stops the spike's leak of one permanent
  trusted token per restart. Only reading trusted tokens for the `/api` gate still uses
  `hub-internals`.

### Alternative G: Fault and observe test helpers on the wire

- **Pros**: Tests see the real frames; no plugin needed.
- **Cons**: Playwright `page.routeWebSocket` and a testkit WebSocket proxy both decode
  Devframe's internal wire format, which can change on any upgrade; the proxy adds a hop
  in front of same-origin forwarding; Vitest browser mode may not offer `routeWebSocket`.
- **Reason for Rejection**: The testkit registers a test-only plugin that wraps functions by
  name instead.

---

## Detailed Implementation Plan

Each PR passes the Verification Plan and leaves the product working. Spike code on
`spike/devframe-rpc` is a reference only; every file is rewritten to repo rules (no code
comments, functions not classes, no `as`, no mocks). All paths are from the repo root.

Fixed choices used below:

- Versions live in the pnpm `catalog:`; manifests use `catalog:`.
- Every Devframe function takes one input object (`args: [Schema]`); procedures with no
  input today use `z.object({})`.
- Core functions are named `conciv:<group>:<proc>`, registered unscoped through
  `ctx.rpc.register`. Plugin functions use `<plugin-id>:<name>`. Devframe itself rejects `:`
  inside `ctx.scope()`, so the wrapper does not check names.
- Error codes keep today's names (`NOT_FOUND`, `NO_BUNDLER`, `APPROVAL_DENIED`,
  `UNKNOWN_MODEL`, `UNKNOWN_REQUEST`, and so on).
- The #649 `PANEL_SHEET` fix is not in this plan; it ships on its own first.

### PR 1: Foundation, in two parts

**PR 1a (items 1-7, 10-12, 14-21, without the gate, login and token parts):** the hub runs
beside oRPC and nothing in the product changes. `Kit.hub` works. `mcp: false`,
`webmcp: false` and the agent-surface test land here.

**PR 1b (items 8, 9, 13 and the login-gate cases of item 19):** the widget login and the
`/t/<token>` gate turn on together. It also updates: `packages/extension-testkit/src/boot-server.ts`,
`widget-suite.ts`, `host/host-runtime.tsx`, the 13 `e2e/*/tests/widget.spec.ts` suites (one
`trustedTab` login step), `packages/core/test/core-api.it.test.ts` token cases,
`packages/core/test/core.test.ts`, direct URLs in `packages/try/test` and `packages/cli/test`,
`packages/harness-init/src/claude/endpoint.ts` (writes `token`),
`packages/plugin/src/core/widget-middleware.ts`, `packages/plugin/src/nextjs-widget.ts`,
`apps/conciv/src/lib/api-base.ts`, `apps/conciv/src/entry-standalone.tsx`, and
`packages/extensions/design/src/server.ts` and `client/frame.ts` (path, not URL). The wrapper
keeps `notifyClient`, forwards `env` to `app.fetch`, and sends CORS headers on its 401.

**First, two checks in the spike worktree; a failure uses the fallback in Risks:** the
delegate auth object, and a plugin wrapping another plugin's registered functions.

#### 1. `pnpm-workspace.yaml`, `packages/core/package.json`, `packages/extension/package.json`, `packages/plugin/package.json`, `apps/conciv/package.json`, `packages/harness-testkit/package.json`, `packages/extension-testkit/package.json`, each `packages/extensions/*/package.json` (Modify)

- **Type / Scope**: Dependencies.
- **Proposed Changes**: Add to the catalog: `devframe`, `@devframes/hub`,
  `@devframes/agentic`, `@devframes/plugin-messages`, `@devframes/plugin-terminals`,
  `@devframes/service-open`, all 1.3.0, and exempt `devframe` and `@devframes/*` in
  `minimumReleaseAgeExclude` until 1.3.0 is older than `minimumReleaseAge`. Each package
  declares what it imports. `@devframes/agentic` must be declared wherever `devframe` is,
  or pnpm resolves it to the 1.2.6 copy `@vitejs/devtools` brings and a second Devframe
  loads. Run `pnpm dedupe`. Core also adds `playwright` (`catalog:`) to devDependencies so
  its browser test file lands on a Chromium shard.

#### 2. `packages/extension/src/devframe-host.ts` (Create); `packages/extension/package.json`, `packages/extension/tsdown.config.ts` (Modify)

- **Type / Scope**: TypeScript module, export `@conciv/extension/devframe-host`.
- **Proposed Changes**: `CONCIV_HOST_SERVICE` and `ConcivHost`: `ServerApi`'s fields from
  `packages/extension/src/types.ts` (`cwd`, `stateDir`, `sessions: ServerSessions`,
  `harness: ServerHarness`, `symbolicate`, `bundler`, `basePath`), plus `nativeUrl`,
  `latestSession`, `config(id)` for a plugin's parsed config, and
  `inSession<R>(id: SessionId | undefined, run: (id: SessionId) => R): R`. Needs
  `import type {} from 'devframe'` so the service augmentation loads.

#### 3. `packages/extension/src/devframe-function.ts` (Create)

- **Type / Scope**: TypeScript module, exported from `@conciv/extension`.
- **Proposed Changes**: `defineConcivFunction({name, type, agent?, session?, input, output,
  handler})`: parses `input` with zod, requires `output`, sets `jsonSerializable: true`,
  with `session: true` extends the input and runs inside `host.inSession`. Handler signature
  `(input, {ctx, sessionId})`. `concivError(code, message, data)` factory plus a
  `ConcivError` type; thrown as `{concivError: true, code, message, data}`.
  `concivRpcOptions()` (client `deserialize` hook), `fromWireError(value)` for Node clients,
  `concivCall(client)` typed over both of Devframe's function-map interfaces. Reference:
  spike `packages/core/src/devframe-function.ts` (110 lines; it uses `{input, output}`).

#### 4. `packages/extension/src/devframe-plugin.ts` (Create); `packages/extension-compiler/src/split-extension.ts`, `extension-guard.ts`, `dedupe-extensions.ts`, `extensions.ts` (Modify)

- **Type / Scope**: Plugin API and compiler.
- **Proposed Changes**: The `defineConcivPlugin` builder (Technical Plan). Add
  `defineConcivPlugin: 'extension'` to `DECLARATION_CALLS` and to `CONTRACT_MARKER`; key
  guards and dedupe on `id ?? name`; `loadServerExtensions` (Vite, `boot.ts`) and
  `loadExtensionPackages` (Next) return `(AnyExtension | ConcivPlugin)[]`, with
  `DedupeResult`, `isExtension`, `StartOpts.extensions` and `composeSystemPrompt` widened. Client entries, the glob and Next's generated entry do
  not change.

#### 5. `packages/extension/src/devframe-connection.ts` (Create)

- **Type / Scope**: TypeScript module, browser and Node.
- **Proposed Changes**: `reconnectingClient(open)`: rebuilds the client with capped backoff;
  on disconnect, open stream readers end with `concivError('DISCONNECTED')`; after
  reconnect, shared-state readers re-read. `nodeClient({url, transport: 'ws' | 'sse',
  token})` over `createRpcClient`, wired with `concivRpcOptions()`. Exposes connection
  status for reachability.

#### 6. `packages/serve/src/serve.ts` (Modify)

- **Type / Scope**: Server.
- **Proposed Changes**: `ServeHonoOptions` gains `claimUpgrade?: (req, socket, head) =>
  boolean`. After `serve()`, replace Hono's `upgrade` listener with one that calls
  `claimUpgrade` first and Hono otherwise, so Hono's rejection of unmatched upgrades keeps
  working.

#### 7. `packages/core/src/devframe-plane.ts`, `packages/core/src/devframe-trust.ts` (Create)

- **Type / Scope**: Engine modules.
- **Proposed Changes**: Plane, called from `makeApp`: `makeDevframePlane({chat, stateDir, cwd,
  host, plugins, loginToken, allowedOrigins, devframes})` calls `initHub` with
  `base: '/__conciv/'`, conciv core plus default and user plugins, `allowedOrigins`, storage
  under `<stateDir>/devframe/<scope>`, `mcp: false`. `auth` is a delegate object filled in
  `configure` with `createInteractiveAuth(ctx, {clientAuthTokens: [loginToken]})`, wrapping
  `onConnect` to record sessions whose upgrade had an Origin (only needed when an
  `accessToken` is shared by browser and agents, as in `packages/try`). `configure`
  provides `conciv:host`. Returns `{hub, publish(group)}`.

  Trust: `isBrowserCaller(ctx)` and `isTrustedBrowserToken(ctx, token)`; the second reads
  Devframe's live store through `devframe/node/hub-internals`, the only importer of it (Access listing and revoking also
  go through this file).

  `publish(group)` writes shared state `conciv:<group>`, whose value is what that group's
  list query returns. Today this is `sessions` only; other groups add it when a screen needs
  live updates.

#### 8. `packages/core/src/start.ts`, `packages/core/src/app.ts`, `packages/core/src/runtime/session-context.ts` (Modify)

- **Type / Scope**: Engine wiring.
- **Proposed Changes**: `start()`: `loginToken = opts.accessToken ?? randomUUID()`;
  a new `agentBase` of `/t/${loginToken}`, with `basePath` left token-free; `harnessEnv` adds
  `CONCIV_TOKEN`; `mcp-endpoint.json` gains `token`. Replace the `.mount` at the token path
  with a fetch wrapper: match `/t/<token>`, accept `loginToken` or a trusted browser token,
  rewrite the path, call the app; open paths `/__conciv/*`, `/health`, `/native*`; otherwise 401. With `accessToken` set, accept only that token. `app.ts`: route `/__conciv/*` to
  `hub.handler` as a sibling of the token prefix, never under it. The `reservePort` family
  takes `{fetch, claimUpgrade}`; `claimUpgrade` matches `${hub.base}__ws` and calls
  `hub.handleUpgrade`. `start()` partitions loaded extensions; plugin system prompts join
  `composeSystemPrompt`. `dispose` terminates `ctx.terminals.sessions`, then `hub.close()`.
  `session-context.ts` gains a non-throwing `currentSession()` for `inSession`. Engine logs
  strip `/t/<token>` and `devframe_auth_token`.

#### 9. `packages/cli/src/engine-origin.ts` (Modify)

- **Type / Scope**: CLI.
- **Proposed Changes**: `engineOrigin` returns the prefixed base; the token comes from
  `CONCIV_TOKEN`, else a walk-up read of `.conciv/mcp-endpoint.json`. Nothing else in the CLI
  changes in this PR.

#### 10. `packages/plugin/src/core/vite.ts` (Modify)

- **Type / Scope**: Vite plugin.
- **Proposed Changes**: Mount the hub with `server.middlewares.use` and an `upgrade` listener
  (path check, socket loopback check, `hub.handleUpgrade`). Reuse the existing
  `devtools.setup(context)` hook, `DevToolsContext` type, `docked` detection and
  `custom-render` dock; keep the returned `{update}` handle. `docked` stays the capability;
  add a mutable `surface: 'page' | 'dock'` read by `load`, `transformIndexHtml` and
  `widgetSettings`, with `makeWidgetInject` taking a getter. Default: `dock` when docked,
  otherwise `page`.

#### 11. `packages/plugin/src/core/nextjs.ts` (Modify)

- **Type / Scope**: Next plugin.
- **Proposed Changes**: `forwardHub`: `rewrites().beforeFiles` entry for `/__conciv/:path*` to
  the engine with the loopback `has` Host condition, merged with the user's rewrites (array
  or object form); `skipTrailingSlashRedirect: true` plus the user-facing redirect
  `/:path((?!__conciv/).+)/` to `/:path` unless the user set the skip option; honor a preset
  `NEXT_PUBLIC_CONCIV_PORT`. Reference: spike commits `0dc2def5f`, `53f1aea89`.

#### 12. `packages/plugin/src/core/dev-server-hub.ts` (Create); `packages/plugin/src/webpack.ts`, `packages/plugin/src/rspack.ts` (Modify)

- **Type / Scope**: webpack and Rspack hooks.
- **Proposed Changes**: `hubProxy(engine)` returns `{pathFilter, router, ws: true}` with a
  `BlockList` loopback check; the `compiler` hooks prepend it to
  `compiler.options.devServer.proxy`. Reference: spike commit `efcd72834`.

#### 13. `apps/conciv/src/app/devframe-link.tsx` (Create); `packages/embed/src/mount-impl.tsx` (Modify)

- **Type / Scope**: Widget.
- **Proposed Changes**: Hub runtime from the base in `conciv-api-base` (page origin on
  forwarding hosts, engine origin on esbuild and rollup), `simpleAuth: false`, shared-state
  readers writing into TanStack Query keys. `trustedApiBase(root, apiBase)` runs before
  `bootNormal`, renders the authorize card into the shadow root on status `unauthorized`,
  and returns `${engine}/t/${client.connection.authToken}`; it no-ops when `apiBase` already
  contains `/t/` (try, native, tests).

#### 14. `apps/conciv/src/data/app-data.ts`, `packages/client/src/query-utils.ts` (Modify)

- **Type / Scope**: Widget data layer.
- **Proposed Changes**: `makeAppData(rpc, hub, queryClient)` with a static map
  `DEVFRAME_GROUPS: Set<GroupName>`. For a listed group, `utils.<group>.<proc>` keeps the
  `queryOptions`, `mutationOptions` and `.key()` shapes and the same query keys, and calls
  `concivCall` with the active session merged. Used by `pane/refresh-coordinator.ts`
  unchanged.

#### 15. `apps/conciv/src/extensions/devframe-docks.tsx`, `apps/conciv/src/app/devframe-overlays.tsx` (Create)

- **Type / Scope**: Widget shell.
- **Proposed Changes**: `iframe` docks merged into the bottom tab bar (keyed by id, kept
  mounted, hidden by class, `switchEntry` on select; hidden `when: 'false'` and assetless
  docks; hidden entirely on esbuild and rollup). cmd+K palette over hub commands; toasts from
  the Messages feed.

#### 16. `packages/client/src/reachability.ts`, `apps/conciv/src/app/reachability.ts` (Modify)

- **Type / Scope**: Offline UX.
- **Proposed Changes**: Feed `onlineManager` and the offline grace period from the Devframe
  connection status as well as the existing signal.

#### 17. `packages/harness-testkit/src/create-testkit.ts`, `packages/harness-testkit/src/session.ts` (Modify); `packages/harness-testkit/src/devframe-mounts.ts` (Create); `packages/harness-testkit/package.json` (Modify)

- **Type / Scope**: Testkit.
- **Proposed Changes**: `BootedApp` exposes `{hub, claimUpgrade}`, `serve-app.ts` and
  `packages/extension-testkit/src/core-kit.ts` pass them to `serveHono`, and `Kit` gains
  `hub` (a `nodeClient`) next to `rpc`. `serveDevframePlugin(plugin)` runs one plugin in
  `initHub({base: '/__conciv/', auth: false, devframes: [plugin]})`. New subpath export.
  `Kit.rpc` stays until PR 20.

#### 18. `packages/extension-testkit/src/devframe-faults.ts`, `packages/extension-testkit/src/devframe-probe.ts` (Create); `packages/extension-testkit/package.json` (Modify)

- **Type / Scope**: Testkit, test-only.
- **Proposed Changes**: Faults: a plugin the testkit registers that wraps named functions.
  `failCalls(names)`, `abortCalls`, `holdCalls`, `gateCalls` (replacing the `rpc-fault.ts`
  family), `callCursor`, `callCount`, `observeCalls(pattern)` (replacing `rpc-counts.ts`,
  `rpc-observer.ts`, `rpc-wire.ts`). They take the running kit, not a Playwright `Page`.
  Each group PR moves that group's helper calls, so nothing goes silent. Probe: one esbuild-built probe bundle plus host page,
  `trustedTab(browser)` through `getTempAuthCode` with `browser.newPage()`.

#### 19. `packages/core/test/core-api.it.test.ts`, `packages/core/test/core-chat.it.test.ts`, `packages/core/test/core-hub.it.test.ts` (Modify, Delete, Create)

- **Type / Scope**: Tests.
- **Proposed Changes**: Move core-chat.it's 11 cases into core-api.it and delete the file.
  New `core-hub.it.test.ts` launches Playwright from Node, like the extension testkit:
  login refused then accepted, a coded error reaching the client, zod defaults applied, shared
  state across two tabs, a stream with a late subscriber, reconnect ending open streams with
  `DISCONNECTED`, `/api/*` 401 without a token and working with one, a plugin iframe trusted
  from the stored login, `isBrowserCaller` true for a tab and false for the engine token.

#### 20. `packages/serve/test/teardown.it.test.ts` (Modify)

- **Type / Scope**: Tests.
- **Proposed Changes**: Unmatched upgrade with a claimer gets a 4xx; a claimed upgrade skips
  Hono.

#### 21. `packages/plugin/test/plugin.it.test.ts`, `packages/plugin/test/fixtures/dev-server-app/`, `packages/plugin/package.json`, `.fallowrc.json`, `apps/examples/nextjs-app/package.json` (Modify, Create)

- **Type / Scope**: Tests and config.
- **Proposed Changes**: "Devframe hub on the page origin" `describe.each` blocks (Next webpack
  and Turbopack; webpack-dev-server and Rspack). Plugin devDependencies: `webpack` 5.112.2,
  `webpack-cli` 7.2.3, `webpack-dev-server` 6.1.0, `@rspack/core` 2.2.9, `@rspack/cli` 2.2.9,
  `@rspack/dev-server` 2.2.2. Fallow ignores the fixture folder and the four bin-only
  packages. Next example adds `dependenciesMeta.injected` for `@conciv/it`.

### PRs 2 to 9: core procedure groups

Order: `sessions` (PR 2), `meta` (3), `drafts` and `markers` (4), `navigation` (5), `editor`
(6), `captures` and `page` (7), `registry` and `server` (8), `chat` non-streaming (9).

Recipe for each group:

#### 22. `packages/contract/src/contract.ts` (Modify)

- **Type / Scope**: Contract.
- **Proposed Changes**: Extract the group's inline `oc.input(...).output(...)` schemas and
  error maps into named exports, reused by both the oRPC procedure and the Devframe function.

#### 23. `packages/core/src/api/rpc/router.ts`, or `sessions.ts` and `chat.ts` for those groups (Modify); `packages/core/src/devframe-plane.ts` (Modify)

- **Type / Scope**: Engine.
- **Proposed Changes**: Move the procedure body into a plain function. The oRPC procedure and
  a new `defineConcivFunction` both call it. Procedures on `sessionOs` use `session: true`.
  The oRPC procedures stay until PR 20. Mutations call `publish(group)` if the group has
  shared state.

#### 24. `apps/conciv/src/data/app-data.ts` and the group's direct widget callers (Modify)

- **Type / Scope**: Widget.
- **Proposed Changes**: Add the group to `DEVFRAME_GROUPS`. Move direct `rpc.<group>.*` calls in
  `apps/conciv` to the Devframe client: `routes/panel.$sessionId.tsx`, `routes/quick.tsx`,
  `routes/__root.tsx`, `routes/panel.latest.tsx`, `composer/session-selector.tsx`,
  `composer/model-selector.tsx`, `app/pane-provider.tsx`, `pane/draft-storage.ts`,
  `pane/use-pane-messaging.ts`, as each applies. Callers outside `apps/conciv` move in PR 20.

#### 25. `packages/core/test/core-api.it.test.ts` (Modify)

- **Type / Scope**: Tests.
- **Proposed Changes**: The group's `kit.rpc.<group>.*` sites and `page.route` helpers across
  all test files switch to `kit.hub` and `devframe-faults` in this PR, so `Kit.rpc` shrinks
  to nothing by PR 20. oRPC-only cases (paths, CORS, header scoping) go in PR 20.

Group-specific files:

- **editor (PR 6)**: `packages/plugin/src/core/open-editor.ts` (Delete);
  `packages/plugin/src/core/boot.ts`, `vite.ts`, `packages/core/src/start.ts`
  (`StartOpts.launchEditor`, `makeEditorOpener`), `packages/try/src/connect.ts`,
  `packages/extension-testkit/src/boot-server.ts`, `packages/plugin/package.json` and its
  tsdown external (Modify, remove `launch-editor`). Opening goes through
  `@devframes/service-open`, which refuses paths outside the project.
- **captures and page (PR 7)**: `packages/core/src/page-bus.ts` (Modify: bus removed; `makeJournal`
  and the types used by `runtime/core-runtime.ts`, `scope-types.ts`, `primitives.ts` and
  `tool-registry.ts` stay); `packages/core/src/api/push.ts`,
  `packages/client/src/push-channel.ts` (Modify: page half removed);
  `packages/page/src/page-driver.ts`, `packages/page/src/page-tool-dispatcher.ts` (Modify):
  server-to-tab calls use the stored connection (`session.rpc.$call`). Before this PR, measure
  capture payloads.
- **registry and server (PR 8)**: `packages/core/src/api/rpc/router.ts` functions only;
  `registry.call` and `server.*` use `isBrowserCaller` for the approval exemption. No runtime
  replacement yet (PR 20).
- **chat (PR 9)**: `packages/core/src/api/rpc/chat.ts` (Modify): its oRPC procedures, with
  `chat.events` as a Devframe stream used by `packages/client/src/chat-connection.ts`,
  `Kit.events` and `call-tool.ts`. `/api/chat` is untouched.

### PRs 10 to 18: extensions, one per PR

Each extension PR:

#### 26. `packages/extensions/<name>/src/server.ts` (Modify)

- **Type / Scope**: Extension server.
- **Proposed Changes**: `defineConcivPlugin(...).server(...)`: router, Hono routes and websockets
  become functions and streams; tool names unchanged; `turnEnd` moves to
  `conciv:host.sessions.onChatTurn`.

#### 27. `packages/extensions/<name>/src/client.ts(x)` and `src/client/` (Modify)

- **Type / Scope**: Extension client.
- **Proposed Changes**: `.client({...})` with today's shape; RPC calls move to `concivCall`
  through `packages/extension/src/ext-rpc.ts`.

#### 28. `packages/extensions/<name>/test/*` (Modify)

- **Type / Scope**: Tests, existing files only.
- **Proposed Changes**: Cases run the plugin in a real hub through `getExtensionTestApi`.

Extension-specific files:

- **terminal (PR 10)**: `src/server/pty-sessions.ts`, `src/server/spawn-helper-fix.ts` (Delete);
  `src/server/osc-busy.ts`, `frame-injector.ts`, `launch.ts` (Modify: read the hub PTY
  session's output stream); `src/client/terminal-panel-view.tsx`, `terminal-actions.tsx`
  (Modify: read and write the hub PTY session; the view registers only when the extension's
  `enabled` config is true, default false; when true, the agent session is started unlisted
  in the Terminals plugin); `package.json` (Modify: remove `@lydell/node-pty`).
  `packages/ui-kit-terminal/src/model.ts` (Modify: websocket half removed). Agent env vars
  are unset through `/usr/bin/env -u`; POSIX only, as the harness CLIs are today.
- **test-runner (PR 11)**: `vitest.config.ts` (Modify: globalSetup uses `serveDevframePlugin`);
  `stream` becomes a stream.
- **ios (PR 12)**: `build`, `run`, `screenshot`, `logs` as `agent` functions.
- **recorder (PR 13)**: measure `pull` keyframes first. Event feed becomes a stream, recording
  list shared state. `pull` stays within `RESULT_CAP_CHARS` on `/api/mcp`, as today.
  `src/client/recording-card.tsx`, `panel-view.tsx` (Modify).
- **page (PR 14)**: every page verb a page-script function with `agent`; also
  `packages/core/src/app.ts` and `start.ts` (`withBuiltinExtensions`) and
  `packages/embed/src/mount-impl.tsx`, where the built-in page extension is hard-wired.
- **tanstack (PR 15)**: client tools as page-script functions, server tools as `agent` functions.
- **design (PR 16)**: `src/server/xray-routes.ts` (Modify) into functions; the built xray page
  served as an iframe dock with `clientAssets`; `src/xray/data.ts` (Modify).
- **whiteboard (PR 17)**: `src/server/router.ts` (Modify) into functions; the TanStack DB feed a
  stream; `src/client/whiteboard-collection.ts` (Modify). Never write to the db inside a
  subscription, effect or render body.
- **try-it (PR 18)**: client half only; no server file exists.

### PR 19: Settings page and mode switch

#### 29. `apps/conciv/src/routes/panel.$sessionId.settings.tsx` and child routes `.index`, `.appearance`, `.agent`, `.tabs`, `.shortcuts`, `.plugins`, `.access` (Create)

- **Type / Scope**: Widget routes (TanStack Router, route-scoped APIs only).
- **Proposed Changes**: Per `docs/specs/devframe-settings-mockup.html`, nested under the session
  so chat stays mounted, built from ui-kit-system primitives with `--chat-*` tokens; no
  hand-written CSS in `styles.css`. No search params. Values read and write
  `ctx.scope('conciv').settings.project` (shared state
  `devframe:settings:project:conciv`) with zod-parsed defaults in the widget: `appearance.scheme`,
  `appearance.skin`, `panel.closeOnOutsideClick`, `panel.showAddressBar`, `panel.reduceMotion`,
  `panel.surface`, `agent.model`. `panel.surface` shows only when Vite DevTools is present.
  Tabs and Shortcuts use `devframe:user-settings`. The coding-agent row is read-only: the
  harness is engine config. Plugins lists the hub's loaded plugins and the opt-in defaults;
  a toggle applies on next start and the page says so; config `add` wins and shows locked.
  Access lists trusted tokens and revokes through `revokeAuthToken` on
  `getInternalContext` (`devframe-trust.ts`). Reset Tabs and Reset Shortcuts clear their keys
  in `devframe:user-settings`; Reset All also clears the conciv scope.

#### 30. `packages/plugin/src/core/vite.ts`, `packages/core/src/start.ts` (Modify)

- **Type / Scope**: Mode switch.
- **Proposed Changes**: `start({devtools: docked})` exposes whether Vite DevTools is present. On a
  `panel.surface` change (`settings.project.onChange`), the plugin sets `surface`, calls
  `dock.update({when: surface === 'dock' ? undefined : 'false'})`, invalidates the extensions
  virtual module and sends `full-reload`.

#### 31. `apps/conciv/src/data/settings.ts` (Modify)

- **Type / Scope**: Widget.
- **Proposed Changes**: `parseConcivSettings` keeps `modal`, `launcher`, `surface` and `transport`
  from config; scheme, skin and motion read the new settings.

#### 32. `apps/conciv/test/conciv.browser.test.tsx`, `packages/plugin/test/plugin.it.test.ts` (Modify)

- **Type / Scope**: Tests.
- **Proposed Changes**: A setting changed in one tab shows in another; a Tabs change hides a dock;
  a recorded shortcut works; Reset All needs a second click; the mode switch flips the dock
  without a restart. Screenshots of every screen in light and dark, checked against the mockup.

### PR 20: Remove the old path

#### 33. `packages/contract/src/client.ts`, `packages/contract/src/browser-transport.ts` (Delete); `packages/contract/src/contract.ts`, `packages/contract/src/index.ts` (Modify)

- **Type / Scope**: Contract.
- **Proposed Changes**: Keep only zod schemas and row types. Remove `@orpc/*` from every manifest
  and the catalog; update `e2e/nextjs/tests/packed-closure.spec.ts`.

#### 33b. `packages/extension/src/tool-registry.ts` (Modify), `packages/extension/src/registry-walk.ts` (Delete), `packages/core/src/tool-registry.ts`, `packages/core/src/api/mcp.ts`, `packages/core/src/page-bus.ts` (Modify)

- **Type / Scope**: Agent surface.
- **Proposed Changes**: Keep the types and `SandboxTool`; replace the runtime with a read of the
  agent host; update `packages/ui-kit-chat-tools/test/helpers.tsx`; remove the page bus.

#### 34. `packages/client/src/query-utils.ts`, `packages/client/src/push-channel.ts` (Delete); `packages/client/src/chat-connection.ts`, `packages/client/src/use-chat-session.ts`, `packages/client/src/reachability.ts` (Modify)

- **Type / Scope**: Client.
- **Proposed Changes**: Chat events move to the `@tanstack/ai` socket; `chat.hydrate`, `chat.stop`
  and `permissionDecision` use the Devframe client; `ORPCError` checks go.

#### 35. `packages/extension/src/rpc-mount.ts`, `server-stream.ts`, `mount-extension.tsx`, `define-extension.ts` (Delete); `packages/extension/src/ext-rpc.ts`, `collect-client.ts`, `client-host.ts`, `types.ts`, `host-context.ts`, `catalog.ts` (Modify)

- **Type / Scope**: Extension runtime.
- **Proposed Changes**: `defineConcivPlugin` is the only extension API; `AnyExtension` and
  `AnyToolBuilder` move to `types.ts`. Also move `packages/tools/src/extensions-tool.ts`,
  `apps/conciv/src/extensions/highlight.tsx`, the tanstack example's `deploy-button.tsx`, the
  ping fixtures, and the docs and skills that show `defineExtension`.

#### 36. `packages/core/src/api/rpc/mount.ts`, `router.ts`, `sessions.ts`, `chat.ts`, `packages/core/src/api/push.ts` (Delete); `packages/core/src/app.ts`, `packages/core/src/lib/cors.ts` (Modify)

- **Type / Scope**: Engine.
- **Proposed Changes**: The oRPC mount and `widgetCaller` go; `/rpc` paths go. The `/t/<token>`
  gate stays.

#### 37. `packages/cli/src/request.ts`, `server.ts`, `open.ts`, `tool-group.ts`, `page.ts` (Modify)

- **Type / Scope**: CLI.
- **Proposed Changes**: Use `nodeClient`; `withSession` merges `sessionId` into input; errors read
  `ConcivError` codes.

#### 38. `packages/embed/src/mount-impl.tsx`, `packages/embed/src/navigation-storage.ts`, remaining `apps/conciv/src` importers of `RpcClient`, `packages/extensions/design/src/xray/data.ts` (Modify)

- **Type / Scope**: Widget and embed.
- **Proposed Changes**: Replace `RpcClient` with the Devframe client; `makeAppData` loses the oRPC
  backend and `DEVFRAME_GROUPS`.

#### 39. `packages/harness-testkit/src/rpc-websocket-client.ts`, `rpc-mounts.ts` (Delete); `session.ts`, `call-tool.ts`, `create-testkit.ts`, `package.json` (Modify)

- **Type / Scope**: Testkit.
- **Proposed Changes**: `Kit.rpc` removed; approvals become a stream subscription plus a call;
  coded checks use `fromWireError`.

#### 40. `packages/extension-testkit/src/rpc-fault.ts`, `rpc-observer.ts`, `rpc-counts.ts`, `rpc-wire.ts`, `rpc-payload.ts`, `push-wire.ts` (Delete); `connect-handshake.ts`, `core-kit.ts`, `page-plane.ts`, `launch.ts`, `get-extension-test-api.ts`, `host/host-runtime.tsx`, `fixtures/ping/router.ts`, `package.json` (Modify)

- **Type / Scope**: Testkit.
- **Proposed Changes**: Callers move to `devframe-faults.ts`; `getExtensionTestApi` keeps its public
  shape.

#### 41. Remaining tests (Modify or Delete)

- **Type / Scope**: Tests.
- **Proposed Changes**: `packages/contract/test/contract.test.ts` client and header cases;
  `packages/client/test/client.test.ts` reachability and push cases;
  `packages/extension/test/extension.test.ts` rpc websocket route;
  `packages/extension-testkit/test/extension-testkit.test.ts`;
  `packages/harness-testkit/test/harness-testkit.test.ts` oRPC stream-abort case;
  `packages/cli/test/cli.test.ts` fake oRPC error body; `apps/conciv/test/conciv.test.ts`
  `/rpc/drafts/*` paths; `apps/conciv/test/conciv.browser.test.tsx`,
  `apps/conciv/test/commands/core-control.ts`, `core-testkit.ts`,
  `packages/embed/tests/e2e/embed.it.test.ts` (move to `devframe-faults`);
  `packages/plugin/test/plugin.it.test.ts` waits on `/rpc/navigation/set`; core-api.it's
  `cors`, `api rpc fetch`, `api extension router` and mount-isolation cases.

#### 42. `apps/site/content/docs/extending/testing.mdx`, `apps/site/content/docs/extending/tool-contract.mdx`, `apps/site/content/docs/extending/your-first-extension.mdx`, `packages/skills/skills/conciv-develop/references/rpc-and-testing.md`, `packages/skills/skills/conciv-develop/references/tool-contract.md`, `AGENTS.md` (Modify)

- **Type / Scope**: Documentation.
- **Proposed Changes**: Extension docs describe `defineConcivPlugin`, `defineConcivFunction` and the
  testkit helpers. AGENTS.md: the input-validation rule points at `defineConcivFunction`, and
  gains the flake rules from the Testing section.

### Every PR

- A `.changeset/<name>.md` naming each touched public package.

### Verification Plan

- **Build**: `pnpm turbo run build --filter=<touched packages>`.
- **Tests**: `pnpm turbo run test --filter=<pkg>` for each touched package, and
  `--filter=...<pkg>` for dependents of changed libraries.
- **Static analysis**: `pnpm lint`, `pnpm format:check`, `pnpm exec fallow audit --changed-since main
  --format json` with zero introduced findings, `conciv/test-file-budget` passing with no cap
  raised.
- **Revert checks**: removing the code under a new behavior test makes it fail.
- **Agent surface**: a test asserts no route answers on Devframe's `__mcp` path and no WebMCP tool is
  registered.
- **E2E**: `e2e/nextjs` passes under webpack and Turbopack; a manual browser pass of login, docks,
  palette, toasts and settings in Vite, Vite with Vite DevTools, and Next.
- **Measurements**: bundle size in PR 1; capture payloads before PR 7; keyframes before PR 13; net
  line count after PR 1 and PR 20.
- **Release**: `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main`.
