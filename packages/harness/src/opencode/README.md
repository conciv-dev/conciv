# harness/src/opencode

## Overview

OpenCode harness, published as `./opencode` (`opencode.ts`). It chats through `opencode` from `../adapters` (default model `opencode/claude-sonnet-4-5`), lists models with the CLI, and reads session history from OpenCode's SQLite database at `$XDG_DATA_HOME/opencode/opencode.db` (default `~/.local/share` when unset or empty, the same rule opencode follows).

## Invariants

- The model list is OpenCode's own list of usable models from `opencode models --verbose` (`models.ts`): ids `<providerID>/<id>`, newest `release_date` first, deprecated ones left out; the region routes of one model collapse to one row (the `global.` route when listed, else the unrouted id). A failed or timed-out call (30 s), or one that prints more than 64 MiB, rejects, so the engine keeps the last saved list (`withSavedModels`).
- The listing CLI runs detached as the leader of its own process group; whenever the listing ends (abort, timeout, failure or success) the group gets SIGTERM, then `killLeftovers` (`../local-sandbox.ts`) waits for it and sends SIGKILL, and the listing settles only once the CLI has exited, so an engine that stops leaves no `opencode models` behind. If the engine process dies without its close, the detached group is not signalled.
- Session reads require `sameCwd(session.directory, cwd)`; otherwise messages returns `[]` (`history.ts`).
- `tail` selects `limit + 1` message rows newest first by `(time_created, id)` below the cursor `<time_created>:<id>`, and only those messages' parts (`json_each` of their ids); `earlier` is the oldest kept row's cursor when the extra row exists.
- Tool parts become tool results only with status `'completed'` or `'error'` (`toolParts`).
- `listSessions` filters `directory = realpathOrSelf(cwd)` and `time_archived is null` one page at a time, newest first by `(time_updated, id)` after the page cursor, `limit + 1` rows to know whether a next page exists (`pageAfter`); `meta` reads one session row for this cwd; `totalTokens` = `tokens_input + tokens_output`.

## Side Effects

- Opens `opencode.db` read-only with `node:sqlite` `DatabaseSync` for each read and closes it after (`history.ts`).
- `opencodeModels` (`models.ts`) runs `opencode models --verbose` from PATH.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
