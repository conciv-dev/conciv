# primitives/message-part

## Overview

Hooks and parts for reading the current message part by type, and the model-only visibility check.

## Interface

- `message-part.tsx:MessagePart` - `{Text, Image, InProgress}`.
- `message-part.tsx:useMessagePartText`, `useMessagePartReasoning`, `useMessagePartImage`, `useMessagePartToolCall`, `useMessagePartFile`, `useMessagePartData`, `useMessagePartSource` (always `null`).
- `part-visibility.ts:partIsModelOnly`.

## Invariants

- Each `useMessagePart*` hook returns `null` when the current part has a different type.
- `part-visibility.ts:partIsModelOnly` is true only when `part.metadata.modelOnly === true`.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
