# design/src/client

## Overview

`captureStep` either snapshots the current viewport with snapdom (removing the widget root) or, when the requested width/height differs from the tab, renders the current URL in a hidden same-origin iframe and asks the page inside it to snapshot itself over a MessageChannel. Before the PNG is base64-encoded, every capture is composited onto the page's canvas background. `collectComponents` walks the DOM and records each element carrying `data-conciv-source` with its clipped box, text box, axis, computed styles and sibling index. `winnerStep` scans all stylesheets (including @media, @supports, @layer, @import, nesting and adopted sheets), ranks candidate declarations by importance, inline, layer, specificity and order, and confirms the winner against the computed value.

## Interface

- `captureStep(input: CaptureInput)` (`capture.ts`): returns the viewport size for `probe`/`clear`, otherwise `{image (base64 PNG), width, height, route, components}`
- `ClientCapture` type (`capture.ts`): `{image; width; height; route; components: LiveComponent[]}`
- `collectComponents({root})` (`components.ts`): returns the `LiveComponent[]` tree of elements with `data-conciv-source` (format `file:line:column`)
- `answerCaptureRequests()` (`frame-capture.ts`): inside a `data-conciv-capture` frame, answers `conciv-design:capture` requests with a snapdom PNG blob and posts `conciv-design:capture-ready` to the parent
- `frameAnswering({frame, signal})` (`frame-capture.ts`): resolves when the given frame posts `CAPTURE_READY`
- `requestFrameCapture(frame)` (`frame-capture.ts`): sends `CAPTURE_REQUEST` with a MessagePort and resolves with the PNG blob
- `ensureCaptureFrame({url, width, height})` (`frame.ts`): reuses or creates the hidden `iframe[data-conciv-capture]` and waits for it to settle
- `captureFrameAt({width, height})` (`frame.ts`): returns the existing capture frame only if its size matches
- `removeCaptureFrame()` (`frame.ts`): removes the capture iframe
- `winnerStep(input: WinnerInput)` (`winner.ts`): maps each requested property to its winning `Winner` declaration or null
- ambient module `@bramus/specificity` (`specificity.d.ts`): type declarations for `calculate` and `compare`

## Invariants

- `needsFrame` (`capture.ts`): the iframe path is used only when a requested width or height differs from `innerWidth`/`innerHeight`; `clear` removes the frame and returns the viewport size like `probe`
- `frameAtRoute` (`capture.ts`): if the frame document's pathname+search differs from the tab's, the frame is removed and recreated
- `captureInFrame` (`capture.ts`): throws `toolError('frame-blocked')` when `frame.contentDocument` is null
- `canvasBackground` (`capture.ts`): uses the html background, then the body background (only if parsed alpha > 0), else `#ffffff`
- `readSource` (`components.ts`): drops the source unless the file is non-empty and line/column are finite numbers
- `clipped` (`components.ts`): boxes are rounded and clamped to the viewport, with width and height of at least 0
- `readStyles` (`components.ts`): a non-numeric line-height falls back to `fontSize * 1.2`; colors are converted to hex (hex8 when alpha < 1)
- `readAxis` (`components.ts`): a grid parent or a row flex parent gives `row`, anything else gives `column`, no parent gives null
- `answerCaptureRequests` (`frame-capture.ts`): only active when `window.frameElement` has `data-conciv-capture`; ignores messages that are not from `window.parent`, have no port, or fail the zod `captureRequest` schema
- `requestFrameCapture` (`frame-capture.ts`): rejects with `toolError('frame-timeout')` after `TOLERANCES.frameSettleMs` (5000 ms), and rejects on a reply that fails the zod `captureReply` schema or carries `error`
- `settle` (`frame.ts`): within `frameSettleMs` it waits for load, `document.fonts.ready`, two consecutive mutation-free animation frames and the `CAPTURE_READY` handshake; a timeout becomes `toolError('frame-timeout')`, an unreadable document becomes `toolError('frame-blocked')`
- `ensureCaptureFrame` (`frame.ts`): an existing frame is reused only if its src, width and height match; a new frame is removed if settling throws
- `outranks` (`winner.ts`): the order is !important, then inline, then layer (reversed for important; unlayered rules rank above layered ones), then specificity, then source order
- `visitMedia`/`visitSupports`/`visitImport` (`winner.ts`): only descend into rules whose media query or supports condition currently matches; cross-origin sheets that throw on `cssRules` are skipped
- `winningDeclaration` (`winner.ts`): returns null unless the winner's value (with `var()` resolved and normalized) equals the computed value; with no candidates it falls back to the parent as `inherited: true` only when the parent's computed value is equal
- `winnerStep` (`winner.ts`): if the selector matches no element, every property maps to null; it reads the capture frame when one exists at the requested size, otherwise the tab

## Side Effects

- `ensureCaptureFrame` (`frame.ts`): appends an off-screen, inert, aria-hidden iframe with `data-conciv-capture` to `document.body`, loading `location.href`
- `removeCaptureFrame` (`frame.ts`): removes that iframe from the DOM
- `quietFrames` (`frame.ts`): attaches a MutationObserver and a requestAnimationFrame loop to the frame document
- `answerCaptureRequests` (`frame-capture.ts`): adds a window `message` listener and calls `window.parent.postMessage` with `CAPTURE_READY`
- `requestFrameCapture` (`frame-capture.ts`): opens a MessageChannel and posts `CAPTURE_REQUEST` to the frame window
- `captureStep` (`capture.ts`): snapdom DOM rasterization with embedded fonts, excluding `[data-conciv-root]`; uses OffscreenCanvas, createImageBitmap and FileReader
- `normalized` (`winner.ts`): creates a detached `span` to normalize CSS values (it is never attached to the document)

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
