# Transcript tail reads

Status: draft for Omri's approval. Follows the preview abort + debounce PR (fixes A + B).

## Problem

`HarnessHistory.messages(cwd, id)` folds a whole transcript every time. Real Claude transcripts reach 100-500 MB: one fold of a 124 MB file takes 3.2 s and 336 MB RSS. The session picker preview wants the last ~20 messages, and every "load earlier" page re-folds the whole file again. `sessionSummary` (claude) is worse: it `readFile`s the whole transcript into one string.

## Goal

A preview or a page costs in proportion to the messages it returns, not the file size. Stream from the end of the file, stop as soon as the window is full, and page backwards by byte offset.

## Why a backward read is safe

The folds are local, not global:

- **Claude**: the only cross-line state is `openAssistantId` (assistant parts with the same `message.id` merge) and tool results attaching to the last assistant. Both reset at a human user turn. So any line holding a human user turn is a safe boundary: folding forward from it gives exactly the messages a full fold gives from that point on.
- **Codex**: `attachOutput` finds the owning call by `callId` searching back, and `appendAssistant` merges into the last message. Both are bounded by the user message that opens a turn, so a user-message line is a safe boundary.
- **Pi**: the transcript is a tree (`parentId`), and `activePath` walks from the last message entry back through parents. The backward read follows the same chain: collect entries going backwards and stop once the chain from the leaf holds `limit` messages. Parents always sit earlier in the file than their children.
- **OpenCode**: SQLite. A tail is `order by time_created desc, id desc limit ?`, with the cursor being `(time_created, id)`. No file reading.

Facts that need the whole file (title, total tokens, createdAt) are not part of a tail. The preview doesn't use them, and the session list already gets them from the list/meta path.

## API (needs approval: new `HarnessHistory` method)

```ts
type TranscriptCursor = string
type TranscriptPage = {messages: ChatMessage[]; earlier: TranscriptCursor | null}

tail(
  cwd: string,
  sessionId: HarnessSessionId,
  options: {limit: number; before: TranscriptCursor | null; signal?: AbortSignal},
): Promise<TranscriptPage>
```

- `before: null` means start at the end. `earlier` is the cursor for the next older page, or null at the start of the transcript.
- The cursor is opaque to callers. File harnesses use the byte offset of the boundary line; OpenCode uses `time_created:id`. Contract: a zod string. Core never parses it.
- A page may return a few more than `limit` messages, because it always starts on a safe boundary. It never cuts a turn in half.
- It is required wherever `transcriptHistory: true`, enforced in `_shared/contract.ts` like `history` itself.

## Shared primitive

`packages/harness/src/_shared/read-lines-backward.ts`: an async generator yielding `{line, offset}` from a byte position towards the start of the file.

- It reads 256 KiB chunks with `fs.promises` `FileHandle.read` at descending positions, carries the partial first line into the next chunk, and decodes UTF-8 only at line boundaries, since a chunk edge can split a multibyte character.
- It honours `signal` between chunks.
- No dependency: a backward line reader is about 30 lines over `FileHandle`. I checked for a maintained library and found nothing that handles signal plus offsets. If you'd rather use a package, name it.

Each file harness builds its `tail` from it: collect lines backwards until a safe boundary whose forward fold reaches `limit` messages, then fold forward from that boundary with the harness's existing `foldLine`. That reuses the same fold code, so the two paths can't drift.

## Stable message ids

Tail and full reads must give the same ids, or paging and anchors break.

- **Claude** ids come from `record.uuid`. The positional fallback `h${count}` becomes `o${byteOffset}`, which both readers know.
- **Codex** ids are positional today (`${sessionId}:h${opened}`), and a tail can't know `opened`. They become `${sessionId}:o${byteOffset}` of the line that opened the message, in both readers.
  - Breaking change: the chat importer anchors by the last native id (`packages/chat/src/transcript.ts` `advance`), so an anchor stored under the old scheme won't match. We are on v0, so no shim: an unmatched anchor makes the importer start a fresh import for that session.
  - **Question for you:** is a one-time re-import of Codex sessions OK?
- **Pi** ids are entry ids already. **OpenCode** ids are row ids already.

## Callers

| Caller                                         | Today                                   | After                                                                                   |
| ---------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `sessions.preview` (core rpc)                  | `messages()` + `previewWindow` slice    | `tail({limit, before, signal})`; `before`/`earlier` carry the cursor                    |
| preview "load earlier"                         | full re-fold per page                   | `tail` from the cursor                                                                  |
| claude `sessionSummary`                        | `readFile` the whole file into a string | `tail` for the messages; title from a forward stream that stops at the first human turn |
| session search index (`session-search.ts:170`) | `messages()`                            | unchanged: indexing needs every message once, and it streams (B gives it a signal)      |
| chat importer (`chat/src/transcript.ts`)       | `messages()` on every sync              | phase 2, below                                                                          |

## Phase 2 (separate PR, your call)

Opening a huge native session in the chat runs the importer, which folds the whole transcript on each sync. The same primitive can read forward from the anchor's byte offset (`since(cursor)`), so a sync costs only the new lines. It's the same idea, but it touches the chat plane, so it gets its own PR and its own yes.

## Tests (one journey per package, no mocks)

- **harness**: generate a large real JSONL fixture in a temp dir. For each file harness, `tail` pages back to the start, and the concatenated pages equal `messages()` exactly (same ids, parts and order). Also an abort mid-tail rejects with AbortError. Fail-first: on today's code `tail` doesn't exist, so the test is written first.
- **core**: the existing preview journey keeps passing, with paging through the cursor.
- **Perf evidence (not a test)**: the preview of the 124 MB transcript drops from about 3.2 s to tens of ms. Measured in the dev server and reported in the PR.

## Out of scope

- A worker thread (option E): tail reads are small, so it isn't needed unless a measurement says otherwise.
- Grep or a byte index for search: the search index already exists. Revisit only if indexing time is a problem.
