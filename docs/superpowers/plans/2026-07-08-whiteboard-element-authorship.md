# Whiteboard Element Authorship + AI Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who authored every canvas element (owner + lastEditedBy, per-person), and make the AI ask for approval before it modifies or deletes a human-authored element — enforced at the tool handler, reusing the approval pipeline already ported from assistant-ui.

**Architecture:** Elements gain author columns. The store keeps `owner` immutable after first insert and updates `lastEditedBy` on every write. The `canvas.update`/`canvas.delete`/`canvas.clear` handlers read the target element's `ownerKind`; when it is `'human'` they fire an approval via a new ~12-line core hook (`PermissionGate.request` exposed through `ServerApi.approvals`) that plugs into the existing `injectApproval` → `ApprovalModal` → `respondApproval` → `/permission-decision` pipeline. On deny they refuse; on allow they proceed. AI edits to its own (`ownerKind==='ai'`) elements are silent.

**Explicitly out of scope (deferred):** store-level authorization, caller/authority arguments, HTTP capability tokens, Hono auth middleware, and any defense against the AI reaching the DB over raw HTTP/filesystem. A proper core-level security mechanism comes later; the raw-FS/HTTP bypass is tracked in issue #47. This feature is ownership + approval only.

**Tech Stack:** TypeScript (strict, NodeNext), drizzle-orm + `@libsql/client`, zod, `@conciv/extension`, Hono, Solid + Excalidraw (client), vitest + Playwright/Chromium.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (the `conciv/no-comments` lint autofix DELETES them).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Strict TS: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No `any`/`as`/`@ts-ignore`/non-null `!`.
- No barrel files — import from source. Spell identifiers out fully.
- Build/typecheck/test via turbo. `pnpm test` builds first. Rebuild the widget bundle before widget ITs; use `browser.newPage()`; wait for `domcontentloaded`, never `networkidle`.
- Every Solid package `vitest.config.ts` pins `test: {environment: 'node'}`.
- zod validates every HTTP boundary. Real infra in tests: no mocks/stubs/jsdom.
- Commits: pathspec form `git commit -m "…" -- <paths>`; verify `git config --local user.email` is the omridevk noreply before committing; end messages with the `Co-Authored-By: Claude Opus 4.8` trailer.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` and fix anything INTRODUCED.
- **Caveman grep hazard:** Bash/grep tool output mangles identifiers (`@excalidraw`→`@ln/ln`, methods→`n`). Use Read/editor for exact symbol names, never trust grep output for a symbol.

## Terminology

- **author descriptor** = `{kind: 'human' | 'ai', id: string | null, name: string | null, model: string | null}`.
- **owner** = author descriptor set once on first insert, immutable thereafter.
- **lastEditedBy** = author descriptor updated on every write.

---

## Task 1: Author columns on element schema + rows

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/db/schema.ts` (canvasElements, canvasDraftElements)
- Modify: `packages/extensions/whiteboard/src/shared/rows.ts` (elementRow)
- Test: `packages/extensions/whiteboard/test/rows.test.ts`

**Interfaces:**
- Produces: `elementRow` zod schema with `ownerKind`, `ownerId`, `ownerName`, `ownerModel`, `lastEditedByKind`, `lastEditedById`, `lastEditedByName`, `lastEditedByModel`; `type ElementRow = z.infer<typeof elementRow>`.

- [ ] **Step 1: Write the failing test** — append to `test/rows.test.ts`:

```ts
import {elementRow} from '../src/shared/rows.js'

describe('elementRow author fields', () => {
  it('accepts an ai-owned row and rejects a missing ownerKind', () => {
    const ok = elementRow.safeParse({
      room: 'r', elementId: 'e', data: {}, version: 1,
      ownerKind: 'ai', ownerId: null, ownerName: null, ownerModel: 'opus',
      lastEditedByKind: 'ai', lastEditedById: null, lastEditedByName: null, lastEditedByModel: 'opus',
    })
    expect(ok.success).toBe(true)
    const bad = elementRow.safeParse({room: 'r', elementId: 'e', data: {}, version: 1})
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/rows.test.ts`
Expected: FAIL — the second `safeParse` currently succeeds (schema too loose).

- [ ] **Step 3: Add columns to `schema.ts`** in BOTH `canvasElements` and `canvasDraftElements`, before the `(table) => [...]` argument:

