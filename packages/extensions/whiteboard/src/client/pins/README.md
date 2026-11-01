# whiteboard/src/client/pins

## Overview

`PinsLayer` places a pin for each pin row at screen coordinates derived from the canvas viewport. Pins can be dragged, and dropping a source-linked pin opens `DragPrompt` to either disconnect it from its source or keep the link with an offset line. `ThreadPopover` shows the open thread's comments, which can be text, mentions, tool-call cards or raw JSON, with a mention-enabled reply field, prev/next/resolve/delete/close controls and a delete confirmation. `Compose` is the single-field dialog that creates a new comment at the picked screen point. All four components read and write state through `useComments` from `../model/comments.js`.

## Interface

- `PinsLayer()` (`pins.tsx`): renders pins, offset anchor lines, `file:line` anchor tags and the drift prompt; handles drag and open-on-click
- `ThreadPopover()` (`thread.tsx`): non-modal popover positioned by `model.anchorRect`, with header controls, comment list, reply composer and a delete-confirm alertdialog
- `Compose({target})` (`compose.tsx`): new-comment dialog placed at `target.screen`
- `DragPrompt(props)` / `DragPromptProps` (`drag-prompt.tsx`): popover with the actions 'Disconnect from source', 'Keep link, accept drift' and 'Cancel'

## Invariants

- `PinsLayer` (`pins.tsx`) treats a pointer-up as a click (opening the thread) unless the drag moved more than `DRAG_THRESHOLD` = 4 scene units on either axis
- `PinsLayer` (`pins.tsx`) shows `DragPrompt` instead of moving the pin when the dragged pin's root comment has `kind === 'source-linked'`; other pins are moved directly with `movePin`
- `PinsLayer` disconnect (`pins.tsx`) calls `detachAnchor` (comment becomes `floating`) and sets `pinState 'offset'`; keep sets `pinState 'offset'` and stores the original position as `anchorX`/`anchorY`
- `PinsLayer` (`pins.tsx`) falls back to status `'open'` when the comment status is not one of `open`/`resolved`/`drifted`/`orphaned`, and draws the dashed anchor line only when `pinState === 'offset'` and both anchor coordinates are non-null
- `Compose` (`compose.tsx`) cancels instead of creating when the trimmed text is empty; Enter submits only when `!event.isComposing`
- `ThreadPopover` (`thread.tsx`) is open only while `rootOf(openCid)` resolves; the comment remove menu appears only when `ownedBySelf` is true
- `renderPart` (`thread.tsx`) checks each part against the zod schemas `TextPart`, then `MentionPart`, then `ToolPart`, and renders anything else as a JSON code block

## Side Effects

- DOM: pin `onPointerDown` (`pins.tsx`) calls `setPointerCapture`; `Compose` (`compose.tsx`) and `DragPrompt` (`drag-prompt.tsx`) focus their first control in a microtask
- Collection writes through the model: `PinsLayer` (`movePin`, `detachAnchor`), `Compose` (`createComment`), `ThreadPopover` (`reply`, `resolve`, `deleteThread`, `removeComment`, `markRead` via `openThread`)

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
