# page/src

## Overview

client.tsx builds the browser extension from `PAGE_CLIENT_TOOLS` and `grabAttachment`, registers `GrabCard` as the renderer for grab attachments, and re-exports the session-card and result-view helpers. server.ts lists only the grab attachment on the engine: the page tools moved to the page plugin.

## Interface

- `page` / default export (`client.tsx`): `defineExtension({name: PAGE_EXTENSION_NAME, tools: PAGE_CLIENT_TOOLS, attachments: [grabAttachment]}).client(() => ({value: {}}))`
- `pageSessionEntry` (`client.tsx`): `GroupEntry` `{key: PAGE_SESSION_GROUP_KEY, render: SessionCard}`
- re-exports (`client.tsx`): `pageSessionSteps`, `PageSessionStep` from client/cards/session-steps.js; `A11yNodeList`, `PageHtmlBlock`, `PageValueChip`, `A11yNode`; `formatHtml`
- `page` / default export (`server.ts`): the remnant engine extension, `attachments: [grabAttachment]` only: no tools, no system prompt, no context; the page tools, prompt, symbolication and screenshots are the page plugin's (`@conciv/plugin-page`)
- Subdirectories:
  - [server](./server/README.md): Registers the server-side handler for the grab attachment, which decodes a base64 grab payload into a text part for the model.
  - [shared](./shared/README.md): Environment-neutral definitions for all 40 `page_*` tools (zod input/output schemas, metadata, capture mode) plus the grab attachment declaration.
  - [client](./client/README.md): Browser-side code for the page extension: the `.client()` bodies of all 40 page tools, the snapdom screenshot capture, the Vite HMR settle watcher, HTML formatting, and Solid result views. Its cards/ subdirectory holds the per-tool render cards.

## Invariants

- `grabAttachment.card(GrabCard)` (`client.tsx`) runs at module load, before `page` is defined

## Side Effects

- importing `client.tsx` registers `GrabCard` on the shared `grabAttachment` (module-level global state)
- importing `server.ts` runs the side-effecting import of server/grab-attachment.ts, which registers the attachment's server handler

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
