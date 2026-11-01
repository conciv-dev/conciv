# recorder/src/tool

## Overview

`def.ts` declares the three tool schemas and their metadata. `server.ts` implements them against `RecorderRuntime.control` and `pullWindow`, and `client.ts` binds each tool to `recordingToolCard`. `card.tsx` parses a tool result, which can be an array of image/text parts, a {captureId} object or an {error} object, into a card listing actions, the keyframe count and the error state. `story.fixtures.ts` provides Storybook helpers that only `card.stories.tsx` uses; no file in the package's test/ dir references it.

## Interface

- `startToolDef` (`def.ts`): tool `recording_start`; empty input; output is {captureId, startedAt} or {error}
- `stopToolDef` (`def.ts`): tool `recording_stop`; input {captureId, keyframes 0-8 default 3}; output is a RecordingWindow array or {error}
- `pullToolDef` (`def.ts`): tool `recording_pull`; input {secondsBack 1-600 default 60, keyframes 0-8 default 3}; output is a RecordingWindow array
- `startTool` / `stopTool` / `pullTool` (`server.ts`): server implementations of the three tools
- `startToolClient` / `stopToolClient` / `pullToolClient` (`client.ts`): client tools rendered with `recordingToolCard`
- `RecordingToolCard` / `recordingToolCard` (`card.tsx`): Solid ToolCard with a subtitle like 'last Ns · N actions · N keyframes' or 'capture started'; `hasEmbeddedBody` always returns true
- `STORY_FRAME_CLASS` / `storyAddResult` / `storyCtx` / `storyPart` / `storyResult` (`story.fixtures.ts`): Storybook fixtures for tool-call and tool-result parts
- `Main` / `ErrorState` / `Recording` / `EmbeddedInTrace` / `EmbeddedError` (`card.stories.tsx`): Storybook stories with play assertions

## Invariants

- `recording_start` waits up to `START_ATTACH_TIMEOUT_MS` (5000 ms) for a ring append; if none arrives it stops the capture and returns {error:'no page client attached within 5s; ...'} (`startTool`, `server.ts`)
- `recording_stop` returns {error:`no active capture ${captureId}`} for an unknown capture; otherwise it waits up to 1500 ms for a flush append before calling pullWindow(startTs, stopTs) (`stopTool`, `server.ts`)
- `recording_pull` emits {flush:true} and waits up to 1500 ms only when `control.isLive()`; the window is [now - secondsBack*1000, now] (`pullTool`, `server.ts`)
- Input limits: keyframes is an integer from 0 to 8; secondsBack is a positive integer of at most 600 (`StopInput`/`PullInput`, `def.ts`)
- The card parses log lines only if they match /^\+(\d+(?:\.\d+)?)s \[(\w+)\] (.*)$/ and shows the error status when the result is {error} (`RecordingToolCard`, `card.tsx`)

## Side Effects

- `recording_start` and `recording_stop` change capture state and emit live/flush/snapshot control to page clients through `ctx.recorder.control` (`startTool`/`stopTool`, `server.ts`)
- `recording_pull` emits a flush control when live and may launch the Chromium renderer through `pullWindow` (`pullTool`, `server.ts`)
- Renders DOM through Solid (`RecordingToolCard`, `card.tsx`)

## Verification

- Run: `cd packages/extensions/recorder && pnpm test`
