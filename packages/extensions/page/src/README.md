# page/src

## Overview

client.tsx builds the browser extension from `PAGE_CLIENT_TOOLS` and `grabAttachment`, registers `GrabCard` as the renderer for grab attachments, and re-exports the session-card and result-view helpers. server.ts maps each def in `PAGE_TOOL_DEFS` to a server declaration. Most verbs are forwarded to the client. `page_locate` gets a server step that symbolicates stack frames, and `page_screenshot` gets one that writes the image to disk. server.ts also adds a system prompt that steers the model away from `page_eval`.

## Interface

- `page` / default export (`client.tsx`): `defineExtension({name: PAGE_EXTENSION_NAME, tools: PAGE_CLIENT_TOOLS, attachments: [grabAttachment]}).client(() => ({value: {}}))`
- `pageSessionEntry` (`client.tsx`): `GroupEntry` `{key: PAGE_SESSION_GROUP_KEY, render: SessionCard}`
- re-exports (`client.tsx`): `pageSessionSteps`, `PageSessionStep` from client/cards/session-steps.js; `A11yNodeList`, `PageHtmlBlock`, `PageValueChip`, `A11yNode`; `formatHtml`
- `page` / default export (`server.ts`): extension with `tools: declarations`, `systemPrompt: PAGE_PROMPT`, `attachments: [grabAttachment]`, and context `{cwd, symbolicate}` taken from the server
- `PageServerContext` (`server.ts`): type `{cwd: string; symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>}`
- tool `page_locate` server step (`server.ts`, `locateServer`): calls the page, then fills in `source` through `ctx.symbolicate` when the page returned no source
- tool `page_screenshot` server step (`server.ts`, `screenshotServer`): returns `imageResult('image/webp', image, {width, height, path})`
- Subdirectories:
  - [server](./server/README.md): Registers the server-side handler for the grab attachment, which decodes a base64 grab payload into a text part for the model.
  - [shared](./shared/README.md): Environment-neutral definitions for all 40 `page_*` tools (zod input/output schemas, metadata, capture mode) plus the grab attachment declaration.
  - [client](./client/README.md): Browser-side code for the page extension: the `.client()` bodies of all 40 page tools, the snapdom screenshot capture, the Vite HMR settle watcher, HTML formatting, and Solid result views. Its cards/ subdirectory holds the per-tool render cards.

## Invariants

- `declarations` (`server.ts`) uses `SERVER_STEPS[def.name] ?? def.client()`; only `page_locate` and `page_screenshot` get server logic
- `locateServer` (`server.ts`) parses the page reply with `LocateResultSchema`; it returns the data unchanged if `source` is present, or if `frames` fails `z.array(RawFrameSchema)`, or if `frames` is empty
- `screenshotServer` (`server.ts`) validates the page reply with `PageScreenshotSchema.parse` before writing anything
- `grabAttachment.card(GrabCard)` (`client.tsx`) runs at module load, before `page` is defined

## Side Effects

- `screenshotServer` (`server.ts`) runs `mkdir` (recursive) and `writeFile` to `<cwd>/<CONCIV_STATE_DIR>/tmp/screenshots/<randomUUID>.webp`
- `locateServer` / `screenshotServer` (`server.ts`) make an RPC to the browser through `page.call(def.name, input)`
- importing `client.tsx` registers `GrabCard` on the shared `grabAttachment` (module-level global state)
- importing `server.ts` runs the side-effecting import of server/grab-attachment.ts, which registers the attachment's server handler

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
