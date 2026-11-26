# ui-kit-chat-tools/src/styled/tools

## Overview

Styled Solid tool cards. Each card wraps a primitive Root, renders a `ToolCard` with icon, title, meta and body, and exports a `ToolCardEntry` with the tool names it handles. `builtin-tool-cards.tsx` collects every entry; `inline-tool.tsx` has single-row renderers; `search-matches.tsx` groups grep-style `file:line:snippet` output by file.

## Interface

- One file per tool card, each exporting its card and its `ToolCardEntry` with the tool names it draws: `bash-card.tsx` (`Bash`), `apply-patch-diff.tsx` (`apply_patch`), `discovered-apis-card.tsx` (`catalog`), `file-edit-card.tsx` (`Edit`, `MultiEdit`, `Write`), `file-read-card.tsx` (`Read`), `search-card.tsx` (`Grep`, `Glob`), `todo-card.tsx` (`TodoWrite`), and `ToolLookupCard` (`ToolSearch`) in `builtin-tool-cards.tsx`.

## Invariants

- `hasEmbeddedBody`: true for every entry except `applyPatchTool`, which is true only when the patch has parsed blocks
- `BashCard` (`bash-card.tsx`): status forced to 'error' when `isError()`
- `DiscoveredApisCard` (`discovered-apis-card.tsx`): validates with zod `CatalogList`, then `CatalogDetail`, then falls back to `ShellCard`
- `SearchCard` (`search-card.tsx`): grouped results only when `useEmbeddedCard()` is true; raw text when no records parse

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
