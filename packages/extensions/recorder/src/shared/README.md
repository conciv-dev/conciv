# recorder/src/shared

## Overview

This directory defines the recorder's wire and config contracts, which both the browser and server bundles import. It holds the zod schemas for extension config, rrweb events and control messages. It also has helpers that encode and decode the recording reference carried inside attachments. `attachment.ts` declares the recorder attachment type under `RECORDER_MIME`; the server handler is attached in `src/server/attachment.ts`.

## Interface

- `RECORDER_NAME` (`protocol.ts`): extension name constant 'recorder'
- `recorderConfig` / `RecorderConfig` (`protocol.ts`): zod config with `masking` ('none'|'inputs'|'sensitive', default 'none'), `windowMinutes` (default 10) and `console` (default true)
- `RrwebEvent` / `RrwebEventSchema` (`protocol.ts`): {type, data, timestamp} event shape
- `MAX_FLUSH_BYTES` (`protocol.ts`): 8 MiB flush size constant
- `jsonByteLength` (`protocol.ts`): UTF-8 byte length of JSON.stringify(value)
- `RecorderControlSchema` / `RecorderControl` (`protocol.ts`): control message with optional `live`, `flush` and `snapshot` booleans
- `ActionLogKind` / `ActionLogEntry` / `Keyframe` (`protocol.ts`): action log and keyframe types
- `RECORDER_MIME` (`protocol.ts`): 'application/x-conciv-recorder'
- `RecordingRef` / `recordingRefJson` / `parseRecordingRefJson` / `decodeRecordingRef` (`protocol.ts`): JSON and base64 codec for {recordingId, poster}
- `recordingPoster` (`protocol.ts`): builds the label 'Screen recording · N action(s) · Ss'
- `recordingAttachment` (`attachment.ts`): `defineAttachment<{recorder: RecorderRuntime}>({mime: RECORDER_MIME})`

## Invariants

- `windowMinutes` must be a positive integer of at most 60 (`recorderConfig`, `protocol.ts`)
- `RecordingRefSchema` requires a non-empty `recordingId` and a string `poster`; `parseRecordingRefJson` and `decodeRecordingRef` return null on invalid JSON, invalid base64 or a schema mismatch (`protocol.ts`)
- `recordingPoster` clamps the duration to at least 0 seconds and uses the singular 'action' when there is exactly 1 entry (`protocol.ts`)

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-recorder` from the repo root (turbo builds the package and its dependencies first)
