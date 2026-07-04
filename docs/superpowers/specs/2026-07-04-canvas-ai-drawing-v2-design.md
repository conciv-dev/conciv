# Canvas AI Drawing v2: draft/commit, SVG bridge, visual feedback

Date: 2026-07-04
Status: approved (amended after spike, 2026-07-04)
Package: `packages/extensions/whiteboard`

## Spike results (scratchpad `canvas-spike/`, artifact 411e9bad)

All design bets validated before implementation:

- SVG bridge: same model that draws a circles-snowman via primitives draws a layered, styled cat (31 editable elements) and a designed three-tier architecture diagram (37 elements) via SVG paths. The representation was the bottleneck, not the model.
- Feedback loop: three self-critique rounds each caught a real visual flaw (detached whiskers, floating shadow) and fixed it.
- Conversion fidelity: `getPointAtLength` sampling preserves paths, fills (closed line loops), subpaths, and colors. Roughness 1 restores the hand-drawn Excalidraw look.
- takumi (`@takumi-rs/core`, Rust napi): rasterizes draft SVG server-side in ~21ms with faithful composition. Approved as a dependency for the inner iteration loop (see section 4).

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
- Spike learnings folded in: split multi-subpath `d` attributes on absolute `M` before sampling (relative `m` subpaths fall back to whole-path sampling); closed fills come from closed `line` loops with `backgroundColor`; `roughness` is a tool input (default 1 for the hand-drawn look, 0 for clean diagrams); text needs a baseline y-offset from the computed font size.
- Conversion uses native browser APIs only.

### 3. `canvas.export` PNG upgrade

- Input gains `{format: 'json' | 'png', scope: 'draft' | 'live' | 'both'}` (defaults: `json`, `live`).
- PNG is the first request/response round-trip through the pending table: the server writes a pending row `kind: 'export'`, the island runs Excalidraw's `exportToBlob` on the requested elements (draft elements need no visible mounting; `exportToBlob` accepts a plain element array), and writes a reply row carrying the image (Jazz FileStream).
- The server awaits the reply with a ~10s timeout. No connected browser tab produces a clear error, never a hang.
- The image returns to the agent via the harness image convention (file reference, not base64).
- This is the fidelity check: real Excalidraw rendering (roughjs strokes, fonts). The prompt pack reserves it for the final pass before commit; inner-loop rounds use `canvas.preview` (next section).

### 4. `canvas.preview`: fast inner loop (takumi, node-side)

The extension server runs in node, so draft critique does not need the browser round-trip. New dependency `@takumi-rs/core` (Rust napi renderer; spike measured ~21ms per frame).

- New tool `canvas.preview`, input `{}`: rasterizes the current draft entirely server-side and returns a PNG to the agent via the same image convention as export.
- The server composes one SVG document from the draft rows:
  - `kind: 'svg'` rows embed their source markup at their placement.
  - `kind: 'skeletons'` rows render as plain SVG shapes (rect, ellipse, line, text) — geometrically faithful, no roughjs styling.
  - `kind: 'mermaid'` rows render as labeled placeholder boxes at their placement (mermaid conversion exists only in the browser).
- The composite goes through takumi to PNG. No pending-table round-trip, no browser tab required, no timeout path.
- Contract stated in the tool description: preview is an approximate composition check (no hand-drawn strokes, mermaid as placeholders); `canvas.export` with `format: 'png'` is the ground truth.
- The spike proved composition critique works on this approximation: all three cat fixes were visible in the source-SVG render.

### 5. Draft UX: cursor as the performer

The `cursors` table already supports `kind: 'agent'`.

- During hidden iteration the agent cursor is visible on the canvas with a "drawing…" label positioned near the draft bounds. Presence is the progress indicator; no separate chip.
- On commit the agent cursor performs the drawing: it moves along strokes and elements appear in its wake. Freedraw elements reveal progressively point by point; shapes and text pop in as the cursor reaches them.
- Replay is time-capped (~2–4s total, scaled to element count) and skippable: any user interaction with the canvas jumps straight to the final state.
- This is a state-transition performance, not an idle loop (consistent with the settled-motion rule).

### 6. Prompt pack

- Rewrite `promptSnippet`s to route by intent: `canvas.svg` for illustrations and organic shapes, `canvas.draw` for boxes and layout, `canvas.diagram` for structured graphs.
- Teach the loop: draft → `canvas.preview` → self-critique → refine (repeat) → `canvas.export` (png, draft) as the final fidelity check → `canvas.commit`.
- Composition guidance: establish big shapes first, layer detail, keep a limited palette, style with Excalidraw fields (`strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `roughness`).
- Style routing (spike stages 07–08): flat fills + clean outlines read as clipart — right for icons, diagrams, quick asks. For "draw me X" default to sketch technique: hatched shading, contour strokes, varied line weight, minimal fills. Same pipeline, different instruction; the spike owl proves the ceiling.
- Redraw from reference (spike stage 10): when a reference image is available (user-dropped on canvas, present in the conversation), study it and author fresh semantic SVG matching its palette, pose, and structure. Never trace a bitmap into paths — traced output is uneditable patch soup. Output stays editable Excalidraw elements; every path keeps meaning.

### 7. Error handling

- SVG parse failure or cap violation: tool returns a descriptive error; nothing lands on canvas.
- Export timeout (no island connected): descriptive error naming the cause, suggesting `canvas.preview` as the browser-free alternative.
- Preview with an empty draft: no-op result naming the cause, not an error.
- Commit with empty draft: no-op result, not an error.
- Draft rows from a dead session are garbage-collected the same way stale cursors already are.

## Testing

Integration tests, real browser, per repo rules (no jsdom, no mocks, no tests in example apps):

- SVG → element conversion fidelity: shapes map to native types, paths sample to point strokes, styles carry over.
- Export round-trip returns a real PNG for both draft and live scopes; timeout path errors cleanly with no island.
- Preview: returns a real PNG from draft rows with no browser involved; mermaid rows appear as placeholders; empty draft is a clean no-op. Runs node-side, so these tests need no browser.
- Commit atomicity: all draft elements appear in `canvasElements` together; discard leaves the live scene untouched.
- Draft invisibility: draft elements never render in the visible scene before commit.
- Cursor replay reaches the exact final element set; interaction skips to it.

## Implementation slices

1. Draft/commit plumbing (`stage` column, commit/discard tools, island draft map, auto-commit).
2. `canvas.svg` tool + island converter.
3. `canvas.preview` (takumi, node-side inner loop).
4. `canvas.export` PNG round-trip (browser fidelity check).
5. Prompt pack, cursor performance replay, polish.

Each slice lands independently; slice 1 is useful on its own. Slices 2+3 together already give the agent the full draw-critique-refine loop; slice 4 adds ground-truth rendering.

## Out of scope

- Bitmap output on the canvas. Explored and rejected in the spike: the whiteboard's value is editable strokes. This includes diffusion-rendered images and traced vectorizations of them.
- External image services (fal.ai etc.) — hard constraint, local-only product.
- Local diffusion as a reference generator (validated in the spike: stable-diffusion.cpp on Metal, SD 1.5, ~30s/frame, img2img from the vector draft; output fed to the agent's eyes for semantic redraw, never to the canvas). Viable future optional extension, off by default; costs 2.1GB weights + binary distribution per machine. Reference-redraw itself ships in v1 via the prompt pack — it just needs a user-provided reference instead of a generated one.
- Excalidraw community libraries integration.
- Ghost preview of the draft for the user.
