# whiteboard/src/tool

## Overview

client.ts wraps each canvas, comment, element and anchor tool definition with defineTool and attaches its card renderer, producing the client-side tool list. card-util.tsx holds small Solid components and helpers the cards share (field rows, op tags, mono lines, failure parsing, clock formatting). story.fixtures.ts builds fake tool-call and tool-result parts and a trace tool list for the card stories. Tool definitions, server handlers and cards live in the anchor, canvas, comment and element subdirectories.

## Interface

- `whiteboardToolClients` (`client.ts`): 22 client tools: canvas_* defs rendered with canvasOpCard, comment/pin defs with commentOpCard, elementReferenceDef with elementReferenceCard, anchorResolveDef with anchorResolveCard
- `FailureDetailSchema` / `failureOf` (`card-util.tsx`): zod schema {error, reason?} and a parser returning the parsed detail or null
- `FieldRow` / `FieldRows` / `Field` / `FieldTone` (`card-util.tsx`): label/value row components with default or danger tone
- `OpTag` (`card-util.tsx`): uppercase operation label component
- `MonoLine` (`card-util.tsx`): single truncated monospace text line component
- `clockTime` (`card-util.tsx`): formats epoch ms as hour:minute via Intl.DateTimeFormat
- `storyCtx` / `storyPart` / `storyResult` / `storyResultParts` / `storyErrorResult` / `storyAddResult` (`story.fixtures.ts`): fake ToolViewCtx and tool-call/tool-result parts for stories
- `traceTools` (`story.fixtures.ts`): maps whiteboardToolClients with a renderer to ToolCardEntry items
- `STORY_FRAME_CLASS` / `TRACE_FRAME_CLASS` (`story.fixtures.ts`): wrapper class strings for story frames
- Subdirectories:
  - [comment](./comment/README.md): Defines and implements the whiteboard comment and pin AI tools (comment_create, comment_reply, comment_read, comment_list, comment_resolve, comment_delete, comment_move, pin_set_state), source-anchor enrichment, and the Solid chat card that displays them.
  - [element](./element/README.md): The element_reference tool: definition, server handler that locates a React component or JSX tag by name in a file, and its chat card with stories.
  - [canvas](./canvas/README.md): Defines and implements the 12 whiteboard canvas_* AI tools (read, draw, svg, diagram, connect, update, delete, clear, export, commit, discard, preview), plus a server-side SVG/PNG draft preview renderer and the Solid chat card that displays canvas tool calls.
  - [anchor](./anchor/README.md): The anchor_resolve tool: definition, server handler that checks whether a source-linked comment still matches its code, and its chat card with stories.

## Invariants

- `FieldRows` (`card-util.tsx`) renders nothing when rows is empty
- `traceTools` (`story.fixtures.ts`) skips tools without a __render

## Side Effects

- None

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