```ts
    ownerKind: text('owner_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    ownerId: text('owner_id'),
    ownerName: text('owner_name'),
    ownerModel: text('owner_model'),
    lastEditedByKind: text('last_edited_by_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    lastEditedById: text('last_edited_by_id'),
    lastEditedByName: text('last_edited_by_name'),
    lastEditedByModel: text('last_edited_by_model'),
```

- [ ] **Step 4: Extend `elementRow` in `rows.ts`:**

```ts
export const elementRow = z.object({
  room: z.string(),
  elementId: z.string(),
  data: json,
  version: z.number().int(),
  ownerKind: z.enum(['human', 'ai']),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  ownerModel: z.string().nullable(),
  lastEditedByKind: z.enum(['human', 'ai']),
  lastEditedById: z.string().nullable(),
  lastEditedByName: z.string().nullable(),
  lastEditedByModel: z.string().nullable(),
})
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/rows.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(whiteboard): author columns on canvas element schema + rows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/db/schema.ts \
  packages/extensions/whiteboard/src/shared/rows.ts \
  packages/extensions/whiteboard/test/rows.test.ts
```

---

## Task 2: Drizzle migration for the new columns

**Files:**
- Create: `packages/extensions/whiteboard/drizzle/<generated>.sql` (+ `drizzle/meta/*`)

**Interfaces:**
- Consumes: schema from Task 1.
- Produces: a migration applied by `createStore` on open; existing rows backfill `owner_kind='human'`, `last_edited_by_kind='human'` via the column defaults.

- [ ] **Step 1: Generate the migration**

Run: `pnpm --filter @conciv/whiteboard exec drizzle-kit generate`
Expected: a new `drizzle/NNNN_*.sql` adding 8 columns to `canvas_elements` and `canvas_draft_elements`.

- [ ] **Step 2: Verify the SQL** — confirm it `ALTER TABLE`s both tables and the `*_kind` columns carry `DEFAULT 'human'`. No manual edit expected.

- [ ] **Step 3: Run the store suite to confirm the migration applies**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/extensions/whiteboard/drizzle
git commit -m "feat(whiteboard): migration for element author columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- packages/extensions/whiteboard/drizzle
```

---

## Task 3: Store keeps owner immutable + updates lastEditedBy

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/db/store.ts` (`upsertElement` only)
- Test: `packages/extensions/whiteboard/test/store.test.ts`

**Interfaces:**
- Consumes: `ElementRow` (Task 1). Signatures UNCHANGED (no caller param) — this is the descoped design.
- Produces: `upsertElement` preserves `owner*` on update and writes `lastEditedBy*` every time.

- [ ] **Step 1: Write the failing test** — append to `test/store.test.ts` (the file already defines `open()`):

