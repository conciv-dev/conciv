# harness/src/pi

## Overview

Pi harness, published as `./pi`. Chat is unsupported (`unsupportedChatConfig`). The adapter can launch `pi` in a TTY and reads pi's per-cwd JSONL session transcripts, following the `parentId` chain along the active branch.

## Interface

- `pi` (`index.ts`): id/binName `'pi'`, displayName `'Pi'`; capabilities resume false, `permissionGate: 'none'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'none'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; `chatConfig: unsupportedChatConfig('pi', 'pi')`; no models.
- `pi.connect.plan(ctx)` (`index.ts`): argv `pi [--session <sessionsDir(cwd)>/<id>.jsonl] [--model <model>]` (`piSessionArgs`).
- `encodeSessionDir(cwd)`, `sessionsDir(cwd, home)` -> `~/.pi/agent/sessions/<encoded>`, `activePath(entries)`, `sessionIdFromFile(fileName)`, `piHistory` `{messages, observe, transcriptPath, transcriptRoot, list}` (`history.ts`).

## Invariants

- Transcript reads go through `containedPath(sessionsDir, ...)`; a path outside it yields `[]` messages and `'missing'` from observe (`history.ts`).
- Only entries on the active `parentId` chain become messages, with cycle protection (`activePath`); a `toolResult` attaches to the last assistant message or opens one (`messagesOf`).
- `listSessions` keeps `.jsonl` names whose id token passes `HarnessSessionId.safeParse`, returns the 50 newest by mtime, and titles from the last `session_info.name` or the first user text.
- File naming: `transcriptPath` looks for `*_<id>.jsonl` and falls back to `<id>.jsonl`; `observeTranscript` matches only `*_<id>.jsonl`. The connect plan passes `<id>.jsonl` (`index.ts`).

## Side Effects

- Reads `~/.pi/agent/sessions/<encoded cwd>/` and its JSONL files (`readdir`, `readdirSync`, `readFile`, `stat` in `history.ts`).
- `chatConfig` yields a `RUN_ERROR` "pi is not installed or not yet supported" (`../_shared/stub.ts`).

## Verification

- Run: `cd packages/harness && pnpm test`
