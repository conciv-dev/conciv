# ui-kit-chat/src/primitives/message-part

## Overview

Hooks and parts for reading the current message part by type, and the model-only visibility check.

## Interface

- `message-part.tsx`: the `MessagePart` parts and the hooks that read the current part by type; `part-visibility.ts`: the model-only check.

## Invariants

- Each `useMessagePart*` hook returns `null` when the current part has a different type.
- `part-visibility.ts:partIsModelOnly` is true only when `part.metadata.modelOnly === true`.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
