# Canvas AI Drawing v2: draft/commit, SVG bridge, visual feedback

Date: 2026-07-04
Status: approved
Package: `packages/extensions/whiteboard`

## Problem

Ask the agent to "draw a cat" and it produces a few circles. Two causes:

1. `canvas.draw` only advertises boxy primitives (`rectangle, ellipse, diamond, text, arrow, line`). Excalidraw supports far more: `freedraw` point strokes, multi-point curved lines, styled fills.
2. The agent draws blind. `canvas.export` returns JSON, never pixels, so the model can never see or correct its own output.

A third problem appears once the agent iterates: every `canvas.draw` lands directly in the shared `canvasElements` table, so the user would watch the agent scribble, delete, and redraw. Iteration must be invisible; the user sees only the finished result.

Goal is richer output across the board: illustrations, styled diagrams, annotations. Not photo-real images; everything stays editable Excalidraw vector elements. No image-generation API.

## Current pipeline (unchanged foundation)

Server tools write rows to `canvasPending` (`kind: 'skeletons' | 'mermaid'`). The browser island subscribes, converts (`convertToExcalidrawElements`, `parseMermaidToExcalidraw`), and writes editable elements back to `canvasElements`. All new work extends this pattern.

## Design

### 1. Draft buffer

- `canvasPending` rows gain `stage: 'draft' | 'live'` (default `draft`). All agent drawing tools (`canvas.draw`, `canvas.svg`, `canvas.diagram`, `canvas.connect`) write draft rows.
- The island converts draft rows to Excalidraw elements but holds them in an in-memory map keyed by room. Draft elements are never inserted into the visible scene.
- New tool `canvas.commit`: promotes the current draft set into `canvasElements` atomically and clears the draft.
- New tool `canvas.discard`: drops the draft without publishing.
- If the agent's turn ends with an uncommitted draft, the draft auto-commits. Rationale: the agent stopping means it judged the work done; silently discarding loses work. The prompt pack still instructs an explicit commit.
- `canvas.update` / `canvas.delete` operate on draft elements when a draft is active, otherwise on live elements.

### 2. `canvas.svg` tool

LLMs generate far better SVG than raw point arrays. New tool bridges that strength into editable elements.

- Input: `{svg: string, x: number, y: number, width?: number, height?: number}`. Server validates size caps (element count, path length, total byte size) and writes a pending row `kind: 'svg'`, stage `draft`.
- The island parses the SVG in the DOM and converts:
  - `<rect>`, `<ellipse>`/`<circle>`, `<text>`, `<line>` map to native Excalidraw element types.
  - `<path>`, `<polygon>`, `<polyline>` are sampled via native `getPointAtLength` into `freedraw`/`line` skeletons.
  - `stroke`, `fill`, `stroke-width` carry over to Excalidraw style fields.
- Native browser APIs only; zero new dependencies.

### 3. `canvas.export` PNG upgrade

- Input gains `{format: 'json' | 'png', scope: 'draft' | 'live' | 'both'}` (defaults: `json`, `live`).
- PNG is the first request/response round-trip through the pending table: the server writes a pending row `kind: 'export'`, the island runs Excalidraw's `exportToBlob` on the requested elements (draft elements need no visible mounting; `exportToBlob` accepts a plain element array), and writes a reply row carrying the image (Jazz FileStream).
- The server awaits the reply with a ~10s timeout. No connected browser tab produces a clear error, never a hang.
- The image returns to the agent via the harness image convention (file reference, not base64).

### 4. Draft UX: cursor as the performer

The `cursors` table already supports `kind: 'agent'`.

- During hidden iteration the agent cursor is visible on the canvas with a "drawing…" label positioned near the draft bounds. Presence is the progress indicator; no separate chip.
- On commit the agent cursor performs the drawing: it moves along strokes and elements appear in its wake. Freedraw elements reveal progressively point by point; shapes and text pop in as the cursor reaches them.
- Replay is time-capped (~2–4s total, scaled to element count) and skippable: any user interaction with the canvas jumps straight to the final state.
- This is a state-transition performance, not an idle loop (consistent with the settled-motion rule).

### 5. Prompt pack

- Rewrite `promptSnippet`s to route by intent: `canvas.svg` for illustrations and organic shapes, `canvas.draw` for boxes and layout, `canvas.diagram` for structured graphs.
- Teach the loop: draft → `canvas.export` (png, draft) → self-critique → refine → `canvas.commit`.
- Composition guidance: establish big shapes first, layer detail, keep a limited palette, style with Excalidraw fields (`strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `roughness`).

### 6. Error handling

- SVG parse failure or cap violation: tool returns a descriptive error; nothing lands on canvas.
- Export timeout (no island connected): descriptive error naming the cause.
- Commit with empty draft: no-op result, not an error.
- Draft rows from a dead session are garbage-collected the same way stale cursors already are.

## Testing

Integration tests, real browser, per repo rules (no jsdom, no mocks, no tests in example apps):

- SVG → element conversion fidelity: shapes map to native types, paths sample to point strokes, styles carry over.
- Export round-trip returns a real PNG for both draft and live scopes; timeout path errors cleanly with no island.
- Commit atomicity: all draft elements appear in `canvasElements` together; discard leaves the live scene untouched.
- Draft invisibility: draft elements never render in the visible scene before commit.
- Cursor replay reaches the exact final element set; interaction skips to it.

## Implementation slices

1. Draft/commit plumbing (`stage` column, commit/discard tools, island draft map, auto-commit).
2. `canvas.export` PNG round-trip.
3. `canvas.svg` tool + island converter.
4. Prompt pack, cursor performance replay, polish.

Each slice lands independently; slice 1 is useful on its own.

## Out of scope

- Image-generation APIs / bitmap output.
- Excalidraw community libraries integration.
- Ghost preview of the draft for the user.
