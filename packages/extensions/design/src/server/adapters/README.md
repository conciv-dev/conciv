# design/src/server/adapters

## Overview

The adapter accepts a reference that is either a file under cwd or base64 data with the PNG signature. It decodes the PNG, scales it with nearest-neighbour to the requested width (default: native width), and returns a TargetModel with a single root frame node and a random 8-char id.

## Interface

- `imageAdapter` (`image.ts`): TargetAdapter of kind 'image' with `accepts` and `load`
- `unreadableMessage` (`image.ts`): builds the 'image is neither a PNG file nor PNG base64' message, truncating the ref to 80 chars

## Invariants

- Base64 input is accepted only if the decoded bytes start with the 8-byte PNG signature (`imageAdapter`, `image.ts`)
- `load` throws `toolError('image-unreadable')` when the ref is neither an existing file nor PNG base64 (`imageAdapter`, `image.ts`)
- source.ref is recorded as 'base64' when the input is not a file (`imageAdapter`, `image.ts`)

## Side Effects

- Reads the image file from disk relative to cwd (existsSync/statSync/readFile) (`imageAdapter`, `image.ts`)

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
