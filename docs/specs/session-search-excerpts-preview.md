# Session search: excerpts, session preview, all projects

Status: approved (2026-11-08). Follows #746 (server search over Orama) and #757 (header title).

## Problem

The picker's search (`sessions.search`) returns only a matching session's title, time and size. Three gaps remain:

1. **Why it matched.** A hit found by its body text gives no clue where the match is.
2. **What the session is.** Picking a session to see what it holds means opening it, which replaces the open chat.
3. **Other projects.** Search covers only the current cwd. A session about the same topic in another repo can't be found.

## Goal

- Each search hit shows a short markdown excerpt around the match, with the matched words highlighted.
- Moving the picker's highlight onto a row, by pointer or keyboard, opens a preview of the whole session beside the picker.
- Search can be widened to every project the harnesses know about.

The work ships as three PRs in that order. All three are approved; the decisions are at the end.

## Map: packages, folders, components

| Piece | Package | Folder / file | What changes |
| --- | --- | --- | --- |
| 1 | `@conciv/core` | `packages/core/src/sessions/search-index-worker.ts`, `session-search.ts`, `session-rows.ts` | The worker cuts the excerpt and finds the matched words. Hits carry both through the search pipeline. |
| 1 | `@conciv/contract` | `packages/contract/src/contract.ts` | The `sessions.search` output rows gain `excerpt` and `matched`. |
| 1 | `@conciv/solid-streamdown` | `packages/solid-streamdown/src/streamdown.tsx` | New `highlight` prop: a rehype step that wraps matches in `<mark>`. |
| 1 | `@conciv/ui-kit-chat` | `packages/ui-kit-chat/src/styled/markdown.tsx` | `Markdown` gains `highlight` and a `compact` variant for excerpts. |
| 1 | `@conciv/uno-preset` / `ui-kit-chat` tokens | `packages/ui-kit-chat/src/theme/tokens.css`, `packages/uno-preset/src/motion.ts` | `--chat-mark` derived from `--chat-accent`, plus an `anim-mark` shortcut. |
| 1 | `@conciv/app` | `apps/conciv/src/composer/session-selector.tsx` | Search rows render the excerpt. |
| 2 | `@conciv/contract`, `@conciv/core` | `contract.ts`, `packages/core/src/api/rpc/` (sessions router), `packages/core/src/sessions/` | `sessions.preview` reads a transcript window, read-only. |
| 2 | `@conciv/app` | new `apps/conciv/src/composer/session-preview.tsx`; `session-selector.tsx` | The preview surface and its wiring to the picker. |
| 2 | `@conciv/ui-kit-chat` | reused only: `Thread` (`styled/thread.tsx`), `ChatProvider`, `useThreadViewport` | The preview is the real chat thread, read-only. |
| 3 | `@conciv/protocol`, `@conciv/harness` | `harness-types.ts`, `packages/harness/src/{claude,codex,opencode,pi}/history.ts` | `list(scope)`, and `cwd` on each meta. |
| 3 | `@conciv/core`, `@conciv/contract`, `@conciv/app` | index worker, `sessions.search` input, picker | A `cwd` index field, an `everywhere` search flag, and the "All projects" `Switch`. |

Kit components used, all existing: Ark `Combobox` (the picker), `VirtualList` (ui-kit-system), `Streamdown` / `Markdown`, `Thread` + `ChatProvider` (ui-kit-chat), the `Switch` and `ClipboardCopyButton` (ui-kit-system, piece 3), and the ui-kit-chat `ConversationSkeleton` pattern for loading states. We build no new primitive. The ui-kit-system `HoverCard` is NOT used. It is a hover-and-focus link-preview pattern, and combobox items never take DOM focus (virtual focus through `aria-activedescendant`), so it can't follow the keyboard. Piece 2 positions its own surface instead (see below).

## 1. Excerpts with highlighted matches

### Worker (`search-index-worker.ts`)

The `search` procedure returns each hit with two extra fields:

- `excerpt: string | null`: null when only the title matched.
- `matched: string[]`: the distinct words in the excerpt that matched, as written in the text.

Matching follows Orama 3.1.18's own rule (radix `find` / `_findLevenshtein`), so the highlight never disagrees with the hit:

- The query and the body run through Orama's tokenizer (`@orama/orama/components`, `tokenizer.createTokenizer()`), with the same configuration the index uses: normalization, diacritics, and stemming or stop words if any.
- A body token matches a query token when it starts with the query token, or when `boundedLevenshtein(queryToken, token, tolerance).isBounded` holds (`@orama/orama/internals`).
- `tolerance` is the one the search already passes (`typoTolerance(term)`).

Cutting the excerpt:

- Take the first matching token's position in `body`.
- Walk back to the nearest line start; message text is joined by `\n` (`textOf`).
- Take about 300 characters forward, then extend to the next word boundary.
- This runs only on the returned page (30 hits at most), never on the whole index. It reads no internal tree.

No character offsets cross the wire. The widget marks the words again in the rendered text, so offsets would not survive markdown rendering anyway.

