# harness/src/opencode

## Overview

OpenCode harness, published as `./opencode`. It chats through `opencode` from `@conciv/ai/server`, passes the MCP config to the TTY in `OPENCODE_CONFIG_CONTENT`, and reads session history and live transcripts from OpenCode's SQLite database.

## Interface

- `opencode` (`index.ts`): id/binName `'opencode'`, displayName `'OpenCode'`; capabilities resume true, `permissionGate: 'callback'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'http'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; default model `'opencode/claude-sonnet-4-5'`; models from `opencodeModels` (`models.ts`): the live list from `opencode models --verbose`, which is OpenCode's own list of usable models (providers with a stored credential, a provider key in the environment, ambient credentials such as an AWS profile for Bedrock, configured providers, and the free OpenCode models that need none; with no credentials at all only the free ones) (ids `<providerID>/<id>`, named by the model's `name`, newest `release_date` first, `deprecated` ones left out, `group: 'OpenCode'`, `description` the provider); region routes of one model (`global.`/`us.`/`eu.`/`apac.`/`au.`/`jp.`/`ca.`/`in.`/`us-gov.` id prefixes) collapse to one row, the `global.` route when listed, else the unrouted id, named like the unrouted id; same-named models of one provider collapse to the first; a name shared by several providers reads `<name> · <providerID>`; an empty listing is an empty list; a failed or timed-out CLI call (30 s) rejects, so core keeps the last saved list (`withSavedModels`).
- `opencode.connect.plan(ctx)` (`index.ts`): argv `opencode [--session <id>]`; with `ctx.mcpUrl`, env `OPENCODE_CONFIG_CONTENT` = `{mcp:{conciv:{type:'remote', url, headers:{[CONCIV_SESSION_HEADER]: id}, oauth:false, enabled:true}}}` (`opencodeMcpEnv`).
- `storagePath()` -> `$XDG_DATA_HOME/opencode/opencode.db` (default `~/.local/share`, the same rule opencode follows), `buildMessages(messageRows, partRows)`, `opencodeHistory` `{messages, observe, list, meta}` (`history.ts`). `list({cwd}, page)` reads the `session` rows of that directory, `list({everywhere: true}, page)` every unarchived row; each meta carries the row's `directory` as its `cwd`.

## Invariants

- Session reads require `sameCwd(session.directory, cwd)`; otherwise messages returns `[]` and observe returns `'missing'` (`history.ts`).
- `observe` returns `'missing'` when the DB file is absent; every `read()` returns the full message set with `replaced: true`; revision is `${max(message.time_updated)}:${count(part)}`.
- Tool parts become tool results only with status `'completed'` or `'error'` (`toolParts`).
- `listSessions` filters `directory = realpathOrSelf(cwd)` and `time_archived is null` one page at a time, newest first by `(time_updated, id)` after the page cursor, `limit + 1` rows to know whether a next page exists (`pageAfter`); `meta` reads one session row for this cwd; `totalTokens` = `tokens_input + tokens_output`.

## Side Effects

- Opens `opencode.db` read-only with `node:sqlite` `DatabaseSync`; `observeTranscript` keeps it open until `close()` (`history.ts`).
- Sets `OPENCODE_CONFIG_CONTENT` in the TTY connect plan env (`opencodeMcpEnv`).
- `opencodeModels` (`models.ts`) runs `opencode models --verbose` from PATH.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
