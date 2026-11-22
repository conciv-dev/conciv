# harness/src/_shared

## Overview

Helpers shared by the harness adapters: the `HarnessAdapter` contract type, path-containment checks, an incremental JSONL transcript reader, env filtering, and helpers that read text and images from the last user message.

## Interface

- `HarnessAdapter` (`contract.ts`): base fields `id`, `binName`, `displayName?`, `chatConfig(deps)`, `models`, `defaultModel`, `tty.command(ctx)`, `resume.command({cwd, nativeId})` (the `{bin, args}` a person runs in that cwd to reopen a native session), plus unions keyed on capabilities.
- `HarnessChatConfig` `{adapter: TextAdapter; modelOptions?; prepareMessages?}`; `defineHarness(adapter)` identity helper for type checking (`contract.ts`).
- `containedPath(root, candidate)`, `transcriptPathWithin(history, cwd, sessionId)` (`contained-path.ts`).
- `foldJsonlFile(path, initial, foldLine, {signal})` -> the fold over every line of a JSONL file, read in 256 KiB `FileHandle.read` chunks so the event loop runs between them, throwing the signal's reason (AbortError) before the next chunk once `signal` aborts; `foldLine(state, line, offset)` gets each line with the byte offset where it starts (lines split on `\n` only, decoded as UTF-8 per whole line); a missing file rejects with ENOENT (`fold-jsonl-file.ts`).
- `readLinesBackward(path, {end, signal})` -> async generator of `{line, offset}` from byte `end` (the file size when null, clamped to it) back to the start, reading 256 KiB chunks at descending positions and decoding only whole lines, so a multibyte character split by a chunk edge decodes intact; it throws the signal's reason between chunks once aborted (`tail-lines.ts`).
- `tailLines({path, end, limit, signal, scan, fold, cursor})` -> `TranscriptPage`: walks `readLinesBackward`, keeps the lines `scan` returns, folds each run of kept lines forward with `fold` whenever `scan` marks a safe boundary, and stops at the first boundary where the page holds `limit` messages, answering `earlier: cursor(line, offset)`; a line marked `first` (the start of the transcript) or the start of the file answers `earlier: null` (`tail-lines.ts`).
- `readHead(path)` -> the complete lines in the first 64 KiB of a file, read synchronously; fs errors throw (`read-head.ts`). Codex reads a rollout's `session_meta` cwd through it.
- `definedEntries(env)` (`env.ts`): drops env entries whose value is undefined.
- `lastUserModelText(messages)`, `lastUserImages(messages)` (`text-adapter.ts`): newline-joined text and data images `{mediaType, dataBase64}` from the last user message.
- `inside`, `realpathOrSelf`, `sameCwd` (`cwd.ts`): re-exported from `@conciv/harness-init/paths`; published as the `./cwd` export.

## Invariants

- `HarnessAdapter` requires `history` and `resume` when `capabilities.transcriptHistory: true`, `commands` when `slashCommands` is `'live'` or `'files'`, and `init` when `init: 'files'`; otherwise each must be undefined (`contract.ts`).
- `containedPath` returns null when the relative step is `''`, starts with `..`, or is absolute (the root itself is rejected); it resolves symlinks with `realpathSync`, falling back to the parent (`contained-path.ts`).
- `transcriptPage` pages the transcripts of one or more directories as one newest-first list, and skips a transcript whose real path escapes the listed directory (`containedPath`), so `list` never returns a session that `messages` and `meta` refuse to read (`../pi/history.ts`).
- `transcriptPathWithin` returns null when `history.transcriptPath` is undefined or `withinProject` is false.

## Side Effects

- `realpathSync` calls (`containedPath`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
