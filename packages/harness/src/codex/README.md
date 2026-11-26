# harness/src/codex

## Overview

Codex CLI harness, published as `./codex` (`codex.ts`). It chats through `codex` from `../adapters`, reads models and the default model from `CODEX_HOME` files, and reads session history from Codex's SQLite state DB and rollout JSONL files.

## Invariants

- Each model step gets a fresh Codex adapter built from that step's tools, with `sandboxMode: 'workspace-write'` and `approvalPolicy: 'never'` (Codex never asks); a step that offers tools adds `mcp_servers.tanstack.default_tools_approval_mode = "approve"` (`codexRunAdapter`, `codex.ts`).
- History reads the rollout's first `session_meta` line for its cwd and answers `[]` when that cwd is not the project; message ids are `${sessionId}:o<byte offset of the line that opened the message>`; a `tail` cursor is the boundary's byte offset as a decimal string (`history.ts`).
- `codexModels` validates `models_cache.json` with `ModelsCacheSchema`, keeps `visibility === 'list'` entries sorted by `priority`, and falls back to `adapterCodexModels` on failure (`models.ts`).
- `codexDefaultModel` reads top-level `model = "..."` only before the first `[table]` header of `config.toml`; fallbacks are the first cached model, then `adapterCodexModels[0]`.
- `rolloutPath` prefers the thread row's `rollout_path`, else scans for `-<id>.jsonl`; both must be inside `$CODEX_HOME` (`containedPath`).
- History and `withinProject` require the rollout's `session_meta.cwd` to match (`sameCwd`).
- `listSessions` selects `threads` where `cwd = realpathOrSelf(cwd)` and `archived = 0` one page at a time, newest first by `(updatedAt, id)` after the page cursor, `limit + 1` rows to know whether a next page exists (`pageAfter`); a thread whose rollout file is gone, or whose recorded rollout path resolves outside the codex home (`containedPath`, the same check `messages` and `observe` apply), is left out, and `meta` answers `null` for it, so a page can come back short while `next` is set; titles capped at 80, previews at 200.
- Tool outputs attach to the last message holding the matching `call_id`, else to the assistant message; namespaced tool names become `namespace__name` (`history.ts`).

## Side Effects

- Reads `$CODEX_HOME` (default `~/.codex`) `models_cache.json` and `config.toml` without blocking, only when `models()`, `defaultModel()` or `login()` is called (`models.ts`, `codex.ts`); `codex(provider)` reads no file. A turn without a chosen model reads its default from the home in the turn's harness env.
- Opens `$CODEX_HOME/state_5.sqlite` read-only with `node:sqlite` `DatabaseSync` (`queryRows`).
- Reads rollout JSONL files and recursively scans `$CODEX_HOME/sessions` (`rolloutEntries`, `listSessions`); `withinProject` and `tail` read only the head (`readHead`, 64 KiB).
- The chat adapter runs the codex CLI with the caller's env.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
