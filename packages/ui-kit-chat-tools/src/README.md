# ui-kit-chat-tools/src

## Overview

Single barrel `index.tsx` that re-exports the tool primitives and the styled tool cards, plus helpers from @conciv/ui-kit-chat/tools.

## Interface

- Primitives (`index.tsx`): `Bash`, `useBash`, `parseBashOutput`, `ApplyPatch`, `useApplyPatch`, `patchTextOf`, `patchInfo`, `parseClaudePatchBlocks`, `claudeBlockToUnifiedDiff`, `FileRead`, `FileEdit`, `Search`, `Todo` and their hooks
- Helpers (`index.tsx`): `humanToolName`, `nowTitle`, `schemaParams` from @conciv/ui-kit-chat/tools; `inlineValue`, `shortenPath`, `basename`, `truncate`, `SUMMARY_KEYS`
- Cards (`index.tsx`): `BashCard`, `ApplyPatchDiff`, `DiscoveredApisCard`, `FileReadCard`, `FileEditCard`, `SearchCard`, `TodoCard` with their `*Tool` entries
- Inline rows and registry (`index.tsx`): `inlineTool`, `ReadInline` to `ToolCallInline`, `builtinToolCards`
- Subdirectories:
  - primitives: [./primitives/README.md](./primitives/README.md) - headless tool primitives
  - styled: [./styled/README.md](./styled/README.md) - styled tool cards

## Invariants

- `index.tsx`: `bashTool`, `applyPatchTool`, `toolLookupTool` and `ToolLookupCard` are reachable only through `builtinToolCards`

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck && pnpm lint`
