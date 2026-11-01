# recorder/src/client

## Overview

CaptureDriver gets the extension API base and starts bootRecorder. bootRecorder subscribes to the server's control stream and starts or stops a capture session based on the live flag. A capture session runs rrweb record and pushes each event into a Flusher, which batches events, posts them through rpc.flush, and backs off after failures. The capture stops after the tab has been hidden for 30s. The panel view polls the window and log procedures, renews viewer presence, streams the live replay through mountStreamPlayer, and can save a recording, export it as video, or attach a recording reference to the composer. RecordingCard replays a saved recording inside a dialog.

## Interface

- `bootRecorder(apiBase, store)` (`boot.ts`): starts the control loop and the capture-session lifecycle; returns a dispose function
- `CaptureDriver` (`capture-driver.tsx`): Solid component that calls bootRecorder on mount and disposes it on cleanup
- `createCaptureSession` / `CaptureSession` (`capture-session.ts`): session with takeSnapshot, flushNow and finish
- `loadCaptureLibrary`, `startCapture`, `takeFreshSnapshot`, `CaptureLibrary` (`capture.ts`): lazy import of rrweb and the console plugin, a record() wrapper, and a forced full snapshot
- `saveFileToDisk(file)` (`download.ts`): downloads a File through an object URL and an anchor click
- `createFlusher` / `Flusher` (`flusher.ts`): event queue with push, setLive, flushNow and dispose
- `RecorderNotice`, `RecorderBlockedNotice`, `RecorderBlockedCardNotice`, `RecorderErrorNotice` (`notices.tsx`): status and error UI
- `RecorderPanelView` (`panel-view.tsx`): the 'recorder' view with Send to agent, New recording, Export video and GO LIVE actions
- `loadPlayerKit`, `mountStreamPlayer`, `mountPlayer`, `PlayerKit`, `StreamPlayerHandle` (`player.ts`): rrweb-player loading and mounting for live and static replay
- `useRecorderContext` (`recorder-context.ts`): getExtensionApi('recorder').useContext
- `createRecorderStore`, `RecorderStore`, `RecorderStatus` (`recorder-store.ts`): signals for status ('idle'|'recording'|'failed'|'blocked') and live, plus a clientId from crypto.randomUUID()
- `RecordingCard` (`recording-card.tsx`): attachment card that resolves a RecordingRef and replays recordings.get events in a Dialog
- `createVisibilityPauser` (`visibility-pauser.ts`): calls pause after the tab has been hidden for HIDDEN_PAUSE_MS (30s) and resume when it becomes visible again

## Invariants

- `sessionBlocked` (`boot.ts`): no session starts if one already exists, the controller has aborted, or store.live() is false; status becomes 'blocked' when loadCaptureLibrary fails and 'failed' when config fetch or session creation throws
- `consumeControl` (`boot.ts`): control messages are applied one after another on a promise chain, in the order start, then snapshot/flush, then stop
- `createCaptureSession` (`capture-session.ts`): a generation counter discards a stale resume, and onFailed runs only when the reloadConfig failure belongs to the current generation
- `startCapture` (`capture.ts`): sets checkoutEveryNms to 60000, blocks the conciv UI selectors ([data-conciv-root] and others), always masks passwords, and adds email/tel masking for 'sensitive' and maskAllInputs for 'inputs'; the console plugin records only 'error' level and only when config.console is set
- `enqueue` (`flusher.ts`): drops any single event larger than MAX_FLUSH_BYTES; when the queue passes MAX_QUEUE_BYTES (8 MiB) it drops the oldest events but keeps the last full snapshot (type 2)
- `takeChunk` (`flusher.ts`): a POST holds at most MAX_POST_BYTES (1 MiB) unless the chunk is a single event; after a send failure the chunk is requeued and the backoff grows from 1s up to 30s
- `drain` (`flusher.ts`): the draining flag blocks concurrent drains; the cadence is 200ms while live and 5000ms while idle
- `recordingWithEnoughEvents` / `hasReplay` (`panel-view.tsx`): replay needs at least 2 events; the window and log queries poll every 1000ms until they have data
- `mountStreamPlayer` (`player.ts`): live means the player is playing and within LIVE_EDGE_MS (2500ms) of the tail; it polls for new events every LIVE_POLL_MS (1000ms); ArrowLeft/ArrowRight on the timeline scrub by 5000ms, clamped to [0,total]
- `detachEvents` (`player.ts`): deep-clones events and validates them with RrwebEventSchema before the player gets them
- `RecordingCard` (`recording-card.tsx`): plays only with at least 2 events; shows 'Recording expired.' when recordings.get returns expired

## Side Effects

- `bootRecorder` (`boot.ts`): oRPC calls to the recorder procedures config, flush and control (control retries forever)
- `createCaptureSession` (`capture-session.ts`): adds window listeners for error, unhandledrejection and beforeunload and document listeners for visibilitychange, each triggering a flush
- `startCapture` (`capture.ts`): runs rrweb record on the host page DOM; `loadCaptureLibrary` caches its dynamic import in module-global state
- `saveFileToDisk` (`download.ts`): creates and revokes an object URL and clicks an anchor to start a download
- `RecorderBlockedNotice` (`notices.tsx`): the Reload page button calls location.reload()
- `RecorderPanel` in `RecorderPanelView` (`panel-view.tsx`): calls presence with live:true on mount and every VIEWER_RENEW_MS (7000ms) and with live:false on cleanup; calls reset, recordings.save and recordings.exportVideo; attaches a File with type RECORDER_MIME to the composer
- `mountStreamPlayer` / `mountPlayer` (`player.ts`): inject <style> elements, rewrite injected rrweb styles into @layer rrweb, set ARIA attributes on the player controls, and attach a ResizeObserver; `loadPlayerKit` caches its import in module-global state
- `RecordingCard` (`recording-card.tsx`): calls the recordings.get and recordings.exportVideo procedures

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-recorder` from the repo root (turbo builds the package and its dependencies first)
