# Session list: cursor pagination across all harnesses

Status: approved (2026-11-05). Replaces closed PR #719 (incremental transcript folding), which the maintainer rejected.

## Problem

Today `sessions.list` builds the full list on every call:

- **Harnesses:** each harness's `history.list(cwd, home)` returns its newest 50 sessions.
  - Claude and Pi read every one of those 50 transcript files in full.
  - Codex reads every rollout file only to count messages.
  - OpenCode runs a SQLite query.
- **Core:** `listSessionMetas` (`packages/core/src/sessions/session-rows.ts`) loads every session row for the cwd and joins the native list by `harnessSessionId`. Native sessions with no row get one (`materializeNative`). The result is sorted by `updatedAt`.
- **Widget:** six places call `sessions.list` through solid-query. Most only `.find()` one session by id.

So the cost grows with the cap: the 50 is arbitrary, and sessions beyond it can't be reached. Every list call re-reads whole transcripts. #719 tried to make the re-reading incremental with per-file cached folds, a module-level map and identity checks; that is the shape we don't want.

## Goal

The session list is cursor-paginated end to end. Each harness reads only the sessions on the requested page. The widget loads pages on demand through TanStack Query's infinite query, with no custom loader. No incremental caching, and no cap besides the page size.

## Design

### 1. Harness interface (`packages/protocol/src/harness-types.ts`)

Replace

```ts
list(cwd: string, home?: string): Promise<HarnessSessionMeta[]>
```

with

```ts
list(cwd: string, page: HarnessListPage, home?: string): Promise<HarnessSessionPage>
```

```ts
export type HarnessListCursor = {updatedAt: number; id: HarnessSessionId}
export type HarnessListPage = {after: HarnessListCursor | null; limit: number}
export type HarnessSessionPage = {sessions: HarnessSessionMeta[]; next: HarnessListCursor | null}
```

**Order:**

- Sessions are ordered by `updatedAt` descending, then `id` descending.
- `after` is exclusive: a page holds the sessions strictly older than `after` in that order.
- `next` is the last session's `(updatedAt, id)` when there may be more, otherwise `null`.

`HarnessListCursor` is the same tuple core uses as its own cursor (section 2), so every layer means the same thing by "older than".

Every harness implements it. There is no optional fallback and no "list everything" path. `MAX_SESSIONS` is deleted from all four harnesses.

**Per harness: read only the page.**

| Harness                          | Today                                                                   | Paged                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (`claude/history.ts`)     | readdir, stat all, sort, top 50, read 50 files                          | readdir and stat all (metadata only, no file reads), sort by `(mtime, id)`, slice after the cursor, then read only the `limit` files on the page      |
| Pi (`pi/history.ts`)             | same shape as Claude                                                    | same as Claude                                                                                                                                        |
| Codex (`codex/history.ts`)       | `LIST_THREADS` SQLite query, then reads every rollout to count messages | the query takes the cursor (`WHERE (updated_at_ms, id) < (?, ?) ORDER BY updated_at_ms DESC, id DESC LIMIT ?`), and only the page's rollouts are read |
| OpenCode (`opencode/history.ts`) | `LIST_SESSIONS` SQLite query                                            | the query takes the cursor, as for Codex, and `messageCounts` only covers the page's ids                                                              |

For Claude and Pi, stat-ing a directory of transcripts is cheap next to reading them. Reading only the page's files is the whole win, with no caching.

### 2. Core (`packages/core/src/sessions/session-rows.ts`, `api/rpc/sessions.ts`)

`listSessionMetas` takes the same `HarnessListPage` and returns `{sessions: SessionMeta[], next: HarnessListCursor | null}`. `HarnessListCursor` and `HarnessListPage` come from `@conciv/protocol/harness-types`, as in section 1. Core never defines its own cursor type.

**Two sources merged:**

1. **Native-backed sessions** (a row with `harnessSessionId`, or a native session with no row yet). The harness page is the ordering authority, because their `updatedAt` comes from the native meta. Core joins the page's native ids to rows with one `WHERE harness_session_id IN (...)` query, then materializes the unclaimed ones exactly as today.
2. **Conciv-only rows** (no `harnessSessionId` yet: created, never sent). Read with a SQL page on the row's own `updated_at`, using the same cursor and limit.

Core merges the two pages by `(updatedAt, id)`, takes the first `limit`, and sets `next` to the last returned session. Both sources are asked again from that cursor on the next call. Hidden rows are filtered as today. A filtered page may come back shorter than `limit`; that's fine, because `next` still advances.

Harnesses without `transcriptHistory` contribute an empty native page.

### 3. Contract (`packages/contract/src/contract.ts`)

```ts
sessions: {
  list: oc
    .input(z.object({includeHidden: z.boolean().optional(), cursor: HarnessListCursorSchema.nullish(), limit: z.number().int().min(1).max(100).default(30)}).nullish())
    .output(z.object({sessions: z.array(SessionMetaSchema), next: HarnessListCursorSchema.nullable()})),
  get: oc.errors(notFound).input(SessionIdInput).output(SessionMetaSchema),
}
```

