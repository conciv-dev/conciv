# page/src

## Overview

client.tsx is an empty browser extension (no host mounts it) and re-exports the simulator. The grab attachment card is the built-in page plugin's (`@conciv/builtin-plugins`, `src/page/cards`). server.ts lists only the grab attachment on the engine: the page tools moved to the page plugin.

## Interface

- `page` / default export (`client.tsx`): `defineExtension({name: PAGE_EXTENSION_NAME}).client(() => ({value: {}}))`
- re-exports (`client.tsx`): `endRun`, `endTask`, `mountSimulator` from client/simulator.js
- `page` / default export (`server.ts`): the remnant engine extension, `attachments: [grabAttachment]` only: no tools, no system prompt, no context; the page tools, prompt, symbolication and screenshots are the page plugin's (`@conciv/plugin-page`)
- Subdirectories:
  - [server](./server/README.md): Registers the server-side handler for the grab attachment, which decodes a base64 grab payload into a text part for the model.
  - [shared](./shared/README.md): Environment-neutral definitions for all 40 `page_*` tools (zod input/output schemas, metadata, capture mode) plus the grab attachment declaration.
  - [client](./client/README.md): Browser-side code left in the page extension: the agent cursor simulator and the capture plugins.

## Invariants

## Side Effects

- importing `server.ts` runs the side-effecting import of server/grab-attachment.ts, which registers the attachment's server handler

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
