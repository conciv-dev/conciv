# Whiteboard Element Authorship + AI Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record who authored every canvas element (owner + lastEditedBy, per-person), and make the AI unable to modify or delete a human-authored element without explicit human approval — enforced at the store so no door (MCP tool, HTTP route, forged curl) can skip it.

**Architecture:** Authorization lives in the store (`upsertElement`/`deleteElement`/`deleteElements`), which every write path funnels through. Callers pass an unforgeable `authority` (`'ai'` literal in tool handlers; `'human'` derived from a Hono capability-token middleware for browser HTTP writes) plus an optional one-shot approval token. The interactive approval UI reuses core's existing `uiBus` injection via a new `PermissionGate.request` exposed to extensions through `ServerApi.approvals`.

**Tech Stack:** TypeScript (strict, NodeNext), drizzle-orm + `@libsql/client`, Hono (`bearerAuth`, typed `Variables`), zod, `@conciv/extension`, Solid + Excalidraw (client), vitest + Playwright/Chromium.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (the `conciv/no-comments` lint autofix DELETES them).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Strict TS: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No `any`/`as`/`@ts-ignore`/non-null `!`.
- No barrel files — import from source. Spell identifiers out fully.
- Build/typecheck/test via turbo: `pnpm turbo run build --filter=@conciv/whiteboard`. `pnpm test` builds first.
- Widget IT: rebuild the widget bundle before running (`pnpm turbo run build --filter=@conciv/widget`); use `browser.newPage()`; wait for `domcontentloaded`, never `networkidle`.
- Every Solid package `vitest.config.ts` pins `test: {environment: 'node'}` — do not remove.
- zod validates every HTTP boundary. Real infra in tests: no mocks/stubs/jsdom.
- Commits: pathspec form `git commit -m "…" -- <paths>`; verify `git config --local user.email` is the omridevk noreply before committing; end messages with the `Co-Authored-By: Claude Opus 4.8` trailer.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` and fix anything INTRODUCED.

## Terminology

- **author descriptor** = `{kind: 'human' | 'ai', id: string | null, name: string | null, model: string | null}`.
- **owner** = author descriptor set once on first insert, immutable thereafter.
- **lastEditedBy** = author descriptor updated on every write.
- **authority** = `'human' | 'ai' | 'untrusted'`, the *caller's* trust level (distinct from owner: the browser has `human` authority but stamps `owner.kind='ai'` on AI-origin drawings).

---

## Task 1: Author columns on element schema + rows

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/db/schema.ts` (canvasElements, canvasDraftElements)
- Modify: `packages/extensions/whiteboard/src/shared/rows.ts` (elementRow)
- Test: `packages/extensions/whiteboard/test/rows.test.ts`

**Interfaces:**
- Produces: `elementRow` zod schema with fields `ownerKind`, `ownerId`, `ownerName`, `ownerModel`, `lastEditedByKind`, `lastEditedById`, `lastEditedByName`, `lastEditedByModel`; `type ElementRow = z.infer<typeof elementRow>`.

- [ ] **Step 1: Write the failing test** in `test/rows.test.ts` (append):

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
Expected: FAIL — extra keys stripped / `ownerKind` unknown, second assertion parses successfully (schema too loose).

- [ ] **Step 3: Add columns to `schema.ts`.** In BOTH `canvasElements` and `canvasDraftElements` table definitions, add before the `(table) => [...]` args:

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
- Create: `packages/extensions/whiteboard/drizzle/<generated>.sql` (+ `drizzle/meta/*` updates)
- Reference: `packages/extensions/whiteboard/drizzle.config.ts`

**Interfaces:**
- Consumes: schema from Task 1.
- Produces: a migration that `store.createStore` applies on open (existing rows backfill `owner_kind='human'`, `last_edited_by_kind='human'` via the column defaults).

- [ ] **Step 1: Generate the migration**

Run: `pnpm --filter @conciv/whiteboard exec drizzle-kit generate`
Expected: a new `drizzle/NNNN_*.sql` adding 8 columns to `canvas_elements` and `canvas_draft_elements`, each `NOT NULL DEFAULT 'human'` (kind) or nullable (id/name/model).

- [ ] **Step 2: Verify the SQL** — open the generated file; confirm it `ALTER TABLE`s both tables and that the `*_kind` columns carry `DEFAULT 'human'` (so existing rows backfill). No manual edit expected.

