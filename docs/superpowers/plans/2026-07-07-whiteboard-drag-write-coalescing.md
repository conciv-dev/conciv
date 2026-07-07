# Whiteboard Drag-Write Coalescing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the whiteboard emitting one `PUT /elements/live` per Excalidraw frame during a drag; coalesce a drag into ~one persisted write per 50ms using TanStack DB's native paced mutations, and collapse multi-select drags into one bulk write that still echoes per-element version-gate winners.

**Architecture:** Route every element insert/update through a single `createPacedMutations` writer with `throttleStrategy({wait: 50})`, so per-frame mutations accumulate in one pending transaction, merge by key, and persist once per window. The paced `mutationFn` sends a single `PUT /elements/:scope` for one element (keeping its 409 path) or one `PUT /elements/:scope/bulk` for many; the bulk route is changed to return the authoritative row per input so the client can `writeUpsert`-reconcile version-gate losers.

**Tech Stack:** `@tanstack/db` 0.6.14 (`createPacedMutations`, `throttleStrategy`, re-exported by `@tanstack/solid-db`), `@tanstack/query-db-collection`, Solid, h3 v2, drizzle/libSQL, zod v4, Playwright/Chromium ITs.

## Global Constraints

- All work stays in `packages/extensions/whiteboard`. Files touched: `src/server/db/store.ts`, `src/server/routes.ts`, `src/client/db.tsx`, `src/canvas/island.tsx`, plus tests.
- Functions not classes; no IIFEs; **zero code comments** (the `conciv/no-comments` autofix deletes them); no `else` where a guard-return works.
- Fully typed: no `any`, no `as`, no non-null assertions. `noUncheckedIndexedAccess` is on — narrow array reads with destructuring + a truthiness guard, never `arr[0]!`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- `vitest.config.ts` keeps `test: {environment: 'node'}`. Build/typecheck via turbo, never hand-build `dist/`.
- Commit with a pathspec always: `git commit -m "..." -- <paths>`.
- **Behavior parity:** the existing 22-file / 53-test whiteboard suite must pass unchanged. Do not loosen existing tests.
- Element rows are `{room, elementId, data, version}`; timestamps elsewhere are epoch-ms integers; nullable columns are explicit `| null`.
- Before the browser IT, rebuild extension + widget: `pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/widget`.

---

### Task 1: Server — bulk route echoes per-element winners

**Files:**

- Modify: `packages/extensions/whiteboard/src/server/db/store.ts:75-82` (`upsertElements`)
- Modify: `packages/extensions/whiteboard/src/server/routes.ts:99-102` (bulk route)
- Test: `packages/extensions/whiteboard/test/store.test.ts` (add one case)
- Test: `packages/extensions/whiteboard/test/routes.test.ts` (add one case)

**Interfaces:**

- Consumes: `upsertElement(scope, row): Promise<{ok: true; row: ElementRow} | {ok: false; current: ElementRow}>` (unchanged), `ElementRow = {room: string; elementId: string; data: JsonValue; version: number}`.
- Produces: `upsertElements(scope: ElementScope, rows: ElementRow[]): Promise<ElementRow[]>` now returning the **authoritative row per input** (accepted row when the write wins, current stored row when it loses) — one entry per input row, order preserved. Bulk route `PUT /elements/:scope/bulk` returns `{rows: ElementRow[]}`.

- [x] **Step 1: Write the failing store test**

Add to `packages/extensions/whiteboard/test/store.test.ts`, inside the `describe('whiteboard store', …)` block (after the existing `bulk upsert and bulk delete` test):

```ts
it('bulk upsert returns the authoritative row per input, winner on conflict', async () => {
  const store = await open()
  await store.upsertElement('live', {room: 'r1', elementId: 'e1', data: {v: 1}, version: 5})
  const resolved = await store.upsertElements('live', [
    {room: 'r1', elementId: 'e1', data: {v: 2}, version: 3},
    {room: 'r1', elementId: 'e2', data: {v: 9}, version: 1},
  ])
  expect(resolved).toHaveLength(2)
  expect(resolved[0]).toEqual({room: 'r1', elementId: 'e1', data: {v: 1}, version: 5})
  expect(resolved[1]).toEqual({room: 'r1', elementId: 'e2', data: {v: 9}, version: 1})
})
```

- [x] **Step 2: Write the failing routes test**

Add to `packages/extensions/whiteboard/test/routes.test.ts`, inside the `describe('whiteboard routes', …)` block (after the `element upsert 409s…` test). It reuses the file's existing `put` helper and `base`:

