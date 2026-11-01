# core/src/api

## Overview

Hono sub-apps for the core server: an MCP endpoint that exposes the sandboxed TypeScript runner as MCP tools, a WebSocket push route that streams page queries and chat events for a session, and a route that serves the native widget host page and bundle. Also holds the zod schemas for the execute tool.

## Interface

- HTTP `POST /` (`mcp.ts`, default export `app`): stateless MCP Streamable HTTP endpoint; builds a fresh `McpServer` named 'conciv' per request
- MCP tool `execute_typescript` (`mcp.ts`, `EXECUTE_TOOL_NAME` in `execute-schemas.ts`): runs `typescriptCode` through `CodeRunner.run`
- MCP tool `discover_tools` (`mcp.ts`, `DISCOVER_TOOL_NAME`): typed signatures for `{toolNames}`; registered only when `runner.discover` is not null
- MCP tools for each `runner.asking` entry (`mcp.ts`): run through `runDirect`
- WS `GET /push-ws?sessionId=` (`push.ts`, `pushRoutes`; path `PUSH_WS_PATH`): frames on channels `ready`, `page` and `chat`
- HTTP `GET /` and `GET /:file` (`native-page.ts`, `makeNativePageApp`): host HTML and `conciv-widget-native.global.js` (or its .map)
- `NATIVE_PAGE_PATH` = '/native' (`native-page.ts`)
- `sessionIdFromHeaders` / `nativeIdFromHeaders` / `serverInstructions` / `McpVars` (`mcp.ts`)
- `PushDeps`, `PageQuery` (`push.ts`)
- `ExecuteInputSchema`, `ExecuteResultSchema`, `ExecuteErrorSchema` (`execute-schemas.ts`)
- Subdirectories:
  - rpc: [./rpc/README.md](./rpc/README.md) - the oRPC router

## Invariants

- `sessionIdFromHeaders` / `nativeIdFromHeaders` (`mcp.ts`): a present but invalid header throws HTTP 400
- MCP `POST /` (`mcp.ts`): 403 'forbidden host' when `loopbackHostAllowlist(host)` is empty; DNS rebinding protection uses that allowlist
- `buildServer` (`mcp.ts`): registers no tools when `codeRunner` returns null
- `runExecute` (`mcp.ts`): output failing `ExecuteResultSchema` becomes 'the sandbox returned an unreadable result'; error codes are decoded only when listed in `runner.declaredCodes`
- `cappedParts` / `cappedText` (`mcp.ts`): text over `RESULT_CAP_CHARS` becomes a truncation envelope
- `pushRoutes` (`push.ts`): closes with 1008 when `sessionId` fails `SessionId.safeParse`
- `makeNativePageApp` (`native-page.ts`): only the two `NativeFileSchema` filenames are served; anything else is 404

## Side Effects

- `runExecute` / `runDirect` (`mcp.ts`): publish TOOL_CALL_START/ARGS/END/RESULT chat events to `scope.stream`
- `mcp.ts`: `logError` when code mode is unavailable or execute fails outside the sandbox
- `pushRoutes` (`push.ts`): sends WebSocket frames and aborts its AbortController on close or error
- `makeNativePageApp` (`native-page.ts`): reads bundle files from disk

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
