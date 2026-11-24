# plugins/terminal/src/screen/styled

## Overview

Styled `Terminal` component combining the primitives with chat-theme CSS variables: a dimmed screen once the session has ended, a 'connecting…' overlay, and an error or exit banner with an optional 'Back to chat' button.

## Interface

- `Terminal(props)` (`terminal.tsx`): `model`, optional `onBackToChat`, `class`

## Invariants

- `settled` (`terminal.tsx`): screen opacity 0.45 when status is 'exited' or 'error'
- `Terminal` (`terminal.tsx`): styling reads --chat-* CSS variables

## Side Effects

- `Terminal` (`terminal.tsx`): mounts `TerminalPrimitive.Screen` and inherits its effects

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/plugin-terminal` from the repo root
- Typecheck and lint: `cd packages/plugins/terminal && pnpm typecheck && pnpm lint`
