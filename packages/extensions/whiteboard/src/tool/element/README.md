# whiteboard/src/tool/element

## Overview

def.ts declares element_reference (input file and component; output found plus optional file/line/column). server.ts calls the anchor resolver's locate for the working directory and returns found:false when nothing matches. card.tsx renders an inline row with the component name, marked as an error and 'not found' when found is false. card.stories.tsx shows the card in trace frames.

## Interface

- `elementReferenceDef` (`def.ts`): tool definition 'element_reference', category whiteboard, non-mutating
- `elementReferenceTool` (`server.ts`): server handler for element_reference returning {found:true, ...location} or {found:false}
- `elementTools` (`server.ts`): array [elementReferenceTool]
- `ElementReferenceCard` / `elementReferenceCard` (`card.tsx`): Solid card and ToolCardView showing the component name or '<component> not found'

## Invariants

- `elementReferenceTool` (`server.ts`) returns {found:false} instead of throwing when resolver.locate finds no target
- `ElementReferenceCard` (`card.tsx`) forces status 'error' and danger tone when the result has found === false
- `elementReferenceCard` (`card.tsx`) hasEmbeddedBody only when the input component is non-empty

## Side Effects

- `elementReferenceTool` (`server.ts`) loads the resolver via loadResolver(ctx.cwd) and reads the named file under cwd

## Verification

- Run: `cd packages/extensions/whiteboard && pnpm test`
