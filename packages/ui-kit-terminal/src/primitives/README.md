# ui-kit-terminal/src/primitives

## Overview

Headless Solid compound components for the terminal: a Root that provides the model through context, a Screen that opens xterm and connects once it has width, a Banner shown on exit or error, and an Overlay anchor.

## Interface

- `TerminalPrimitive` (`terminal.tsx`): {Root, Screen, Banner, Overlay}
- `useTerminal(): TerminalModel` (`terminal.tsx`)
- `Root` (`terminal.tsx`): `div[data-terminal-root][data-status]`
- `Screen` (`terminal.tsx`): `div[data-terminal-screen]`
- `Banner` (`terminal.tsx`): render prop `children({code, message})` when status is 'exited' or 'error'
- `Overlay` (`terminal.tsx`): `anchor: 'rail' | 'top-right'`

## Invariants

- `useTerminal` (`terminal.tsx`): throws outside `<TerminalPrimitive.Root>`
- `Root` (`terminal.tsx`): the model is captured once with `untrack`; swapping the prop later has no effect
- `Screen` (`terminal.tsx`): start runs once and only when `clientWidth > 0`; later resizes only call `fit`

## Side Effects

- `Screen` (`terminal.tsx`): opens xterm, injects xterm CSS, calls `model.connect()` and `focus()`; installs a ResizeObserver; calls `model.disconnect()` on cleanup

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-terminal` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck && pnpm lint`