```ts
it('bulk PUT echoes the authoritative row per input, winner on conflict', async () => {
  expect((await put('/elements/live', {room: 'rb', elementId: 'b1', data: {v: 1}, version: 5})).status).toBe(200)
  const response = await put('/elements/live/bulk', {
    rows: [
      {room: 'rb', elementId: 'b1', data: {v: 2}, version: 3},
      {room: 'rb', elementId: 'b2', data: {v: 9}, version: 1},
    ],
  })
  expect(response.status).toBe(200)
  const {rows} = (await response.json()) as {rows: unknown[]}
  expect(rows).toHaveLength(2)
  expect(rows[0]).toEqual({room: 'rb', elementId: 'b1', data: {v: 1}, version: 5})
  expect(rows[1]).toEqual({room: 'rb', elementId: 'b2', data: {v: 9}, version: 1})
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts test/routes.test.ts`
Expected: FAIL — store returns `[e2]` (length 1, loser dropped); routes returns `{written: 1}` (no `rows`).

- [x] **Step 4: Change `upsertElements` to return the authoritative row per input**

In `packages/extensions/whiteboard/src/server/db/store.ts`, replace the `upsertElements` helper (currently lines 75-82):

```ts
const upsertElements = async (scope: ElementScope, rows: ElementRow[]): Promise<ElementRow[]> => {
  const resolved: ElementRow[] = []
  for (const row of rows) {
    const outcome = await upsertElement(scope, row)
    resolved.push(outcome.ok ? outcome.row : outcome.current)
  }
  return resolved
}
```

- [x] **Step 5: Change the bulk route to return rows**

In `packages/extensions/whiteboard/src/server/routes.ts`, replace the bulk route (currently lines 99-102):

```ts
app.put('/elements/:scope/bulk', async (event) => {
  const {rows} = await readValidatedBody(event, z.object({rows: z.array(elementRow)}))
  return {rows: await store.upsertElements(scopeOf(event), rows)}
})
```

- [x] **Step 6: Run the server tests + typecheck**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts test/routes.test.ts`
Expected: PASS (the two new cases plus all pre-existing store/routes cases, incl. the unchanged `bulk upsert and bulk delete cover the pending drain` which still sees length 2 for two fresh rows).

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: clean.

- [x] **Step 7: Commit**

```bash
git add packages/extensions/whiteboard/src/server/db/store.ts packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/store.test.ts packages/extensions/whiteboard/test/routes.test.ts
git commit -m "feat(whiteboard): bulk element route echoes per-input version winners" -- packages/extensions/whiteboard/src/server/db/store.ts packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/store.test.ts packages/extensions/whiteboard/test/routes.test.ts
```

---

### Task 2: Client — paced element writer + island wiring + real-browser IT

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/db.tsx` (imports line 3; `createWhiteboardDb` body; `elementCollection` factory ~119-166; `dispose` ~209)
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (`writeLocal` ~100-114; `commitStep.write` ~150-159)
- Test: `packages/extensions/whiteboard/test/canvas-drag-batching.it.test.ts` (create)

**Interfaces:**

- Consumes: from Task 1, `PUT /elements/:scope/bulk` → `{rows: ElementRow[]}`. From `@tanstack/solid-db`: `createPacedMutations<TVariables, T>({onMutate, mutationFn, strategy}) => (variables) => Transaction`, `throttleStrategy({wait, leading?, trailing?})`. From the collection: `collection.has(key)`, `collection.update(key, draft => …)`, `collection.insert(row)`, `collection.utils.writeUpsert(row)`, `collection.utils.writeBatch(fn)`.
- Produces: `db.canvasElements` / `db.canvasDraftElements` gain a `write(row: ElementRow): void` method (the sole insert/update entry). `createWhiteboardDb`'s `dispose` also runs every element strategy's `cleanup`.

- [x] **Step 1: Write the failing IT**

