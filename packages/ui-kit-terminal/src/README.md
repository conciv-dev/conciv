# ui-kit-terminal/src

## Overview

Package entry and the headless terminal model. `createTerminalModel` wraps an xterm instance and a session over the transport it is given with exponential-backoff reconnects and a reactive status store, and parses JSON control frames from the server.

## Interface

- `index.tsx`: re-exports `createTerminalModel`, `translateBuffer`, `TerminalModel`, `TerminalModelOpts`, `TerminalStatus`, `TerminalTheme`, the transport types, `TerminalPrimitive`, `useTerminal`, `Terminal`
- `createTerminalModel(opts)` (`model.ts`): xterm (scrollback 5000) plus FitAddon plus a session over `opts.transport`
- `TerminalTransport` (`transport.ts`): `(terminal, listener) => link`; the listener hears open, data, control and closed, the link writes, resizes, injects and closes
- `TerminalModel` (`model.ts`): terminal, status, busy, exitCode, errorMessage, connect, disconnect, fit, focus, inject, paste, sendInput
- `TerminalStatus` (`model.ts`): 'idle' | 'connecting' | 'open' | 'exited' | 'error' | 'closed'
- `injectXtermCss(root)` (`xterm-css.ts`)
- Subdirectories:
  - primitives: [./primitives/README.md](./primitives/README.md) - headless compound components
  - styled: [./styled/README.md](./styled/README.md) - styled `Terminal`

## Invariants

- `connect` (`model.ts`): does nothing unless status is 'idle'
- `settled` (`model.ts`): 'exited', 'error' and 'closed' are terminal; no reconnect after them
- `AsyncRetryer` (`model.ts`): at most 7 attempts, backoff 500ms to 8000ms, then 'Lost connection to the terminal.'
- Send paths (`model.ts`): send only while the session is open
- `injectXtermCss` (`xterm-css.ts`): idempotent per root

## Side Effects

- `createTerminalModel` (`model.ts`): opens a session through `opts.transport` and reconnects on timers
- `disconnect` (`model.ts`): closes the link and disposes xterm
- `injectXtermCss` (`xterm-css.ts`): appends a style element

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-terminal` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck && pnpm lint`
