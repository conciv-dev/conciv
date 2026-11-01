# harness/src/opencode

## Overview

OpenCode harness, published as `./opencode`. It chats through `opencode` from `@conciv/ai/server`, passes the MCP config to the TTY in `OPENCODE_CONFIG_CONTENT`, and reads session history and live transcripts from OpenCode's SQLite database.

## Interface

- `opencode` (`index.ts`): id/binName `'opencode'`, displayName `'OpenCode'`; capabilities resume true, `permissionGate: 'callback'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'http'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; default model `'opencode/claude-sonnet-4-5'`; models from `opencodeModels`.
- `opencode.connect.plan(ctx)` (`index.ts`): argv `opencode [--session <id>]`; with `ctx.mcpUrl`, env `OPENCODE_CONFIG_CONTENT` = `{mcp:{conciv:{type:'remote', url, headers:{[CONCIV_SESSION_HEADER]: id}, oauth:false, enabled:true}}}` (`opencodeMcpEnv`).
- `storagePath(home)` -> `~/.local/share/opencode/opencode.db`, `buildMessages(messageRows, partRows)`, `opencodeHistory` `{messages, observe, list}` (`history.ts`).

## Invariants

- Session reads require `sameCwd(session.directory, cwd)`; otherwise messages returns `[]` and observe returns `'missing'` (`history.ts`).
- `observe` returns `'missing'` when the DB file is absent; every `read()` returns the full message set with `replaced: true`; revision is `${max(message.time_updated)}:${count(part)}`.
- Tool parts become tool results only with status `'completed'` or `'error'` (`toolParts`).
- `listSessions` filters `directory = realpathOrSelf(cwd)` and `time_archived is null`, newest first, limit 50; `totalTokens` = `tokens_input + tokens_output`.

## Side Effects

- Opens `opencode.db` read-only with `node:sqlite` `DatabaseSync`; `observeTranscript` keeps it open until `close()` (`history.ts`).
- Sets `OPENCODE_CONFIG_CONTENT` in the TTY connect plan env (`opencodeMcpEnv`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
