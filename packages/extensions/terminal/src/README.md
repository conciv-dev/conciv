# terminal/src

## Overview

`client.tsx` defines the `terminal` extension. It has one view (`terminal`, labeled 'Terminal'), whose component is `TerminalPanelView` with `TerminalActions` as the action bar, and its client context is a `createTerminalStore()` store. `server.ts` defines `createTerminalExtension`, which makes a `createTtySessions()` registry per server. It exposes the RPC procedures `open`, `close`, `state`, `launch` and `connectCommand`, plus a Hono app with `GET /tty` that upgrades to a WebSocket and streams pty output both ways. The pty is started from the harness `ttyCommand`, and resume tokens are minted through `server.sessions`.

## Interface

- `terminal` / default (`client.tsx`): client extension named `TERMINAL_NAME`, with view `{id:'terminal', Component: TerminalPanelView, actions: TerminalActions}` and context `{store}`; it also augments `ExtensionRegistry` in `@conciv/protocol/config-types`
- `createTerminalExtension(opts?: {openTerminal?})` (`server.ts`): server extension that returns `{context:{}, router, app, dispose}`; `dispose` calls `tty.shutdown()`
- default export (`server.ts`): `createTerminalExtension()` called with no options
- RPC `open` (`server.ts`): input is `TerminalOpenRequestSchema` plus `sessionId`; reuses a live pty (resizing it) or spawns a new one, and returns `{alive:true}`
- RPC `close` (`server.ts`): kills the session's pty and returns `{alive:false}`
- RPC `state` (`server.ts`): returns a `TerminalState` with fields `{alive, busy}`
- RPC `launch` (`server.ts`): builds the harness `connectPlan` and opens it in an external OS terminal via `launchConnectPlan`, returning `{ok}`
- RPC `connectCommand` (`server.ts`): returns `{command}`, a shell command string from `renderConnectCommand`
- Route `GET /tty?session=&cols=&rows=` (`server.ts`): WebSocket that attaches a `TtySink`; binary frames carry pty data and JSON frames carry control messages
- `TerminalRouter`, `TerminalAppType` (`server.ts`): exported types for the router and the Hono app
- Subdirectories:
  - [server](./server/README.md): Node-side pty session registry with replay buffering, OSC 9;4 busy detection, frame-safe text injection, external terminal launching, and a fix for the node-pty spawn-helper execute permission on macOS.
  - [shared](./shared/README.md): Zod schemas and constants used by both the client and server halves of the terminal extension.
  - [client](./client/README.md): SolidJS client code: the terminal panel view (an xterm surface over the `/tty` WebSocket), its action bar, a signal store, and oRPC/URL helpers.

## Invariants

- `GET /tty` returns 400 'invalid or missing session' when the `session` query param fails `SessionId.safeParse` (`server.ts`)
- The WebSocket closes with code 4404 'no terminal for session' if no tty session exists when it opens (`server.ts`)
- On WS open, a resize happens only if `cols` and `rows` are both integers greater than 1 (`server.ts`)
- RPC `open` throws `NO_TTY` when `server.harness.ttyCommand` is missing; `openTtySession` likewise throws `harness "<id>" has no terminal mode` (`server.ts`)
- RPC `close` throws `BUSY` when the session's pty is busy (`server.ts`)
- RPC `launch` and `connectCommand` throw `NO_CONNECT` when `harness.connectPlan` is absent (`server.ts`)
- `LaunchInputSchema` limits `model` to 1-200 characters (`server.ts`)
- `reuseAlive` reuses a session only if one exists and `exited()` is null (`server.ts`)
- `applyControl`: a lone ESC is sent as an interrupt only while the session is busy; otherwise the text goes to the pty (`server.ts`)
- `parseControl` accepts only text starting with '{' that passes `TtyClientControlSchema`; anything else is treated as raw input (`server.ts`)
- `mintHarnessSession` reuses an existing `resumeToken` and only otherwise mints a new UUID and records it (`server.ts`)
- `resumable` is false when there is no harnessSessionId; otherwise it uses `harness.transcriptExists`, defaulting to true (`server.ts`)
- `openTtySession` calls `server.harness.release?.(sessionId)` before spawning the pty (`server.ts`)

## Side Effects

- `openTtySession` (`server.ts`) spawns a pty process via `tty.open` and, on resume, injects a dim 'conciv: resumed session' banner
- `mintHarnessSession` (`server.ts`) persists a new harness token with `server.sessions.recordToken`
- `GET /tty` (`server.ts`) sends pty bytes and JSON control frames over the WebSocket and writes client input to the pty
- RPC `launch` (`server.ts`) writes plan files and a launch script to disk and spawns an external terminal process

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-terminal` from the repo root (turbo builds the package and its dependencies first)
