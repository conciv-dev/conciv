# harness/src/opencode

## Overview

OpenCode harness, published as `./opencode`. It chats through `opencode` from `@conciv/ai/server`, passes the MCP config to the TTY in `OPENCODE_CONFIG_CONTENT`, and reads session history and live transcripts from OpenCode's SQLite database.

## Interface

- `opencode(provider)` (`index.ts`): reads `XDG_DATA_HOME` as Effect Config under the provider; id/binName `'opencode'`, displayName `'OpenCode'`; capabilities resume true, `permissionGate: 'callback'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'http'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; `resume.command({nativeId})` is `opencode --session <nativeId>`; default model `'opencode/claude-sonnet-4-5'`; models from `opencodeModels` (`models.ts`): the live list from `opencode models --verbose`, which is OpenCode's own list of usable models (providers with a stored credential, a provider key in the environment, ambient credentials such as an AWS profile for Bedrock, configured providers, and the free OpenCode models that need none; with no credentials at all only the free ones) (ids `<providerID>/<id>`, named by the model's `name`, newest `release_date` first, `deprecated` ones left out, `group: 'OpenCode'`, `description` the provider); region routes of one model (`global.`/`us.`/`eu.`/`apac.`/`au.`/`jp.`/`ca.`/`in.`/`us-gov.` id prefixes) collapse to one row, the `global.` route when listed, else the unrouted id, named like the unrouted id; same-named models of one provider collapse to the first; a name shared by several providers reads `<name> · <providerID>`; an empty listing is an empty list; a failed or timed-out CLI call (30 s), or one that prints more than 64 MiB, rejects, so core keeps the last saved list (`withSavedModels`); the CLI runs detached as the leader of its own process group, and whenever the listing ends (the listing's `signal` aborts, the timeout, a failure or success) the group gets SIGTERM, then `killLeftovers` from `@conciv/ai/server` waits up to `GROUP_EXIT_TIMEOUT_MS` (5 s) for it, sends the group SIGKILL and waits again; the listing settles only once the CLI has exited, so an engine that stops leaves no `opencode models` behind, a CLI that ignores SIGTERM included. If the engine process itself dies without its close, the detached group is not signalled and lives until it exits or writes to its closed output pipe.
- `storagePath(dataHome)` -> `$XDG_DATA_HOME/opencode/opencode.db` (default `~/.local/share` when unset or empty, the same rule opencode follows), `buildMessages(messageRows, partRows)`, `opencodeHistory(dbPath)` `{messages, tail, observe, list, meta}` (`history.ts`). `list({cwd}, page)` reads the `session` rows of that directory, `list({everywhere: true}, page)` every unarchived row; each meta carries the row's `directory` as its `cwd`.

## Invariants

- Session reads require `sameCwd(session.directory, cwd)`; otherwise messages returns `[]` and observe returns `'missing'` (`history.ts`).
- `tail` selects `limit + 1` message rows newest first by `(time_created, id)` below the cursor `<time_created>:<id>`, and only those messages' parts (`json_each` of their ids); `earlier` is the oldest kept row's cursor when the extra row exists.
- `observe` returns `'missing'` when the DB file is absent; every `read()` returns the full message set with `replaced: true`; revision is `${max(message.time_updated)}:${count(part)}`.
- Tool parts become tool results only with status `'completed'` or `'error'` (`toolParts`).
- `listSessions` filters `directory = realpathOrSelf(cwd)` and `time_archived is null` one page at a time, newest first by `(time_updated, id)` after the page cursor, `limit + 1` rows to know whether a next page exists (`pageAfter`); `meta` reads one session row for this cwd; `totalTokens` = `tokens_input + tokens_output`.

## Side Effects

- Opens `opencode.db` read-only with `node:sqlite` `DatabaseSync`; `observeTranscript` keeps it open until `close()` (`history.ts`).
- `opencodeModels` (`models.ts`) runs `opencode models --verbose` from PATH.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