```ts
const authored = (id: string, kind: 'human' | 'ai') => ({
  room: 'r', elementId: id, data: {n: 1}, version: 1,
  ownerKind: kind, ownerId: 'u1', ownerName: 'Guest 00', ownerModel: kind === 'ai' ? 'opus' : null,
  lastEditedByKind: kind, lastEditedById: 'u1', lastEditedByName: 'Guest 00', lastEditedByModel: kind === 'ai' ? 'opus' : null,
})

describe('element owner immutability', () => {
  it('preserves owner on update and advances lastEditedBy', async () => {
    const store = await open()
    await store.upsertElement('live', authored('e1', 'human'))
    const edit = {...authored('e1', 'ai'), version: 2, data: {n: 2}}
    const outcome = await store.upsertElement('live', edit)
    expect(outcome.ok).toBe(true)
    const rows = await store.listElements('live', 'r')
    expect(rows[0]?.ownerKind).toBe('human')
    expect(rows[0]?.ownerName).toBe('Guest 00')
    expect(rows[0]?.lastEditedByKind).toBe('ai')
    expect(rows[0]?.version).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: FAIL — current `set` clause omits `lastEditedBy*` (stays `human`), or the returned row echoes the incoming `owner`.

- [ ] **Step 3: Update `upsertElement` in `store.ts`.** Keep the signature `(scope, row)`. Extend the `onConflictDoUpdate.set` to include `lastEditedBy*` but NOT `owner*`, and make the emitted/returned row carry the preserved owner:

```ts
  const upsertElement = async (scope: ElementScope, row: ElementRow): Promise<ElementUpsert> => {
    const table = elementTable(scope)
    const current = await db
      .select()
      .from(table)
      .where(and(eq(table.room, row.room), eq(table.elementId, row.elementId)))
      .get()
    if (current && current.version >= row.version) return {ok: false, current}
    await db
      .insert(table)
      .values(row)
      .onConflictDoUpdate({
        target: [table.room, table.elementId],
        set: {
          data: row.data,
          version: row.version,
          lastEditedByKind: row.lastEditedByKind,
          lastEditedById: row.lastEditedById,
          lastEditedByName: row.lastEditedByName,
          lastEditedByModel: row.lastEditedByModel,
        },
      })
    const saved: ElementRow = current
      ? {...row, ownerKind: current.ownerKind, ownerId: current.ownerId, ownerName: current.ownerName, ownerModel: current.ownerModel}
      : row
    emit({table: elementTableName(scope), room: row.room, type: 'upsert', row: saved})
    return {ok: true, row: saved}
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the package** (signatures unchanged, so it should still compile)

Run: `pnpm turbo run typecheck --filter=@conciv/whiteboard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(whiteboard): store preserves element owner, advances lastEditedBy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/db/store.ts \
  packages/extensions/whiteboard/test/store.test.ts
```

---

## Task 4: Core approval-trigger hook (`PermissionGate.request` → `ServerApi.approvals`)

**Files:**
- Modify: `packages/core/src/api/chat/permission.ts` (`PermissionGate` type, `makePermissionGate`)
- Modify: `packages/extension/src/types.ts` (`ServerApi`)
- Modify: `packages/core/src/app.ts` (pass `approvals` into `extension.__server` at the mount call ~line 173)
- Test: `packages/core/test/permission-request.test.ts`

**Interfaces:**
- Produces:
  - `PermissionGate.request(sessionId: string, detail: {toolName: string; input: unknown; toolCallId?: string}): Promise<boolean>`
  - `ServerApi.approvals: {request(sessionId: string, detail: {toolName: string; input: unknown}): Promise<boolean>}`
- Reuses the existing `injectApproval` → `ApprovalModal` → `respondApproval` → `/permission-decision` pipeline (the assistant-ui-shaped approval flow already in `packages/widget/src/shell/approval-modal.tsx` and `packages/protocol/src/ui-types.ts`). No new UI.

- [ ] **Step 1: Read `packages/core/src/runtime/ui-bus.ts`** to confirm `makeUiBus` and the exact `injectApproval` + subscription signatures (grep mangles them). Confirm how a subscriber receives the emitted `ApprovalRequest` so the test can capture the `approvalId`.

- [ ] **Step 2: Write the failing test** `packages/core/test/permission-request.test.ts`. Use the real `makeUiBus`; subscribe to the session channel; assert that `gate.request` injects an approval and that resolving it with the captured `approvalId` settles the promise to the decision:

```ts
import {describe, expect, it} from 'vitest'
import {makePermissionGate} from '../src/api/chat/permission.js'
import {makeUiBus} from '../src/runtime/ui-bus.js'

describe('permission gate request', () => {
  it('injects an approval and resolves to the user decision', async () => {
    const uiBus = makeUiBus()
    const sessionId = 's1'
    let capturedId = ''
    uiBus.run(sessionId).subscribe((event: {value?: {approval?: {id: string}}}) => {
      if (event.value?.approval?.id) capturedId = event.value.approval.id
    })
    const gate = makePermissionGate(uiBus, {timeoutMs: 2000})
    const decision = gate.request(sessionId, {toolName: 'canvas.update', input: {elementId: 'e'}})
    await new Promise((r) => setTimeout(r, 20))
    expect(capturedId).not.toBe('')
    gate.resolve(capturedId, true)
    expect(await decision).toBe(true)
  })
})
```

Note: adjust the subscription call to the ACTUAL ui-bus API discovered in Step 1 (the mangled grep showed `run`/`inject`/`injectApproval` — confirm names before finalizing).

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @conciv/core exec vitest run test/permission-request.test.ts`
Expected: FAIL — `gate.request` is not a function.

- [ ] **Step 4: Add `request` to `makePermissionGate`** in `permission.ts` (reuse the existing `pending` + `uiBus`), and add it to the `PermissionGate` type:

```ts
  async function request(
    sessionId: string,
    detail: {toolName: string; input: unknown; toolCallId?: string},
  ): Promise<boolean> {
    const approvalId = randomUUID()
    const injected = uiBus.injectApproval(sessionId, {
      toolCallId: detail.toolCallId ?? approvalId,
      toolName: detail.toolName,
      input: detail.input,
      approvalId,
    })
    if (!injected) return false
    try {
      return await pending.await(approvalId, timeoutMs)
    } catch {
      return false
    }
  }

  return {decide, resolve: pending.resolve, request}
```

Add to the type:

```ts
export type PermissionGate = {
  decide(toolName: string, toolInput: unknown, sessionId: string, toolUseId: string): Promise<'allow' | 'deny'>
  resolve(approvalId: string, approved: boolean): void
  request(sessionId: string, detail: {toolName: string; input: unknown; toolCallId?: string}): Promise<boolean>
}
```

- [ ] **Step 5: Extend `ServerApi` in `packages/extension/src/types.ts`:**

```ts
export type ServerApi<Config> = {
  config: Config
  cwd: string
  sessions: ServerSessions
  harness: ServerHarness
  approvals: {request(sessionId: string, detail: {toolName: string; input: unknown}): Promise<boolean>}
}
```

- [ ] **Step 6: Wire it at the extension mount in `app.ts`** (the `extension.__server?.({...})` call; confirm the current line, ~173):

```ts
      const result = await extension.__server?.({
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        cwd: opts.cwd,
        sessions: serverSessions,
        harness: serverHarness,
        approvals: {request: (sessionId, detail) => gate.request(sessionId, detail)},
      })
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm --filter @conciv/core exec vitest run test/permission-request.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck core + extension**

Run: `pnpm turbo run typecheck --filter=@conciv/core --filter=@conciv/extension`
Expected: PASS. (Any other extension that builds a `ServerApi` mock in tests may need the new `approvals` field — fix such call sites; grep `sessions:` + `harness:` in test files to find them.)

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(core): let extensions request an approval (reuses existing pipeline)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/core/src/api/chat/permission.ts \
  packages/core/src/app.ts \
  packages/extension/src/types.ts \
  packages/core/test/permission-request.test.ts
```

---

## Task 5: Handlers ask for approval when the target is human-owned

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/context.ts` (`WhiteboardToolContext` gains `requestApproval`)
- Modify: `packages/extensions/whiteboard/src/server.ts` (build `requestApproval` from `server.approvals`; add to context)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/server.ts` (`canvas.update`, `canvas.delete`, `canvas.clear`)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/def.ts` (drop static `approval: 'ask'` on delete/clear)
- Test: `packages/extensions/whiteboard/test/canvas-guard.it.test.ts`

**Interfaces:**
- Consumes: `ServerApi.approvals.request` (Task 4).
- Produces: `WhiteboardToolContext.requestApproval(request: ToolRequest, detail: {toolName: string; input: unknown}) => Promise<boolean>`.

- [ ] **Step 1: Extend `context.ts`:**

```ts
export type WhiteboardToolContext = {
  cwd: string
  store: Store
  sessionId: (request: ToolRequest) => string
  room: (request: ToolRequest) => string
  model: (request: ToolRequest) => string | null
  requestApproval: (request: ToolRequest, detail: {toolName: string; input: unknown}) => Promise<boolean>
}
```

- [ ] **Step 2: Build `requestApproval` in `server.ts`** inside the `.server(async (server) => {...})` body, after `store` is created, and add it to the returned `context`:

```ts
  const requestApproval = async (request: ToolRequest, detail: {toolName: string; input: unknown}) => {
    if (!request.sessionId) return false
    return server.approvals.request(request.sessionId, detail)
  }
```

- [ ] **Step 3: Write the failing test `test/canvas-guard.it.test.ts`.** First READ `test/canvas-it-helpers.ts` to reuse how it builds `ctx` + a `ToolRequest`; stub `requestApproval` per-case. Assert:
  - AI `canvas.update` on a human-owned live element with `requestApproval` returning `false` → `{updated: false, blocked: true}`, element unchanged (version + data).
  - Same with `requestApproval` returning `true` → `{updated: true}`, row `lastEditedByKind==='ai'`, `ownerKind==='human'`.
  - AI `canvas.update` on an ai-owned element → `{updated: true}` and `requestApproval` NOT called.

Seed elements by calling `store.upsertElement('live', authored(...))` (reuse the `authored` helper shape from Task 3).

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/canvas-guard.it.test.ts`
Expected: FAIL — handler does not gate / does not set lastEditedBy.

- [ ] **Step 5: Update `canvas.update` in `tool/canvas/server.ts`:**

```ts
const canvasUpdateTool = defineTool<typeof CanvasUpdateInput, WhiteboardToolContext>(canvasUpdateDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draft = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
    const live = draft
      ? undefined
      : (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
    const current = draft ?? live
    if (!current) return {updated: false}
    if (current.ownerKind === 'human' && !(await ctx.requestApproval(request, {toolName: 'canvas.update', input})))
      return {updated: false, blocked: true}
    const scope = draft ? 'draft' : 'live'
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    await ctx.store.upsertElement(scope, {
      ...current,
      data,
      version: current.version + 1,
      lastEditedByKind: 'ai',
      lastEditedById: null,
      lastEditedByName: null,
      lastEditedByModel: ctx.model(request),
    })
    return {updated: true}
  },
)
```

- [ ] **Step 6: Update `canvas.delete`:**

```ts
const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draftHit = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
    const current =
      draftHit ?? (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
    if (!current) return {deleted: null}
    if (current.ownerKind === 'human' && !(await ctx.requestApproval(request, {toolName: 'canvas.delete', input})))
      return {deleted: null, blocked: true}
    const scope = draftHit ? 'draft' : 'live'
    await ctx.store.deleteElement(scope, room, input.elementId)
    return {deleted: input.elementId}
  },
)
```

- [ ] **Step 7: Update `canvas.clear`** — one approval if any live element is human-owned:

```ts
const canvasClearTool = defineTool<typeof CanvasClearInput, WhiteboardToolContext>(canvasClearDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const elements = await ctx.store.listElements('live', room)
    const hasHuman = elements.some((row) => row.ownerKind === 'human')
    if (hasHuman && !(await ctx.requestApproval(request, {toolName: 'canvas.clear', input: {}})))
      return {cleared: 0, blocked: true}
    await ctx.store.deleteElements(
      'live',
      room,
      elements.map((row) => row.elementId),
    )
    for (const row of await ctx.store.db.select().from(canvasPending).where(eq(canvasPending.room, room)))
      await ctx.store.deletePending(row.id)
    return {cleared: elements.length}
  },
)
```

- [ ] **Step 8: Drop static approval in `def.ts`** — remove the `approval: 'ask'` line from `canvasDeleteDef` and `canvasClearDef` (and the now-unneeded `as const` if it was only for that), and trim the "user is asked to confirm" wording from their `promptSnippet`. The conditional in-handler approval replaces the blanket prompt (AI stops being prompted for its own drawings).

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/canvas-guard.it.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck the package**

Run: `pnpm turbo run typecheck --filter=@conciv/whiteboard`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git commit -m "feat(whiteboard): AI asks approval before editing/deleting human elements

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/context.ts \
  packages/extensions/whiteboard/src/server.ts \
  packages/extensions/whiteboard/src/tool/canvas/server.ts \
  packages/extensions/whiteboard/src/tool/canvas/def.ts \
  packages/extensions/whiteboard/test/canvas-guard.it.test.ts
```

