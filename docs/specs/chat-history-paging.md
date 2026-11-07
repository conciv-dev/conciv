# Chat history paging

## Problem

Opening a chat loads its whole transcript. The library asks for a page, but three layers drop the request:

- `packages/client/src/chat-connection.ts:246-250`: our connection's `hydrate` ignores the `{limit, before}` argument.
- `packages/contract/src/contract.ts:183`: the hydrate input carries only the session id.
- `packages/ai/src/server/chat-server.ts:533-543`: the server loads the thread without `limit` or `before`.

A long chat sends every message over the wire and builds every row before the user sees anything.

## Library support (already in our pinned versions)

- `@tanstack/ai-client` 1.0.1: `history: {pageSize}` together with `persistence: true` hydrates the newest page, and `loadOlderMessages()` prepends the page before it (`chat-client.js:1913-1975`). It passes `{limit, before}` to the connection's `hydrate` (`chat-client.js:644-654, 1922-1926`). With a page size set, `messagesForSend` trims what is sent.
- `@tanstack/ai-persistence` 1.0.1: `loadThread` takes `limit` and `before` and can return a `MessagePage` (`reconstruct.d.ts:15-32, 87-90`). `withPersistence` merges incoming messages by id, so a short client list keeps the stored ones.
- TanStack AI PR #1400 is the reference.

## Decisions

1. **Library way.** Use `history: {pageSize}` and `loadOlderMessages()`. Do not write our own pager, cursor or message cache.
2. **Page size: 50 messages.** One constant, beside the other chat constants.
3. **Our `lastTurn` send trimming** (`chat-connection.ts:215, 252-258`) does the job of the library's `messagesForSend`. Delete it if the library covers it once the page size is set. Keep it only with source evidence that it does more.
4. **Message position is not identity.** Everything keyed by index must be keyed by message id before paging lands, because prepending a page shifts every index:
   - `harnessAt(index)` (`packages/ai/src/session/session.ts:138-141, 255`). The server already sends `messageHarness` keyed by id (`packages/chat/src/index.ts:131`).
   - the dividers from `dividersAt(messages().length)` and the marker `afterTurn` (`apps/conciv/src/pane/chat-pane.tsx:297-307`)
   - `stoppedBefore(index)`
   - anything else index-keyed that you find; list it in the report.
5. **Loading older pages in the UI.**
   - When the user scrolls near the top of the thread and the library reports more history, call `loadOlderMessages()`.
   - While it loads, show a loading row at the top. Reuse an existing row or skeleton from the kit; do not design a new one.
   - Prepending must not move what the user is looking at. Keep the visible anchor message at the same screen position through the thread virtualizer (`ui-kit-chat/src/behaviors/create-thread-virtualizer.ts`).
   - Once the first message is loaded, stop asking.
6. **The server reads only one page.** `chat-server.ts` passes `limit` and `before` to `loadThread`. The contract input gets optional `limit` and `before` fields, validated by zod with the repo's pattern.
   - The hydration's pending approvals, `messageHarness` and run state stay complete on every page; they are not paged.
   - `messageHarness` may be limited to the ids of the returned page.
7. **Search and jump-to-message are out of scope.**

## Acceptance

- [ ] Opening a chat with 200 messages sends 50 over the wire. The hydrate request and response show the limit.
- [ ] Scrolling to the top loads the previous 50 without a visible jump. The message under the viewport top stays put.
- [ ] Repeating this reaches the first message, and then loading stops.
- [ ] Harness labels, dividers and stopped markers sit on the same messages before and after older pages are prepended.
- [ ] Sending a message in a paged chat works, and the server keeps the full stored history (no loss from the short client list).
- [ ] A refresh or a re-join of a running turn in a paged chat keeps the loaded pages and shows the new turn.
- [ ] Short chats (under one page) look and behave exactly as today.