- `HarnessListCursorSchema` is the zod schema for section 1's `HarnessListCursor`. It lives in `@conciv/protocol` beside that type, with the type inferred from it, and the contract imports it.
- `sessions.get` is new. Five of the six widget callers only want one session (`pane-provider.tsx`, `model-selector.tsx`, `panel.$sessionId.tsx`, `quick.tsx`, and `warm-session.ts` wants the latest). With paging, a `.find()` over the loaded pages would miss a session past the first page.
- `get` builds one `SessionMeta` from the row plus the harness `meta(cwd, id)` (already on `HarnessHistory`, optional today).
- `meta` becomes required for harnesses with `transcriptHistory`. Only Claude implements it today (`claude/history.ts:457`); Codex, OpenCode and Pi add it.

### 4. Widget (`apps/conciv`)

- `session-selector.tsx`, the only real list UI, uses `createInfiniteQuery` with oRPC's `utils.sessions.list.infiniteOptions({input: (cursor) => ({cursor, limit}), initialPageParam: null, getNextPageParam: (page) => page.next})`. More pages load as the user scrolls the list, through the existing virtual list's end-reached signal. No hand-rolled page state.
- The single-session callers switch to `utils.sessions.get.queryOptions({input: {id}})`.
- `warm-session.ts` asks for the first page with `limit: 1`. The list is newest first, so its first row is the latest session.
- `invalidateSessions` (`data/app-data.ts`) and `refresh-coordinator.ts` invalidate both `sessions.list` and `sessions.get` keys. Query keys already prefix-match by procedure.
- `harness-testkit/src/create-testkit.ts` cleanup pages through the list until `next` is null.

### 5. Search on the server (decided 2026-11-06)

The picker's search box queries the server. It never filters loaded pages in the browser.

