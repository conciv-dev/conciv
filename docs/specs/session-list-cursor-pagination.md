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

- **What matches:** the title the picker shows (`row.title ?? native.derivedTitle`) or the session id contains the search text, case-insensitive. A search narrows the list; order and cursor rules stay as in section 1.
- **Contract:** `sessions.list` input gains `search: z.string().trim().max(200).optional()`. The page type gains it too: `HarnessListPage = {after, limit, search: string | null}`.
- **Harnesses:**
  - **Codex** and **OpenCode** add the match to their SQL: `LIKE ? ESCAPE '\'` on the columns their `derivedTitle` comes from, plus the id.
  - **Claude** and **Pi** walk the stat-sorted files from the cursor. For each file, they read only up to the first user message, which is what the title comes from. They stop once the page is full. The reader stops early; it never folds the whole transcript just to get a title.
- **Core, renamed sessions:** a native-backed row with its own `title` is matched on that title, not the native one.
  - Core drops a native page entry when its row title exists and doesn't match.
  - A third source supplies renamed rows whose title matches: a SQL query for `harness_session_id IS NOT NULL AND title LIKE ?`, then `meta()` for each one's `updatedAt`, filtered by the cursor and merged by `(updatedAt, id)` like the other two sources.
  - The number of renamed sessions is small, so this source isn't paged in SQL. That is its known ceiling.
- **Conciv-only rows** add `title LIKE ?` to their SQL page.
- **Widget:** the search text goes into the infinite query's key, debounced with `@solid-primitives/scheduled`. A new search starts over from page one. The combobox's `filter` stays off: the server already narrowed the list.

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
- Full-text search inside transcripts: search matches titles and ids only.

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
