# Whiteboard Drag-Write Coalescing — Design

**Goal:** Stop the whiteboard emitting one `PUT /elements/live` per Excalidraw frame during a drag
(~60/sec). Coalesce a drag into ~one persisted write per 50ms using TanStack DB's native paced
mutations — no hand-rolled throttle, no protocol change.

**Scope:** `packages/extensions/whiteboard/src/client/db.tsx` and
`packages/extensions/whiteboard/src/canvas/island.tsx` only. Server, routes, store, schema
unchanged.

## Root cause (read from source, not inferred)

`island.tsx` `writeLocal` runs on every Excalidraw `onChange` (one per animation frame during a
drag). For each changed element it calls `db.canvasElements.update(id, …)` or `.insert(row)`
(`island.tsx:104-113`). Each such call, made outside any ambient transaction, is its own
**auto-commit** transaction, so the element collection's `onUpdate`/`onInsert` handler
(`db.tsx:138-145`) fires once per frame — one `PUT /elements/live` per frame. The frames never
share a transaction, so TanStack DB's per-transaction merge-by-key never gets a chance to collapse
them.

Verified library facts (from installed `@tanstack/db@0.6.14` d.ts + `paced-mutations.js`):

- `createPacedMutations({onMutate, mutationFn, strategy, ...transactionConfig})` returns a
  `mutate(variables) => Transaction`. Internally it opens a single
  `createTransaction({mutationFn, autoCommit: false})` and, while that transaction is still
  `pending`, **reuses it** across `mutate()` calls. Each call runs `onMutate(variables)` inside
  `transaction.mutate(...)`, so the collection mutations issued in `onMutate` are captured by the
  ambient manual transaction and the collection's own `onInsert`/`onUpdate`/`onDelete` handlers are
  **not** invoked (no double-write). The `strategy` decides when the accumulated transaction
  commits; on commit `mutationFn({transaction})` runs once with all mutations.
- Within one transaction, repeated mutations to the same key merge: `insert+update → insert`
  (changes merged), `update+update → update` (union changes, keep first `original`),
  `update+delete → delete`, `insert+delete → removed`. So N frames on one element → one merged
  mutation whose `modified` is the latest row.
- `throttleStrategy({wait, leading?, trailing?})`, `debounceStrategy({wait, leading?, trailing?})`,
  `queueStrategy({wait, maxSize?, addItemsTo?, getItemsFrom?})` all exist and satisfy `Strategy`
  (`{_type, execute, cleanup}`).
- `@tanstack/solid-db` re-exports all of `@tanstack/db` (`export * from '@tanstack/db'`), so
  `createPacedMutations`, `throttleStrategy` import from `@tanstack/solid-db` alongside
  `createCollection`.

## Design

### Element write path becomes a single paced owner

In `db.tsx`'s `elementCollection(scope, table)` factory:

- Keep `queryFn`, `getKey`, `onDelete` unchanged.
- **Remove `onInsert` and `onUpdate`** from `queryCollectionOptions`. Persistence for
  insert/update moves into the paced `mutationFn`. (Confirmed safe: the only element insert/update
  callers in the whole package are `island.tsx` `writeLocal` and `commitStep`; draft draws go
  server-side via the raw `PUT /elements/:scope/bulk` fetch in `drainPending` + SSE, never through
  `collection.insert`. `onDelete` stays — the sole element delete caller is `clearDraftRows`,
  `db.canvasDraftElements.delete`.)
- Add a paced writer, keeping the existing `putElement` helper as the single persist step
  (`PUT /elements/:scope` → parse 200 row or 409 `{current}` → `collection.utils.writeUpsert`):

```ts
const strategy = throttleStrategy({wait: 50, leading: true, trailing: true})
disposers.push(strategy.cleanup)
const write = createPacedMutations<ElementRow>({
  strategy,
  onMutate: (row) => {
    if (collection.has(row.elementId))
      return void collection.update(row.elementId, (draft) => {
        draft.data = row.data
        draft.version = row.version
      })
    collection.insert(row)
  },
  mutationFn: async ({transaction}) => {
    await Promise.all(transaction.mutations.map((mutation) => putElement(mutation.modified)))
  },
})
```

