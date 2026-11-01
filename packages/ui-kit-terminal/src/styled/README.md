# ui-kit-terminal/src/styled

## Overview

Styled `Terminal` component combining the primitives with chat-theme CSS variables: a dimmed screen once the session has ended, a 'connecting…' overlay, an optional side rail, and an error or exit banner with an optional 'Back to chat' button.

## Interface

- `Terminal(props)` (`terminal.tsx`): `model`, optional `onBackToChat`, `class`, `rail`

## Invariants

- `settled` (`terminal.tsx`): screen opacity 0.45 when status is 'exited' or 'error'
- `Terminal` (`terminal.tsx`): styling reads --chat-* CSS variables

## Side Effects

- `Terminal` (`terminal.tsx`): mounts `TerminalPrimitive.Screen` and inherits its effects

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-terminal` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck && pnpm lint`
