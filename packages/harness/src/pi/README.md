# harness/src/pi

## Overview

Pi harness, published as `./pi` (`pi.ts`). Chat is unsupported (`unsupportedChatConfig`), and it has no models. The adapter can launch `pi` in a TTY and reads pi's per-cwd JSONL session transcripts under `$PI_CODING_AGENT_DIR/sessions` (default `~/.pi/agent` when unset or empty, the same rule pi follows), following the `parentId` chain along the active branch.

## Invariants

- A session's `cwd` comes from the session header (`{type: 'session', cwd}`), never from the lossy folder name; a session with no header cwd is left out of an `everywhere` listing (`history.ts`).
- `messages` streams the transcript through `foldJsonlFile`.
- Transcript reads go through `containedPath(sessionsDir, ...)`; a path outside it yields `[]` messages (`history.ts`).
- Only entries on the active `parentId` chain become messages, with cycle protection (`activePath`); a `toolResult` attaches to the last assistant message or opens one (`collectMessages`).
- `tail` follows the same chain backwards through `tailLines`, from the last `message` entry (or the parent id in the cursor), keeping only chain entries; a safe boundary is a spoken user entry with no later tool result before the next assistant entry, and the cursor is `<byte offset of the boundary line>:<its parentId>`; an entry without a parent ends the chain (`earlier: null`).
- `listSessions` keeps `.jsonl` names whose id token passes `HarnessSessionId.safeParse`, returns one page newest first by `(mtime, id)` after the page cursor, and builds each meta without parsing the transcript: the head is streamed only up to the first user message (title, `createdAt` from the session header), the last 64 KB are scanned for the last `session_info.name`, which wins as the title, and `sizeBytes` and `updatedAt` come from `stat`.
- File naming: `transcriptPath` looks for `*_<id>.jsonl` and falls back to `<id>.jsonl`; `observeTranscript` matches only `*_<id>.jsonl`.

## Side Effects

- Reads `$PI_CODING_AGENT_DIR/sessions/<encoded cwd>/` and its JSONL files (`readdir`, `stat`, `open` and `createReadStream` in `history.ts`, none blocking).
- `chatConfig` yields a `RUN_ERROR` "pi is not installed or not yet supported" (`pi.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
