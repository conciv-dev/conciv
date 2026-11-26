# HarnessHistory: the transcript-parsing deep dive

This is the densest part of a real adapter. `codex` (`packages/harness/src/codex/history.ts`) is the
clearest full example: it parses a JSONL rollout file into `UIMessage[]` and lists past sessions from a local SQLite state db. Read it alongside this file.

## The shape you're filling in

```ts
export type HarnessHistory = {
  messages(cwd: string, sessionId: string): Promise<UIMessage[]>
  transcriptPath?(cwd: string, sessionId: string): Promise<string>
  withinProject?(cwd: string, sessionId: string): Promise<boolean>
  nameFromTranscript?(raw: string): string | null
  contextTokens?(line: string): number | undefined
  list(cwd: string): Promise<HarnessSessionMeta[]>
  meta?(cwd: string, sessionId: string): Promise<HarnessSessionMeta | null>
}
```

No method takes a home directory. Each implementation resolves its CLI's data directory from that
CLI's own environment variable, falling back to `homedir()` the way the CLI itself does (Codex:
`CODEX_HOME` through `codexHome()` in `packages/harness/src/codex/models.ts`; Claude:
`CLAUDE_CONFIG_DIR`; Pi: `PI_CODING_AGENT_DIR`; OpenCode: `XDG_DATA_HOME`). Tests isolate a harness
by setting that variable for the test process.

## `messages()`: parse the whole transcript once

Codex's transcript is JSON-Lines, one `{type, payload}` envelope per line
(`EnvelopeSchema`, `packages/harness/src/codex/history.ts:98`). Each envelope's `payload` is validated
with a `zod` `.loose()` schema per event kind: `user_message`, `agent_message`, `function_call`,
`custom_tool_call`, `function_call_output`/`custom_tool_call_output`, `token_count`
(`packages/harness/src/codex/history.ts:110-139`). `.loose()` (not `.strict()`) is deliberate: the CLI
may add fields the adapter doesn't care about, and a strict schema would break on every upstream CLI
release.

The fold: `spineEvent(payload)` classifies one parsed line into a `SpineEvent`
(`packages/harness/src/codex/history.ts:177-226`), then `applyEvent` mutates a running `CodexSpine`
(`{messages: UIMessage[], opened: number}`): opening a new `UIMessage` on `user`/first-`assistant`
events, appending to the last assistant message on subsequent `assistant`/`call` events
(`appendAssistant`, `packages/harness/src/codex/history.ts:234-238`), and attaching `tool-result` parts
to whichever earlier message owns the matching `tool-call` id (`attachOutput`,
`packages/harness/src/codex/history.ts:240-244`, matched via `hasCall`,
`packages/harness/src/codex/history.ts:167-169`). `messages()` itself
(`transcriptMessages`, `packages/harness/src/codex/history.ts:331-343`) is just: resolve the file for
this `(cwd, sessionId)`, then stream it line by line through `foldJsonlFile` with `foldRolloutLine`, never
reading the whole file into memory.

## Project scoping

`messages()` reads the rollout's own recorded cwd (`session_meta`) and returns `[]` unless it matches
the requested `cwd` via `sameCwd` (`packages/harness/src/_shared/cwd.ts`). This is the mechanism that
stops a stale/foreign session's transcript from being adopted into the wrong project's chat pane.

## `list()`: enumerate past sessions

`listSessions` (`packages/harness/src/codex/history.ts:345-358`) queries a SQLite `threads` table
scoped by `cwd`, then `stat`s each row's rollout file for its `sizeBytes`; it never parses a
transcript to build a meta. If your CLI has no session-index database, an alternative is scanning its
transcript directory (`packages/harness/src/codex/history.ts:286-294`,
`rolloutEntries`/`scanForRollout`: used as the `list()`-independent fallback path when a specific
session isn't in the db). Every `HarnessSessionMeta` needs at least `{id, derivedTitle, updatedAt}`
(`packages/types/src/harness-types.ts`); `sizeBytes` (the transcript file's size, shown in the session
picker) and the rest (`model`, `totalTokens`, `lastMessage`, `createdAt`) are best-effort. Build a meta from
cheap reads only (a `stat`, the head up to the first prompt), never a whole-transcript parse.
