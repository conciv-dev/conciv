# whiteboard/src/canvas

## Overview

`Island` renders a fixed full-screen portal and mounts Excalidraw in it with React `createRoot`, wrapped in an error boundary. Remote rows go into the scene through `updateScene`, guarded by element versions. Local edits are written back to `db.canvasElements`. Pending rows from `db.canvasPending` are batched and dispatched by kind: draw ops convert to elements and are bulk-upserted to the draft or live scope, commit replays draft elements onto the live canvas with an animated agent cursor, and export renders a PNG and writes a reply row. svg-convert.ts turns SVG markup into Excalidraw skeletons using the live DOM. coords.ts wraps Excalidraw's scene/viewport conversions and is used by client/pins/pins.tsx and client/model/comments.tsx.

## Interface

- `Island(props: {doc, room, theme, self, visible, onViewport?, registerPan?})` (`island.tsx`): Solid component hosting Excalidraw
- `replayDraft(steps, moveCursor)` (`replay.ts`): writes steps one at a time and returns a `ReplayHandle` `{skip, done}`; types `ReplayStep` and `ReplayHandle`
- `svgToSkeletons(svgMarkup, {x, y, width, roughness})` (`svg-convert.ts`): converts rect, circle, ellipse, text, line, polyline, polygon and path (g and svg are traversed) into `ExcalidrawElementSkeleton[]`
- `sceneToScreen`, `screenToScene`, type `Viewport` (`coords.ts`)

## Invariants

- `applyRemote` (`island.tsx`): calls `updateScene` only when an incoming row has a higher version than the one tracked or a tracked element was removed. It sets `guard.applyingRemote` so `writeLocal` ignores the resulting onChange. Rows that arrive before the API attaches are buffered and applied on the next animation frame
- `writeLocal` (`island.tsx`): writes only elements whose version is greater than the tracked version
- `queueDrain` (`island.tsx`): each pending row id is handled at most once per mount (`draining` set). Kinds without a handler are ignored, including 'discard'
- `drainPending` / `performCommit` / `performExport` (`island.tsx`): `db.canvasPending.delete(row.id)` always runs in `finally`, even on failure
- `withStableIds` (`island.tsx`): skeletons without an id get `${rowId}-${index}`, and conversion uses `regenerateIds: false`
- `skeletonsOf` (`island.tsx`): mermaid parsing uses `maxEdges: 500`
- `exportReply` (`island.tsx`): throws when scope is 'live' or 'both' before the Excalidraw API attaches. A failed export is still answered with `{error: 'export render failed', reason}`
- `collaboratorsFrom` (`island.tsx`): drops its own peer and cursors with `lastSeen` older than `CURSOR_STALE_MS` (15_000)
- `performCommit` (`island.tsx`): draft rows are deleted only after the replay finishes. A pointerdown on the container skips the rest of the animation, and the remaining steps are written at once
- `replayDraft` (`replay.ts`): delay per step = clamp(3000/steps, 60, 400) ms
- `svgToSkeletons` (`svg-convert.ts`): throws 'no <svg> root found' when the markup has no svg root. Output is capped at `MAX_ELEMENTS` (500). Each path samples 16 to 220 points. A failing subpath is logged and skipped
- `rootTransform` (`svg-convert.ts`): source width comes from the viewBox width, else the width attribute, else 400

## Side Effects

- `Island` (`island.tsx`): portals a fixed div with z-index 2147482000 into `props.doc.body` and mounts and unmounts a React root
- `writeLocal` / `commitStep` (`island.tsx`): write to the `db.canvasElements` collection. `drainPending` calls `db.bulkUpsertElements`, `clearDraftRows` deletes from `db.canvasDraftElements`, `performExport` inserts into `db.canvasReplies`, and `agentCursor` calls `db.postCursor`
- `IslandBoundary` / `reportMountError` (`island.tsx`): log failures with console.error
- `svgToSkeletons` (`svg-convert.ts`): temporarily appends an off-screen div (and probe path elements) to document.body and removes it afterwards
- `replayDraft` (`replay.ts`): schedules setTimeout chains

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-whiteboard` from the repo root (turbo builds the package and its dependencies first)