---

## Task 6: Browser stamps author on element writes

**Files:**
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (`writeLocal` on Excalidraw change → human author; draft-commit conversion → ai author)
- Modify: `packages/extensions/whiteboard/src/client/whiteboard-collection.ts` (ensure author fields flow through the PUT/bulk bodies)
- Reference: `packages/extensions/whiteboard/src/client/overlay.tsx` (existing guest identity `{id, name}`)

**Interfaces:**
- Consumes: the guest identity in `overlay.tsx`; `elementRow` (Task 1).
- Produces: every client element write carries an `owner`/`lastEditedBy` descriptor. No capability header (out of scope).

- [ ] **Step 1: Read the three files** (grep mangles symbols) to locate: the guest-identity factory in `overlay.tsx`; `writeLocal(elements)` and the draft-commit `bulk` write in `island.tsx`; how rows are built before PUT in `whiteboard-collection.ts`.

- [ ] **Step 2: Stamp human-origin writes** — where the Excalidraw `onChange`/`writeLocal` path builds `ElementRow`s, set `owner*` (meaningful only on insert; the store preserves it) and `lastEditedBy*` to the guest identity: `{kind:'human', id: guest.id, name: guest.name, model: null}`.

- [ ] **Step 3: Stamp AI-origin writes** — in the draft→live commit-conversion path, set `owner*`/`lastEditedBy*` to `{kind:'ai', id: null, name: null, model: <session/pending model>}`.

