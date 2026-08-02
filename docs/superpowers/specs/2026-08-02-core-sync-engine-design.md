# Core Sync Engine — Design Spec

**Status:** approved direction (user, 2026-08-02: "design the sync engine with tanstack db so we can delete this ugliness"). Executes on its own branch AFTER `connected-external-terminal` merges. Supersedes Tasks 2–3 of `docs/superpowers/plans/2026-08-02-primitive-debt-cleanup.md` (the `sessions.changes` doorbell + manual invalidation design is REJECTED — recorded below so it stays rejected).

## Problem

The branch accumulated a bespoke change-propagation layer between core and the widget:

- `makeChanges` — hand event bus with microtask coalescing (`packages/core/src/chat/attach.ts`)
- `externalRev` — hand cache-version counter; `snapshotKey` — hand dirty-check; `ChangeWaiter` — hand wake-up primitive
- `dialLog` — TTL/LRU presence map surfaced as a decaying `ready` flag
- widget side: manual `invalidateSessions()` calls sprinkled through mutations, a candidates poll ladder with per-state retry regimes, and a hand ticking clock for staleness

Each piece is small; together they are a custom sync engine nobody owns. Meanwhile the whiteboard extension already ships a REAL one on TanStack DB: `createChangeFeed` (one oRPC event-iterator stream fanning table changes to subscribers, infinite retry, reconnect hooks) + `whiteboardCollectionOptions` (`createCollection` sync + optimistic mutation handlers over rpc ops + zod row parse). Proven, tested, in-tree.

## Design: promote the whiteboard pattern into core

One sentence: **core exposes a `changes` event-iterator stream of typed row upserts/deletes; the widget holds TanStack DB collections synced from that stream; UI reads live queries; TanStack Query remains only for one-shot RPCs.**

### Synced collections (v1 scope)

| Collection | Row (zod, in `@conciv/contract`) | Key | Server source of truth |
|---|---|---|---|
| `sessions` | existing session row shape | `sessionId` | core db `sessions` table |
| `candidates` | `LiveSession` (reshaped: `online: boolean`, `lastSeenAt: number \| null` replacing `ready`) | `sessionId` (harness) | process scan + transcripts + dialLog |
| `navigation` | existing navigation row | singleton key | core db `navigation` table |

Out of scope v1: chat message streaming (stays AG-UI over `sessions.attach` — different problem: ordered append stream, not row sync), drafts (tiny get/set, revisit later), whiteboard (already done, stays extension-local).

### Server half

- New contract route `sync.changes: oc.output(eventIterator(SyncEventSchema))` where `SyncEvent = {table: 'sessions' | 'candidates' | 'navigation'} & ({type: 'upsert'; row: <table row>} | {type: 'delete'; key: string}) | {type: 'snapshot'; table; rows: <row>[]}`. Mirrors the whiteboard event shape (`server/router.ts:117`) plus an explicit `snapshot` event: on subscribe, the server sends one snapshot per table, then deltas. Zod-validated per table — no `z.custom` passthrough; discriminated union in `@conciv/contract`.
- Server publisher: one module (`packages/core/src/sync/publisher.ts`) owning "table changed → emit". Sources:
  - `sessions`/`navigation`: the db write paths already call `changes.notify()`; the publisher taps the same call sites and emits the written row (write-through, no re-query).
  - `candidates`: recompute on the events that can change it (adopt/detach/launch/presence transition/dial note — the current `notifyChange` callers) plus one slow rescan interval (processes appear without any event; 15s, server-side, the ONLY poll left). Emit `snapshot` for candidates each recompute — the list is ≤50 rows and diffing it server-side is complexity for nothing.
- `dialLog` stays server-internal but reshapes: `online(id)`/`lastSeenAt(id)`, TTL no longer deletes entries (LRU cap only). Its facts ride the `candidates` rows. The decaying `ready` flag and its "one reload" misclassification die; the reload note keys off `lastSeenAt === null`.
- **What gets deleted server-side:** `externalRev`, `snapshotKey`'s externalRev term, `sessions.notifyChange` (extensions call the publisher's typed emit instead), the whole planned doorbell. `makeChanges`' emitter shrinks to the attach-stream's internal wake-up (chat streaming still needs it) or dies entirely if the publisher covers it — decided during implementation with a fallow trace, not up front.

