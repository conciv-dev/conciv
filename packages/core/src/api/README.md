# core/src/api

## Overview

Hono sub-apps for the core server: an MCP endpoint that exposes the sandboxed TypeScript runner as MCP tools, a WebSocket push route that streams page queries and chat events for a session, and a route that serves the native widget host page and bundle. Also holds the zod schemas for the execute tool.

## Interface

- HTTP `POST /` (`mcp.ts`, default export `app`): stateless MCP endpoint served by `createMCPServer` from `@tanstack/ai-mcp`, built per request with the session's tools; spec 2025 replies stream as SSE
- MCP tool `execute_typescript` (`mcp.ts`, `EXECUTE_TOOL_NAME` in `execute-schemas.ts`): runs `typescriptCode` through `CodeRunner.run`; its description carries the stale-engine warning, the sandbox rules and then the capability list (`executeDescription`), since MCP server instructions are not sent; it stays within 4096 characters (the Claude Code cap) by listing capabilities past the budget by name only
- MCP tool `discover_tools` (`mcp.ts`, `DISCOVER_TOOL_NAME`): typed signatures for `{toolNames}`; registered only when `runner.discover` is not null
- MCP tools for each `runner.asking` entry (`mcp.ts`): run through `runDirect`
- WS `GET /push-ws?sessionId=` (`push.ts`, `pushRoutes`; path `PUSH_WS_PATH`): frames on channels `ready`, `page` and `chat`; the client sends `PageServingFrameSchema` frames (`{channel: 'page-serving', serving}`) to start or stop page queries on that socket
- HTTP `GET /` and `GET /:file` (`native-page.ts`, `makeNativePageApp`): host HTML and `conciv-widget-native.global.js` (or its .map)
- `NATIVE_PAGE_PATH` = '/native' (`native-page.ts`)
- HTTP `GET /` (`tabs.ts`, default export `app`, mounted at `/api/tabs`): `TabsSchema` from `@conciv/protocol/chat-types`, the sessions with a page-bus subscriber plus the project name, root and git branch (read from the nearest `.git` at or above the root, a worktree `gitdir:` file included); with `?session=<id>` it answers `TabOpenSchema` (`{open, instructions, tools}`) instead, `tools` being the session's discover output (empty when not open), with no page probe and no session listing
- `TabsVars` (`tabs.ts`)
- `sessionIdFromHeaders` / `nativeIdFromHeaders` / `McpVars` (`mcp.ts`)
- `createOutsideTabs(home?)` (`outside-tabs.ts`, home defaults to `concivHome`): `list()` gives `TabsListingSchema` rows for every live engine in the home db with each failing engine under `unreachable`; `find(tab)` names the one engine holding that tab open with its instructions and tools
- `outsideRunCapabilities({tabs, client, capabilities})` (`outside-run.ts`): the capability set of an outside run (a hub-origin request without a session header): `use_tab` picks a tab for the rest of the execute block and returns its instructions plus a one-line summary per tool, every other non-ask capability except `tabs` forwards to the owning engine's `/api/mcp` with the hub-origin headers
- `callTrace(header)` (`call-trace.ts`): reads `conciv-origin` / `conciv-client` into `hub` (null unless the origin is `hub`) and builds the tool call chunks, which carry `metadata.conciv = {origin: 'hub', client}` on a hub-origin request; shared by `/api/mcp` and the oRPC router; `mirror(run, sink)` publishes a call's chunks and, when the call ran outside a live run, `settle()` records them into the session's chat through `scope.run.record` so the call and its tag survive a reload (a failed save is logged, never fails the call)
- `outsideRefusal(scope, client, reason)` (`outside-refusal.ts`): the text an outside agent gets when the tab has not allowed it (`<client> is waiting for the user to allow it in the conciv tab "<page title>"; retry after they click Approve.`) or denied it; the page title comes from `page_route` within 1.5 s, else the text names no title
- `PushDeps`, `PageQuery` (`push.ts`)
- `ExecuteInputSchema`, `ExecuteResultSchema`, `ExecuteErrorSchema` (`execute-schemas.ts`)
- Subdirectories:
  - rpc: [./rpc/README.md](./rpc/README.md) - the oRPC router

## Invariants

- `sessionIdFromHeaders` / `nativeIdFromHeaders` (`mcp.ts`): a present but invalid header throws HTTP 400
- MCP `POST /` (`mcp.ts`): 403 'forbidden host' when `loopbackHostAllowlist(host)` is empty, which is the DNS rebinding protection; auth stays with the engine gate in front of the route
- `sessionTools` (`mcp.ts`): lists no tools when `codeRunner` returns null
- `sessionTools` (`mcp.ts`): an outside run skips the consent check (the owning engine asks), and only an outside run sees `external_use_tab`; for a hub-origin session the consent check runs when a tool is called, never on initialize or `tools/list`, and holds the call up to 50 s (`OUTSIDE_DECISION_WAIT_MS` in `app.ts`) for the user's Allow or Deny, ending early when the request aborts
- `outsideRunCapabilities` (`outside-run.ts`): a forwarded call before `use_tab` throws `NO_TAB`; the pick lives for one request; an owner that stops answering gives 'the conciv engine at <root> stopped answering'
- `createOutsideTabs` (`outside-tabs.ts`): an unreadable home db throws 'cannot read the conciv home folder <home>'; a 404 or unparsable `/api/tabs` lists the engine as 'engine too old; upgrade its @conciv packages'; a tab open on no engine or on two engines throws `TAB_NOT_OPEN`; every probe times out after 2000 ms
- `runExecute` (`mcp.ts`): output failing `ExecuteResultSchema` becomes 'the sandbox returned an unreadable result'; error codes are decoded only when listed in `runner.declaredCodes`
- `cappedParts` / `cappedText` (`mcp.ts`): text over `RESULT_CAP_CHARS` becomes a truncation envelope
- `GET /api/tabs` (`tabs.ts`): each open session's `page_route` probe is raced against 1500 ms; a timeout or any page error gives `page: null` and the session stays listed; `package.json` and `.git/HEAD` (or a worktree's `gitdir:` file) are re-read on every request, anything unreadable gives null; an invalid `session` query is ignored
- `pushRoutes` (`push.ts`): closes with 1008 when `sessionId` fails `SessionId.safeParse`
- `pushRoutes` (`push.ts`): a socket subscribes to its session's page queries only after a `page-serving` frame with `serving: true`, and sends `ready` at that point; `serving: false` unsubscribes it; chat events stream from open regardless
- `makeNativePageApp` (`native-page.ts`): only the two `NativeFileSchema` filenames are served; anything else is 404

## Side Effects

- `runExecute` / `runDirect` (`mcp.ts`): publish TOOL_CALL_START/ARGS/END/RESULT chat events to `scope.stream`
- `mcp.ts`: `logError` when code mode is unavailable or execute fails outside the sandbox
- `pushRoutes` (`push.ts`): sends WebSocket frames and aborts its AbortController on close or error
- `makeNativePageApp` (`native-page.ts`): reads bundle files from disk
- `outside-tabs.ts`: reads the home db and fetches each engine's `/api/tabs`; `outside-run.ts`: opens an MCP client to the owning engine per forwarded call

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
