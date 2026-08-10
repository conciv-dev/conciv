# HarnessHistory: the transcript-parsing deep dive

This is the densest part of a real adapter. `codex` (`packages/harness/src/codex/history.ts`) is the
clearest full example — it parses a JSONL rollout file into `UIMessage[]`, drives live-tail
`observe()`, and lists past sessions from a local SQLite state db. Read it alongside this file.

## The shape you're filling in

```ts
export type HarnessHistory = {
  messages(cwd: string, sessionId: string, home?: string): Promise<UIMessage[]>
  observe(cwd: string, sessionId: string, home?: string): TranscriptHandle
  transcriptPath?(cwd: string, sessionId: string, home?: string): string
  withinProject?(cwd: string, sessionId: string, home?: string): boolean
  nameFromTranscript?(raw: string): string | null
  contextTokens?(raw: string): number | undefined
  list(cwd: string, home?: string): Promise<HarnessSessionMeta[]>
  meta?(cwd: string, sessionId: string, home?: string): Promise<HarnessSessionMeta | null>
  summary?(cwd: string, sessionId: string, home?: string): Promise<HarnessSessionSummary | null>
}
```

`home` defaults to `homedir()` in every implementation — it's only overridden in tests, so accept it
as an optional parameter with that default rather than requiring callers to pass it
(`packages/harness/src/codex/history.ts:16`, `packages/harness/src/codex/history.ts:20`,
`packages/harness/src/codex/history.ts:293`, `packages/harness/src/codex/history.ts:316`,
`packages/harness/src/codex/history.ts:320`, `packages/harness/src/codex/history.ts:325`,
`packages/harness/src/codex/history.ts:344`).

## `messages()`: parse the whole transcript once

Codex's transcript is JSON-Lines, one `{type, payload}` envelope per line
(`EnvelopeSchema`, `packages/harness/src/codex/history.ts:82`). Each envelope's `payload` is validated
with a `zod` `.loose()` schema per event kind — `user_message`, `agent_message`, `function_call`,
`custom_tool_call`, `function_call_output`/`custom_tool_call_output`, `token_count`
(`packages/harness/src/codex/history.ts:93-123`). `.loose()` (not `.strict()`) is deliberate: the CLI
may add fields the adapter doesn't care about, and a strict schema would break on every upstream CLI
release.

The fold: `spineEvent(payload)` classifies one parsed line into a `SpineEvent`
(`packages/harness/src/codex/history.ts:156-209`), then `applyEvent` mutates a running `CodexSpine`
(`{messages: UIMessage[], opened: number}`) — opening a new `UIMessage` on `user`/first-`assistant`
events, appending to the last assistant message on subsequent `assistant`/`call` events
(`appendAssistant`, `packages/harness/src/codex/history.ts:218-222`), and attaching `tool-result` parts
to whichever earlier message owns the matching `tool-call` id (`attachOutput`,
`packages/harness/src/codex/history.ts:224-228`, matched via `hasCall`,
`packages/harness/src/codex/history.ts:152-154`). `messages()` itself
(`transcriptMessages`, `packages/harness/src/codex/history.ts:320-323`) is just: resolve the file for
this `(cwd, sessionId, home)`, read it, `raw.split('\n').reduce(foldLine, emptySpine()).messages`.

## `observe()`: live-tail with `makeJsonlHandle`

`packages/harness/src/_shared/jsonl-handle.ts:76-140` is the shared incremental-read engine both
`claude` and `codex` build `observe()` on. You give it a `JsonlSource<State>`:

```ts
export type JsonlParser<State> = {
  empty(): State
  foldLine(state: State, line: string): State
  messages(state: State): UIMessage[]
}
export type JsonlSource<State> = {
  parser: JsonlParser<State>
  resolvePath(): Promise<string | TranscriptFailure>
  verifyHead?(head: string): TranscriptFailure | null
}
```

and it returns a `TranscriptHandle` (`revision()/read()/close()`) that:

- tracks a byte `offset` and re-reads only the new tail on each `read()` call, not the whole file
  (`readBytes(found.path, state.offset, ...)`, `packages/harness/src/_shared/jsonl-handle.ts:125`);
- only counts **complete** lines (splits on the last `\n` in the buffer,
  `completeLines`, `packages/harness/src/_shared/jsonl-handle.ts:65-70`) so a partial write mid-flush
  never corrupts the fold;
- resets to offset 0 and re-empties state if the file shrank (`found.info.size < state.offset`,
  `packages/harness/src/_shared/jsonl-handle.ts:120-123`) — handles log rotation/truncation;
- calls your optional `verifyHead(head)` exactly once, on the first successful stat, against the head
  bytes of the file (`HEAD_BYTES = 65_536`) — this is where you reject a transcript that belongs to a
  different project.

Codex's `observeTranscript` (`packages/harness/src/codex/history.ts:344-358`) wires the same
`{empty, foldLine, messages}` triple used by `parseHistory` into `makeJsonlHandle`, and its
`verifyHead` calls `rolloutCwd(head)` to confirm the transcript's own recorded cwd matches the
requested `cwd` via `sameCwd` (`packages/harness/src/_shared/cwd.ts:1`, re-exported from
`@conciv/harness-init/paths`) — returning a `transcriptFailure('missing', ...)` when it doesn't. This
is the mechanism that stops a stale/foreign session's transcript from being adopted into the wrong
project's chat pane.

## `TranscriptFailure`: three reasons, not a thrown error

```ts
export const TRANSCRIPT_FAILURES = ['missing', 'unreadable', 'corrupt'] as const
export type TranscriptFailure = {ok: false; reason: TranscriptFailureReason; detail: string}
```

(`packages/protocol/src/harness-types.ts:155-161`.) Only `TranscriptHandle`'s own methods
(`revision()`/`read()`) return this discriminated union by signature — `HarnessHistory`'s methods
(`messages()`, `list()`, and the optional refinements) don't. The `resolvePath()`/`verifyHead()` hooks
you hand to `makeJsonlHandle` also return it (`JsonlSource`, `packages/harness/src/_shared/jsonl-handle.ts:21-25`)
— build one with `transcriptFailure(reason, detail)` (`packages/harness/src/_shared/jsonl-handle.ts:27-29`).
Use `'missing'` when the file/session doesn't exist yet or belongs to a different project, `'unreadable'`
for I/O errors, `'corrupt'` when the file exists but its content fails a structural check (e.g. no
`session_meta` envelope in the head).

## `list()`: enumerate past sessions

`listSessions` (`packages/harness/src/codex/history.ts:325-342`) queries a SQLite `threads` table
scoped by `cwd`, then re-reads each row's own rollout file to compute a fresh `messageCount` via the
same `parseHistory`. If your CLI has no session-index database, an alternative is scanning its
transcript directory (`packages/harness/src/codex/history.ts:279-297`,
`rolloutEntries`/`scanForRollout` — used as the `list()`-independent fallback path when a specific
session isn't in the db). Every `HarnessSessionMeta` needs at least `{id, derivedTitle, updatedAt,
messageCount}` (`packages/protocol/src/harness-types.ts:142-151`); the rest (`model`, `totalTokens`,
`lastMessage`, `createdAt`) are best-effort.
