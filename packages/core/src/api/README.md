# core/src/api

## Overview

Hono sub-apps for the core server: an MCP endpoint that exposes the sandboxed TypeScript runner as MCP tools, a WebSocket push route that streams page queries and chat events for a session, and a route that serves the native widget host page and bundle. Also holds the zod schemas for the execute tool.

## Interface

- HTTP `POST /` (`mcp.ts`, default export `app`): stateless MCP endpoint served by `createMCPServer` from `@tanstack/ai-mcp`, built per request with the session's tools; spec 2025 replies stream as SSE
- MCP tool `execute_typescript` (`mcp.ts`, `EXECUTE_TOOL_NAME` in `execute-schemas.ts`): runs `typescriptCode` through `CodeRunner.run`; its description carries the stale-engine warning, the sandbox rules and then the capability list (`executeDescription`), since MCP server instructions are not sent; it stays within 4096 characters (the Claude Code cap) by listing capabilities past the budget by name only
- MCP tool `discover_tools` (`mcp.ts`, `DISCOVER_TOOL_NAME`): typed signatures for `{toolNames}`; registered only when `runner.discover` is not null
- MCP tools for each `runner.asking` entry (`mcp.ts`): run through `runDirect`; an outside agent (a hub-origin request, or the Claude plugin bridge: a Claude session header and no conciv session header) runs them with no Approve card, any other caller (the agent inside the tab) waits for `admitCall` first
- WS `GET /push-ws?sessionId=` (`push.ts`, `pushRoutes`; path `PUSH_WS_PATH`): frames on channels `ready`, `page` and `chat`; the client sends `PageServingFrameSchema` frames (`{channel: 'page-serving', serving}`) to start or stop page queries on that socket
- HTTP `GET /`, `GET /:file` and `GET /widget/:file` (`native-page.ts`, `makeNativePageApp`): host HTML, the `conciv-widget-native.global.js` loader, and the widget's ESM chunks from the bundle dir's `widget/` folder
- `NATIVE_PAGE_PATH` = '/native' (`native-page.ts`)
- `createTabs(deps)` (`tabs.ts`): backs the RPC `tabs.list` and `tabs.get`: `list()` gives `TabsSchema` from `@conciv/protocol/chat-types`, the sessions with a page-bus subscriber plus the project name, root and git branch (read from the nearest `.git` at or above the root, a worktree `gitdir:` file included); `get(sessionId)` gives `TabOpenSchema` (`{open, instructions}`): page-bus membership and the engine's instructions text, with no page probe, no discover and no session listing
- `sessionIdFromHeaders` / `nativeIdFromHeaders` / `McpVars` (`mcp.ts`)
- `openCodeSession(deps, scope, caller)` (`mcp.ts`): the one engine function behind both `/api/mcp` and the RPC `code.*` procedures: it builds the session's code runner (the outside capability set for a hub-origin call without a session) and mirrors every call into the session's chat; `execute(code)` gives the typed `CodeExecuteResult` (`queued`: every queue the run started, from the queue store by its child call ids, never from the returned value; `finished`: the finished queues not yet delivered to this caller, marked delivered) and the MCP reply `/api/mcp` serves; `discover(names)` the capped signatures; `describe()` the two tool descriptions; returns null when code mode is unavailable
- `createOutsideTabs(home?)` (`outside-tabs.ts`, home defaults to `concivHome`): `list()` gives `TabsListingSchema` rows for every live engine in the home db with each failing engine under `unreachable`
- `outsideRunCapabilities(capabilities)` (`outside-run.ts`): the capability set of an outside run (a hub-origin request without a session header): `tabs` as is, every other non-ask capability throws `NO_TAB` ('pass tab to execute_typescript; external_tabs({}) lists the open tabs'); a block that drives a tab comes from the hub with that tab's session header and runs on the session path
- `callTrace(header)` (`call-trace.ts`): reads `conciv-origin` / `conciv-client` / `conciv-chosen-engine` into `hub` = `{client, choseEngine}` (null unless the origin is `hub`; `choseEngine` is true when `conciv-chosen-engine: 1` came, which the CLI sends with `--tab` or when it found the engine in the project folder outside the in-widget agent) and builds the tool call chunks, which carry `metadata.conciv = {origin: 'hub', client, run}` on a hub-origin request; `callId` is the one id of the request's outside call, used as the top call's id and as `run` on that call, its child calls and its result, so the panel can give each outside call its own turn; shared by `/api/mcp` and the oRPC router; `mirror(run, sink)` publishes a call's chunks and, when the call ran outside a live run, `settle()` records them into the session's chat through `scope.run.record` so the call and its tag survive a reload (a failed save is logged, never fails the call)
- `outsideRefusal(scope, client, reason)` (`outside-refusal.ts`): the text an outside agent gets when the tab has not allowed it (`<client> is waiting for the user to allow it in the conciv tab "<page title>"; retry after they click Approve.`) or denied it; the page title comes from `page_route` within 1.5 s, else the text names no title
- `PushDeps`, `PageQuery` (`push.ts`)
- `ExecuteInputSchema`, `ExecuteResultSchema`, `ExecuteErrorSchema` (`execute-schemas.ts`)
- Subdirectories:
  - rpc: [./rpc/README.md](./rpc/README.md) - the oRPC router

