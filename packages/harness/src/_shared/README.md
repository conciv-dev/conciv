# harness/src/_shared

## Overview

Helpers shared by the harness adapters: the `HarnessAdapter` contract type, path-containment checks, an incremental JSONL transcript reader, env filtering, and helpers that read text and images from the last user message.

## Invariants

- Transcript readers never block the event loop: `foldJsonlFile` reads a JSONL file forward and `readLinesBackward` backward in 256 KiB chunks, each decoding only whole lines (split on `\n`, UTF-8 per whole line, so a multibyte character split by a chunk edge decodes intact) and throwing the signal's reason between chunks once it aborts (`fold-jsonl-file.ts`, `tail-lines.ts`).
- `tailLines` folds each run of kept lines forward whenever `scan` marks a safe boundary and stops at the first boundary where the page holds `limit` messages; a line marked `first` or the start of the file answers `earlier: null` (`tail-lines.ts`).
- `HarnessAdapter` requires `history` and `resume` when `capabilities.transcriptHistory: true`, `commands` when `slashCommands` is `'live'` or `'files'`, and `init` when `init: 'files'`; otherwise each must be undefined (`contract.ts`).
- `containedPath` returns null when the relative step is `''`, starts with `..`, or is absolute (the root itself is rejected); it resolves symlinks with `realpath` from `node:fs/promises`, falling back to the parent (`contained-path.ts`).
- `transcriptPage` pages the transcripts of one or more directories as one newest-first list, and skips a transcript whose real path escapes the listed directory (`containedPath`), so `list` never returns a session that `messages` and `meta` refuse to read (`../pi/history.ts`).
- `transcriptPathWithin` returns null when `history.transcriptPath` is undefined or `withinProject` is false.

## Side Effects

- `realpath` calls (`containedPath`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