- [ ] **Step 3: Run the store test suite to confirm migration applies cleanly**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: PASS (migration runs in `createStore`; existing assertions unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/extensions/whiteboard/drizzle
git commit -m "feat(whiteboard): migration for element author columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- packages/extensions/whiteboard/drizzle
```

---

## Task 3: Approval-token registry + store authorization types

**Files:**
- Create: `packages/extensions/whiteboard/src/server/db/authorize.ts`
- Test: `packages/extensions/whiteboard/test/authorize.test.ts`

**Interfaces:**
- Produces:
  - `type Authority = 'human' | 'ai' | 'untrusted'`
  - `type Caller = {authority: Authority; approvalToken?: string}`
  - `type ApprovalTokens = {mint: () => string; consume: (token: string) => boolean}`
  - `makeApprovalTokens(): ApprovalTokens` — `mint` returns a random uuid; `consume` returns `true` once then `false` (one-shot).
  - `mayMutate(ownerKind: 'human' | 'ai', caller: Caller, tokens: ApprovalTokens): boolean` — `true` if `ownerKind==='ai'`, or `caller.authority==='human'`, or `caller.approvalToken` present and `tokens.consume` succeeds; else `false`.

- [ ] **Step 1: Write the failing test** `test/authorize.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {makeApprovalTokens, mayMutate} from '../src/server/db/authorize.js'

describe('element authorization', () => {
  it('lets anyone mutate ai-owned rows', () => {
    const tokens = makeApprovalTokens()
    expect(mayMutate('ai', {authority: 'ai'}, tokens)).toBe(true)
    expect(mayMutate('ai', {authority: 'untrusted'}, tokens)).toBe(true)
  })
  it('blocks ai/untrusted on human-owned rows, allows human', () => {
    const tokens = makeApprovalTokens()
    expect(mayMutate('human', {authority: 'ai'}, tokens)).toBe(false)
    expect(mayMutate('human', {authority: 'untrusted'}, tokens)).toBe(false)
    expect(mayMutate('human', {authority: 'human'}, tokens)).toBe(true)
  })
  it('consumes a one-shot approval token exactly once', () => {
    const tokens = makeApprovalTokens()
    const token = tokens.mint()
    expect(mayMutate('human', {authority: 'ai', approvalToken: token}, tokens)).toBe(true)
    expect(mayMutate('human', {authority: 'ai', approvalToken: token}, tokens)).toBe(false)
    expect(mayMutate('human', {authority: 'ai', approvalToken: 'bogus'}, tokens)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/authorize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `authorize.ts`:**

```ts
import {randomUUID} from 'node:crypto'

export type Authority = 'human' | 'ai' | 'untrusted'
export type Caller = {authority: Authority; approvalToken?: string}
export type ApprovalTokens = {mint: () => string; consume: (token: string) => boolean}

export const makeApprovalTokens = (): ApprovalTokens => {
  const live = new Set<string>()
  return {
    mint: () => {
      const token = randomUUID()
      live.add(token)
      return token
    },
    consume: (token) => live.delete(token),
  }
}

export const mayMutate = (ownerKind: 'human' | 'ai', caller: Caller, tokens: ApprovalTokens): boolean => {
  if (ownerKind === 'ai') return true
  if (caller.authority === 'human') return true
  return caller.approvalToken !== undefined && tokens.consume(caller.approvalToken)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/authorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(whiteboard): one-shot approval tokens + mayMutate rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/db/authorize.js \
  packages/extensions/whiteboard/src/server/db/authorize.ts \
  packages/extensions/whiteboard/test/authorize.test.ts
```

---

## Task 4: Enforce authorization + author invariant in the store

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/db/store.ts` (`upsertElement`, `deleteElement`, `deleteElements`, `createStore` return)
- Test: `packages/extensions/whiteboard/test/store.test.ts`

**Interfaces:**
- Consumes: `Caller`, `makeApprovalTokens`, `mayMutate` (Task 3); `ElementRow` (Task 1).
- Produces (new store signatures):
  - `upsertElement(scope: ElementScope, row: ElementRow, caller: Caller): Promise<ElementUpsert | {ok: false; blocked: true}>`
  - `deleteElement(scope, room, elementId, caller): Promise<{deleted: boolean; blocked?: boolean}>`
  - `deleteElements(scope, room, elementIds, caller): Promise<{deleted: number; blocked: number}>`
  - `store.approvals: ApprovalTokens` (so tool handlers mint tokens the store will consume).

- [ ] **Step 1: Write the failing test** — append to `test/store.test.ts` (the file already exposes `open()`):

```ts
const humanRow = (id: string) => ({
  room: 'r', elementId: id, data: {n: 1}, version: 1,
  ownerKind: 'human' as const, ownerId: 'u1', ownerName: 'Guest 00', ownerModel: null,
  lastEditedByKind: 'human' as const, lastEditedById: 'u1', lastEditedByName: 'Guest 00', lastEditedByModel: null,
})

describe('element authorization at the store', () => {
  it('preserves owner and blocks AI mutation of human rows without a token', async () => {
    const store = await open()
    await store.upsertElement('live', humanRow('e1'), {authority: 'human'})

    const aiEdit = {...humanRow('e1'), version: 2, data: {n: 2},
      lastEditedByKind: 'ai' as const, lastEditedByModel: 'opus', ownerKind: 'ai' as const}
    const blocked = await store.upsertElement('live', aiEdit, {authority: 'ai'})
    expect('blocked' in blocked && blocked.blocked).toBe(true)
    const rows = await store.listElements('live', 'r')
    expect(rows[0]?.ownerKind).toBe('human')
    expect(rows[0]?.version).toBe(1)

    const token = store.approvals.mint()
    const allowed = await store.upsertElement('live', aiEdit, {authority: 'ai', approvalToken: token})
    expect(allowed.ok).toBe(true)
    const after = await store.listElements('live', 'r')
    expect(after[0]?.ownerKind).toBe('human')
    expect(after[0]?.lastEditedByKind).toBe('ai')
    expect(after[0]?.version).toBe(2)
  })

  it('blocks AI delete of a human row, allows human delete', async () => {
    const store = await open()
    await store.upsertElement('live', humanRow('e2'), {authority: 'human'})
    expect((await store.deleteElement('live', 'r', 'e2', {authority: 'ai'})).blocked).toBe(true)
    expect((await store.listElements('live', 'r')).length).toBe(1)
    expect((await store.deleteElement('live', 'r', 'e2', {authority: 'human'})).deleted).toBe(true)
    expect((await store.listElements('live', 'r')).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: FAIL — `upsertElement` takes 2 args / `store.approvals` undefined.

- [ ] **Step 3: Update `store.ts`.** Add the import and a tokens instance inside `createStore`:

```ts
import {makeApprovalTokens, mayMutate, type Caller} from './authorize.js'
```
```ts
  const approvals = makeApprovalTokens()
```

Rewrite `upsertElement` to take `caller` and gate on the existing row's `ownerKind`; note the update `set` adds `lastEditedBy*` but never `owner*`:

```ts
  const upsertElement = async (
    scope: ElementScope,
    row: ElementRow,
    caller: Caller,
  ): Promise<ElementUpsert | {ok: false; blocked: true}> => {
    const table = elementTable(scope)
    const current = await db
      .select()
      .from(table)
      .where(and(eq(table.room, row.room), eq(table.elementId, row.elementId)))
      .get()
    if (current && !mayMutate(current.ownerKind, caller, approvals)) return {ok: false, blocked: true}
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
    const saved = current ? {...current, ...row, ownerKind: current.ownerKind, ownerId: current.ownerId, ownerName: current.ownerName, ownerModel: current.ownerModel} : row
    emit({table: elementTableName(scope), room: row.room, type: 'upsert', row: saved})
    return {ok: true, row: saved}
  }
```

Update `upsertElements` to thread `caller`:

```ts
  const upsertElements = async (scope: ElementScope, rows: ElementRow[], caller: Caller): Promise<ElementRow[]> => {
    const resolved: ElementRow[] = []
    for (const row of rows) {
      const outcome = await upsertElement(scope, row, caller)
      if ('blocked' in outcome) continue
      resolved.push(outcome.ok ? outcome.row : outcome.current)
    }
    return resolved
  }
```

Update `deleteElement` to check ownership before deleting:

```ts
  const deleteElement = async (
    scope: ElementScope,
    room: string,
    elementId: string,
    caller: Caller,
  ): Promise<{deleted: boolean; blocked?: boolean}> => {
    const table = elementTable(scope)
    const current = await db
      .select()
      .from(table)
      .where(and(eq(table.room, room), eq(table.elementId, elementId)))
      .get()
    if (!current) return {deleted: false}
    if (!mayMutate(current.ownerKind, caller, approvals)) return {deleted: false, blocked: true}
    const result = await db.delete(table).where(and(eq(table.room, room), eq(table.elementId, elementId)))
    if (result.rowsAffected > 0) emit({table: elementTableName(scope), room, type: 'delete', key: elementId})
    return {deleted: result.rowsAffected > 0}
  }
```

Update `deleteElements`:

```ts
  const deleteElements = async (
    scope: ElementScope,
    room: string,
    elementIds: string[],
    caller: Caller,
  ): Promise<{deleted: number; blocked: number}> => {
    let deleted = 0
    let blocked = 0
    for (const elementId of elementIds) {
      const outcome = await deleteElement(scope, room, elementId, caller)
      if (outcome.blocked) blocked += 1
      else if (outcome.deleted) deleted += 1
    }
    return {deleted, blocked}
  }
```

Add `approvals` to the returned store object (alongside `upsertElement`, etc.).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/store.test.ts`
Expected: PASS. (Callers in routes/tools still pass the old arity — they are fixed in Tasks 6 and 7; the package will not typecheck until then, which is expected mid-plan. Do NOT run a full typecheck yet.)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(whiteboard): store enforces owner immutability + AI mutation guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/db/store.ts \
  packages/extensions/whiteboard/test/store.test.ts
```

---

## Task 5: Approval primitive in core (`PermissionGate.request` → `ServerApi.approvals`)

**Files:**
- Modify: `packages/core/src/api/chat/permission.ts` (`PermissionGate`, `makePermissionGate`)
- Modify: `packages/extension/src/types.ts` (`ServerApi`)
- Modify: `packages/core/src/app.ts:173-178` (pass `approvals` into `extension.__server`)
- Test: `packages/core/test/permission.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces:
  - `PermissionGate.request(sessionId: string, detail: {toolName: string; input: unknown; toolCallId?: string}): Promise<boolean>`
  - `ServerApi.approvals: {request(sessionId: string, detail: {toolName: string; input: unknown}): Promise<boolean>}`

- [ ] **Step 1: Write the failing test** `packages/core/test/permission.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {makePermissionGate} from '../src/api/chat/permission.js'
import {makeUiBus} from '../src/runtime/ui-bus.js'

describe('permission gate request', () => {
  it('injects an approval and resolves to the decision', async () => {
    const uiBus = makeUiBus()
    const sessionId = 's1'
    uiBus.subscribe(sessionId, () => {})
    const gate = makePermissionGate(uiBus, {timeoutMs: 1000})
    const pending = gate.request(sessionId, {toolName: 'canvas.update', input: {elementId: 'e'}})
    await new Promise((r) => setTimeout(r, 10))
    gate.resolve('__any__', true)
    expect(typeof (await Promise.race([pending, Promise.resolve('pending')]))).toBeDefined()
  })
})
```

Note: `injectApproval` mints its own `approvalId`; adapt the assertion to capture the id emitted on the uiBus channel (subscribe callback receives the approval payload) and pass that id to `gate.resolve`. Confirm the exact `makeUiBus`/`subscribe` signatures by reading `packages/core/src/runtime/ui-bus.ts` before finalizing the test.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/core exec vitest run test/permission.test.ts`
Expected: FAIL — `gate.request` is not a function.

- [ ] **Step 3: Add `request` to `makePermissionGate`.** Reuse the existing `pending` + `uiBus`:

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

Add `request` to the `PermissionGate` type.

- [ ] **Step 4: Extend `ServerApi` in `packages/extension/src/types.ts`:**

```ts
export type ServerApi<Config> = {
  config: Config
  cwd: string
  sessions: ServerSessions
  harness: ServerHarness
  approvals: {request(sessionId: string, detail: {toolName: string; input: unknown}): Promise<boolean>}
}
```

- [ ] **Step 5: Wire it at `packages/core/src/app.ts:173`:**

```ts
      const result = await extension.__server?.({
        config: extension.parseConfig(opts.extensionConfig?.[extension.name]),
        cwd: opts.cwd,
        sessions: serverSessions,
        harness: serverHarness,
        approvals: {request: (sessionId, detail) => gate.request(sessionId, detail)},
      })
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @conciv/core exec vitest run test/permission.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck core + extension**

Run: `pnpm turbo run typecheck --filter=@conciv/core --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(core): expose ad-hoc approval request to extensions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/core/src/api/chat/permission.ts \
  packages/core/src/app.ts \
  packages/extension/src/types.ts \
  packages/core/test/permission.test.ts
```

---

## Task 6: Capability classify-middleware + authority on element routes

**Design note (read first):** The widget is **cross-origin** to the API (`widget-tags.ts` sets
`pw-api-base` to `http://127.0.0.1:${corePort}`; core runs CORS), so signed cookies are the wrong tool.
Hono's `bearerAuth` also does not fit — it *rejects* on mismatch, but we need *classify-not-reject* (an
authorityless browser write to an AI-owned element must still succeed; the store is the decider). So this
task adds a tiny custom classify-middleware, and the capability is delivered to the browser through the
existing meta-tag bootstrap (like `pw-api-base`), **not** a fetchable endpoint (an endpoint would let the
agent's curl read the token). The capability is minted in `createStore` and exposed as `store.capability`.

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/routes.ts` (env Variables, classify-middleware, element write routes)
- Modify: `packages/core/src/widget-tags.ts` (inject `pw-whiteboard-cap` meta tag)
- Modify: `packages/core/src/app.ts` (pass the whiteboard store's capability into `htmlTags` opts)
- Test: `packages/extensions/whiteboard/test/routes.test.ts`

**Interfaces:**
- Consumes: `Caller` (Task 3); the store's new `caller`-aware methods (Task 4).
- Produces: element write routes read header `x-whiteboard-cap`; `authority` classified to `'human'` when it equals `store.capability`, else `'untrusted'`. The capability reaches the browser via the `pw-whiteboard-cap` meta tag (host page — the sandboxed agent never receives it). There is deliberately **no** `GET /capability`.
- The store carries the capability so routes can compare: `store.capability: string` (random minted in `createStore`).

**Note on wiring the meta tag:** `htmlTags(corePort, {widget})` currently has no access to extension
state. Confirm by reading `app.ts` how `htmlTags` is called and thread the whiteboard capability through
its opts (e.g. `htmlTags(corePort, {widget, whiteboardCapability})`), reading the mounted whiteboard
store's `capability`. If `htmlTags` is called before extensions mount, mint the capability in `app.ts`
and pass the SAME value into both the whiteboard extension config and `htmlTags` instead of minting it in
`createStore`. Verify the call order before writing the code for this step.

- [ ] **Step 1: Add `capability` to the store.** In `store.ts` `createStore`, add `const capability = randomUUID()` (import `randomUUID` from `node:crypto`) and return it on the store object. (Fold this micro-change here so the route test can rely on it.)

- [ ] **Step 2: Write the failing test** — append to `test/routes.test.ts`. The suite already builds a Hono app around a real `store`; add a `cap` helper reading `store.capability`:

```ts
const authored = (id: string, kind: 'human' | 'ai') => ({
  room: 'r', elementId: id, data: {n: 1}, version: 1,
  ownerKind: kind, ownerId: 'u1', ownerName: 'Guest 00', ownerModel: kind === 'ai' ? 'opus' : null,
  lastEditedByKind: kind, lastEditedById: 'u1', lastEditedByName: 'Guest 00', lastEditedByModel: kind === 'ai' ? 'opus' : null,
})
const capHeaders = () => ({'content-type': 'application/json', 'x-whiteboard-cap': store.capability})

it('persists author fields and preserves owner across writes', async () => {
  await fetch(`${base}/elements/live`, {method: 'PUT', headers: capHeaders(), body: JSON.stringify(authored('e1', 'human'))})
  const rows = await (await fetch(`${base}/elements/live?room=r`)).json()
  expect(rows[0].ownerKind).toBe('human')
})

it('rejects a tokenless bulk-delete of a human element (the AI-curl case)', async () => {
  await fetch(`${base}/elements/live`, {method: 'PUT', headers: capHeaders(), body: JSON.stringify(authored('e2', 'human'))})
  const forged = await fetch(`${base}/elements/live/bulk-delete`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({room: 'r', elementIds: ['e2']}),
  })
  const body = await forged.json()
  expect(body.blocked).toBe(1)
  expect(body.deleted).toBe(0)
  const rows = await (await fetch(`${base}/elements/live?room=r`)).json()
  expect(rows.length).toBe(1)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/routes.test.ts`
Expected: FAIL — no `x-whiteboard-cap` handling; `deleteElements` old shape; owner not blocked.

- [ ] **Step 4: Add authority middleware + thread caller in `routes.ts`.** Extend the env and add a middleware on `/elements/*`:

```ts
export type WhiteboardEnv = {Variables: {whiteboard: {store: Store}; authority: 'human' | 'untrusted'}}
```
```ts
  .use('/elements/*', async (c, next) => {
    const {store} = c.var.whiteboard
    c.set('authority', c.req.header('x-whiteboard-cap') === store.capability ? 'human' : 'untrusted')
    await next()
  })
```

Update the three element write routes to pass a `Caller`:

```ts
  .put('/elements/:scope', zValidator('param', scopeParam), zValidator('json', elementRow), async (c) => {
    const outcome = await c.var.whiteboard.store.upsertElement(
      c.req.valid('param').scope, c.req.valid('json'), {authority: c.get('authority')})
    if ('blocked' in outcome) return c.json({blocked: true}, 403)
    if (!outcome.ok) return c.json({current: outcome.current}, 409)
    return c.json(outcome.row)
  })
  .put('/elements/:scope/bulk', zValidator('param', scopeParam), zValidator('json', bulkBody), async (c) =>
    c.json({rows: await c.var.whiteboard.store.upsertElements(
      c.req.valid('param').scope, c.req.valid('json').rows, {authority: c.get('authority')})}),
  )
  .post('/elements/:scope/bulk-delete', zValidator('param', scopeParam), zValidator('json', bulkDeleteBody), async (c) => {
    const {room, elementIds} = c.req.valid('json')
    return c.json(await c.var.whiteboard.store.deleteElements(
      c.req.valid('param').scope, room, elementIds, {authority: c.get('authority')}))
  })
```

Do **not** add a `GET /capability` route — the agent could fetch it. The browser receives the token via
the `pw-whiteboard-cap` meta tag (wired in `widget-tags.ts`/`app.ts` per this task's Files list) and
sends it as `x-whiteboard-cap` (Task 8 handles the client side).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/routes.test.ts`
Expected: PASS — tokenless bulk-delete blocked, capability write succeeds.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(whiteboard): capability-token authority on element routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/routes.ts \
  packages/extensions/whiteboard/src/server/db/store.ts \
  packages/core/src/widget-tags.ts \
  packages/core/src/app.ts \
  packages/extensions/whiteboard/test/routes.test.ts
```

---

## Task 7: Tool handlers use AI authority + approval token

**Files:**
- Modify: `packages/extensions/whiteboard/src/server/context.ts` (`WhiteboardToolContext` gains `requestApproval`)
- Modify: `packages/extensions/whiteboard/src/server.ts` (build `requestApproval` from `server.approvals` + `store.approvals`; pass into context)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/server.ts` (`canvas.update`, `canvas.delete`, `canvas.clear`)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/def.ts` (drop static `approval: 'ask'` on delete/clear)

**Interfaces:**
- Consumes: `ServerApi.approvals.request` (Task 5); `store.approvals` (Task 4).
- Produces: `WhiteboardToolContext.requestApproval(request: ToolRequest, summary: {toolName: string; input: unknown}): Promise<string | null>` — returns a one-shot store token on approve, `null` on deny.

- [ ] **Step 1: Extend `context.ts`:**

```ts
export type WhiteboardToolContext = {
  cwd: string
  store: Store
  sessionId: (request: ToolRequest) => string
  room: (request: ToolRequest) => string
  model: (request: ToolRequest) => string | null
  requestApproval: (request: ToolRequest, summary: {toolName: string; input: unknown}) => Promise<string | null>
}
```

- [ ] **Step 2: Build `requestApproval` in `server.ts`.** Inside the `.server(async (server) => {...})` body, after `store` is created:

```ts
  const requestApproval = async (request: ToolRequest, summary: {toolName: string; input: unknown}) => {
    if (!request.sessionId) return null
    const approved = await server.approvals.request(request.sessionId, summary)
    return approved ? store.approvals.mint() : null
  }
```
Add `requestApproval` to the returned `context`.

- [ ] **Step 3: Write the failing test (handler unit) — `test/canvas-guard.it.test.ts`** driving the real tools through the store. Reuse `canvas-it-helpers.ts` patterns; assert:
  - AI `canvas.update` on a human-owned live element with a stub `requestApproval` returning `null` → `{updated: false, blocked: true}`, element unchanged.
  - Same with `requestApproval` returning a real token (`store.approvals.mint()`) → `{updated: true}`, `lastEditedByKind==='ai'`, `ownerKind==='human'`.
  - AI `canvas.update` on an ai-owned element → `{updated: true}` with no approval call.

(Read `canvas-it-helpers.ts` first to match the harness for constructing `ctx` + `request`.)

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/canvas-guard.it.test.ts`
Expected: FAIL — handlers don't call the store with a caller / don't gate.

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
    const token = current.ownerKind === 'human'
      ? await ctx.requestApproval(request, {toolName: 'canvas.update', input})
      : undefined
    if (current.ownerKind === 'human' && token === null) return {updated: false, blocked: true}
    const scope = draft ? 'draft' : 'live'
    const data = Object.assign({}, current.data, input.patch) as JsonValue
    const model = ctx.model(request)
    const outcome = await ctx.store.upsertElement(scope, {
      ...current, data, version: current.version + 1,
      lastEditedByKind: 'ai', lastEditedById: null, lastEditedByName: null, lastEditedByModel: model,
    }, {authority: 'ai', approvalToken: token ?? undefined})
    return 'blocked' in outcome ? {updated: false, blocked: true} : {updated: true}
  },
)
```

- [ ] **Step 6: Update `canvas.delete`:**

```ts
const canvasDeleteTool = defineTool<typeof CanvasDeleteInput, WhiteboardToolContext>(canvasDeleteDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    const draftHit = (await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)
    const scope = draftHit ? 'draft' : 'live'
    const current = draftHit ?? (await ctx.store.listElements('live', room)).find((row) => row.elementId === input.elementId)
    if (!current) return {deleted: null}
    const token = current.ownerKind === 'human'
      ? await ctx.requestApproval(request, {toolName: 'canvas.delete', input})
      : undefined
    if (current.ownerKind === 'human' && token === null) return {deleted: null, blocked: true}
    const outcome = await ctx.store.deleteElement(scope, room, input.elementId, {authority: 'ai', approvalToken: token ?? undefined})
    return outcome.blocked ? {deleted: null, blocked: true} : {deleted: input.elementId}
  },
)
```

- [ ] **Step 7: Update `canvas.clear`** — one approval if any live element is human-owned, then pass a caller carrying that token:

```ts
const canvasClearTool = defineTool<typeof CanvasClearInput, WhiteboardToolContext>(canvasClearDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const elements = await ctx.store.listElements('live', room)
    const hasHuman = elements.some((row) => row.ownerKind === 'human')
    const token = hasHuman ? await ctx.requestApproval(request, {toolName: 'canvas.clear', input: {}}) : undefined
    if (hasHuman && token === null) return {cleared: 0, blocked: true}
    const outcome = await ctx.store.deleteElements('live', room, elements.map((row) => row.elementId), {authority: 'ai', approvalToken: token ?? undefined})
    for (const row of await ctx.store.db.select().from(canvasPending).where(eq(canvasPending.room, room)))
      await ctx.store.deletePending(row.id)
    return {cleared: outcome.deleted, blocked: outcome.blocked > 0 ? true : undefined}
  },
)
```

Note: a single one-shot token guards only the first human element in `deleteElements`. Since a human clear is rare and the whole batch shares one approval, mint the token once and have `deleteElements` treat an approved clear as human-authorized: pass `{authority: 'ai', approvalToken: token}` but change `canvas.clear` to instead call the store with `{authority: 'human'}` when `token` is non-null (the user explicitly approved the wipe). Use `{authority: token ? 'human' : 'ai'}`.

- [ ] **Step 8: Update `canvas.discard`** — draft is AI-owned; pass `{authority: 'ai'}` to `deleteElements`.

- [ ] **Step 9: Drop static approval in `def.ts`** — remove the `approval: 'ask'` line from `canvasDeleteDef` and `canvasClearDef` (and the `as const` if now unneeded), and trim the "user is asked to confirm" wording from their `promptSnippet`.

- [ ] **Step 10: Run to verify it passes**

Run: `pnpm --filter @conciv/whiteboard exec vitest run test/canvas-guard.it.test.ts`
Expected: PASS.

- [ ] **Step 11: Typecheck the package**

Run: `pnpm turbo run typecheck --filter=@conciv/whiteboard`
Expected: PASS (all store callers now pass a `caller`).

- [ ] **Step 12: Commit**

```bash
git commit -m "feat(whiteboard): AI canvas edits gate on human ownership via approval token

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/server/context.ts \
  packages/extensions/whiteboard/src/server.ts \
  packages/extensions/whiteboard/src/tool/canvas/server.ts \
  packages/extensions/whiteboard/src/tool/canvas/def.ts \
  packages/extensions/whiteboard/test/canvas-guard.it.test.ts
```

---

## Task 8: Browser stamps author + sends the capability token

**Files:**
- Modify: `packages/extensions/whiteboard/src/client/whiteboard-collection.ts` (fetch wrapper sends `x-whiteboard-cap`; element PUT/bulk/bulk-delete)
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (`writeLocal` on Excalidraw change → stamp human author; AI draft-commit conversion → stamp `owner.kind='ai'`)
- Modify: `packages/extensions/whiteboard/src/client/overlay.tsx` (reuse the existing guest identity `{id, name}` as the human author source)

**Interfaces:**
- Consumes: `GET /capability` (Task 6); the guest identity in `overlay.tsx`.
- Produces: every client element write carries an `owner`/`lastEditedBy` descriptor and the capability header.

- [ ] **Step 1: Read the three files** to locate: the `request(...)` fetch wrapper in `whiteboard-collection.ts`, the `writeLocal(elements)` path and the commit `bulk` fetch in `island.tsx`, and the guest-identity factory in `overlay.tsx`. Confirm exact symbol names (the caveman grep mangles them; use the editor/Read).

- [ ] **Step 2: Read the capability from the `pw-whiteboard-cap` meta tag** at collection setup (same way the client already reads `pw-api-base` — locate that reader and mirror it), cache it, and have the shared `request` wrapper attach it as the `x-whiteboard-cap` header. Do NOT fetch it from an endpoint. On human writes, tag each row with the guest identity as both `owner` (only meaningful on insert; the store preserves it) and `lastEditedBy`.

- [ ] **Step 3: Stamp AI-origin rows** in the commit-conversion path (`island.tsx` where draft skeletons/pending convert to elements and PUT to `/elements/live/bulk`): set `ownerKind: 'ai'`, `ownerModel` from the pending/session model, `lastEditedByKind: 'ai'`.

- [ ] **Step 4: Rebuild widget + run the existing canvas ITs** (they exercise these write paths) to confirm no regression:

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/whiteboard exec vitest run test/canvas-commit.it.test.ts test/canvas-draft.it.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(whiteboard): client stamps element author + sends capability token

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/src/client/whiteboard-collection.ts \
  packages/extensions/whiteboard/src/canvas/island.tsx \
  packages/extensions/whiteboard/src/client/overlay.tsx
```

---

## Task 9: Author chip UI

**Files:**
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (render chip for the selected element)
- Reference: `packages/extensions/whiteboard/src/client/ui.tsx` (`Avatar`)

**Interfaces:**
- Consumes: the element rows' author fields (Task 1) already synced into `db.canvasElements`.

- [ ] **Step 1: Read `island.tsx`** to find selection state (Excalidraw `getAppState().selectedElementIds`) and the overlay layer where a chip can mount.

- [ ] **Step 2: Render a chip** when exactly one element is selected: look up its row in the element collection, show `Avatar` + label (`ownerName ?? 'Guest'` for human, `AI · ${ownerModel}` for ai). Unstyled-primitive + thin styled wrapper per the ui-kit convention; no `[prop:value]` pileups.

- [ ] **Step 3: Rebuild widget + write the browser IT** `test/element-author-chip.it.test.ts`: human draws → select → chip shows the guest name; assert via `getByText`/role, never CSS.

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

## Task 10: End-to-end guard IT + full verification

**Files:**
- Create: `packages/extensions/whiteboard/test/element-guard-e2e.it.test.ts`

- [ ] **Step 1: Write the browser E2E** exercising the real widget + agent tools:
  - Human draws an element; AI `canvas.draw` + `canvas.commit` a second; assert two rows with `ownerKind` `human` and `ai`.
  - AI `canvas.update` on the human element → approval prompt appears (assert the native approval UI by role/text); deny → element unchanged; repeat + allow → patch applied, `lastEditedByKind==='ai'`, `ownerKind==='human'`.
  - AI `canvas.update` on its own element → no prompt.

(Read `canvas-it-helpers.ts` + an existing `*.it.test.ts` to reuse the widget-boot + agent-drive harness.)

- [ ] **Step 2: Rebuild widget + run**

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/whiteboard exec vitest run test/element-guard-e2e.it.test.ts`
Expected: PASS.

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: PASS.

- [ ] **Step 4: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: no INTRODUCED findings; fix any that appear.

- [ ] **Step 5: Add a changeset** (all `@conciv/*` share one version):

```bash
cat > .changeset/whiteboard-element-authorship.md <<'EOF'
---
'@conciv/whiteboard': patch
---

Canvas elements now record their author (owner + lastEditedBy). The AI cannot modify or delete a human-drawn element without explicit approval, enforced at the store.
EOF
```

- [ ] **Step 6: Commit**

```bash
git commit -m "test(whiteboard): end-to-end element-authorship guard + changeset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- \
  packages/extensions/whiteboard/test/element-guard-e2e.it.test.ts \
  .changeset/whiteboard-element-authorship.md
```

---

## Self-review notes

- **Spec coverage:** schema/rows (T1), migration+backfill (T2), owner-immutability chokepoint (T4), store authorization rule (T3+T4), Hono capability authority (T6), unforgeable AI authority + approval token (T5+T7), write-site coverage map — all 7 sites: routes 1/2/4 (T6), canvas.update 3 / delete 5 / clear 6 / discard 7 (T7); UI chip (T9); three test layers store (T3/T4) / API incl. bypass sim (T6) / browser (T8/T9/T10). Out-of-scope FS bypass tracked in issue #47.
- **Mid-plan typecheck:** Task 4 intentionally leaves the package non-compiling until Tasks 6–7 update the route/tool callers; the first green package typecheck is Task 7 Step 11. Do not run `pnpm typecheck` before then.
- **One-shot token vs clear:** Task 7 Step 7 resolves the batch-clear/one-token tension by passing `{authority: 'human'}` once the user approves the wipe, rather than a per-element token.
- **Caveman grep hazard:** Bash/grep output mangles identifiers (`@excalidraw`→`@ln/ln`, methods→`n`). Use Read/editor for exact symbol names in Tasks 8–10.
