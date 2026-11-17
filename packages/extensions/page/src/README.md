# page/src

## Overview

server.ts lists only the grab attachment on the engine: the page tools moved to the page plugin. The grab attachment card is the built-in page plugin's (`@conciv/builtin-plugins`, `src/page/cards`). No browser entry is left.

## Interface

- `page` / default export (`server.ts`): the remnant engine extension, `attachments: [grabAttachment]` only: no tools, no system prompt, no context; the page tools, prompt, symbolication and screenshots are the page plugin's (`@conciv/plugin-page`)
- Subdirectories:
  - [server](./server/README.md): Registers the server-side handler for the grab attachment, which decodes a base64 grab payload into a text part for the model.
  - [shared](./shared/README.md): Environment-neutral definitions for all 40 `page_*` tools (zod input/output schemas, metadata, capture mode) plus the grab attachment declaration.
  - [client](./client/README.md): The snapdom capture plugins the design extension imports.

## Invariants

## Side Effects

- importing `server.ts` runs the side-effecting import of server/grab-attachment.ts, which registers the attachment's server handler

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/extension-page` from the repo root
