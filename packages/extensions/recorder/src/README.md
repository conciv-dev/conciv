# recorder/src

## Overview

server.ts builds the extension's oRPC router over a RecorderRuntime. The routes cover config, flush and windowed reads of the per-client event rings, viewer presence, reset, the distilled action log, and saved recordings with video export. The server factory wires up the rings, capture control, renderer cache and on-disk recording store. client.tsx registers the client tools, the recording attachment card, the 'recorder' panel view and a Surface that mounts CaptureDriver, and it creates a per-client RecorderStore. css-inline.d.ts declares the module type for '*.css?inline' imports.

## Interface

- `recorder` / default export (`client.tsx`): client extension 'recorder' with tools startToolClient, stopToolClient and pullToolClient, attachment recordingAttachment, view {id:'recorder', label:'Recorder'} using RecorderPanelView, and a Surface that renders CaptureDriver; its context value is {store: createRecorderStore()}
- module augmentation `ExtensionRegistry` (`client.tsx`): adds the recorder to @conciv/protocol/config-types
- `makeRecorderRouter(runtime)` (`server.ts`): oRPC router with procedures config, clients, flush, window, events, presence, reset, log, recordings.save, recordings.get, recordings.exportVideo and control (an event-iterator subscription)
- `RecorderRouter` (`server.ts`): type of the router; the client RPC calls use it
- default export (`server.ts`): server extension with tools startTool, stopTool and pullTool, attachment recordingAttachment, context {recorder: runtime}, router, and a dispose function
- module '*.css?inline' (`css-inline.d.ts`): default export typed as string
- Subdirectories:
  - [server](./server/README.md): Server-side recorder internals: per-client rrweb event rings, capture/viewer liveness control, action-log distillation, keyframe/video rendering via headless Chromium, and an on-disk recording store.
  - [shared](./shared/README.md): Recorder code shared by client and server: config schema, rrweb event and control schemas, the recording-ref codec, and the attachment definition.
  - [client](./client/README.md): Browser-side recorder code. It covers rrweb capture and batched flushing to the server, the control-stream boot loop, the rrweb-player replay helpers, the Recorder panel view, the recording attachment card, and notice components.
  - [tool](./tool/README.md): Agent tools recording_start, recording_stop and recording_pull: definitions, server implementations, client render bindings, and the Solid tool card that shows their results.

## Invariants

- `ClientId` (`server.ts`): z.string().min(1).max(128)
- `FlushInput` (`server.ts`): at most `MAX_FLUSH_EVENTS` (5000) events, and the refine requires jsonByteLength(events) <= `MAX_FLUSH_BYTES` (8 MiB, from shared/protocol.ts)
- presence (`server.ts`): viewerId must be 1-128 chars; live=false calls dropViewer; when renewViewer reports a new viewer joined, the server emits {snapshot:true, flush:true}
- reset (`server.ts`): clears the rings, emits {snapshot:true, flush:true}, then waits up to 1500ms in awaitAppendAfter
- recordings.save (`server.ts`): returns {recordingId} or {error:'too-large'|'empty'|'io-error'}
- recordings.get (`server.ts`): returns {expired:true} when the recording is missing
- recordings.exportVideo (`server.ts`): returns {error:'expired'} when there are no events and {error:'render-failed'} when rendering rejects or returns nothing; on success returns a File 'recording.webm' with type video/webm
- control (`server.ts`): emits {live: control.isLive()} right after subscribing

## Side Effects

- the server factory in default export (`server.ts`) creates the recording store at join(server.stateDir,'recorder','recordings') and runs `recordings.sweep()` without awaiting it
- recordings.exportVideo (`server.ts`) renders video through a cached Chromium renderer (`createChromiumRenderer` / `createRendererCache`)
- dispose (`server.ts`) calls control.dispose() and disposes the renderer cache
- `recordingAttachment.card(RecordingCard)` (`client.tsx`) registers the attachment card as a global side effect when the module loads

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-recorder` from the repo root (turbo builds the package and its dependencies first)
