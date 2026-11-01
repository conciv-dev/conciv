# whiteboard/src/tool/anchor

## Overview

def.ts declares the anchor_resolve tool (input cid; output status fresh|moved|drifted|orphaned|ambiguous plus optional anchor, candidates, diff). server.ts looks up the comment by cid in the comments table, validates its stored anchor shape, and runs the anchor resolver for the working directory. card.tsx renders an inline row with the cid and resolved status, colored by status. card.stories.tsx shows the card in trace frames.

## Interface

- `anchorResolveDef` (`def.ts`): tool definition 'anchor_resolve', category whiteboard, non-mutating, error COMMENT_NOT_FOUND
- `anchorResolveTool` (`server.ts`): server handler for anchor_resolve
- `anchorTools` (`server.ts`): array [anchorResolveTool]
- `AnchorResolveCard` / `anchorResolveCard` (`card.tsx`): Solid card and ToolCardView showing 'cid · status' or the error text

## Invariants

- `anchorResolveTool` (`server.ts`) throws toolError COMMENT_NOT_FOUND when no comments row has the given cid
- `anchorResolveTool` (`server.ts`) returns status 'orphaned' without calling the resolver when the stored anchor fails the StoredAnchor schema (source file/line/column/component/hash/salt/snippet/commit required)
- `anchorResolveCard` (`card.tsx`) hasEmbeddedBody only when the computed label is non-empty

## Side Effects

- `anchorResolveTool` (`server.ts`) reads the comments table
- `anchorResolveTool` (`server.ts`) loads the resolver via loadResolver(ctx.cwd), which reads source files under cwd

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-whiteboard` from the repo root (turbo builds the package and its dependencies first)
