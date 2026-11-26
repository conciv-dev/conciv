# ui-kit-chat-tools/src/primitives/tools

## Overview

Headless per-tool primitives. Each file defines a Solid context, a `Root` provider taking `{part, result, children}`, and a `useX` hook; the Root derives typed accessors from the tool call's JSON arguments and result. The apply-patch file also parses `*** Update/Add/Delete File:` patches and converts them to unified diffs.

## Interface

- One file per tool (`apply-patch.tsx`, `bash.tsx`, `file-edit.tsx`, `file-read.tsx`, `search.tsx`, `todo.tsx`), each a `Root` and its `useX` hook; the pure parsers are beside them (`apply-patch-text.ts`, `bash-output.ts`) and `inline-tool.tsx` holds the inline-row value helpers.

## Invariants

- `useApplyPatch`, `useBash`, `useFileEdit`, `useFileRead`, `useSearch`, `useTodo`: throw when used outside their `X.Root`
- `bash.tsx`, `apply-patch-text.ts`, `inline-tool.tsx`: malformed JSON arguments give ''/null instead of throwing
- `Bash.Root` (`bash.tsx`): `isError` for a non-zero exitCode or status 'error' when the result has no `outcome`; `outcome` and `stoppedReason` for a denied or cancelled result
- `fileContents` (`file-read.tsx`): strips line-number prefixes and caps at `MAX_LINES` = 200
- `parseClaudePatchBlocks` (`apply-patch-text.ts`): only Update, Add and Delete headers are recognized

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