- **What matches:** a native session matches on its title or its message text through an Orama full-text index, with typo tolerance 1. A conciv-only row matches on its own title. Results keep section 1's order and cursor (newest first), not relevance order.
- **Contract:** search is its own procedure, `sessions.search`, with input `{term: z.string().trim().min(1).max(200), includeHidden?, cursor?, limit}` and the same output as `sessions.list` (`{sessions, next}`). `sessions.list` takes no search input. Inside core, both procedures run the same pipeline (`listSessionMetas`); the only difference is the source of the native pages: harness `list` for `sessions.list`, the index for `sessions.search`.
- **The index (core, Orama, decided 2026-11-06):**
  - `@orama/orama` (3.1.18, approved) is a dependency of core. There is one in-memory Orama instance per engine, with schema `{harness: 'enum', title: 'string', body: 'string', updatedAt: 'number'}`. The document id is `${harness}:${harnessSessionId}`.
  - **Memory only.** No persistence plugin and no Orama data written to disk; message text never lands in conciv's database. Orama has to keep the documents in memory, because `remove()` re-tokenizes the stored document.
  - **No harness work.** The index uses only the `HarnessHistory` API that every harness with `transcriptHistory` already has: `list`, `messages` and `meta`. No harness gains a search method or a search-specific method. A new harness gets search for free.
  - **Document:** the title is `meta.derivedTitle` (or the row title, see below). The body is the text parts of `messages(cwd, id)`.
  - **Build (decided 2026-11-07):** the index never delays anything. It starts in the background once the widget is up, triggered after core has answered the first `sessions.list` (the widget's first load), not at engine start. It reads in small batches, smallest transcripts first, yielding between batches so live requests always go first. A search that arrives before the build is done does NOT wait: it answers at once from what's indexed so far, and titles from the listing are indexed first, before any message text. Text matches appear as each file finishes. A new `sessions.changes` stream (approved 2026-11-07) yields the index version `{version}`: the current one on subscribe, then each new one when a pass changes the index. The widget reads it as a live query and puts the version in its list and search query keys, so an open list or search refetches when the index changes. A search answers at once from the index and starts one background refresh if none is running, so a session created since the last refresh is searchable from the next search on. A per-session read failure indexes that session by title only and retries its body on the next refresh; no session is ever left out.
  - **Freshness:** core keeps a watermark, the highest `updatedAt` it has indexed. Before each search it pages `list` from the top (newest first) and stops at the first session at or below the watermark. Only those changed or new sessions are re-read and upserted. A session no longer listed (the transcript is gone) is removed from the index on the next refresh.
  - Measured on this repo: 19 Claude transcripts with 6 MB of message text took about 2.5 s to read and index, used about 12 MB of heap, and searched in under 10 ms.
  - **Query:** `search(db, {term, properties: ['title', 'body'], tolerance: 1, where: {updatedAt: {lte: cursor.updatedAt}}, sortBy: {property: 'updatedAt', order: 'DESC'}})`. Core applies the exact `(updatedAt, id)` cursor on the hits and keeps `limit + 1`. The fetch limit covers the hits that share the cursor's `updatedAt`, counted with a `where: {updatedAt: {eq}}` preflight. The page's sessions take their meta from the index documents, as section 5b says.
  - Harness `list` never sees `search`. Search has one path for every harness.
- **Core, renamed sessions:** the indexed `title` is the title the picker shows, `row.title ?? native.derivedTitle`. A rename updates that session's Orama document right away.
- **Conciv-only rows** (never sent, so no transcript) add `title LIKE ? ESCAPE '\'` to their SQL page and merge with the index hits by `(updatedAt, id)`, as in section 2.
- **Widget:** the picker uses `sessions.list.infiniteOptions` when the debounced search is empty and `sessions.search.infiniteOptions` when it isn't; both share the same page handling. A new search starts over from page one. The combobox's `filter` stays off, because the server already narrowed the list. Invalidation covers `sessions.search` keys too.

### 5b. Cheap session metadata (decided 2026-11-06)

Measured on real data (81 Claude transcripts, 2.6 GB, the largest 419 MB): a list page took 13.7 s, `sessions.get` for the live session over 10 s, the first search 35 s, and each later search 3-5 s. All of it came from parsing whole transcripts to build `HarnessSessionMeta`.

- **Claude and Pi meta and list** never parse a whole transcript.
  - The title comes from the first user message, read by streaming lines from the start and stopping there.
  - **Size, not message count (decided 2026-11-06).** An exact message count needs reading the whole file, and the maintainer rejected any cache, so `messageCount` goes away. The row shows the transcript's size instead. `HarnessSessionMeta`/`SessionMeta` gain `sizeBytes?: number`: Claude's comes from the SDK's `fileSize`, Pi's and Codex's from the `stat` already done, and OpenCode (sqlite, no file) leaves it out. `messageCount` is removed wherever only the row consumed it. The row renders the size through a ui-kit-system wrapper around Ark's `Format.Byte`, added beside `relative-time.tsx` first. Claude's meta comes from the Claude Agent SDK's `listSessions`/`getSessionInfo` (189 ms for a 30-session page against 13.7 s, and 5 ms for the 400 MB session).
  - `updatedAt` stays the file's mtime.
  - Everything else the meta carries is either read from the head or dropped, if nothing uses it.
- **Search hits** take their meta from the index document (title, updatedAt, sizeBytes stored at index time). They don't call `meta()` per hit. A transcript that has gone is caught on the next refresh, not per hit.
- **A live session** that changes all the time is re-indexed at most once every 30 s. Between those re-indexes its body can lag behind; its title and updatedAt still come from the walk.

### 6. Virtual list and load-more row (decided 2026-11-06)

The picker's list is virtualized with `@tanstack/solid-virtual`, following TanStack's infinite-scroll example:

- The rows are flat: date-group headers and sessions are both virtual items.
- When `hasNextPage` is true, `count` is the row count plus one, and the extra last row is a visible "Loading more…" row.
- The next page is fetched from the virtualizer's `onChange` callback when the last virtual item is the loader row and no fetch is running. That callback is an event; there is no `createEffect`.
- The `@solid-primitives/intersection-observer` dependency and the sentinel div are removed.
- The combobox stays an Ark Combobox with keyboard navigation working. Use Ark's virtualized combobox pattern, `scrollToIndexFn`.
- If ui-kit-system's `combobox.tsx` lacks what this needs, add it there first.

## Out of scope

- No caching of folds or file handles between calls. The previous change took that approach and it is rejected.
- No change to `messages`, `observe`, or how a single transcript is read.
- No TanStack DB migration for the widget. The maintainer chose TanStack Query's infinite query.
- Relevance ordering: results stay newest first.
- Embeddings and semantic search: a follow-up PR (a local model via `@huggingface/transformers` feeding Orama vector fields).
- Searching sessions from every project, not only the current cwd: a follow-up PR, requested by the maintainer on 2026-11-07. The picker gets an option to widen search to all projects; each harness would need to list transcripts across project directories.

## Overlap with open PRs

#720 ("sessions.list stops amplifying") touches the widget callers in section 4. Sections 1-3 (protocol, harnesses, core, contract) do not overlap and land first; the widget part builds on main after #720 merges.

## Tests

All tests go in existing files:

- **`harness.test.ts`:** one describe per harness checks the paging contract:
  - order;
  - `after` is exclusive;
  - `next` is null on the last page;
  - ties on `updatedAt` are broken by id;
  - a page reads only its own transcripts. Claude/Pi check: an unreadable transcript on page 2 doesn't affect page 1. No mocks.
- **`core.test.ts`:**
  - merging the native page with conciv-only rows;
  - hidden filtering;
  - a native session materialized on page 2;
  - `sessions.get` for both a native-backed session and a conciv-only one.
- **`conciv.browser.test.tsx`:**
  - the selector loads a second page when scrolled to the end;
  - opening a session past the first page shows its title, which proves `get`.

## Decisions (2026-11-05)

1. **Default page size:** 30 (approved).
2. **`HarnessHistory.meta`** is required when `transcriptHistory` is true (approved).
3. A session whose native transcript is gone drops out of the list (B, 2026-11-06).
