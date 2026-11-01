# recorder/src/server

## Overview

This directory holds the Node-side runtime of the recorder extension. Rrweb events from page clients go into time- and byte-bounded rings, one per client (`ring.ts`, `rings.ts`). `capture-control.ts` decides when page clients should record by emitting live/flush/snapshot control messages. `distill.ts` and `node-index.ts` turn raw events into a readable action log, `render.ts` replays events in playwright-core Chromium to produce PNG keyframes or video, and `runtime.ts` combines these into the content parts that tools and attachments return.

## Interface

- `recordingAttachment` (`attachment.ts`): re-exported attachment with a registered server handler that decodes a recording ref, loads the stored events and renders them with 3 keyframes
- `createCaptureControl` / `CaptureControl` (`capture-control.ts`): manages capture IDs and viewer leases and fans out `RecorderControl` messages to subscribers; also offers `awaitAppendAfter` to wait for new ring appends
- `distill` (`distill.ts`): converts `RrwebEvent[]` into `ActionLogEntry[]` (navigation, reload, click, input, scroll, console)
- `pickKeyframeTimestamps` (`format.ts`): chooses up to `count` keyframe timestamps from significant log entries plus the last timestamp
- `recordingParts` (`format.ts`): builds image `ContentPart`s plus a text log formatted as `+N.Ns [kind] detail`
- `createNodeIndex` / `NodeIndex` / `SerializedNode` (`node-index.ts`): DOM mirror built from full snapshots and mutations, with `describe(id)` returning a tag#id plus a label
- `createRecordingStore` / `RecordingStore` / `SaveResult` (`recordings.ts`): disk-backed store with `save`, `get` and `sweep`
- `createChromiumRenderer` / `KeyframeRenderer` (`render.ts`): renderer that produces PNG keyframes (`render`) and a replay video (`renderVideo`), or null when Chromium cannot launch
- `createRendererCache` / `RendererCache` (`renderer-cache.ts`): lazily creates one shared renderer, leases it through `use`, and disposes it after it sits idle
- `createEventRing` / `EventRing` / `createSequence` (`ring.ts`): sliding-window event buffer with `window`, `since`, `head` and `onAppend`
- `createClientRings` / `ClientRings` / `ClientSummary` (`rings.ts`): one ring per clientId with a global append cursor
- `RecorderRuntime` / `renderRecording` / `pullWindow` (`runtime.ts`): runtime bag type plus helpers that distill events and render frames from stored events or from the newest client's ring window

## Invariants

- Captures expire after `CAPTURE_TTL_MS` (10 min) and viewer leases after `VIEWER_LEASE_MS` (20 s); a sweep runs every 5 s and emits `{live:false}` once nothing is live (`createCaptureControl`, `capture-control.ts`)
- `stopCapture` returns null for an unknown captureId; `renewViewer` emits `{live:true}` only for the first viewer when there are no captures (`createCaptureControl`, `capture-control.ts`)
- `awaitAppendAfter` resolves true right away if the ring cursor is already past the given cursor, and otherwise resolves false after the timeout (`capture-control.ts`)
- Click, input and scroll events with id -1 are ignored, as are empty inputs; console entries cover only `rrweb/console@1` error-level events, truncated to 200 chars (`distill`, `distill.ts`)
- A full snapshot counts as a reload only if it is not the first and arrives within 2000 ms of a meta event; repeated scrolls on the same target within 1500 ms are merged into one entry (`distill`, `distill.ts`)
- `pickKeyframeTimestamps` returns [] when count < 1 and otherwise returns at most `count` sorted, unique timestamps (`format.ts`)
- `recordingParts` adds '(keyframes skipped: no renderer available)' when keyframes were requested but none were rendered (`format.ts`)
- `save` rejects fewer than 2 events ('empty'); payloads are trimmed to start at a snapshot boundary so they fit `MAX_RECORDING_BYTES` (16 MiB), else 'too-large'; filesystem failures return 'io-error' (`createRecordingStore`, `recordings.ts`)
- The store keeps at most `MAX_RECORDINGS` 50 files and `MAX_TOTAL_RECORDING_BYTES` 200 MiB, and recordings older than `RECORDING_TTL_MS` (7 days) are deleted on sweep (`recordings.ts`)
- `get` returns null unless the id matches /^[A-Za-z0-9-]+$/, which blocks path traversal; stored JSON is validated with `RrwebEventSchema` (`recordings.ts`)
- Rendering returns []/null when the events contain no full snapshot (type 2); video length is capped at 5 min plus a 15 s margin (`createChromiumRenderer`, `render.ts`)
- The idle renderer is disposed after 5 min only while no leases are held; a null creation is not cached (`createRendererCache`, `renderer-cache.ts`)
- Each ring drops events older than `windowMs` or beyond `maxBytes` (default 16 MiB) but always keeps the newest event; `window()` starts at the nearest full snapshot, including the meta event just before it (`createEventRing`, `ring.ts`)
- Client rings idle for 30 min are dropped, and the least-recently-touched rings are evicted while there are more than 8 or more than 64 MiB in total, never evicting the newest (`createClientRings`, `rings.ts`)
- `pullWindow` reads only the most recently touched client and keeps only log entries at or after fromTs; frames render only if keyframeCount > 0 and there are at least 2 events (`runtime.ts`)

## Side Effects

- Registers a server handler on the shared `recordingAttachment` when the module is imported (`attachment.ts`)
- Starts an unref'd `setInterval` sweep timer, cleared by `dispose` (`createCaptureControl`, `capture-control.ts`)
- Generates capture IDs with `randomUUID` from node:crypto (`capture-control.ts`)
- Writes, renames, reads and unlinks `<recordingId>.json` files in the store dir (writes go to `.tmp` then are renamed atomically), creates the dir with mkdir recursive, and removes stray .tmp files on sweep (`createRecordingStore`, `recordings.ts`)
- Launches headless Chromium through playwright-core, opens pages and contexts, injects the rrweb UMD script and CSS from node_modules, and takes screenshots (`createChromiumRenderer`, `render.ts`)
- Creates and then deletes a temp dir `conciv-recorder-video-*` under os.tmpdir for video recording (`renderVideo`, `render.ts`)
- Closes the browser after the idle timeout via an unref'd setTimeout (`createRendererCache`, `renderer-cache.ts`)
- Keeps module-instance in-memory state (rings, listeners, captures, viewers) in closures (`ring.ts`, `rings.ts`, `capture-control.ts`)

## Verification

- Run: `cd packages/extensions/recorder && pnpm test`
