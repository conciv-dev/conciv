# ui-kit-chat/src/primitives/message

## Overview

Headless `Message` compound: root, parts rendering (flat or grouped), attachments, conditional rendering and error, with message and part contexts.

## Interface

- `message.tsx`: the `Message` compound, exported as `MessagePrimitive`; `message-context.tsx`: the message and part contexts.

## Invariants

- `message-context.tsx:useMessage` and `usePart` throw outside `Thread.Messages` / `Message.Root` and `Message.Parts` respectively.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
