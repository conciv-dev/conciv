# Moving conciv onto Devframe

Status: design, not started. Written 2026-11-01 from the `spike/devframe-rpc` branch
(worktree `aidx-wt-devframe-spike`, local only, never merged).

## 1. What this is

conciv runs its own plumbing for things Devframe already ships: RPC, live push, a tool
registry, an MCP endpoint, terminal sessions, editor opening, and (soon) a login step and
settings. This document says how to move each piece onto Devframe, how to move every
extension onto Devframe's plugin model, and how to keep the old and new paths working side
by side until the last piece moves.

Devframe version: 1.3.0 for `devframe` and every `@devframes/*` package, with a
`minimumReleaseAgeExclude` entry until it ages past the window (decision 5). The spike
started on 1.2.6 and moved to 1.3.0 in commit `d9d5c0843`.

## 2. What the spike proved

Every row below ran in a real browser (headless Chromium) against the real engine, as a
test in `packages/core/test/devframe-spike.it.test.ts` or by hand in the example app.

| Claim                                               | Result                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devframe mounts inside our Hono server next to oRPC | Yes. `app.all('/__conciv/*', hub.handler)` plus `hub.attach(server)`. All 138 existing core tests still pass.                                     |
| Login (#648)                                        | Devframe's code login refuses an untrusted tab, accepts the terminal code, survives an engine restart.                                            |
| A conciv procedure on Devframe RPC                  | `sessions:list` and `sessions:rename` ported, reading the real database.                                                                          |
| Server asks one tab and waits for the answer        | Works through the stored connection (`session.rpc.$call`). Replaces our page bus pattern.                                                         |
| Live synced state                                   | Session list as Devframe shared state, written into the widget's TanStack Query cache; a rename in one tab shows in another within a second.      |
| Streaming with replay                               | Works, including a late subscriber.                                                                                                               |
| Reconnect after an engine restart                   | Not built in. A 25 line wrapper that rebuilds the client on disconnect works and stays logged in.                                                 |
| Agent tools over MCP                                | Functions marked `agent` show up on Devframe's MCP route; a token-holding CLI can list and call them.                                             |
| Page tools over MCP                                 | A page-script function marked `agent` reaches the server's MCP through Devframe's browser agent bridge and is callable end to end.                |
| WebMCP                                              | Browser-side agent functions register as WebMCP tools.                                                                                            |
| Hub: messages, commands, terminals, docks           | All work.                                                                                                                                         |
| Services: git, Shiki, open in editor                | All work; open in editor refuses paths outside the project.                                                                                       |
| Ready-made plugins inside conciv                    | Terminals, Messages, Git, A11y Inspector, Devframe Inspector load unchanged as docks in the widget. A11y found 15 real issues on the example app. |
| A conciv extension as a Devframe plugin             | The terminal extension runs as a Devframe plugin, on the hub's own PTY sessions, rendered in the widget through a dock renderer.                  |
| conciv inside Vite DevTools                         | conciv posts toasts, palette commands and a terminal into Vite DevTools' panels through the hub context Vite DevTools already hands our plugin.   |

## 3. Target shape

```
host page                                   engine (node)
---------                                   -------------
conciv widget (Solid, shadow root)          Hono server
  = a Devframe hub UI                         /api/...      oRPC (shrinks to zero during migration)
  - dock bar: every plugin's panel            /api/chat     @tanstack/ai chat transport (stays)
  - palette (cmd+K), toasts, settings         /__conciv/    Devframe hub (initHub)
  - chat (stays ours)                           conciv core devframe
                                                conciv plugins (terminal, recorder, ...)
                                                Devframe plugins (git, a11y, messages, ...)
                                                services: conciv:host, open, shiki, git
```

- **The engine runs one Devframe hub** (`initHub`) mounted under `/__conciv/` in the Hono
  server. Under Vite, the same hub is also mounted on Vite's own server
  (`server.middlewares.use(hub.nodeMiddleware)` plus `hub.attach(server.httpServer)`), so
  the widget and every plugin iframe talk to it from the page's own origin.
- **conciv's own procedures become one devframe** ("conciv core") registered in that hub.
- **Every conciv extension becomes a Devframe plugin**: a `defineDevframe` definition with
  conciv's extra fields on top (section 5).
- **The widget becomes a hub UI.** It reads docks, commands and messages from the hub and
  draws them in Solid. Chat stays ours.
- **Inside Vite DevTools there is no second hub.** conciv registers its devframes into
  the Vite DevTools hub instead (section 9), so there is one login and one dock bar.

What stays ours on purpose:

- The chat plane on `@tanstack/ai` (transport, persistence, runs). Devframe has no chat
  concept. This follows the TanStack AI adoption lane, not this one.
- Code mode (`execute_typescript`, `discover_tools`), the approval gate, result caps and
  chat mirroring of MCP calls.
- The Solid widget, its look, the extension compiler's single-file split.
- Page inspection tools (DOM, React, screenshots, element captures).
- HTML injection for non-Vite hosts (`widget-middleware.ts`).

## 4. The conciv layer on top of Devframe

Devframe is generic. conciv needs a thin layer with the conciv-specific parts, the same way
Vite DevTools adds `docks`, `terminals`, `messages` and `commands` on top of plain Devframe.
It lives in `@conciv/extension` and replaces most of what that package has today.

### 4.1 `conciv:host` service

The engine provides one in-process Devframe service that every conciv plugin reads with
`ctx.services.whenAvailable('conciv:host', ...)`. Proven in the spike
(`packages/extension/src/devframe-host.ts`).

```ts
type ConcivHost = {
  cwd: string
  stateDir: string
  sessions: ServerSessions // resumeToken, recordToken, chatBusy, model, onChatTurn
  harness: ServerHarness // id, ttyCommand, connectPlan, release, transcript*
  symbolicate: (frames) => Promise<SourceLoc | null>
  bundler?: BundlerBridge
  nativeUrl: () => string | undefined
  latestSession: () => Promise<SessionId | null>
}
```

This replaces the `ServerApi` object `makeApp` passes to `extension.__server(...)` today.
Inside Vite DevTools, our plugin provides the same service on the Vite DevTools hub.

### 4.2 `defineConcivFunction`

A wrapper over `defineRpcFunction` that fixes the three gaps the spike found:

| Gap                                                                                                                                             | Fix in the wrapper                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devframe checks arguments but hands the raw values to the handler, so zod defaults, transforms and branded types never apply (`validate-io.ts`) | Parse every argument with its zod schema inside the wrapper and pass the parsed value.                                                                                                               |
| Thrown errors cross the wire as message only; `code`, `cause` and custom fields are dropped by the codec                                        | The wrapper throws a plain object `{concivError: true, code, message, data}`; a client `deserialize` hook (`concivRpcOptions()`) rebuilds `ConcivError`, and Node clients use `fromWireError` (5.5). |
| A function without a `returns` schema is typed `void` on the client                                                                             | Require `returns`.                                                                                                                                                                                   |

It also sets `jsonSerializable: true` by default and forbids `:` inside scoped names
(Devframe rejects them inside `ctx.scope()`).

### 4.3 `defineConcivPlugin`

Today an extension is `defineExtension({...}).client(...).server(...)`. Its fields map like
this:

| Today (`defineExtension`)                                          | On Devframe                                                                                           | Notes                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `.server()` returning `router`                                     | `setup(ctx)` registering `defineConcivFunction`s                                                      | oRPC router per extension goes away.                    |
| `.server()` returning `app` (Hono routes, websockets)              | Devframe functions plus streaming channels                                                            | Every websocket route in extensions becomes a stream.   |
| `.server()` returning `context`                                    | Shared state, or a service the plugin provides                                                        |                                                         |
| `.server()` returning `dispose`                                    | Devframe teardown through the hub                                                                     |                                                         |
| `.server()` returning `turnEnd`                                    | `conciv:host.sessions.onChatTurn`                                                                     | Already exists on `ServerSessions`.                     |
| `views` (panel tabs)                                               | Dock of type `conciv-view` with a Solid renderer                                                      | Proven with the terminal (`conciv-terminal` dock type). |
| `Surface` (effects layer over the page)                            | Dock `action` with `toggle: true` and an eager client script, or a page script on the in-page channel |                                                         |
| `Component` (slot inside the panel: header, composer, empty state) | Stays a conciv field                                                                                  | Devframe has no slots inside our panel.                 |
| `tools` with `.server()` binding                                   | `defineConcivFunction` with `agent`                                                                   | Shows on MCP and in code mode.                          |
| `tools` with `.client()` binding                                   | Page-script channel function with `agent`                                                             | Reaches MCP through the browser agent bridge (proven).  |
| `tools` `.render()` cards                                          | Stays a conciv field                                                                                  | Chat cards are ours.                                    |
| `tools` `approval: 'ask'`                                          | Stays a conciv field, enforced in our gate                                                            | Devframe only has a safety hint.                        |
| `attachments`                                                      | Stays a conciv field                                                                                  | Chat concept.                                           |
| `systemPrompt`                                                     | Stays a conciv field                                                                                  | Chat concept.                                           |
| `connectGate`                                                      | Stays a conciv field                                                                                  |                                                         |
| zod `config`                                                       | Devframe scoped settings, or stays conciv config                                                      | See section 8.                                          |

`defineConcivPlugin` returns a normal `DevframeDefinition` plus a `conciv` field holding the
conciv-only parts (slots, cards, attachments, system prompt, approvals). Any Devframe hub
can mount it and ignore the `conciv` field; conciv's hub reads it.

### 4.4 Dock types we add

| Dock type         | Used for                                              | Renderer                                        |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `conciv-view`     | Panel tabs (terminal, recorder, ...)                  | Solid component mounted into the dock container |
| `conciv-terminal` | Already exists in the spike; folds into `conciv-view` |                                                 |

Renderers are registered locally in the widget (`createDevframeClientRuntime({renderers})`).
For Vite DevTools they are also listed in the hub's renderer manifest with a bare
`importFrom` that Vite resolves through `/@id/`.

## 5. Keeping both paths working until the end

The migration is a series of small PRs. After each one, everything still works: some
procedures and extensions are on Devframe, the rest are on the old path.

### 5.1 Engine

1. Mount the hub next to oRPC (spike already does this). Both serve from the same
   process and share the database, harness and runtime objects.
2. **One login for both.** A Hono middleware in front of `/api/*` accepts a request when it
   carries a token that Devframe's trusted store accepts, or the existing pairing token
   (CLI, harness children, MCP). Until this ships, the old routes stay open as they are today.
3. **Live state is published from one place.** Every mutation that today pushes over our
   push channel also refreshes the matching Devframe shared state. The spike does this for
   sessions (`sessionsChanged` in `api/rpc/sessions.ts`). Each group of procedures adds its
   own refresh when it moves.

### 5.2 Widget data layer

UI components call `appData.utils.<group>.<proc>.queryOptions()` today. The migration keeps
that call shape:

- `makeAppData` gets a second backend. For a group that has moved, its query and mutation
  options call Devframe (`rpc.call('conciv:<group>:<proc>', input)`) instead of oRPC.
- Shared state for a moved group is written into the same TanStack Query keys (spike:
  `syncSessions` in `apps/conciv/src/app/devframe-link.tsx`). Components do not change.
- When the last group moves, `@orpc/tanstack-query` and `@conciv/contract`'s oRPC parts go.

### 5.3 Extensions

- The engine mounts both kinds: legacy `defineExtension` extensions through `makeApp` as
  today, and `defineConcivPlugin` plugins through the hub.
- The widget shows both kinds in one tab bar: legacy views as today, plugin docks from the
  hub runtime. The spike's separate "Devframe" tab is only a demo; the real build merges
  docks into the existing bottom tab bar.
- Tools from both kinds feed code mode and MCP. Until the registry moves (section 6.3),
  plugin tools are bridged into the existing registry by name.
- An extension moves in one PR: new plugin in, old `defineExtension` out, same tool names so
  agent prompts and saved chats keep working.

### 5.4 Removing the old path

The old path is gone when: every group of procedures is on Devframe, every extension is a
plugin, the registry is Devframe's agent host, and our MCP endpoint only adds code mode on
top of Devframe's. Then delete oRPC, the push channel and the old extension runtime in one
cleanup PR.

### 5.5 Can oRPC really go? Spike verdicts on Devframe 1.3.0

Checked on 2026-11-01 in spike commit `42a2512d4`, 32 of 32 browser checks passing. Nothing
came back "can't". None of the gaps changed between 1.2.6 and 1.3.0.

| Question                                   | Verdict                           | Cost and catch                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node client (tests, CLI, harness)          | Works with 3 lines of ours        | The browser client reads `location`, so Node uses the low-level `createRpcClient` over WebSocket or SSE. Trusting our bearer means writing it into the trust store through `devframe/node/hub-internals`, which is marked unstable.                                                        |
| Error codes and data                       | Works with about 25 lines of ours | Structured-clone keeps only name and message. The wrapper throws a plain object and a client `deserialize` hook rebuilds `ConcivError`. Devframe's own input errors (DF0043) stay message-only.                                                                                            |
| `defineConcivFunction`                     | Works, 109 lines (budget 150)     | Parses input with zod so defaults and transforms apply, typed returns, coded errors, one `concivCall` type that sees hub, plugin and conciv names.                                                                                                                                         |
| Engine restart                             | Does not recover by itself        | Pending calls reject cleanly. Open streams hang, old shared state goes stale, old clients stay disconnected, stream replay is lost (memory only), a login made under 100 ms before the stop is lost. Needs our reconnect (spike has one) plus ending and re-opening streams on disconnect. |
| Login for plugin iframes on another origin | Works natively, about 3 lines     | `buildRemoteDevframeUrl` and `connectRemoteDevframe`. WebSocket only. The full bearer travels in the iframe URL fragment.                                                                                                                                                                  |
| Speed against oRPC                         | Mixed                             | 200 small calls about 2.5 times faster. A 1 MB payload about 1.5 to 2.5 times slower, likely from validating it three times plus strict JSON.                                                                                                                                              |

Result: oRPC can be deleted. What we own on top of Devframe is about 140 lines plus restart
handling.

- **Node bearer (decided 2026-11-01):** use `devframe/node/hub-internals` for now, in one
  place, and recheck it on every Devframe upgrade.
- **Iframe login (decided):** no bearer in iframe URLs. The hub is served on the page's origin
  on every host, so iframes share the stored login and no token is handed over. Proven for Next
  in spike commit `0dc2def5f`:
  - Next's `rewrites()` (`beforeFiles`, `/__conciv/:path*` to the engine) proxies HTTP and the
    WebSocket upgrade; no custom server, no new dependency, about 30 lines in
    `packages/plugin/src/core/nextjs.ts`.
  - Needs `skipTrailingSlashRedirect: true` plus the user-facing slash redirect re-added for
    everything outside `/__conciv/`, or plugin pages lose their relative asset paths.
  - Proven under both `next dev --webpack` and Turbopack (spike commit `53f1aea89`), and from a
    packed tarball install like a real user. In this repo the example must install `@conciv/it`
    with `dependenciesMeta.injected: true` (as e2e/nextjs does): Next only keeps a package out of
    the server bundle when its real path contains `node_modules`, and a plain workspace link
    does not. This does not affect real users.
  - Loopback only: the rewrite carries `has: [{type: 'header', key: 'host', value:
    '(localhost|127\.0\.0\.1|\[::1\])(:\d+)?'}]`; another Host gets 404 for the hub while the
    app still serves. This stops other sites and DNS rebinding (browsers cannot forge Host), not
    a LAN client that sends a hand-made Host. Next gives rewrites no access to the socket
    address, so nothing stronger exists there; Devframe's login still guards every call.
  - webpack-dev-server and Rspack dev server: proven (spike commit `efcd72834`). Our plugin
    hook prepends one proxy entry to `compiler.options.devServer.proxy` (about 5 lines plus a
    28-line `hubProxy` helper): `/__conciv` paths only, only when `req.socket.remoteAddress` is
    loopback (Node's `BlockList`), `ws: true`, engine origin looked up per request. A real LAN
    socket gets 404 for the hub while the app still serves; this is a real address check,
    stronger than Next's Host check. Not covered: users who build `new WebpackDevServer(...)`
    themselves, and multi-compiler setups. Rsbuild ignores Rspack's `devServer`, so it needs a
    small Rsbuild plugin adding the same entry to `server.proxy` (read from source, not run).
  - Devframe's client also puts the bearer in the WebSocket URL on every host; Next dev does
    not log it.

## 6. Core procedures (oRPC to Devframe)

The contract has 40 procedures in 11 groups (`packages/contract/src/contract.ts`).

### 6.1 Order

| Order | Group                | Why this order                                                                                                     |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | `sessions`           | Already ported in the spike; drives the session list everywhere.                                                   |
| 2     | `meta`               | Small, read-only.                                                                                                  |
| 3     | `drafts`, `markers`  | Small, tied to sessions.                                                                                           |
| 4     | `navigation`         | Small.                                                                                                             |
| 5     | `editor`             | Replace the body with `@devframes/service-open`; drops `plugin/src/core/open-editor.ts`.                           |
| 6     | `captures`, `page`   | Page queries move to "server asks one tab" (proven). Replaces `page-bus.ts` and the page half of the push channel. |
| 7     | `registry`, `server` | Tool catalog and server tools; moves with the registry (6.3).                                                      |
| 8     | `chat`               | Only the non-streaming procedures. The chat stream stays on `@tanstack/ai`.                                        |

### 6.2 Push channel

`packages/client/src/push-channel.ts` and `packages/core/src/api/push.ts` carry two things:
page queries and chat events. Page queries move in step 6. Chat events stay with the chat
plane. When page queries leave, the push channel carries only chat events and folds into
the chat plane's own transport.

### 6.3 Tool registry and MCP

- Server tools become `defineConcivFunction`s with `agent`; Devframe's agent host lists and
  calls them (`node/host-agent.ts`). This replaces `extension/src/tool-registry.ts` and
  `registry-walk.ts` (about 700 lines).
- Page tools become page-script channel functions with `agent`; they reach the server
  through the browser agent bridge.
- Our MCP endpoint keeps code mode and the approval gate, and delegates listing and calling
  to the agent host. The spike found Devframe's MCP handler has no per-request session and
  rejects requests without an `Origin` header; configure it with
  `mcp: {allowedOrigins: false, authorization: <pairing token>}` and pass the chat session
  through the conciv layer.
- WebMCP comes for free once page tools are channel functions.

## 7. Each extension

Sizes are source lines without tests and stories.

### 7.1 terminal (1,180 lines) - first, mostly done in the spike

- **Spike state:** Devframe plugin (`src/devframe.ts`, `src/dock.ts`); runs the harness CLI on
  `ctx.terminals.startPtySession`; output on the hub's `devframe:terminals` stream; input and
  resize over RPC; Solid xterm dock renderer.
- **Left to port:** busy detection (OSC 9;4) and Escape to interrupt, frame-safe text
  injection, idle eviction, the model picker, respawn, launch in the OS terminal, pasting
  grabbed elements, the view lock, theme tokens. Busy detection and injection need a small
  reader on the hub session's output stream, since our `pty-sessions.ts` goes away.
- **Workaround to keep:** the hub always merges `process.env` into the child; the harness's
  `unsetEnvPrefixes` go through `/usr/bin/env -u ...` (`withUnsetEnv`).
- **Decided (revised 2026-11-01):** Devframe's Terminals plugin is the default terminal
  viewer. Our terminal view is kept but disabled by default; enabling it hides the agent
  session from the Terminals plugin. The extension starts the agent session as a hub PTY
  session (with title and description) and keeps the server-side parts (resume token,
  busy detection, injection, idle eviction, respawn). Two viewers of one PTY at different
  sizes break the CLI's drawing, so there is never a second one.
- **Kept in our view:** the model picker, the view lock, pasting grabbed elements and
  "open in OS terminal" stay in our terminal view, available when it is enabled.
- **Deletes:** `server/pty-sessions.ts`, `server/spawn-helper-fix.ts`, the `/tty` websocket
  and oRPC router in `server.ts`, the spike's separate terminal dock (`src/dock.ts`), the `@lydell/node-pty` dependency.

### 7.2 test-runner (1,316 lines) - second, no panel UI

- Server: router (`list`, `run`, `status`, `stop`, `stream`, `ui`) becomes functions plus a
  streaming channel for `stream`. The `test` tool becomes an `agent` function.
- Client: one result card (stays a conciv card).
- **Deletes:** its oRPC router and stream plumbing.

### 7.3 recorder (2,588 lines)

- Server: router (`config`, `control`, `events`, `flush`, `log`, `presence`, `recordings`,
  `reset`, `window`, `clients`, `exportVideo`, `get`, `save`) becomes functions; the event
  feed becomes a streaming channel; recording list becomes shared state.
- Page side: the rrweb recorder runs in the host page; becomes an eager dock `action` client
  script, or a page-script channel when it needs to answer server calls.
- Panel: `RecorderPanelView` becomes a `conciv-view` dock.
- Tools: `start`, `stop`, `pull` become `agent` functions; `pull` returns keyframes, check
  the size budget on the MCP route.
- Attachment (`recordingAttachment`) and cards stay conciv fields.

### 7.4 whiteboard (5,610 lines)

- Server: router over drizzle/libSQL becomes functions; the SSE feed for TanStack DB becomes
  a Devframe streaming channel, or a shared-state collection if the volume allows.
- `turnEnd` moves to `conciv:host.sessions.onChatTurn`.
- Surface (Excalidraw overlay on the page) becomes a toggle `action` dock with an eager client
  script, so it also works as a toggle inside Vite DevTools.
- Tools (canvas, comment, anchor, element) become `agent` functions.
- Keep the extension landmine from AGENTS.md: never write to the db inside a subscription,
  effect or render body.
- Largest port; do it after the recorder proves the page-surface pattern.

### 7.5 design (5,611 lines)

- Server: xray router and app (it serves its own page from `xray/`) become functions plus a
  dock of type `iframe` with `clientAssets` pointing at the built xray page.
- Client tools (frame capture) become page-script channel functions with `agent`.
- Server steps stay as functions.

### 7.6 page (3,010 lines)

- No router. Every page verb is a client tool today; they become page-script channel
  functions with `agent`. This is the step that replaces the page tool dispatcher's
  transport (`packages/page/src/page-driver.ts`, `page-tool-dispatcher.ts` lookup and
  dispatch) and gives WebMCP.
- DOM targeting, element captures and result views stay ours.
- `grabAttachment` stays a conciv field.

### 7.7 tanstack (2,833 lines)

- A `Component` slot (stays a conciv field), client tools that read the router and query
  cache in the page (page-script channel functions with `agent`), server tools for the
  route manifest and build errors (`agent` functions). Cards stay.

### 7.8 ios (1,465 lines)

- Server tools only (`build`, `run`, `screenshot`, `logs`) and a system prompt. Becomes a
  plugin with four `agent` functions. Small.

### 7.9 try-it (364 lines)

- Client-only demo, not published. Move last or drop.

### 7.10 Order summary

terminal, test-runner, ios, recorder, page, tanstack, design, whiteboard, try-it.

## 8. Settings

There are two different kinds of settings.

### 8.1 Devframe hub settings

The hub keeps per-project UI settings in shared state `devframe:user-settings`: which docks
are hidden, their order, pins, keyboard shortcuts. Vite DevTools draws a settings screen for
it (Docks, Appearance, Shortcuts, Advanced). That screen is part of Vite DevTools' own UI
(`@devframes/hub-ui`, Vue), not a plugin, so conciv does not get it.

conciv draws its own Settings view in Solid over the same shared state. A change made in
conciv shows in Vite DevTools and the other way round, because both read the same state.

### 8.2 conciv widget settings

#572 and its PRs (#578, #592) are set aside. A new settings page will be designed for the
Devframe shape. #572's screens are not a reference (rejected on look, 2026-11-01).
The approved mockup is `docs/specs/devframe-settings-mockup.html` (2026-11-01): an overview
list that drills into Appearance, Agent, Tabs, Shortcuts, Plugins, and Access and reset, at
the 480px panel width. Tabs and Shortcuts edit Devframe's shared `devframe:user-settings`, so
they stay in step with Vite DevTools. Storage is open until that design;
the default is Devframe's own settings store (`ctx.scope(id).settings`) plus shared state for
live sync, since it already exists and Vite DevTools reads the same data.

## 9. Hosts

| Host                                  | Hub location                                                                                                                                  | Login                                     | Plugin iframes                                                  | Widget injection                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| Vite                                  | Engine hub, also mounted on Vite's server                                                                                                     | conciv authorize card (#648)              | Load from the page origin; share the stored login (proven)      | Ours (`transformIndexHtml`)                |
| Vite with Vite DevTools               | Vite DevTools' hub (`devtools.setup(context)`); conciv registers its devframes into it with `createEmbedded` and provides `conciv:host` there | Vite DevTools' login only; no conciv card | Vite DevTools draws them                                        | conciv runs as a dock (existing #649 path) |
| Next (webpack and Turbopack)          | Engine hub, forwarded on the page origin by `rewrites()`, loopback Host only                                                                  | conciv authorize card                     | Load from the page origin; share the stored login (proven, 5.5) | Ours (`widget-middleware.ts`)              |
| webpack-dev-server, Rspack dev server | Engine hub, forwarded on the page origin by a `devServer.proxy` entry, loopback sockets only                                                  | conciv authorize card                     | Same as Next (proven, 5.5)                                      | Ours (`widget-middleware.ts`)              |
| Rsbuild                               | Same forwarding through an Rsbuild plugin's `server.proxy`                                                                                    | conciv authorize card                     | Same (from source, not run)                                     | Ours                                       |

Inside Vite DevTools, conciv must not start its own hub or show its own card (#648 comment).

Bug to fix first, already on main from #649: in the standalone `/__devtools/` page the conciv
panel uses `fixed inset-0` in dock mode and covers the Vite DevTools sidebar
(`apps/conciv/src/routes/panel.tsx`, `PANEL_SHEET`).

## 10. Default plugins

| Plugin                                    | Default                   | Why                                                                                                 |
| ----------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Messages (`@devframes/plugin-messages`)   | On                        | Feed behind toasts; conciv posts engine and tool events into it.                                    |
| Terminals (`@devframes/plugin-terminals`) | On                        | The default terminal viewer, including the agent session unless conciv's own view is enabled (7.1). |
| Git (`@devframes/plugin-git`)             | Off                       | Opt-in through config.                                                                              |
| A11y (`@devframes/plugin-a11y`)           | Off                       | Opt-in through config.                                                                              |
| Inspect (`@devframes/plugin-inspect`)     | Off, on with a debug flag | Developer tool for conciv itself.                                                                   |
| Data inspector, assets, OG, code-server   | Off                       | Opt-in through config.                                                                              |

Config shape: `conciv({devframes: {defaults: true, add: [...], remove: ['git']}})`, merged
into `initHub({devframes})`. Defaults are Messages and Terminals only. Services `open`, `shiki` and `git` are always installed.

## 11. Widget shell work

The hub UI parts conciv draws itself, in Solid, over `createDevframeClientRuntime`:

- **Dock bar:** merged into the existing bottom tab bar. Rules learned in the spike:
  - Track docks by id. The hub rewrites the whole dock list on every message change; keying
    on the entry object reloaded the Messages iframe about 54 times a second.
  - Keep opened docks mounted and only hide them; rebuilding on every switch reloads the
    plugin page.
  - Hide with a class, not the `hidden` attribute (the `flex` class wins over it).
  - Hide docks with `when: 'false'` and the auto-created iframe dock of a devframe that has
    no `clientAssets`.
  - Call `runtime.context.docks.switchEntry(id)` on selection so dock client scripts load.
- **Palette (cmd+K):** over `runtime.context.commands.paletteCommands` and `execute`.
- **Toasts:** register `devframe:messages:updated`, fetch the delta from
  `devframes:plugin:messages:list`, show entries with `notify`.
- **Settings view:** section 8.1.
- **Authorize card:** turn off Devframe's native `prompt()` (`simpleAuth: false`); show the
  card only when the connection status is `unauthorized`, not while the stored token is
  still being checked.

## 12. Auth (#648)

- Browser: Devframe's code login. Trusted browsers are stored in
  `.conciv/devframe/global/auth.json`.
- CLI, MCP and harness children: the existing pairing token as a bearer
  (`mcp.authorization`), plus the Hono middleware from 5.1 for `/api/*`.
- Known Devframe behaviour: the trusted store writes 100 ms after a change and does not flush
  on shutdown, so an engine stopped right after a login forgets that browser.

## 13. What gets deleted

| Area                                                                                                                         | Lines                                | When                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| oRPC contract, transports, clients, query utils                                                                              | about 700                            | After the last procedure group (rewritten as Devframe functions, not just deleted) |
| Push channel, session bus wiring, page bus                                                                                   | about 480                            | Step 6.2                                                                           |
| Tool registry and walkers                                                                                                    | about 700 of 930                     | Step 6.3                                                                           |
| MCP endpoint listing and calling                                                                                             | about 150 of 270                     | Step 6.3                                                                           |
| Server port, CORS, engine lookup (Vite path)                                                                                 | about 200                            | When the hub on Vite's port is the only path under Vite                            |
| Terminal PTY layer                                                                                                           | about 400 of 705                     | 7.1                                                                                |
| Open in editor                                                                                                               | about 30                             | Step 5 of 6.1                                                                      |
| Extension runtime (`rpc-mount`, `ext-rpc`, `server-stream`, `mount-extension`, most of `collect-client`, `create-instances`) | about 500                            | 5.4                                                                                |
| Per-extension routers and websocket routes                                                                                   | most of each extension's `server.ts` | Each extension's PR                                                                |

Rough total: about 3,000 lines deleted and about 1,000 rewritten, plus features we get
without writing them (auth, MCP tools, WebMCP, settings sync, git, a11y, shared terminals).

## 14. Testing

Per AGENTS.md: one node test file and one browser test file per package, no mocks, real
browser for widget UI.

- The spike's browser test (`devframe-spike.it.test.ts`) becomes the base of the core
  package's browser test: login, procedure calls, shared state, streaming, reconnect, page
  tools over MCP. It drives the real client in headless Chromium from a separate page origin.
- Each extension PR adds its cases to that extension's existing test files: the plugin
  mounted in a real hub, its functions called through a real client, its dock rendered in
  the widget.
- A widget browser test for the shell: dock switching causes no iframe reloads, only the
  selected dock is visible, palette runs a command, a notify message shows a toast.

## 15. Decisions

Made with Omri on 2026-11-01:

1. **Terminal:** Devframe's Terminals plugin is the default viewer; our terminal view is kept but disabled by default, and never shows the same session as the Terminals plugin (7.1).
2. **Settings:** #572 is set aside; a new settings page gets designed (8.2).
3. **Default plugins:** Messages and Terminals on, everything else opt-in (section 10).
4. **Shell:** conciv ships only its own Solid shell, not Devframe's Vue hub UI. A Vite
   DevTools look, if wanted later, is a conciv theme. A tokens-only theme was tried on
   2026-10-31 (local branch `spike/devframe-skin`) and looked the same as the default, because
   conciv's look lives in component shapes; a real theme needs shape changes too.
5. **Version:** start on Devframe 1.3.0, with `devframe` and `@devframes/*` added to
   `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` until 1.3.0 ages past the window.
6. **Dependencies:** `devframe`, `@devframes/hub` and the default plugins become direct
   dependencies.
7. **Node bearer:** unstable `devframe/node/hub-internals` for now (5.5).
8. **Iframe login:** no bearer in URLs; hub on the page origin on every host, proven on Next (5.5).

## 16. Spike references

Branch `spike/devframe-rpc`, worktree `aidx-wt-devframe-spike`.

| File                                                          | What it shows                                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/core/src/devframe-plane.ts`                         | Hub setup, conciv core functions, shared state, `conciv:host` provide, default plugins |
| `packages/core/test/devframe-spike.it.test.ts`                | 21 browser checks                                                                      |
| `packages/extensions/terminal/src/devframe.ts`, `src/dock.ts` | Extension as a Devframe plugin on hub PTY sessions                                     |
| `packages/extension/src/devframe-host.ts`                     | `conciv:host` service type                                                             |
| `apps/conciv/src/app/devframe-link.tsx`                       | Authorize card, hub runtime, shared state into TanStack Query                          |
| `apps/conciv/src/extensions/devframe-docks.tsx`               | Dock bar as a hub UI                                                                   |
| `apps/conciv/src/app/devframe-overlays.tsx`                   | Palette and toasts                                                                     |
| `packages/plugin/src/core/vite.ts`                            | Hub on Vite's port, Vite DevTools context use                                          |
