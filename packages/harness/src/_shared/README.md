# harness/src/_shared

## Overview

Helpers shared by the harness adapters: the `HarnessAdapter` contract type, an ACP chat-config factory, a stub chat config, path-containment checks, an incremental JSONL transcript reader, env filtering, and helpers that read text and images from the last user message.

## Interface

- `HarnessAdapter` (`contract.ts`): base fields `id`, `binName`, `displayName?`, `connect`, `chatConfig(deps)`, `models`, `defaultModel`, `tty.command(ctx)`, plus unions keyed on capabilities.
- `HarnessChatConfig` `{adapter: TextAdapter; modelOptions?; prepareMessages?}`; `defineHarness(adapter)` identity helper for type checking (`contract.ts`).
- `acpChatConfig(name, commandOf, defaultModel)` (`acp.ts`): chatConfig that builds an `acp(...)` adapter with `permissions: 'interactive'` and sets `modelOptions.sessionId` when resuming.
- `unsupportedChatConfig(id, binName)` (`stub.ts`): TextAdapter that yields `RUN_STARTED` then `RUN_ERROR` "<binName> is not installed or not yet supported".
- `defineStubHarness({id, binName, capabilities})` (`stub.ts`): `defineHarness` wrapper over `unsupportedChatConfig`; no non-test caller in `src`.
- `containedPath(root, candidate)`, `transcriptPathWithin(history, cwd, sessionId, home?)` (`contained-path.ts`).
- `makeJsonlHandle(source)` -> TranscriptHandle `{revision(), read(), close()}` over `JsonlSource {parser, resolvePath, verifyHead?}`; types `JsonlParser<State>`, `JsonlSource<State>`; `transcriptFailure(reason, detail)` (`jsonl-handle.ts`).
- `definedEntries(env)` (`env.ts`): drops env entries whose value is undefined.
- `lastUserModelText(messages)`, `lastUserImages(messages)` (`text-adapter.ts`): newline-joined text and data images `{mediaType, dataBase64}` from the last user message.
- `inside`, `realpathOrSelf`, `sameCwd` (`cwd.ts`): re-exported from `@conciv/harness-init/paths`; published as the `./cwd` export.

## Invariants

- `HarnessAdapter` requires `history` when `capabilities.transcriptHistory: true`, `commands` when `slashCommands` is `'live'` or `'files'`, and `init` when `init: 'files'`; otherwise each must be undefined (`contract.ts`).
- `defineStubHarness` capabilities are fixed to `transcriptHistory: false`, `compaction: false`, `slashCommands: 'none'`, `init: 'none'` (`stub.ts`).
- `containedPath` returns null when the relative step is `''`, starts with `..`, or is absolute (the root itself is rejected); it resolves symlinks with `realpathSync`, falling back to the parent (`contained-path.ts`).
- `transcriptPathWithin` returns null when `history.transcriptPath` is undefined or `withinProject` is false.
- `makeJsonlHandle` consumes only complete newline-terminated lines; when the file shrinks it resets offset and fold; `replaced` is true for reads from offset 0; `verifyHead` runs once on up to `HEAD_BYTES` (65536); a closed handle returns `'unreadable'`; ENOENT maps to `'missing'`, other errors to `'unreadable'`; a revision is `${size}:${mtimeMs}` (`jsonl-handle.ts`).

## Side Effects

- Reads transcript files with fs/promises `stat`, `open`, `read` (`makeJsonlHandle`).
- `realpathSync` calls (`containedPath`).
- The adapter from `acpChatConfig` spawns `commandOf(model)` with interactive permissions (`acp.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
