# harness/src/codex

## Overview

Codex CLI harness, published as `./codex`. It chats through `codex` from `@conciv/ai/server`, reads models and the default model from `CODEX_HOME` files, and reads session history from Codex's SQLite state DB and rollout JSONL files.

## Interface

- `codex` (`index.ts`): id/binName `'codex'`, displayName `'Codex'`; capabilities resume true, `permissionGate: 'none'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'http'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; `resume.command({nativeId})` is `codex resume <nativeId>`.
- `codex.chatConfig` (`index.ts`): codexAdapter with `sandboxMode: 'workspace-write'`, `approvalPolicy: 'never'`; with `deps.hasTools` adds `mcp_servers.tanstack.default_tools_approval_mode = "approve"`; env through `definedEntries`; `sessionId` when resuming.
- `codexHome(env)`, `codexModels(dir)`, `codexDefaultModel(dir)` (`models.ts`).
- `stateDbPath()` (`$CODEX_HOME/state_5.sqlite`), `sessionsRoot()` (`$CODEX_HOME/sessions`), `rolloutCwd(raw)`, `rolloutPath(sessionId)`, `codexHistory` `{messages, tail, observe, withinProject, contextTokens, list, meta}` (`history.ts`); `messages` streams the rollout through `foldJsonlFile`, taking the cwd from its first `session_meta` line, and answers `[]` when that cwd is not the project. Message ids are `${sessionId}:o<byte offset of the line that opened the message>`. `tail` checks the first `session_meta` cwd, then reads backwards through `tailLines`: a safe boundary is a non-blank user message with no later tool output whose call sits above it; the cursor is the boundary's byte offset as a decimal string. `list({cwd}, page)` reads the `threads` rows of that cwd, `list({everywhere: true}, page)` every unarchived row; each meta carries the row's `cwd`.

## Invariants

- `codexModels` validates `models_cache.json` with `ModelsCacheSchema`, keeps `visibility === 'list'` entries sorted by `priority`, and falls back to `adapterCodexModels` on failure (`models.ts`).
- `codexDefaultModel` reads top-level `model = "..."` only before the first `[table]` header of `config.toml`; fallbacks are the first cached model, then `adapterCodexModels[0]`.
- `rolloutPath` prefers the thread row's `rollout_path`, else scans for `-<id>.jsonl`; both must be inside `$CODEX_HOME` (`containedPath`).
- History, `withinProject` and `observe` require the rollout's `session_meta.cwd` to match (`sameCwd`); `verifyHead` returns `'corrupt'` without session_meta and `'missing'` for another cwd.
- `listSessions` selects `threads` where `cwd = realpathOrSelf(cwd)` and `archived = 0` one page at a time, newest first by `(updatedAt, id)` after the page cursor, `limit + 1` rows to know whether a next page exists (`pageAfter`); a thread whose rollout file is gone, or whose recorded rollout path resolves outside the codex home (`containedPath`, the same check `messages` and `observe` apply), is left out, and `meta` answers `null` for it, so a page can come back short while `next` is set; titles capped at 80, previews at 200.
- Tool outputs attach to the last message holding the matching `call_id`, else to the assistant message; namespaced tool names become `namespace__name` (`history.ts`).

## Side Effects

- Reads `$CODEX_HOME` (default `~/.codex`) `models_cache.json` and `config.toml` synchronously, including at module load through `defaultModel: codexDefaultModel()` (`models.ts`, `index.ts`).
- Opens `$CODEX_HOME/state_5.sqlite` read-only with `node:sqlite` `DatabaseSync` (`queryRows`).
- Reads rollout JSONL files and recursively scans `$CODEX_HOME/sessions` (`rolloutEntries`, `readRollout`, `listSessions`).
- The chat adapter runs the codex CLI with the caller's env.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