## Invariants

- `sessionIdFromHeaders` / `nativeIdFromHeaders` (`mcp.ts`): a present but invalid header throws HTTP 400
- MCP `POST /` (`mcp.ts`): 403 'forbidden host' when `loopbackHostAllowlist(host)` is empty, which is the DNS rebinding protection; auth stays with the engine gate in front of the route
- `sessionTools` (`mcp.ts`): lists no tools when `codeRunner` returns null
- `sessionTools` (`mcp.ts`): every hub-origin call is refused first when `deps.hubRefusal(client)` says the calling agent is disconnected (outside runs included, whatever `hubAccess` says), and again after the Allow card resolves; an outside run skips the consent check (it can only list tabs); for a hub-origin session the consent check runs when a tool is called, never on initialize or `tools/list`, and holds the call up to 50 s (`OUTSIDE_DECISION_WAIT_MS` in `app.ts`) for the user's Allow or Deny, ending early when the request aborts
- `createOutsideTabs` (`outside-tabs.ts`): an unreadable home db throws 'cannot read the conciv home folder <home>'; an engine without `tabs.list` (NOT_FOUND) or with an answer outside the contract lists as 'engine too old; upgrade its @conciv packages'; every probe times out after 300 ms
- `runExecute` (`mcp.ts`): output failing `ExecuteResultSchema` becomes 'the sandbox returned an unreadable result'; error codes are decoded only when listed in `runner.declaredCodes`
- `typedResult` (`mcp.ts`): the `code.execute` result is bounded where it is built: `result` through `cappedValue`, `logs` (as one JSON text) and `error.message` through `cappedText` (`@conciv/contract`); `/api/mcp` and the hub both turn it into MCP content with `codeExecuteReply` (`@conciv/contract`), which caps again per text part
- `createTabs` (`tabs.ts`): each browser tab of each open session gets its own `page_route` probe raced against 200 ms, so the listing answers inside the 300 ms its callers wait; a timeout or any page error gives that browser tab `page: null` and the session stays listed; the row's `page` is that of the browser tab a call would go to; `package.json` and `.git/HEAD` (or a worktree's `gitdir:` file) are re-read on every request, anything unreadable gives null
- `pushRoutes` (`push.ts`): a `page-serving` frame's optional `focus` updates that socket's browser-tab focus (a focused report stamps `focusedAt`), which the page bus reads to pick the target browser tab
- `pushRoutes` (`push.ts`): closes with 1008 when `sessionId` fails `SessionId.safeParse`
- `pushRoutes` (`push.ts`): a socket subscribes to its session's page queries only after a `page-serving` frame with `serving: true`, and sends `ready` at that point; `serving: false` unsubscribes it; chat events stream from open regardless
- `makeNativePageApp` (`native-page.ts`): `/:file` serves only `NativeFileSchema` (the loader); `/widget/:file` serves only names matching `ChunkFileSchema` (no slash, no `..` segment, `.js`); anything else is 404

## Side Effects

- `runExecute` / `runDirect` (`mcp.ts`): publish TOOL_CALL_START/ARGS/END/RESULT chat events to `scope.stream`
- `mcp.ts`: `logError` when code mode is unavailable or execute fails outside the sandbox
- `pushRoutes` (`push.ts`): sends WebSocket frames and aborts its AbortController on close or error
- `makeNativePageApp` (`native-page.ts`): reads bundle files from disk
- `outside-tabs.ts`: reads the home db and calls each engine's `tabs.list`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
