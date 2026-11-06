# harness/src/claude

## Overview

Claude Code harness, published as `./claude` (`dist/claude/index.js`). It combines the model list, connect/TTY argv builders, the chat adapter config (on `claudeCode` from `@conciv/ai/server`), slash-command probing through `@anthropic-ai/claude-agent-sdk`, and transcript parsing of `<Claude config dir>/projects/*.jsonl`. Init behaviour comes from `claudeInit` in `@conciv/harness-init/claude`.

## Interface

- `claude` (`index.ts`): `defineHarness({id: 'claude', binName: 'claude', defaultModel: 'opus', ...})` with capabilities `permissionGate: 'callback'`, `systemPrompt: 'file'`, `mcp: 'http'`, `slashCommands: 'live'`, `imageInput: 'fileRef'`, `init: 'files'`, plus resume, transcriptHistory and compaction.
- `claudeSdkModels()` (`sdk.ts`): the account's live model list from the Agent SDK `initializationResult().models` (the same list as Claude Code's `/model`), probed once per process and cached; the slash-command probe reads the same initialization result and seeds this cache, so one session can answer both. The `default` alias row is dropped; alias rows (`opus`, `sonnet`, ...) get `group: 'Claude'` and a pinned id (starting with `claude-`) gets `group: 'Older versions'` only when an alias row for its family is listed (a pinned id with no alias, such as `claude-fable-5-1[1m]` before a `fable` alias exists, stays in `Claude`). A model with `supportsEffort` carries `efforts`, its `supportedEffortLevels` in SDK order; a model without effort carries none. Models carry no context window: the real one arrives with each turn's usage (`providerUsageDetails.contextWindow`, from the patched `@tanstack/ai-claude-code`). A failed probe rejects (no stand-in list) and is retried on the next call; core keeps the last good list on disk (`withSavedModels`).
- `CHAT_SYSTEM_PROMPT` (`system-prompt.ts`, re-exported): names `execute_typescript`, `discover_tools`, `external_conciv_ui`; says native `AskUserQuestion` is disabled.
- `mcpServerConfig(mcpUrl, sessionId?)`, `claudeMcpArgs` (adds `--strict-mcp-config`), `claudeMcpArgsPermissive`, `claudeConnectArgs(ctx)` (`args.ts`).
- `CLAUDE_ASK_RULES`, `claudeAskSettingsFile()` (`ask-rules.ts`): `permissions.ask` rules for risky git/rm/chmod/chown/sudo Bash commands, written to a temp settings file.
- `TextBlock`, `ThinkingBlock`, `ToolUseBlock`, `ToolResultBlock` zod schemas; `canonicalToolName(name)` (strips `mcp__conciv__` / `mcp__plugin_conciv-connect_conciv__`); `contentText(raw)` (`blocks.ts`).
- `imageRefs(images, cwd)`, `claudeExecutable(pluginDir, settingsFile?)`, `claudeChatConfig(deps)` (`chat.ts`): claudeCode adapter with `systemPromptMode: 'append'`, `allowedTools: ['mcp__tanstack']`, `disallowedTools: ['AskUserQuestion']`, `permissionMode: 'auto'`; `prepareMessages` swaps the last user text to `/compact` for `kind === 'compact'`, otherwise appends image refs.
- `CONCIV_PLUGIN_DIR` (`plugin-dir.ts`): first `plugins/claude` dir containing `.claude-plugin/plugin.json`, up to 6 levels above the module, or null.
- `claudeSdkCommands(ctx)`, test hook `__commandsCacheSet(cwd, commands)` (`sdk.ts`).
- `claudeTtyCommand(ctx)` (`tty.ts`): `{bin: 'claude', args, env TERM/COLORTERM, unsetEnvPrefixes}`.
- `transcriptRoot` (under `projects/`, the cwd resolved through symlinks like Claude and the Agent SDK do), `transcriptPath`, `parseHistory`, `parseSessionMeta`, `nameFromTranscript`, `contextTokensFromTranscript`, `listSessions`, `sessionSummary`, `sessionMeta`, `withinProject`, `claudeHistory` (`history.ts`).

## Invariants

- `claudeExecutable` throws when a `--plugin-dir` or `--settings` path contains whitespace, because `@tanstack/ai-claude-code` splits the executable string on spaces (`spaceFreePath`, `chat.ts`).
- Chat always passes `--strict-mcp-config` and disallows `AskUserQuestion` (`claudeExecutable`, `claudeChatConfig`).
- Connect uses strict `claudeMcpArgs` only when `ctx.owned`, else `claudeMcpArgsPermissive`; `--resume` when `ctx.resume`, else `--session-id` (`claudeConnectArgs`).
- `--plugin-dir` is added to connect argv only when `CONCIV_PLUGIN_DIR` is non-null (`claudeConnectPlan`, `index.ts`).
- The Claude config dir is `CLAUDE_CONFIG_DIR`, else `~/.claude` (`claudeConfigDir` from `@conciv/harness-init/claude/state`), the same rule the Agent SDK follows; no Claude history call takes a home.
- `listSessions` and `sessionMeta` go through the Agent SDK (`listSessions({dir: cwd, includeWorktrees: false})` then `pageAfter`, and `getSessionInfo`): the title is the SDK `summary`, `updatedAt` its `lastModified`, `sizeBytes` its `fileSize`. Sessions the SDK hides (no summary in the head or tail it reads, superseded by a `continued-in` record, non-UUID ids) are not listed and their `meta` is null.
- `transcriptMessages` streams the transcript through `foldJsonlFile` with the same line fold as `observeTranscript`.
- `sessionSummary`, `transcriptMessages` and `observeTranscript` refuse session ids whose path escapes `transcriptRoot` (`withinProject` via `containedPath`).
- History skips sidechain records (`isSidechain`), machinery records in user turns (`isFromMachinery`), `INTERNAL_MARKERS`, `SYNTHETIC_MARKERS` and `MACHINERY_XML_BLOCK`; assistant records sharing `message.id` are merged and tool results attach to the last assistant message (`foldAssistantTurn`, `foldUserTurn`).
- `MAX_TITLE` 80, `MAX_PREVIEW` 200 (`history.ts`).
- Slash commands are probed once per cwd and cached (`commandsByCwd`, `sdk.ts`).

## Side Effects

- Writes `conciv-claude-settings-<sha256 16>.json` to `os.tmpdir()` on every `claudeChatConfig` call (`claudeAskSettingsFile`).
- Creates `<concivStateDir(cwd)>/tmp` and writes `img-<uuid>.<ext>` files (`imageRefs`).
- Sets adapter env `MCP_TOOL_TIMEOUT=150000` and `ENABLE_TOOL_SEARCH=false`, merged with `deps.env` (`claudeChatConfig`).
- `existsSync` probe at module load (`CONCIV_PLUGIN_DIR`).
- Starts an Agent SDK `query` with `permissionMode: 'acceptEdits'` to read `supportedCommands`, then interrupts it (`probeCommands`, `sdk.ts`).
- Reads `<Claude config dir>/projects/<encoded cwd>/*.jsonl` (`sessionSummary`, `transcriptMessages`, `observeTranscript`) and, through the Agent SDK, the same directory's heads and tails (`listSessions`, `sessionMeta`).
- The TTY command unsets env vars with prefixes `CLAUDECODE`, `CLAUDE_CODE_`, `CLAUDE_EFFORT`, `AI_AGENT` (`NESTED_SESSION_MARKERS`, `tty.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
