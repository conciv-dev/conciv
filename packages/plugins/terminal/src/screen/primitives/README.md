# plugins/terminal/src/screen/primitives

## Overview

Headless Solid compound components for the terminal: a Root that provides the model through context, a Screen that opens xterm and connects once it has width, and a Banner shown on exit or error.

## Interface

- `TerminalPrimitive` (`terminal.tsx`): {Root, Screen, Banner}
- `useTerminal(): TerminalModel` (`terminal.tsx`)
- `Root` (`terminal.tsx`): `div[data-terminal-root][data-status]`
- `Screen` (`terminal.tsx`): `div[data-terminal-screen]`
- `Banner` (`terminal.tsx`): render prop `children({code, message})` when status is 'exited' or 'error'

## Invariants

- `useTerminal` (`terminal.tsx`): throws outside `<TerminalPrimitive.Root>`
- `Root` (`terminal.tsx`): the model is captured once with `untrack`; swapping the prop later has no effect
- `Screen` (`terminal.tsx`): start runs once and only when the screen has width and height; later resizes only call `fit`

## Side Effects

- `Screen` (`terminal.tsx`): opens xterm, injects xterm CSS, calls `model.connect()`, and `focus()` only while focus is still on the page body, its tab panel or its tab; installs a ResizeObserver; calls `model.disconnect()` on cleanup

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-terminal` from the repo root
- Typecheck and lint: `cd packages/plugins/terminal && pnpm typecheck && pnpm lint`
