# ui-kit-chat/src/primitives/error

## Overview

Headless `Error` compound that renders only while the chat context holds an error.

## Interface

- `error.tsx`: the `Error` compound, exported from the package as `ErrorPrimitive`.

## Invariants

- `error.tsx:Root` renders `role="alert"` only when `useChatContext().error()` is set; `Message` defaults its text to `error.message`.
- Both parts call `useChatContext`, which throws outside a `ChatProvider`.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
