# ui-kit-chat-tools/src/primitives/tools

## Overview

Headless per-tool primitives. Each file defines a Solid context, a `Root` provider taking `{part, result, children}`, and a `useX` hook; the Root derives typed accessors from the tool call's JSON arguments and result. The apply-patch file also parses `*** Update/Add/Delete File:` patches and converts them to unified diffs.

## Interface

- `ApplyPatch` / `useApplyPatch` / `patchTextOf` / `patchInfo` / `parseClaudePatchBlocks` / `claudeBlockToUnifiedDiff` (`apply-patch.tsx`)
- `Bash` / `useBash` / `parseBashOutput` / `BashOutput` (`bash.tsx`)
- `FileEdit` / `useFileEdit` / `FileEditDiff` (`file-edit.tsx`)
- `FileRead` / `useFileRead` (`file-read.tsx`)
- `Search` / `useSearch` (`search.tsx`)
- `Todo` / `useTodo` / `todoItems` / `TodoItem` / `TodoItemStatus` (`todo.tsx`)
- `inlineValue` / `truncate` / `basename` / `shortenPath` / `SUMMARY_KEYS` (`inline-tool.tsx`)

## Invariants

- `useApplyPatch`, `useBash`, `useFileEdit`, `useFileRead`, `useSearch`, `useTodo`: throw when used outside their `X.Root`
- `bash.tsx`, `apply-patch.tsx`, `inline-tool.tsx`: malformed JSON arguments give ''/null instead of throwing
- `Bash.Root` (`bash.tsx`): `isError` for a non-zero exitCode or status 'error'
- `fileContents` (`file-read.tsx`): strips line-number prefixes and caps at `MAX_LINES` = 200
- `parseClaudePatchBlocks` (`apply-patch.tsx`): only Update, Add and Delete headers are recognized

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat-tools && pnpm test`
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck && pnpm lint`
