# primitives/error

## Overview

Headless `Error` compound that renders only while the chat context holds an error.

## Interface

- `error.tsx:Error` - `Object.assign(Root, {Root, Message})`; exported from the package as `ErrorPrimitive`.

## Invariants

- `error.tsx:Root` renders `role="alert"` only when `useChatContext().error()` is set; `Message` defaults its text to `error.message`.
- Both parts call `useChatContext`, which throws outside a `ChatProvider`.

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
