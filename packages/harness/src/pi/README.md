# harness/src/pi

## Overview

Pi harness, published as `./pi`. Chat is unsupported (`unsupportedChatConfig`). The adapter can launch `pi` in a TTY and reads pi's per-cwd JSONL session transcripts, following the `parentId` chain along the active branch.

## Interface

- `pi` (`index.ts`): id/binName `'pi'`, displayName `'Pi'`; capabilities resume false, `permissionGate: 'none'`, transcriptHistory true, compaction false, `systemPrompt: 'flag'`, `mcp: 'none'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`; `chatConfig: unsupportedChatConfig('pi', 'pi')`; no models.
- `pi.connect.plan(ctx)` (`index.ts`): argv `pi [--session <sessionsDir(cwd)>/<id>.jsonl] [--model <model>]` (`piSessionArgs`).
- `encodeSessionDir(cwd)`, `sessionsDir(cwd)` -> `$PI_CODING_AGENT_DIR/sessions/<encoded>` (default `~/.pi/agent`, the same rule pi follows), `activePath(entries)`, `sessionIdFromFile(fileName)`, `piHistory` `{messages, observe, transcriptPath, transcriptRoot, list}` (`history.ts`).

## Invariants

- Transcript reads go through `containedPath(sessionsDir, ...)`; a path outside it yields `[]` messages and `'missing'` from observe (`history.ts`).
- Only entries on the active `parentId` chain become messages, with cycle protection (`activePath`); a `toolResult` attaches to the last assistant message or opens one (`messagesOf`).
- `listSessions` keeps `.jsonl` names whose id token passes `HarnessSessionId.safeParse`, returns the 50 newest by mtime, and builds each meta without parsing the transcript: the head is streamed only up to the first user message (title, `createdAt` from the session header), the last 64 KB are scanned for the last `session_info.name`, which wins as the title, and `sizeBytes` and `updatedAt` come from `stat`.
- File naming: `transcriptPath` looks for `*_<id>.jsonl` and falls back to `<id>.jsonl`; `observeTranscript` matches only `*_<id>.jsonl`. The connect plan passes `<id>.jsonl` (`index.ts`).

## Side Effects

- Reads `$PI_CODING_AGENT_DIR/sessions/<encoded cwd>/` and its JSONL files (`readdir`, `readdirSync`, `readFile`, `stat` in `history.ts`).
- `chatConfig` yields a `RUN_ERROR` "pi is not installed or not yet supported" (`../_shared/stub.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
