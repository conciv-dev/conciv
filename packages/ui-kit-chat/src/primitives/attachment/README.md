# ui-kit-chat/src/primitives/attachment

## Overview

Attachment model, adapters (image, text, composed) and the headless `Attachment` parts used by composer and message attachment lists.

## Interface

- `attachment.tsx`: the `Attachment` parts and their context; `attachment-adapter.ts`: the attachment model and the image, text and composed adapters.

## Invariants

- Image adapter rejects `image/svg+xml` and files over `MAX_ATTACHMENT_RAW_BYTES` (`MAX_IMAGE_BYTES`); text adapter rejects files over 1 MiB (`MAX_TEXT_BYTES`). A failing file is added with status `incomplete` and `send` throws.
- `attachment-adapter.ts:composeAttachmentAdapters` throws `No attachment adapter accepts <name>` when no adapter matches.
- `attachment.tsx:useAttachment` throws outside `Composer.Attachments` / `Message.Attachments`.

## Side Effects

- `attachment-adapter.ts:fileToDataSource` reads the file with a `FileReader` into base64 data.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