Create `packages/extensions/whiteboard/test/canvas-drag-batching.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

type CanvasElement = {x: number; width: number; height: number}
const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
  ((await api.callTool('canvas.read', {})) as {elements: CanvasElement[]}).elements

const readXs = async (api: ExtensionTestApi): Promise<number[]> =>
  (await readElements(api)).map((element) => element.x).sort((left, right) => left - right)

const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

const drawRectangle = async (page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> => {
  await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, {steps: 10})
  await page.mouse.up()
}

const putCounts = (page: Page): {single: number; bulk: number} => {
  const counts = {single: 0, bulk: 0}
  page.on('request', (request) => {
    if (request.method() !== 'PUT') return
    const {pathname} = new URL(request.url())
    if (pathname === '/elements/live/bulk') return void (counts.bulk += 1)
    if (pathname === '/elements/live') counts.single += 1
  })
  return counts
}

const dragBursts = async (page: Page, fromX: number, y: number, dx: number): Promise<void> => {
  await page.mouse.move(fromX, y)
  await page.mouse.down()
  for (let burst = 1; burst <= 6; burst += 1) {
    await page.mouse.move(fromX + burst * dx, y, {steps: 16})
    await page.waitForTimeout(70)
  }
  await page.mouse.up()
}

test('a single-element drag coalesces per-frame writes into few throttled PUTs', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 120, cy - 80, cx + 120, cy + 80)
    await expect
      .poll(async () => (await readElements(api))[0]?.width ?? 0, {timeout: 15_000, interval: 250})
      .toBeGreaterThan(100)
    const startX = (await readElements(api))[0]?.x ?? 0
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    const counts = putCounts(api.page)
    await dragBursts(api.page, cx, cy, 40)
    await expect
      .poll(async () => ((await readElements(api))[0]?.x ?? startX) - startX, {timeout: 8_000, interval: 250})
      .toBeGreaterThan(180)
    expect(counts.single).toBeGreaterThan(1)
    expect(counts.single).toBeLessThanOrEqual(15)
    expect(counts.bulk).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('a multi-select drag collapses to bulk PUTs, not a single-PUT storm', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 220, cy - 40, cx - 120, cy + 40)
    await drawRectangle(api.page, cx + 120, cy - 40, cx + 220, cy + 40)
    await expect.poll(async () => (await readElements(api)).length, {timeout: 15_000, interval: 250}).toBe(2)
    const startXs = await readXs(api)
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    await api.page.mouse.move(cx - 300, cy - 120)
    await api.page.mouse.down()
    await api.page.mouse.move(cx + 300, cy + 140, {steps: 10})
    await api.page.mouse.up()
    const counts = putCounts(api.page)
    await dragBursts(api.page, cx - 170, cy, 26)
    await expect
      .poll(
        async () => {
          const xs = await readXs(api)
          return xs.length === 2 && xs[0]! - startXs[0]! > 100 && xs[1]! - startXs[1]! > 100
        },
        {timeout: 8_000, interval: 250},
      )
      .toBe(true)
    expect(counts.bulk).toBeGreaterThan(0)
    expect(counts.single).toBeLessThanOrEqual(2)
  } finally {
    await api.dispose()
  }
})
```

Note: the two `xs[0]! - startXs[0]!` reads are inside the test's poll predicate. To honor the no-non-null-assertion rule, narrow instead — the plan's Step 7 verifies; if oxlint flags them, rewrite the predicate as:

```ts
const xs = await readXs(api)
const [x0, x1] = xs
const [s0, s1] = startXs
return x0 !== undefined && x1 !== undefined && s0 !== undefined && s1 !== undefined && x0 - s0 > 100 && x1 - s1 > 100
```

- [x] **Step 2: Build extension + widget, run the IT to verify it fails**

Run: `pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/widget`
Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/canvas-drag-batching.it.test.ts`
Expected: FAIL — with today's per-frame path the single-drag test sees `counts.single` far above 15 (one PUT per rapid move), and the multi-select test sees `counts.bulk === 0`.

- [x] **Step 3: Add the paced-mutation imports**

In `packages/extensions/whiteboard/src/client/db.tsx`, extend the `@tanstack/solid-db` import (line 3):

```ts
import {createCollection, createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
```

- [x] **Step 4: Add a `disposers` array to `createWhiteboardDb`**

In `db.tsx`, immediately after `const source = new EventSource(...)` near the top of `createWhiteboardDb` body, add:

```ts
const disposers: Array<() => void> = []
```

- [x] **Step 5: Replace the element collection factory with the paced writer**

In `db.tsx`, replace the whole `elementCollection` factory (currently ~119-166) with:

```ts
const elementCollection = (scope: 'live' | 'draft', table: 'canvasElements' | 'canvasDraftElements') => {
  const rows = z.array(elementRow)
  const change = changeOf(elementRow)
  const conflict = z.object({current: elementRow})
  const bulkResult = z.object({rows: z.array(elementRow)})
  const putElement = async (row: ElementRow): Promise<void> => {
    const response = await request(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})
    const saved =
      response.status === 409 ? conflict.parse(await response.json()).current : elementRow.parse(await response.json())
    collection.utils.writeUpsert(saved)
  }
  const collection = createCollection(
    queryCollectionOptions({
      queryKey: [table, room],
      queryClient,
      queryFn: async () =>
        rows.parse(await (await request(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)).json()),
      getKey: (row: ElementRow) => row.elementId,
      onDelete: async ({transaction}) => {
        await request(`${base}/elements/${scope}/bulk-delete`, {
          method: 'POST',
          body: JSON.stringify({room, elementIds: transaction.mutations.map((mutation) => String(mutation.key))}),
        })
        return {refetch: false}
      },
    }),
  )
  const strategy = throttleStrategy({wait: 50, leading: true, trailing: true})
  disposers.push(strategy.cleanup)
  const pacedWrite = createPacedMutations<ElementRow, ElementRow>({
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
      const modified = transaction.mutations.map((mutation) => mutation.modified)
      const [first] = modified
      if (modified.length === 1 && first) return void (await putElement(first))
      const response = await request(`${base}/elements/${scope}/bulk`, {
        method: 'PUT',
        body: JSON.stringify({rows: modified}),
      })
      const saved = bulkResult.parse(await response.json()).rows
      collection.utils.writeBatch(() => saved.forEach((row) => collection.utils.writeUpsert(row)))
    },
  })
  const onReady = deferUntilReady(collection)
  source.addEventListener(table, (event) => {
    const data = messageData(event)
    if (!data) return
    const message = change.parse(JSON.parse(data))
    onReady(() => {
      if (message.type === 'delete') return void collection.utils.writeDelete(message.key)
      collection.utils.writeUpsert(message.row)
    })
  })
  return Object.assign(collection, {write: (row: ElementRow): void => void pacedWrite(row)})
}
```

- [x] **Step 6: Run element strategy cleanup in `dispose`**

In `db.tsx`, change the returned `dispose` (currently `dispose: () => source.close()`) to:

```ts
    dispose: () => {
      disposers.forEach((cleanup) => cleanup())
      source.close()
    },
