# primitives/message

## Overview

Headless `Message` compound: root, parts rendering (flat or grouped), attachments, conditional rendering and error, with message and part contexts.

## Interface

- `message.tsx:Message` - `{Root, Parts, PartByIndex, Attachments, AttachmentByIndex, Unstable_PartsGrouped, If, Error}`; exported as `MessagePrimitive`; type `PartsComponents`.
- `message-context.tsx:MessageProvider`, `useMessage`, `PartProvider`, `usePart`; types `MessageContextValue`, `PartContextValue`.

## Invariants

- `message-context.tsx:useMessage` and `usePart` throw outside `Thread.Messages` / `Message.Root` and `Message.Parts` respectively.

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