- [ ] **Step 4: Rebuild widget + run existing canvas ITs** (they exercise these write paths):

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/whiteboard exec vitest run test/canvas-commit.it.test.ts test/canvas-draft.it.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(whiteboard): client stamps element author (human vs ai)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/canvas/island.tsx \
  packages/extensions/whiteboard/src/client/whiteboard-collection.ts \
  packages/extensions/whiteboard/src/client/overlay.tsx
```

---

## Task 7: Author chip on the selected element

**Files:**
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx`
- Reference: `packages/extensions/whiteboard/src/client/ui.tsx` (`Avatar`)
- Test: `packages/extensions/whiteboard/test/element-author-chip.it.test.ts`

- [ ] **Step 1: Read `island.tsx`** to find selection state (Excalidraw `getAppState().selectedElementIds`) and the overlay layer to mount a chip.

- [ ] **Step 2: Render a chip** when exactly one element is selected: look up its row in the element collection; show `Avatar` + label (`ownerName ?? 'Guest'` for human; `AI · ${ownerModel}` for ai). Thin styled wrapper per the ui-kit convention; no `[prop:value]` pileups.

- [ ] **Step 3: Rebuild widget + write the browser IT**: human draws → select → chip shows the guest name. Assert via `getByText`/role, never CSS.

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/whiteboard exec vitest run test/element-author-chip.it.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(whiteboard): author chip on selected canvas element

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/canvas/island.tsx \
  packages/extensions/whiteboard/test/element-author-chip.it.test.ts
