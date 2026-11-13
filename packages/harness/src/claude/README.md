# harness/src/claude

## Overview

Claude Code harness, published as `./claude` (`dist/claude/index.js`). It combines the model list, the TTY argv builder, the chat adapter config (on `claudeCode` from `@conciv/ai/server`), slash-command probing through `@anthropic-ai/claude-agent-sdk`, and transcript parsing of `~/.claude/projects/*.jsonl`. Init behaviour comes from `claudeInit` in `@conciv/harness-init/claude`.

## Interface

- `claude` (`index.ts`): `defineHarness({id: 'claude', binName: 'claude', defaultModel: 'opus', ...})` with capabilities `permissionGate: 'callback'`, `systemPrompt: 'file'`, `mcp: 'http'`, `slashCommands: 'live'`, `imageInput: 'fileRef'`, `init: 'files'`, plus resume, transcriptHistory and compaction.
- `claudeSdkModels()` (`sdk.ts`): the account's live model list from the Agent SDK `initializationResult().models` (the same list as Claude Code's `/model`), probed once per process and cached; the slash-command probe reads the same initialization result and seeds this cache, so one session can answer both. The `default` alias row is dropped; alias rows (`opus`, `sonnet`, ...) get `group: 'Claude'` and a pinned id (starting with `claude-`) gets `group: 'Older versions'` only when an alias row for its family is listed (a pinned id with no alias, such as `claude-fable-5-1[1m]` before a `fable` alias exists, stays in `Claude`). A model with `supportsEffort` carries `efforts`, its `supportedEffortLevels` in SDK order; a model without effort carries none. `claudeChatConfig` (`chat.ts`) runs the CLI at the session's effort through `CLAUDE_CODE_EFFORT_LEVEL` (the CLI's highest-precedence effort setting, a plain env var instead of a flag in the space-split executable string), set only when an effort is picked, for every model id alike, so a Claude 5 id gets it although `@tanstack/ai-claude-code` has no reasoning data for it. Models carry no context window: the real one arrives with each turn's usage, read from `providerUsageDetails.modelUsage` by `tokenUsageToSnapshot` in `@conciv/protocol/usage-types` (the session model's entry, else the entry with the most input and cache tokens). A failed probe rejects (no stand-in list) and is retried on the next call; core keeps the last good list on disk (`withSavedModels`).
- `CHAT_SYSTEM_PROMPT` (`system-prompt.ts`, re-exported): names `execute_typescript` and `external_conciv_ui` (the code-mode catalog lists the capabilities); says native `AskUserQuestion` is disabled.
- `mcpServerConfig(mcpUrl, sessionId?)`, `claudeMcpArgs` (adds `--strict-mcp-config`), `claudeMcpArgsPermissive`, `claudeConnectArgs(ctx)` (`args.ts`).
- `CLAUDE_ASK_RULES`, `claudeAskSettingsFile()` (`ask-rules.ts`): `permissions.ask` rules for risky git/rm/chmod/chown/sudo Bash commands, written to a temp settings file.
- `TextBlock`, `ThinkingBlock`, `ToolUseBlock`, `ToolResultBlock` zod schemas; `canonicalToolName(name)` (strips `mcp__conciv__` / `mcp__plugin_conciv-connect_conciv__`); `contentText(raw)` (`blocks.ts`).
- `imageRefs(images, cwd)`, `claudeExecutable(pluginDir, settingsFile?)`, `claudeChatConfig(deps)` (`chat.ts`): claudeCode adapter with `systemPromptMode: 'append'`, `allowedTools: ['mcp__tanstack']`, `disallowedTools: ['AskUserQuestion']`, `permissionMode: 'auto'`; `prepareMessages` swaps the last user text to `/compact` for `kind === 'compact'`, otherwise appends image refs.
- `CONCIV_PLUGIN_DIR` (`plugin-dir.ts`): first `plugins/claude` dir containing `.claude-plugin/plugin.json`, up to 6 levels above the module, or null.
- `claudeSdkCommands(ctx)`, test hook `__commandsCacheSet(cwd, commands)` (`sdk.ts`).
- `resume.command({nativeId})` (`index.ts`): `claude --resume <nativeId>`, built by `claudeSessionArgs` (`args.ts`), the same helper `claudeConnectArgs` uses.
- `claudeTtyCommand(ctx)` (`tty.ts`): `{bin: 'claude', args, env TERM/COLORTERM, unsetEnvPrefixes}`.
- `transcriptRoot` (under `projects/`, the cwd resolved through symlinks like Claude and the Agent SDK do), `transcriptPath`, `parseHistory`, `parseSessionMeta`, `nameFromTranscript`, `contextTokensFromTranscript`, `listSessions`, `sessionMeta`, `withinProject`, `claudeHistory` (`history.ts`).
- `transcriptUsage({cwd, nativeId})` (`transcript-usage.ts`, wired as `history.transcriptUsage`): the transcript of that harness session id, looked up under `transcriptRoot(cwd)` first, then in every project folder (an agent can run from another cwd); `model` is the model of the most assistant messages (deduplicated by message id, `<synthetic>` skipped), `usage` their summed usage as a `TokenUsage` (prompt = input + cache read + cache creation, as `@tanstack/ai-claude-code` counts it), `cost` the summed `total_cost_usd` of result records, absent when the transcript has none. Null when no transcript has the id or it holds no assistant message. The other harnesses have no `transcriptUsage`: their transcripts carry no per-message usage.

## Invariants

- `claudeExecutable` throws when a `--plugin-dir` or `--settings` path contains whitespace, because `@tanstack/ai-claude-code` splits the executable string on spaces (`spaceFreePath`, `chat.ts`).
- Chat always passes `--strict-mcp-config` and disallows `AskUserQuestion` (`claudeExecutable`, `claudeChatConfig`).
- Connect uses strict `claudeMcpArgs` only when `ctx.owned`, else `claudeMcpArgsPermissive`; `--resume` when `ctx.resume`, else `--session-id` (`claudeConnectArgs`).
- The Claude config dir is `CLAUDE_CONFIG_DIR`, else `~/.claude` (`claudeConfigDir` from `@conciv/harness-init/claude/state`), the same rule the Agent SDK follows; no Claude history call takes a home.
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
- Sets adapter env `MCP_TOOL_TIMEOUT=150000` and `ENABLE_TOOL_SEARCH=false`, merged with `deps.env` (`claudeChatConfig`).
- `existsSync` probe at module load (`CONCIV_PLUGIN_DIR`).
- Starts an Agent SDK `query` with `permissionMode: 'acceptEdits'` to read `supportedCommands`, then interrupts it (`probeCommands`, `sdk.ts`).
- Reads `<Claude config dir>/projects/<encoded cwd>/*.jsonl` (`transcriptMessages`, `transcriptTail`, `observeTranscript`) and, through the Agent SDK, the same directory's heads and tails (`listSessions`, `sessionMeta`); an `everywhere` listing reads every `projects/*` directory.
- The TTY command unsets env vars with prefixes `CLAUDECODE`, `CLAUDE_CODE_`, `CLAUDE_EFFORT`, `AI_AGENT` (`NESTED_SESSION_MARKERS`, `tty.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
