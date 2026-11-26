# ui-kit-terminal/src

## Overview

Package entry and the headless terminal model. `createTerminalModel` wraps an xterm instance and a session over the transport it is given with exponential-backoff reconnects and a reactive status store, and parses JSON control frames from the server.

## Interface

- `ui-kit-terminal.tsx`: the entry: the model, the transport types, the primitives and the styled `Terminal`
- `createTerminalModel(opts)` (`model.ts`): xterm (scrollback 5000) plus FitAddon plus a session over `opts.transport`
- `TerminalTransport` (`transport.ts`): `(terminal, listener) => link`; the listener hears open, data, control and closed, the link writes, resizes and closes
- `TerminalStatus` (`model.ts`): 'idle' | 'connecting' | 'open' | 'exited' | 'error' | 'closed'
- Subdirectories:
  - primitives: [./primitives/README.md](./primitives/README.md) - headless compound components
  - styled: [./styled/README.md](./styled/README.md) - styled `Terminal`

## Invariants

- `connect` (`model.ts`): does nothing unless status is 'idle'
- `settled` (`model.ts`): 'exited', 'error' and 'closed' are terminal; no reconnect after them
- `AsyncRetryer` (`model.ts`): at most 7 attempts, backoff 500ms to 8000ms, then 'Lost connection to the terminal.'
- Send paths (`model.ts`): send only while the session is open
- Size (`model.ts`): `fit` caps cols and rows at 500; every connect attempt, first or reconnect, waits until the terminal is at least 2x2; a resize is sent only for a size from 2 to 500 (the engine refuses others)
- `injectXtermCss` (`primitives/terminal.tsx`): idempotent per root

## Side Effects

- `createTerminalModel` (`model.ts`): opens a session through `opts.transport` and reconnects on timers
- `disconnect` (`model.ts`): closes the link and disposes xterm
- `injectXtermCss` (`primitives/terminal.tsx`): appends a style element

## Verification

- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck`, then `pnpm lint` at the repo root