```

---

## Task 8: End-to-end approval IT + full verification

**Files:**
- Create: `packages/extensions/whiteboard/test/element-guard-e2e.it.test.ts`

- [ ] **Step 1: Write the browser E2E** driving the real widget + agent tools (READ `canvas-it-helpers.ts` + an existing `*.it.test.ts` to reuse the widget-boot + agent-drive harness):
  - Human draws an element; AI `canvas.draw` + `canvas.commit` a second; assert two rows with `ownerKind` `human` and `ai`.
  - AI `canvas.update` on the human element → the approval prompt appears (assert `ApprovalModal` by role/text); deny → element unchanged; repeat + allow → patch applied, `lastEditedByKind==='ai'`, `ownerKind==='human'`.
  - AI `canvas.update` on its own element → no prompt.

- [ ] **Step 2: Rebuild widget + run**

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/whiteboard exec vitest run test/element-guard-e2e.it.test.ts`
Expected: PASS.

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: PASS.

- [ ] **Step 4: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: no INTRODUCED findings; fix any that appear.

- [ ] **Step 5: Add a changeset:**

```bash
cat > .changeset/whiteboard-element-authorship.md <<'EOF'
---
'@conciv/whiteboard': patch
---

Canvas elements now record their author (owner + lastEditedBy). The AI asks for approval before modifying or deleting a human-drawn element.
EOF
```

- [ ] **Step 6: Commit**

```bash
git commit -m "test(whiteboard): end-to-end element-authorship approval + changeset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/test/element-guard-e2e.it.test.ts \
  .changeset/whiteboard-element-authorship.md
```

---

## Self-review notes

- **Spec coverage (descoped):** author columns (T1), migration+backfill (T2), owner immutability + lastEditedBy (T3), approval trigger reusing the ported assistant-ui pipeline (T4), conditional handler approval for canvas.update/delete/clear (T5), browser author stamping human+ai (T6), chip UI (T7), tests at store (T3), handler (T5), browser E2E (T8). Deferred security (authority/capability/store-authorization) intentionally absent; FS/HTTP bypass tracked in issue #47.
- **No mid-plan broken build:** unlike the earlier authority design, store signatures are unchanged (T3), so the package typechecks after every task.
- **Discovery steps are real work, not placeholders:** T4S1, T5S3, T6S1, T7S1, T8S1 require reading a named file to confirm grep-mangled symbols before writing code — a required step, given the caveman output hazard.
