# harness/src/codex

## Overview

Codex CLI harness, published as `./codex`. It chats through `codex` from `@conciv/ai/server`, reads models and the default model from `CODEX_HOME` files, builds the TTY connect argv with an inline MCP server config, and reads session history from Codex's SQLite state DB and rollout JSONL files.

## Interface

- `codex` (`index.ts`): id/binName `'codex'`, displayName `'Codex'`; capabilities resume true, `permissionGate: 'none'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'http'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`.
- `codex.chatConfig` (`index.ts`): codexAdapter with `sandboxMode: 'workspace-write'`, `approvalPolicy: 'never'`; with `deps.hasTools` adds `mcp_servers.tanstack.default_tools_approval_mode = "approve"`; env through `definedEntries`; `sessionId` when resuming.
- `codex.connect.plan(ctx)` (`index.ts`): argv `codex [resume <id>] [-m <model>] [-c mcp_servers={...}]`.
- `codexMcpArgs(mcpUrl, concivSessionId)` (`args.ts`): `-c mcp_servers={conciv={url=...,http_headers={<CONCIV_SESSION_HEADER>=...},startup_timeout_sec=30}}` with TOML-escaped strings.
- `codexHome(env)`, `codexModels(dir)`, `codexDefaultModel(dir)` (`models.ts`).
- `stateDbPath(home)` (`~/.codex/state_5.sqlite`), `sessionsRoot(home)` (`~/.codex/sessions`), `rolloutCwd(raw)`, `rolloutPath(sessionId, home)`, `codexHistory` `{messages, observe, withinProject, contextTokens, list}` (`history.ts`).

## Invariants

- `codexModels` validates `models_cache.json` with `ModelsCacheSchema`, keeps `visibility === 'list'` entries sorted by `priority`, and falls back to `adapterCodexModels` on failure (`models.ts`).
- `codexDefaultModel` reads top-level `model = "..."` only before the first `[table]` header of `config.toml`; fallbacks are the first cached model, then `adapterCodexModels[0]`.
- `rolloutPath` prefers the thread row's `rollout_path`, else scans for `-<id>.jsonl`; both must be inside `~/.codex` (`containedPath`).
- History, `withinProject` and `observe` require the rollout's `session_meta.cwd` to match (`sameCwd`); `verifyHead` returns `'corrupt'` without session_meta and `'missing'` for another cwd.
- `listSessions` selects `threads` where `cwd = realpathOrSelf(cwd)` and `archived = 0`, newest first, limit `MAX_SESSIONS` (50); titles capped at 80, previews at 200.
- Tool outputs attach to the last message holding the matching `call_id`, else to the assistant message; namespaced tool names become `namespace__name` (`history.ts`).

## Side Effects

- Reads `$CODEX_HOME` (default `~/.codex`) `models_cache.json` and `config.toml` synchronously, including at module load through `defaultModel: codexDefaultModel()` (`models.ts`, `index.ts`).
- Opens `~/.codex/state_5.sqlite` read-only with `node:sqlite` `DatabaseSync` (`queryRows`).
- Reads rollout JSONL files and recursively scans `~/.codex/sessions` (`rolloutEntries`, `readRollout`, `listSessions`).
- The chat adapter runs the codex CLI with the caller's env.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