### Contract and core

- `sessions.search` gets its own output: a page whose rows are `SessionMeta & {excerpt: string | null; matched: string[]}`. `SessionMetaSchema` and `sessions.list` don't change.
- `session-search.ts` `hitsOf` carries both fields through `pages()`. `NativePage` gains an optional `found` map keyed by native id, so list paging stays untouched.

### Streamdown (`@conciv/solid-streamdown`)

- New prop `highlight?: readonly string[]`.
- A rehype step walks the HAST text nodes, skipping `code` and `pre`. It splits each one at case-insensitive, whole-word occurrences, and wraps each occurrence in a `mark` element. It builds HAST nodes only, never HTML strings. Words are regex-escaped, and one combined regex is built per `highlight` value (memoized), not per node.
- `remend` already heals markdown cut short at the excerpt edge.
- `Markdown` (ui-kit-chat) passes `highlight` through and gains `compact`. In compact mode it uses one type size, no heading scale, and code blocks rendered as inline code with no worker highlighting (`highlightCode` off). An excerpt never wakes the shiki worker.

### Picker (`session-selector.tsx`)

Row layout for a search hit:

1. The title. Its own words are marked too, using the same `highlight` regex through a plain text split.
2. The excerpt: `Markdown compact highlight={matched}`.
3. The `Edited <time> · <size>` line.

**Performance:**

- `VirtualList` keeps fixed row sizes (`sizeOf`), with no `measureElement`. A search row with an excerpt has one fixed height from tokens: the title line, 3 excerpt lines and the meta line. The excerpt box is clipped at exactly 3 lines, with a bottom fade mask (`mask-image`, gradient from the panel token) when the content runs over. A row without an excerpt (title-only hit) keeps today's height.
  - This avoids measuring rows and the layout shift it causes while scrolling, and keeps scrolling at a steady frame rate.
- Excerpts render only for the rows the virtualizer mounts (6 rows overscan, as today).
- The calm perf gate (`pnpm --filter @conciv/app test:perf`) stays green in Chromium and Firefox.

**Motion:**

- `<mark>` uses background `--chat-mark` (derived: `color-mix` of `--chat-accent` into the panel token, same formula as the existing derived tokens in `ui-kit-system/src/derived-tokens.ts`). The text colour is unchanged. Radius and padding are the hairline tokens.
- Marks fade in through `anim-mark`: background over `animate-duration-chat-normal` and `ease-chat`, with `motion-reduce:animate-none`. When the result set changes, rows don't animate, only the marks, so typing never makes the list jump.

**Accessibility:**

- The row's accessible name stays the title (`aria-labelledby`, as today).
- The excerpt gets an id and the row points at it with `aria-describedby`, so screen readers read "title, then excerpt" on highlight.
- `mark` keeps its native role (`mark`). The highlight colour meets 3:1 against the panel in light and dark, and text contrast is unchanged.
- Links inside the excerpt render as text (`allowedLinkPrefixes: []`), so a row holds no interactive element inside an option.

### Tests

- Extend the one picker journey in `apps/conciv/test/conciv.browser.test.tsx`:
  - Type, key by key, a word that appears only in a body. The row's description holds the excerpt, and `getByRole('mark')` holds the word.
  - Type a query with one typo. The correctly spelled word is still marked.
  - Clear the search. Rows go back to title-only.
- Add one case to core's node test file for the match rule: prefix, typo, no match, and title-only gives a null excerpt.
- No new test files, no mocks.

## 2. Session preview

### Surface

- One preview surface per picker, not one per row. It sits in the same `Combobox.Positioner` layer, positioned to the side of `Combobox.Content` with Ark/zag positioning (`placement: 'right-start'`, flipping to `left-start`, `getAnchorElement` set to the content element). Below the panel width breakpoint it renders under the list instead.
- It follows the combobox's `highlightedValue`, which pointer hover and the arrow keys both set. One source drives it, so pointer and keyboard behave the same.
- Open delay: a `@tanstack/solid-pacer` debounced value of `highlightedValue`, 300 ms. Moving fast through rows shows nothing; resting on one opens it. After a preview is open, changing rows swaps the content at once (no delay), like a tooltip group.
- Size: the list's height and up to 26rem wide (token-derived). The thread inside scrolls.
- Closes when the picker closes, when the highlight clears, or on Escape. The first Escape closes the preview, the second closes the picker. The preview takes Escape before the combobox does, the same way the Editable Input already stops it.

### Content (`apps/conciv/src/composer/session-preview.tsx`)