### Client half

- `packages/client` (or `apps/conciv/src/data`) gains `createCoreDb(apiBase)`: the literal `createWhiteboardDb` shape — one `createChangeFeed`-style subscription to `sync.changes` (infinite retry via the same `onRetry` reconnect hook; on reconnect, server re-sends snapshots, collections reconcile), three `createCollection` calls with per-table zod parse.
- UI reads via live queries (`@tanstack/solid-db`): candidate list, session switcher, navigation restore. The connect dialog's `dialledIn` becomes a live query over `candidates` (`row.online` for the adopted id) — no subscription lifecycle in the machine, no effect juggling.
- Mutations stay oRPC calls (adopt/detach/navigate). No optimistic writes in v1 — the server round-trip is localhost; collections update from the pushed delta. (Whiteboard's optimistic `onInsert`/`onUpdate` handlers exist if a surface later needs them.)
- **What gets deleted client-side:** `invalidateSessions` and every manual `invalidateQueries` for these tables, the candidates `useQuery` + `staleTime`/`refetchInterval`/retry juggling, `pollMs`/`persistence`/`dialInPollMs`/`GIVE_UP_AFTER_FAILURES`/`terminalDialledIn`, the ticking clock, `heldOf`/`mergeFrozen`/`arrivedCount` (the frozen-list UX becomes a UI-level concern: the dialog samples the live query into local state on open and offers "N new sessions — refresh" by comparing live rows to the sample — same behavior, no cache management).
- Staleness UX: with push + reconnect hooks, "checked Xs ago" reframes as connection state — "live" while the feed is connected, "reconnecting…" when the feed drops (`onReconnect`/error hooks). The stale badge as a concept dies with the polling it described.

### Presence UX (user ruling, 2026-08-02)

Candidate rows show **Online / Last seen**, not connect/disconnect: `online: true` → "online" (+ working/shell detail); else "last seen \<RelativeTime lastSeenAt\>"; `lastSeenAt === null` → "started \<RelativeTime startedAt\>" + the one-time-setup note. `RelativeTime` (ui-kit-system, Ark Format) renders times — no ticking clocks anywhere.

## Rejected designs (do not resurrect)

1. **`sessions.changes` doorbell + `invalidateQueries`** — a second bespoke signal (rev-filtered ticks) keeping TanStack Query as a pull cache. Rejected: still hand-rolled versioning on the wire, still manual invalidation wiring, and it extends `externalRev` instead of deleting it.
2. **`dialLog.onDial` listener registry + `sessions.awaitDialIn` per-session await route** — third parallel notification path, per-session subscription lifecycle in the connect machine. Rejected: the fact already reaches shared plumbing; per-session await routes multiply state.
3. **Decaying `ready` flag** — TTL presence surfaced as a connection boolean; mislabels idle-but-wired sessions. Replaced by online/lastSeenAt.

## Risks / open questions for the implementation plan

- `sync.changes` is one more long-lived SSE per widget client alongside the chat attach stream — confirm the embed's connection budget (browsers cap per-origin SSE on http/1.1; core serves localhost http/1.1 — count existing streams first; multiplex into one stream if at the cap).
- Candidates recompute cost on chatty presence transitions — coalesce via the publisher (microtask or small debounce INSIDE the publisher, one place, not per-consumer).
- The attach stream's `snapshotKey` loses its `externalRev` term — verify external transcript updates still re-send snapshots through whatever replaces the bump (publisher event or retained internal emitter).
- PiP windows / multiple widget mounts share one `createCoreDb`? Whiteboard's answer (provider + `untrack`) says yes-per-provider; decide at plan time.

## Next steps

1. This branch merges (endgame in flight).
2. New branch `core-sync-engine`; implementation plan derived from this spec (I write it; the whiteboard files are the reference implementation to copy, not re-derive).
3. Primitive-debt plan Tasks 4–5 (presence pill, splitter, draggable) ride along on that branch; Task 6 (recorder issue) files immediately.