```

- [x] **Step 7: Typecheck the client change**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: clean. If oxlint's `no-non-null-assertion` flags the IT's poll predicate, apply the narrowed form shown in Step 1's note. If `createPacedMutations<ElementRow, ElementRow>` mistypes `mutation.modified`, confirm both generics are `ElementRow` (first = `onMutate` variables, second = transaction row type).

- [x] **Step 8: Point `writeLocal` at the paced writer**

In `packages/extensions/whiteboard/src/canvas/island.tsx`, replace the body of `writeLocal` (currently ~100-114):

```ts
const writeLocal = (next: readonly SceneElement[]): void => {
  if (guard.applyingRemote) return
  const changed = next.filter((element) => (versions.get(element.id) ?? -1) < element.version)
  if (!changed.length) return
  changed.forEach((element) => {
    versions.set(element.id, element.version)
    db.canvasElements.write({room: props.room, elementId: element.id, data: asJson(element), version: element.version})
  })
}
```

- [x] **Step 9: Point the commit step at the paced writer**

In `island.tsx`, replace the `write:` field of `commitStep` (currently the `has`/`update`/`insert` branch ~150-159) with:

```ts
      write: (): void =>
        db.canvasElements.write({
          room: props.room,
          elementId: draft.elementId,
          data: draft.data,
          version: draft.version,
        }),
```

- [x] **Step 10: Typecheck, rebuild, run the IT**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: clean (no remaining `db.canvasElements.update`/`.insert`/`.has` callers in `island.tsx`; confirm with `grep -n "canvasElements\.\(insert\|update\|has\)" packages/extensions/whiteboard/src/canvas/island.tsx` → no matches).

Run: `pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/widget`
Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/canvas-drag-batching.it.test.ts`
Expected: PASS — `counts.single` in (1, 15] for the single drag, `counts.bulk > 0` and `counts.single <= 2` for the multi-select drag, both elements moved > 100px.

- [x] **Step 11: Run the full whiteboard suite (behavior-parity gate)**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run`
Expected: the pre-existing 53 tests still pass, plus the 2 new server cases (Task 1) and 2 new IT cases. Pay special attention to `canvas-drag.it.test.ts`, `canvas-autocommit.it.test.ts`, `canvas-commit.it.test.ts`, `canvas-draft.it.test.ts` — they exercise `writeLocal` and the commit path now routed through `write()`.

- [x] **Step 12: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. (Removing `onInsert`/`onUpdate` should not orphan anything — `putElement` is still used by `mutationFn`; the single `PUT /elements/:scope` route stays reachable via `mutationFn`'s single-element branch and `routes.test.ts`.)

- [x] **Step 13: Commit**

```bash
git add packages/extensions/whiteboard/src/client/db.tsx packages/extensions/whiteboard/src/canvas/island.tsx packages/extensions/whiteboard/test/canvas-drag-batching.it.test.ts
git commit -m "feat(whiteboard): coalesce element drag writes via tanstack paced mutations" -- packages/extensions/whiteboard/src/client/db.tsx packages/extensions/whiteboard/src/canvas/island.tsx packages/extensions/whiteboard/test/canvas-drag-batching.it.test.ts
```

---

## Verification (whole change)

- `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard` clean.
- `pnpm --filter @conciv/extension-whiteboard exec vitest run` — all green (55 → 57 tests).
- `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED.
- Live `verify` leg: `pnpm dev`, open the whiteboard in two tabs, drag one element in tab A; in tab A's Network panel confirm ~1 `PUT /elements/live` per 50ms window instead of per frame, and confirm tab B follows the motion smoothly. Multi-select two elements and drag; confirm `PUT /elements/live/bulk` fires (not a single-PUT storm) and both elements follow in tab B.