- `sessions.preview.infiniteOptions({harness, nativeId})` with `staleTime: 60s` and `gcTime: 5m`, so moving back to a row reuses its windows. Pages go backwards, newest window first: input `{harness, nativeId, before: MessageId | null, limit: 40}`, output `{messages: ChatMessage[], earlier: MessageId | null}`. The shape mirrors `ChatHistoryWindowSchema`.
- Rendered with the real chat `Thread` (`Thread.Root > Thread.Viewport > Thread.Messages`, no `Thread.Composer`) inside a `ChatProvider`. The provider gets a read-only `Chat`: `messages` from the query pages, `queue` empty, idle busy state, and `sendMessage` / `stop` / `reload` rejecting with a "preview is read-only" error that no UI can reach. Tool cards, reasoning, markdown, shiki and virtualization all come from the thread we already ship.
- Opens on the newest message (`landOnEnd`). Scrolling near the top fetches the previous page, the same pattern as `pane/older-messages.tsx` (`useThreadViewport().isNearTop()`).
- From a search hit, `Markdown` gets `highlight={matched}`, so the matches are marked in the full session too.
- Loading: the `ConversationSkeleton` after a 200 ms deferred fade (`anim-msg` with delay), so fast loads never flash. Error: an inline `role="alert"` row with Retry.

### Core (`sessions.preview`)

- Input zod-validated in the contract: `harness` (enum of the registered harness kinds), `nativeId: HarnessSessionId`, `before`, and `limit` (1-100).
- Reads through `HarnessHistory.messages(cwd, nativeId)` plus `withinProject`, then slices the window. It creates no session row and writes nothing.
- A missing or unreadable transcript returns `NOT_FOUND`, and the surface shows its error row.

### Performance

- No fetch until the 300 ms debounce settles. The query's `AbortSignal` is passed to the RPC, so leaving a row cancels its read.
- The thread virtualizes as it does in the chat. A 2,000-message session mounts only the visible rows.
- One `ChatProvider` stays mounted, keyed by the session, so swapping rows doesn't rebuild the provider tree twice.

### Motion

- The preview enters with `anim-presence-in` and exits with `anim-presence-out` through the existing ui-kit-system `presence.tsx`. A content swap between rows crossfades with `anim-combo`. Every animation is off under reduced motion.

### Accessibility

- The preview is `role="region"` with `aria-label="Preview of <title>"`, and the combobox content points at it with `aria-controls`. It isn't a live region, so screen readers aren't flooded when the highlight moves.
- The preview is not in the tab order while the input has focus. Reaching it by keyboard is an explicit step: **Alt+ArrowRight** (or **Tab** from the input) moves focus into the preview's scroller, where the arrows and Page keys scroll; **Escape** or **Alt+ArrowLeft** returns to the input with the same highlight. The hint shows once in the preview footer as kbd text.
- Focus is restored to the combobox input on close (Ark focus restore).

### Tests

The picker journey continues, as a user:

- Hover a row with the pointer. After the delay, the region "Preview of <title>" shows that session's last message.
- Press ArrowDown. The region follows to the next row's session.
- Alt+ArrowRight, then PageUp until an earlier message appears (the previous page loads).
- Escape returns focus to the input with the picker still open. A second Escape closes the picker.

The preview procedure gets one node case: a window, then `before` paging, then an unknown id gives `NOT_FOUND`.

## 3. Search across all projects

What exists today:

- Every `HarnessHistory` method takes `cwd`. Each harness scopes by project:
  - Claude: `listSessions({dir: cwd})` from the SDK.
  - Codex: filters rollouts by `cwd`.
  - Pi: `sessionsDir(cwd)`.
  - OpenCode: queries by project.
- Each can enumerate every project. Claude's SDK lists all projects when `dir` is omitted, and `SDKSessionInfo` carries `cwd`. Codex rollouts and OpenCode rows record their cwd. Pi's folders are per cwd under one root.

Shape (approved 2026-11-08):

- `HarnessHistory.list` takes a scope: `list(scope: {cwd: string} | {everywhere: true}, page)`. `HarnessSessionMeta` gains `cwd: string`.
- The index stores `cwd` as an enum field. A project-scoped search filters by `where: {cwd: {eq}}`. A widened one drops the filter.
- The picker's search box gets an "All projects" toggle (ui-kit-system `Switch`, kept in the route search params). Rows from another project show its folder name.
- Indexing everything costs more, so the background indexing starts only the first time the toggle is turned on. The current-project indexing keeps today's timing.

Opening a hit from another project: preview only (Q1). The hover preview is the whole interaction. The row's action reads "Open in <project>" and copies that harness's resume command; it never resumes the session here.

## Decisions (2026-11-08)

- **Q1. Opening a hit from another project.** The engine runs harness turns in this project's cwd and sandbox. A Claude session from repo B resumed in repo A would run its tools against A.
  - **(a)** Preview only. CHOSEN: the hover preview is the whole interaction. Clicking shows "Open in <project>", which does nothing beyond copying the resume command.
  - **(b)** Open read-only in this panel, with no composer.
  - **(c)** Resume it here, in this project's cwd. Its tools would then run against this project.
- **Q2. Harness API change.** Piece 3 changes the `HarnessHistory.list` signature and adds `cwd` to `HarnessSessionMeta` across all four harnesses. Approved as written.

## Out of scope

- Semantic search (embeddings), as in the #746 spec.
- `@orama/highlight` and plugin-match-highlight, both rejected (2026-11-07).
