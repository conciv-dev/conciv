# grab/src

## Overview

`grab.ts` defines the element-grab types and two label helpers. `grab-attachment.ts` serializes a `Grab` into a size-bounded JSON payload or a `File` with MIME type `application/vnd.conciv.grab+json`, and parses such payloads back with a zod schema.

## Interface

- Types `ElementSource`, `ElementRect`, `DomPreview` (kind `'dom'`), `ImagePreview` (kind `'image'`), `GrabPreview`, `GrabFrame`, `GrabSourceLoc`, `StagedGrab`, `Grab` (= `StagedGrab & {text}`) (`grab.ts`).
- `GrabApi` `{pick, comment, cancel, isActive, grabbable?, stage, staged, clear}`; `GrabActions` = `Pick<GrabApi, 'pick' | 'comment' | 'cancel' | 'isActive' | 'grabbable'>`; `GrabProvider` = `() => GrabActions` (`grab.ts`).
- `sourceLabel(source)` (`grab.ts`): `'<component> at <file>:<line>'`, shortened when parts are missing.
- `composeGrabText(snippet, source, fallback)` (`grab.ts`): `'<snippet> at <file>:<line>:<col>'`, or `fallback` when either input is missing.
- `GRAB_MIME` = `'application/vnd.conciv.grab+json'`, `GRAB_FILE_NAME` = `'Grabbed element'`, `MAX_PAYLOAD_BYTES` = 750000 (`floor(1_000_000 * 3/4)`) (`grab-attachment.ts`).
- `GrabPayload` `{text, snippet?, source, rect, preview}`, `grabToPayload(grab)`, `grabToFile(grab)`, `parseGrabPayload(raw)`, `imagePreviewBudget(grab, preview)` (`grab-attachment.ts`).

## Invariants

- `grabToPayload` degrades in order until it fits `MAX_PAYLOAD_BYTES`: full payload; without preview and snippet; text binary-search truncated by code points plus `…`; finally `{text, source: null, rect: null, preview: null}` (`grab-attachment.ts`).
- `parseGrabPayload` returns null for input over `MAX_PAYLOAD_BYTES` UTF-8 bytes, invalid JSON, or a schema mismatch (`grab-attachment.ts`).
- An image preview `dataUrl` must start with `data:image/` (`GrabPreviewSchema`).
- `sourceLabel` drops the location when `filePath === ''` (`whereLabel`, `grab.ts`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/grab` from the repo root (turbo builds the package and its dependencies first)
