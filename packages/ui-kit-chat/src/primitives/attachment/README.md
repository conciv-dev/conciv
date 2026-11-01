# primitives/attachment

## Overview

Attachment model, adapters (image, text, composed) and the headless `Attachment` parts used by composer and message attachment lists.

## Interface

- `attachment.tsx:Attachment` - `{Root, Name, Thumb, Remove}`; `attachment.tsx:AttachmentProvider`, `attachment.tsx:useAttachment`.
- `attachment-adapter.ts` types `Attachment`, `PendingAttachment`, `CompleteAttachment`, `AttachmentAdapter` (`accept`, `add`, `remove`, `send`), `AttachmentContentPart`.
- `attachment-adapter.ts:createSimpleImageAttachmentAdapter`, `attachment-adapter.ts:createTextAttachmentAdapter`, `attachment-adapter.ts:composeAttachmentAdapters`.
- `attachment-adapter.ts:fileToDataSource`, `attachment-adapter.ts:fileMatchesAccept`, `attachment-adapter.ts:isCompleteAttachment`, `attachment-adapter.ts:attachmentId`.

## Invariants

- Image adapter rejects `image/svg+xml` and files over `MAX_ATTACHMENT_RAW_BYTES` (`MAX_IMAGE_BYTES`); text adapter rejects files over 1 MiB (`MAX_TEXT_BYTES`). A failing file is added with status `incomplete` and `send` throws.
- `attachment-adapter.ts:composeAttachmentAdapters` throws `No attachment adapter accepts <name>` when no adapter matches.
- `attachment.tsx:useAttachment` throws outside `Composer.Attachments` / `Message.Attachments`.

## Side Effects

- `attachment-adapter.ts:fileToDataSource` reads the file with a `FileReader` into base64 data.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
