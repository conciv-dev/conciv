# whiteboard/src/tool/canvas

## Overview

def.ts declares tool definitions with zod input/output schemas, error codes and approval flags via toolDefinition from @conciv/extension/tool. server.ts binds them to handlers with defineTool(...).server that read and write canvas rows through the WhiteboardToolContext store (tables canvas_pending and canvas_replies from ../../server/db/schema.ts). Drawing tools insert a pending row into a hidden draft that an open browser canvas tab must consume, and canvas_commit publishes the draft through that tab. canvas_preview renders the draft server-side to PNG through draft-svg.ts and preview.ts (@takumi-rs/core), and card.tsx/card.stories.tsx provide the chat UI card and its Storybook stories.

## Interface

- `canvasReadDef`, `canvasSvgDef`, `canvasDrawDef`, `canvasDiagramDef`, `canvasConnectDef`, `canvasUpdateDef`, `canvasDeleteDef`, `canvasClearDef`, `canvasExportDef`, `canvasCommitDef`, `canvasDiscardDef`, `canvasPreviewDef` (`def.ts`): tool definitions for tools canvas_read, canvas_svg, canvas_draw, canvas_diagram, canvas_connect, canvas_update, canvas_delete, canvas_clear, canvas_export, canvas_commit, canvas_discard, canvas_preview
- `canvasTools` (`server.ts`): array of all 12 server-bound canvas tools
- tool `canvas_read` (`server.ts`): returns element data for scope live|draft (default live)
- tool `canvas_svg` (`server.ts`): validates SVG, then queues a 'svg' pending draft payload {svg,x,y,width (default 400),roughness}
- tool `canvas_draw` / `canvas_diagram` / `canvas_connect` (`server.ts`): queue 'skeletons' or 'mermaid' pending draft payloads; connect builds one arrow skeleton bound from fromId to toId
- tool `canvas_update` (`server.ts`): merges a patch into the element (draft first, then live) and bumps version; returns {updated:false} when not found
- tool `canvas_delete` / `canvas_clear` (`server.ts`): delete one element (draft if present, else live) / all live elements plus every pending row in the room
- tool `canvas_export` (`server.ts`): json returns elements; png asks a browser tab through an 'export' pending row and polls canvas_replies for the image
- tool `canvas_commit` (`server.ts`): inserts a 'commit' pending row and polls until the draft is empty
- tool `canvas_discard` (`server.ts`): deletes draft elements and draft-stage pending rows
- tool `canvas_preview` (`server.ts`): returns an approximate PNG of the draft via imageResult
- `draftToSvg` / `DraftElement` (`draft-svg.ts`): converts draft elements (rectangle/diamond to rect, ellipse, text, others to polyline) into an SVG string with computed width/height (minimum 400x300 plus 40 padding)
- `renderDraftPng` (`preview.ts`): renders SVG to base64 PNG through a lazily created @takumi-rs/core Renderer
- `validateSvg` (`svg-caps.ts`): throws when SVG markup breaks size or content limits
- `CanvasOpCard` / `canvasOpCard` (`card.tsx`): Solid ToolCardView that renders canvas tool calls with per-op summaries, field rows, SVG/mermaid source blocks, result image and error block
- Storybook stories `Read`, `Svg`, `Diagram`, `PreviewImage`, `PreviewEmpty`, `DeleteConfirmed`, `CommitFailed`, `ExportFailed`, `RunningOp` (`card.stories.tsx`): CanvasOpCard stories inside a Trace frame

## Invariants

- `validateSvg` (`svg-caps.ts`) rejects SVG over 64KB, without an <svg> root, with <script> or <foreignObject>, or with more than 400 drawable nodes; canvas_svg maps the error to INVALID_SVG (`server.ts`)
- canvas_diagram throws DIAGRAM_TOO_LARGE when the mermaid edge count (EDGE_PATTERN) exceeds MAX_EDGES=500 (`server.ts`)
- drawIntoDraft waits up to DRAIN_DEADLINE_MS=8000 for the pending row to be deleted (consumed by a canvas tab); otherwise it deletes the row and throws NO_CANVAS (`server.ts`)
- canvas_export png polls for 10s at 250ms steps, then throws EXPORT_TIMEOUT (`server.ts`)
- canvas_commit returns {committed:false, reason:'no draft to commit'} when the draft is empty, and otherwise throws COMMIT_TIMEOUT if the draft is not empty within 15s (`server.ts`)
- canvas_delete and canvas_clear declare approval 'ask' in `canvasDeleteDef` / `canvasClearDef` (`def.ts`)
- canvas_svg input roughness is constrained to 0..2, default 1 (`canvasSvgDef`, `def.ts`)
- canvas_preview returns {empty:true} for an empty draft, and returns {error,reason} instead of throwing when rendering fails (`server.ts`)
- canvas_discard catches store errors and returns {discarded:0,error,reason} (`server.ts`)
- draftToSvg XML-escapes text content (&, <, >, ') (`draft-svg.ts`)

## Side Effects

- DB writes/deletes on canvas elements (live/draft) and tables canvas_pending and canvas_replies through ctx.store.insertPending/deletePending/upsertElement/deleteElement(s)/deleteReply (`server.ts`)
- Subscribes to store events through store.onEvent and sets timers while waiting for a pending row to drain (`server.ts`)
- Polling loops with setTimeout in canvas_export and canvas_commit (`server.ts`)
- console.error logging on canvas_discard and canvas_preview failures (`server.ts`)
- Module-global cached Renderer instance in `renderDraftPng` (`preview.ts`)
- DOM rendering of the chat tool card in `CanvasOpCard` (`card.tsx`)

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
