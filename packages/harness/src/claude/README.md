# harness/src/claude

## Overview

Claude Code harness, published as `./claude` (`dist/claude/index.js`). It combines the model list, connect/TTY argv builders, the chat adapter config (on `claudeCode` from `@conciv/ai/server`), slash-command probing through `@anthropic-ai/claude-agent-sdk`, and transcript parsing of `~/.claude/projects/*.jsonl`. Init behaviour comes from `claudeInit` in `@conciv/harness-init/claude`.

## Interface

- `claude` (`index.ts`): `defineHarness({id: 'claude', binName: 'claude', defaultModel: 'sonnet', ...})` with capabilities `permissionGate: 'callback'`, `systemPrompt: 'file'`, `mcp: 'http'`, `slashCommands: 'live'`, `imageInput: 'fileRef'`, `init: 'files'`, plus resume, transcriptHistory and compaction.
- `CLAUDE_MODELS` (`index.ts`, not exported): opus, sonnet, haiku (contextWindow 200000) and `claude-fable-5` with `disabled: true`.
- `CHAT_SYSTEM_PROMPT` (`system-prompt.ts`, re-exported): names `execute_typescript`, `discover_tools`, `external_conciv_ui`; says native `AskUserQuestion` is disabled.
- `mcpServerConfig(mcpUrl, sessionId?)`, `claudeMcpArgs` (adds `--strict-mcp-config`), `claudeMcpArgsPermissive`, `claudeConnectArgs(ctx)` (`args.ts`).
- `CLAUDE_ASK_RULES`, `claudeAskSettingsFile()` (`ask-rules.ts`): `permissions.ask` rules for risky git/rm/chmod/chown/sudo Bash commands, written to a temp settings file.
- `TextBlock`, `ThinkingBlock`, `ToolUseBlock`, `ToolResultBlock` zod schemas; `canonicalToolName(name)` (strips `mcp__conciv__` / `mcp__plugin_conciv-connect_conciv__`); `contentText(raw)` (`blocks.ts`).
- `imageRefs(images, cwd)`, `claudeExecutable(pluginDir, settingsFile?)`, `claudeChatConfig(deps)` (`chat.ts`): claudeCode adapter with `systemPromptMode: 'append'`, `allowedTools: ['mcp__tanstack']`, `disallowedTools: ['AskUserQuestion']`, `permissionMode: 'auto'`; `prepareMessages` swaps the last user text to `/compact` for `kind === 'compact'`, otherwise appends image refs.
- `CONCIV_PLUGIN_DIR` (`plugin-dir.ts`): first `plugins/claude` dir containing `.claude-plugin/plugin.json`, up to 6 levels above the module, or null.
- `claudeSdkCommands(ctx)`, test hook `__commandsCacheSet(cwd, commands)` (`sdk.ts`).
- `claudeTtyCommand(ctx)` (`tty.ts`): `{bin: 'claude', args, env TERM/COLORTERM, unsetEnvPrefixes}`.
- `encodeProjectDir`, `transcriptRoot`, `transcriptPath`, `parseHistory`, `parseSessionMeta`, `nameFromTranscript`, `contextTokensFromTranscript`, `listSessions`, `sessionSummary`, `sessionMeta`, `withinProject`, `claudeHistory` (`history.ts`).

## Invariants

- `claudeExecutable` throws when a `--plugin-dir` or `--settings` path contains whitespace, because `@tanstack/ai-claude-code` splits the executable string on spaces (`spaceFreePath`, `chat.ts`).
- Chat always passes `--strict-mcp-config` and disallows `AskUserQuestion` (`claudeExecutable`, `claudeChatConfig`).
- Connect uses strict `claudeMcpArgs` only when `ctx.owned`, else `claudeMcpArgsPermissive`; `--resume` when `ctx.resume`, else `--session-id` (`claudeConnectArgs`).
- `--plugin-dir` is added to connect argv only when `CONCIV_PLUGIN_DIR` is non-null (`claudeConnectPlan`, `index.ts`).
- `sessionSummary`, `transcriptMessages` and `observeTranscript` refuse session ids whose path escapes `transcriptRoot` (`withinProject` via `containedPath`).
- History skips sidechain records (`isSidechain`), machinery records in user turns (`isFromMachinery`), `INTERNAL_MARKERS`, `SYNTHETIC_MARKERS` and `MACHINERY_XML_BLOCK`; assistant records sharing `message.id` are merged and tool results attach to the last assistant message (`foldAssistantTurn`, `foldUserTurn`).
- `MAX_TITLE` 80, `MAX_PREVIEW` 200, `MAX_SESSIONS` 50 (`history.ts`).
- Slash commands are probed once per cwd and cached (`commandsByCwd`, `sdk.ts`).

## Side Effects

- Writes `conciv-claude-settings-<sha256 16>.json` to `os.tmpdir()` on every `claudeChatConfig` call (`claudeAskSettingsFile`).
- Creates `<concivStateDir(cwd)>/tmp` and writes `img-<uuid>.<ext>` files (`imageRefs`).
- Sets adapter env `MCP_TOOL_TIMEOUT=150000` and `ENABLE_TOOL_SEARCH=false`, merged with `deps.env` (`claudeChatConfig`).
- `existsSync` probe at module load (`CONCIV_PLUGIN_DIR`).
- Starts an Agent SDK `query` with `permissionMode: 'acceptEdits'` to read `supportedCommands`, then interrupts it (`probeCommands`, `sdk.ts`).
- Reads `~/.claude/projects/<encoded cwd>/*.jsonl` (`listSessions`, `sessionSummary`, `transcriptMessages`).
- The TTY command unsets env vars with prefixes `CLAUDECODE`, `CLAUDE_CODE_`, `CLAUDE_EFFORT`, `AI_AGENT` (`NESTED_SESSION_MARKERS`, `tty.ts`).

## Verification

- Run: `cd packages/harness && pnpm test`
