# harness/src/claude

## Overview

Claude Code harness, published as `./claude` (`claude.ts`). It combines the model list, the TTY argv builder, the chat adapter config (on `claudeCode` from `../adapters`), slash-command probing through `@anthropic-ai/claude-agent-sdk`, and transcript parsing of `~/.claude/projects/*.jsonl`. Init behaviour comes from `claudeInit` in `../init/claude`.

## Invariants

- Chat runs the `claudeCode` adapter with `systemPromptMode: 'append'`, `allowedTools: ['mcp__tanstack']`, `disallowedTools: ['AskUserQuestion']` and `permissionMode: 'auto'`; a compaction turn swaps the last user text to `/compact`, any other turn appends image refs (`chat.ts`). An effort the user picked reaches the CLI as `CLAUDE_CODE_EFFORT_LEVEL`, set only when one is picked, for every model id alike.
- The model list is the account's live list from the Agent SDK (`initializationResult().models`, the same list as Claude Code's `/model`), probed once per process and cached; the slash-command probe seeds the same cache. The `default` alias row is dropped; alias rows get `group: 'Claude'`, and a pinned id gets `group: 'Older versions'` only when an alias row for its family is listed. Models carry no context window: the real one arrives with each turn's usage (`tokenUsageToSnapshot` in `@conciv/types/usage-types`). A failed probe rejects and is retried on the next call; the engine keeps the last good list on disk (`withSavedModels`). The probe follows the listing's `signal`: when the engine stops, the SDK ends the probe CLI's stdin and signals it later without waiting, so the probe CLI can outlive the engine's close by a few seconds (`sdk.ts`).
- `claudeExecutable` throws when a `--plugin-dir` or `--settings` path contains whitespace, because `@tanstack/ai-claude-code` splits the executable string on spaces (`spaceFreePath`, `chat.ts`).
- Chat always passes `--strict-mcp-config` and disallows `AskUserQuestion` (`claudeExecutable`, `claudeChatConfig`).
- Connect always uses strict `claudeMcpArgs`; `--resume` when `ctx.resume`, else `--session-id` (`claudeConnectArgs`).
- The Claude config dir is `CLAUDE_CONFIG_DIR` read under the provider (an empty value falls back), else `~/.claude` (`claudeConfigDir` from `../init/claude/install-state.ts`), the same rule the Agent SDK follows; it is resolved once in `claude(provider)` and handed to `claudeHistory`.
- The Agent SDK reads `CLAUDE_CONFIG_DIR` from `process.env` itself: `listSessions` and `getSessionInfo` take only a project `dir`, with no config-dir option. The session listing and meta (`listSessions`, `sessionMeta`) therefore use the process env's config dir, while transcript reads (`transcriptRoot`, `transcriptMessages`, `transcriptTail`, `observeTranscript`) use the provider's. The two differ only when a provider sets a `CLAUDE_CONFIG_DIR` that the process env does not, as a test provider can; the CLI and the engine read the same env.
- `listSessions(scope, page)` and `sessionMeta` go through the Agent SDK (`listSessions({dir: cwd, includeWorktrees: false})` for a `{cwd}` scope, `listSessions()` across every project for `{everywhere: true}`, then `pageAfter`; and `getSessionInfo`): the title is the SDK `summary`, `updatedAt` its `lastModified`, `sizeBytes` its `fileSize`, `cwd` its `cwd` (the transcript's recorded cwd; a session with none is left out of an `everywhere` listing). Sessions the SDK hides (no summary in the head or tail it reads, superseded by a `continued-in` record, non-UUID ids) are not listed and their `meta` is null.
- `transcriptMessages` streams the transcript through `foldJsonlFile` with the same line fold as `observeTranscript`.
- A message's id is its opening record's `uuid`, or `o<byte offset of that record's line>` when it has none, so full reads, live handles and tails agree.
- `transcriptTail(cwd, id, {limit, before, signal})` (`claudeHistory.tail`) reads backwards from byte `before` (the end when null) through `tailLines`; a safe boundary is a line holding a human user turn with no tool results of its own and no later tool-result line before the next assistant line (such a result attaches to the assistant above the turn), and the page is folded forward with the same `foldLine`; the cursor is the boundary's byte offset as a decimal string. A malformed cursor, a missing transcript or one outside the project answers `{messages: [], earlier: null}`.
- `transcriptMessages`, `transcriptTail` and `observeTranscript` refuse session ids whose path escapes `transcriptRoot` (`withinProject` via `containedPath`).
- History skips sidechain records (`isSidechain`), machinery records in user turns (`isFromMachinery`), `INTERNAL_MARKERS`, `SYNTHETIC_MARKERS` and `MACHINERY_XML_BLOCK`; assistant records sharing `message.id` are merged and tool results attach to the last assistant message (`foldAssistantTurn`, `foldUserTurn`).
- `MAX_TITLE` 80, `MAX_PREVIEW` 200 (`history.ts`).
- Slash commands are probed once per cwd and cached (`commandsByCwd`, `sdk.ts`).

## Side Effects

- Writes `conciv-claude-settings-<sha256 16>.json` to `os.tmpdir()` on every `claudeChatConfig` call (`claudeAskSettingsFile`).
- Creates `<concivStateDir(cwd)>/tmp` and writes `img-<uuid>.<ext>` files (`imageRefs`).
- Sets adapter env `MCP_TOOL_TIMEOUT=3600000` (one hour, so a permission card waits for the user) and `ENABLE_TOOL_SEARCH=false`, merged with `deps.env` (`claudeChatConfig`).
- Probes up to 6 `plugins/claude/.claude-plugin/plugin.json` paths each time `claudePluginDir()` runs: on every `claudeChatConfig` call and every slash-command probe, never at module load.
- Starts an Agent SDK `query` with `permissionMode: 'acceptEdits'` to read `supportedCommands`, then interrupts it (`probeCommands`, `sdk.ts`).
- Reads `<Claude config dir>/projects/<encoded cwd>/*.jsonl` (`transcriptMessages`, `transcriptTail`, `observeTranscript`) and, through the Agent SDK, the same directory's heads and tails (`listSessions`, `sessionMeta`); an `everywhere` listing reads every `projects/*` directory.
- The TTY command unsets env vars with prefixes `CLAUDECODE`, `CLAUDE_CODE_`, `CLAUDE_EFFORT`, `AI_AGENT` (`NESTED_SESSION_MARKERS`, `claude.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
