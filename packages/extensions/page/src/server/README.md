# page/src/server

## Overview

This directory has one module. Importing it calls `grabAttachment.server(...)` on the shared attachment, and server.ts imports it for that side effect. The handler base64-decodes the attachment source, parses it with `parseGrabPayload` from @conciv/grab, and passes the payload text through as a text part.

## Interface

- `grabAttachment` (`grab-attachment.ts`): re-export of the shared attachment after its server handler is registered

## Invariants

- the `grabAttachment.server` handler (`grab-attachment.ts`) returns `[]` when base64 decoding fails, when `parseGrabPayload` returns nothing, or when `payload.text === ''`

## Side Effects

- module load (`grab-attachment.ts`) registers the server handler on the shared `grabAttachment` object (global registration state)

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
