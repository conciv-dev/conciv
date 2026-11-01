# ui-kit-terminal/src

## Overview

Package entry and the headless terminal model. `createTerminalModel` wraps an xterm instance and a WebSocket session with exponential-backoff reconnects and a reactive status store, and parses JSON control frames from the server.

## Interface

- `index.tsx`: re-exports `createTerminalModel`, `translateBuffer`, `TerminalModel`, `TerminalModelOpts`, `TerminalStatus`, `TerminalTheme`, `TerminalPrimitive`, `useTerminal`, `Terminal`
- `createTerminalModel(opts)` (`model.ts`): xterm (scrollback 5000) plus FitAddon plus a WebSocket session
- `TerminalModel` (`model.ts`): terminal, status, busy, exitCode, errorMessage, connect, disconnect, fit, focus, inject, paste, sendInput
- `TerminalStatus` (`model.ts`): 'idle' | 'connecting' | 'open' | 'exited' | 'error' | 'closed'
- Client frames (`model.ts`): raw input, `{type:'resize', cols, rows}`, `{type:'inject', text}`; server frames parsed with `TtyServerControlSchema`
- `injectXtermCss(root)` (`xterm-css.ts`)
- Subdirectories:
  - primitives: [./primitives/README.md](./primitives/README.md) - headless compound components
  - styled: [./styled/README.md](./styled/README.md) - styled `Terminal`

## Invariants

- `connect` (`model.ts`): does nothing unless status is 'idle'
- `settled` (`model.ts`): 'exited', 'error' and 'closed' are terminal; no reconnect after them
- `AsyncRetryer` (`model.ts`): at most 7 attempts, backoff 500ms to 8000ms, then 'Lost connection to the terminal.'
- `safeControl` (`model.ts`): invalid control frames are dropped; binary frames go to xterm
- Send paths (`model.ts`): send only while the socket is OPEN
- `injectXtermCss` (`xterm-css.ts`): idempotent per root

## Side Effects

- `createTerminalModel` (`model.ts`): opens a WebSocket to `opts.url(terminal)` and reconnects on timers
- `disconnect` (`model.ts`): closes the socket and disposes xterm
- `injectXtermCss` (`xterm-css.ts`): appends a style element

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-terminal` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck && pnpm lint`