Expose `write` on the returned collection so callers reach it as `db.canvasElements.write(row)`.
Do **not** spread the collection (`{...collection}` drops its getters like `.state` and unbinds
`.has`/`.update`); attach onto the live instance instead — `return Object.assign(collection, {write})`
with a typed return so the added method is visible to `island.tsx`. A `const disposers: Array<() =>
void> = []` declared at the top of `createWhiteboardDb` collects each `strategy.cleanup`.

### Ownership rationale (why single-owner, not "paced drag + keep handlers")

A collection must have one persistence mechanism. TanStack DB's guarantees — merge-by-key, mutation
ordering, rollback on `mutationFn` failure — are defined **within a single transaction**, not
across concurrent transactions on the same key. Leaving the auto-commit `onUpdate` alive alongside
the paced writer means a direct `collection.update(E)` can open a second, auto-committing
transaction while a throttle window for `E` is still pending — two live transactions mutating `E`,
with local optimistic value and last-PUT-wins now a race the library does not govern. Routing every
insert/update through the one paced transaction manager removes that race by construction.
`leading: true` fires one-shot writes (the draft→live commit) immediately, so single-owner costs no
latency. `onDelete` stays a separate handler because delete is a distinct operation on a distinct
endpoint (`bulk-delete`) that is causally ordered with inserts (insert a draft, later delete it on
commit), not concurrent same-key churn.

### Strategy choice

`throttleStrategy({wait: 50, leading: true, trailing: true})`. Throttle (evenly spaced) over
debounce (fires only after motion stops) so collaborators in other tabs see the element **move**
during the drag at a capped ~20 writes/sec rather than jump to its final position on release;
`trailing: true` guarantees the final position persists. `leading: true` makes one-shot writes
(commit) immediate.

### island.tsx call-site changes

- `writeLocal` (`island.tsx:104-113`): replace the `has`/`update`/`insert` branch with
  `db.canvasElements.write(row)`. The `versions.set(...)` bookkeeping stays.
- `commitStep.write` (`island.tsx:150-159`): replace the `has`/`update`/`insert` branch with
  `db.canvasElements.write({room: props.room, elementId: draft.elementId, data: draft.data,
version: draft.version})`.
- `clearDraftRows` (`island.tsx:166`): unchanged (`db.canvasDraftElements.delete`).

### Lifecycle

`createWhiteboardDb` accumulates each element collection's `strategy.cleanup` in a `disposers`
array; `dispose` (currently `source.close()`) also runs every disposer, so the 50ms throttle timer
cannot outlive the room. `dispose` is already wired through `WhiteboardDbProvider`'s `onCleanup`.

### Deferred (explicitly out of scope)

Multi-select drag of N elements still issues N `PUT /elements/live` per 50ms window (one per merged
key, each version-gated and row-echoed). Collapsing those into one `PUT /elements/:scope/bulk` is
deferred: the bulk route returns `{written}`, not rows, so it cannot echo per-element 409 winners
for `writeUpsert` reconciliation. Single-element drag — the common case — is fully coalesced.

## Error handling

Unchanged semantics. A `PUT` that throws inside `mutationFn` rejects the transaction, and TanStack
DB rolls back the optimistic state (same as today's `onUpdate` throw). A 409 is handled inside
`putElement` by writing the server's winning row via `writeUpsert` — it does not throw, so it does
not roll back.

## Testing

Real browser (Playwright/Chromium), per repo rule — no jsdom. New IT in the whiteboard suite:

1. Open the canvas in a page, draw one element.
2. Drag it across the canvas for ~500ms while counting `PUT /elements/live` requests via
   `page.on('request')`.
3. Assert the count is bounded (≈ ≤ 12; an unbatched drag at ~60fps over 500ms is ~30) **and**
   greater than 1 (proves trailing writes stream, not a single debounce).
4. Open a second page on the same room; assert it receives the element at the final dragged
   position (correctness — the existing cross-tab drag IT already covers this and must stay green).

The existing 22-file / 53-test whiteboard IT suite must pass unchanged. Rebuild the extension +
widget before browser ITs (`pnpm turbo run build --filter=@conciv/extension-whiteboard
--filter=@conciv/widget`).

## Verification

`pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`, the whiteboard IT suite, and a
live `verify` leg: drag an element in one tab, confirm the second tab follows smoothly and the
Network panel shows ~1 `PUT /elements/live` per 50ms window instead of per frame.
