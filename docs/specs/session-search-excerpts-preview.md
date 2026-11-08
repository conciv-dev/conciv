# Session search: excerpts, session preview, all projects

Status: draft (2026-11-08). Follows #746 (server search over Orama) and #757 (header title).

## Problem

The picker's search (`sessions.search`) returns only a matching session's title, time and size. Three gaps remain:

1. **Why it matched.** A hit found by its body text gives no clue where the match is.
2. **What the session is.** Picking a session to see what it holds means opening it, which replaces the open chat.
3. **Other projects.** Search covers only the current cwd. A session about the same topic in another repo can't be found.

## Goal

- Each search hit shows a short markdown excerpt around the match, with the matched words highlighted.
- Hovering a row (or moving the keyboard highlight onto it) opens a preview of the whole session beside the picker.
- Search can be widened to every project the harnesses know about.

Each piece lands as its own PR, in that order. Pieces 1 and 2 need no new decision. Piece 3 waits for the open questions at the end.

## 1. Excerpts with highlighted matches

### Worker (`packages/core/src/sessions/search-index-worker.ts`)

The `search` procedure returns each hit with two extra fields:

- `excerpt: string | null`: null when only the title matched.
- `matched: string[]`: the words in the excerpt that matched, as written in the text.

Matching follows Orama 3.1.18's own rule (radix `find` / `_findLevenshtein`), so the highlight never disagrees with the hit:

- The query and the body run through Orama's tokenizer (`@orama/orama/components`, `tokenizer.createTokenizer()`), with the same configuration the index uses: normalization and diacritics, plus stemming or stop words if any are configured.
- A body token matches a query token when it starts with the query token, or when `boundedLevenshtein(queryToken, token, tolerance).isBounded` holds (`@orama/orama/internals`).
- `tolerance` is the one the search already passes (`typoTolerance(term)`).

Cutting the excerpt:

- Take the first matching token's position in `body`.
- Walk back to the nearest paragraph start, meaning the previous `\n\n` or `\n`. Message text is joined by `\n` (`textOf`).
- Take about 300 characters forward, then extend to the next word boundary.
- The worker runs this only on the returned page, never on the whole index, and reads no internal tree.

No character offsets cross the wire. The widget marks the words again in the rendered text, so offsets would not survive markdown rendering anyway.

### Contract (`packages/contract`)

`SessionMetaSchema` stays as it is. `sessions.search` gets its own output, a page whose rows are `SessionMeta & {excerpt: string | null; matched: string[]}`. `sessions.list` doesn't change.

### Core

`session-search.ts` `hitsOf` carries `excerpt` and `matched` through `pages()` and the shared pipeline (`listSessionMetas`). They ride on the search page only. `NativePage` gains an optional `found` map keyed by native id, so list paging stays untouched.

### Streamdown (`@conciv/solid-streamdown`, our package)

New prop `highlight?: readonly string[]`. After rendering, a rehype step walks the text nodes (never code or pre) and wraps each case-insensitive whole-word occurrence in `<mark>`. It is built from HAST nodes, with no HTML strings. Words are regex-escaped. `remend` already heals markdown cut short at the excerpt edge.

`ui-kit-chat` `Markdown` passes `highlight` through.

### Picker (`apps/conciv/src/composer/session-selector.tsx`)

- A search row renders title, then the excerpt (`Markdown` with `highlight`, clamped to 3 lines), then the `Edited · size` line.
- `<mark>` styling comes from existing tokens only: a background derived from the accent token and the text colour kept. It fades in over the motion token, and reduced motion removes the fade.
- Rows differ in height, so the virtualizer measures each row (`measureElement`) instead of using a fixed estimate.
- The row's accessible name stays the title. The excerpt is described through `aria-describedby`.

### Test

The one existing picker journey in `apps/conciv/test/conciv.browser.test.tsx` gains steps:

- Search a word that appears only in a body. The row shows an excerpt, and the word sits inside a `mark` role (`getByRole('mark')`).
- Search with one typo. The correctly spelled word in the excerpt is still marked.

The worker matching rule gets one node test case in core's existing node test file: prefix, typo, no match, title-only gives a null excerpt.

## 2. Session preview on hover

- **Trigger:** the ui-kit-system `HoverCard` on each picker row, positioned to the side of the picker. The keyboard highlight opens it too, after the same open delay, so it isn't pointer-only. Escape closes the preview before the picker.
- **Data:** a new read-only procedure `sessions.preview({harness, nativeId, before?, limit})`. It returns a window of `ChatMessage[]` read through `HarnessHistory.messages`, the same reader search indexing uses. It creates no session row, so hovering has no side effects. It pages backwards (newest window first), shaped like `chat.hydrate`'s window (`ChatHistoryWindowSchema`).
- **Render:** reuse the chat thread primitives from `ui-kit-chat` (`thread.tsx` with `createThreadVirtualizer`) in read-only mode: no composer, no action bar, no tool approvals. It lands on the end (`landOnEnd`), and scrolling near the top (`nearStart`) loads the previous window. The text goes through `Markdown`, plus `highlight` when the preview comes from a search hit, so the matches are marked in the full session too.
  - If `thread.tsx` can't render without a live chat store, the implementer stops and reports. We don't fork a second thread component.
- **Query:** `sessions.preview.infiniteOptions` keyed by `(harness, nativeId)`, with a `staleTime` so moving between rows reuses windows already read.

### Test

The picker journey continues: hover a row and see the preview with the session's last message. Scroll the preview to the top and see an earlier message. Move the keyboard highlight to the next row and the preview follows. Press Escape and the preview closes while the picker stays open.

## 3. Search across all projects

What exists today:

- Every `HarnessHistory` method takes `cwd`. Each harness scopes by project:
  - Claude: `listSessions({dir: cwd})` from the SDK.
  - Codex: filters rollouts by `cwd`.
  - Pi: `sessionsDir(cwd)`.
  - OpenCode: queries by project.
- Each can enumerate every project. Claude's SDK lists all projects when `dir` is omitted, and `SDKSessionInfo` carries `cwd`. Codex rollouts and OpenCode rows record their cwd. Pi's folders are per cwd under one root.

Shape (pending Q2):

- `HarnessHistory.list` takes a scope: `list(scope: {cwd: string} | {everywhere: true}, page)`. `HarnessSessionMeta` gains `cwd: string`.
- The index stores `cwd` as an enum field. A project-scoped search filters by `where: {cwd: {eq}}`. A widened one drops the filter.
- The picker's search box gets an "All projects" toggle (ui-kit-system `Switch`, kept in the route search params). Rows from another project show its folder name.
- Indexing everything costs more, so the background indexing starts only the first time the toggle is turned on. The current-project indexing keeps today's timing.

What opening a hit from another project does is Q1.

## Open questions

- **Q1. Opening a hit from another project.** The engine runs harness turns in this project's cwd and sandbox. A Claude session from repo B resumed in repo A would run its tools against A.
  - **(a)** Preview only (recommended): the hover preview is the whole interaction. Clicking shows "Open in <project>", which does nothing beyond copying the resume command.
  - **(b)** Open read-only in this panel, with no composer.
  - **(c)** Resume it here, in this project's cwd. Its tools would then run against this project.
- **Q2. Harness API change.** Piece 3 changes the `HarnessHistory.list` signature and adds `cwd` to `HarnessSessionMeta` across all four harnesses. Approve the shape above, or name another.

## Out of scope

- Semantic search (embeddings), as in the #746 spec.
- `@orama/highlight` and plugin-match-highlight, both rejected (2026-11-07).
