# Widget Rewrite Plan 1/4: Core Foundations (contract, drizzle, oRPC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give core the typed oRPC surface and drizzle-backed storage that the new `apps/conciv` client will consume, while the legacy widget keeps working on the old REST routes until Plan 4 deletes them.

**Architecture:** New `@conciv/contract` package (oRPC contract + zod schemas) imported by both sides. New `@conciv/db` package owns ALL persistence (drizzle schemas, `openDb` + migrations, `makeSessionStore`/`makeUiState` stores) — the only package importing drizzle; core opens the db through it once per process, replaces the unstorage session store behind the same `SessionStore` interface, and mounts an oRPC `RPCHandler` at `/rpc/*` on the existing Hono app. Live data (sessions list, chat stream, page queries) are oRPC event iterators fed by the existing `turn-hub`/`page-bus`/store writes. Compaction and model policy move server-side as procedures.

**Tech Stack:** oRPC (`@orpc/contract`, `@orpc/server`, `@orpc/client`), drizzle-orm (stable) on `node:sqlite`, Hono, zod v4, vitest, TanStack AI `StreamChunk`s.

**Spec:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md`. This is plan 1 of 4; plans 2 (`client` + `storage-history` packages), 3 (`apps/conciv` + `embed`), and 4 (`page` split, extension rewire, `git rm packages/widget packages/api-client` + old REST route deletion) are authored when their predecessor lands, against the real signatures this plan produces.

## Global Constraints

- Node floor raised to >= 22.13 (root `engines` + `@conciv/db` engines): `node:sqlite` is unflagged there (ExperimentalWarning only) — no `--experimental-sqlite` anywhere, which matters because the core engine runs inside the HOST app's vite process whose node flags we don't control.
- drizzle-orm + drizzle-kit pinned EXACT `1.0.0-rc.4` (user-approved 2026-07-09: the node-sqlite driver ships only in the 1.0 line, no stable release has it; move to `1.0.0` stable when released). Only `@conciv/db` may import drizzle.
- Functions, not classes. Zero code comments in TS. No `any`/`as`/non-null `!`. No IIFEs. No barrel files beyond existing package entrypoints. oxfmt style (no semicolons, single quotes).
- Never re-model chat messages as rows: `chat.attach` carries TanStack AI `StreamChunk`s verbatim.
- REVOKED 2026-07-10 (user): ~~old REST routes stay mounted throughout~~ — nothing ships mid-phase; BREAK OLD STUFF FREELY. Mid-plan red tests/builds are acceptable and expected; only Task 12's final gates are binding. Client-facing REST routes AND `packages/widget` + `packages/api-client` are deleted in THIS plan (Task 11 demolition). Per-task "full suite green" checks are advisory for the touched package only. Plan 4 shrinks to page-split + final cleanup.
- Build/typecheck via turbo: `pnpm turbo run build --filter=<pkg>`, `pnpm typecheck`.
- Commit with pathspec always: `git commit -- <paths>` (parallel sessions active in this repo).
- Run `pnpm exec fallow audit --changed-since main --format json` before finishing; fix INTRODUCED findings.
- New deps were user-mandated (oRPC, drizzle). Install with `pnpm add` in the owning package only; no other new deps without asking.
- Existing on-disk unstorage session JSON (`<stateRoot>/.conciv/sessions/*`) is intentionally DROPPED by the sqlite swap — no data migration (pre-release v0, user-confirmed rule).
- Extension comms are DEFERRED to a later phase (user decision 2026-07-10): extensions keep their Hono apps at `/api/ext/<slug>`; no extension oRPC work in this plan.

## Route disposition (the delete-the-widget ledger)

Audited 2026-07-10 against `packages/api-client/src/api-client.ts` + a full network sweep of `packages/widget/src` (grab/ui-kit-\* verified network-free). Every CLIENT→core call becomes an oRPC procedure in `@conciv/contract`; plan 4 deletes the REST routes.

- Client comms → oRPC (this plan): resolve, session-detail (subsumed by `sessions.list`/`live` metas — name/usage/status/model; the extra lock.role/cwd/harness fields are unconsumed), sessions list, models, commands, tools, rename, launch, remove, stop, permission-decision, send (`POST /api/chat`), attach (SSE), page stream/reply, editor open, open-source frames symbolication (`editor.openFromFrames`). `GET /api/chat/history` has zero widget callers (history rides the attach snapshot) — delete in plan 4, no procedure.
- NOT client comms, stays as-is: `/api/mcp` (MCP protocol endpoint the harness CLI connects to — foreign wire format, can never be oRPC); `/api/ext/<slug>/*` + terminal WS (extension phase, deferred); `/api/chat/ui`, `/api/page/:verb`, `/api/page/changes(+clear)`, `/api/server/*` (consumed only by the `conciv` CLI — agent↔server loopback tooling, not the widget; plan 4 ledger decides port-or-delete).
- Plan-4 collateral (record now): `packages/extensions/terminal/src/client/terminal-actions.tsx` and `packages/extension-testkit/src/host/host-runtime.tsx` import `@conciv/api-client` directly — they must move to the new client (or the extension host bag) before `git rm packages/api-client`; `PUBLIC_PACKAGES` prunes it then. The extension host bag must keep exposing the session id (extensions authenticate `/api/ext/*` with it today via `chatHeaders()`). The widget boot channel (`window.__CONCIV_API_BASE__` + `pw-widget` meta settings injection) is a plan-3 concern for `apps/conciv`/`embed`. The client-side `pw-conciv-model` localStorage bootstrap is superseded by the server model column (plan 2 decision).
- Deliberately NOT in the contract: a `requestMeta`/`forwardedProps` passthrough lane on `chat.send` — verified unused today (only producers were model → `sessions.setModel` and compact-intent → `sessions.compact`); it is extension-facing surface and lands (or dies) with the extension phase.

---

### Task 1: `@conciv/contract` package scaffold with row schemas

**Files:**

- Create: `packages/contract/package.json`
- Create: `packages/contract/tsconfig.json` (copy `packages/protocol/tsconfig.json` verbatim; adjust only if paths differ)
- Create: `packages/contract/src/rows.ts`
- Test: `packages/contract/src/rows.test.ts`

**Interfaces:**

- Produces: `SessionMetaSchema`/`SessionMeta` (extends today's `ChatSessionMeta` with `status`), `SessionStatusSchema` (`'idle' | 'running' | 'compacting'`), `DraftRowSchema`/`DraftRow`, `MarkerRowSchema`/`MarkerRow`. All later tasks import row types from here.

- [ ] **Step 1: Scaffold the package**

`packages/contract/package.json` (mirror `packages/protocol/package.json` fields — same `repository` block with `"directory": "packages/contract"`, `homepage: https://conciv.dev`, license MIT, `"type": "module"`):

```json
{
  "name": "@conciv/contract",
  "version": "0.0.7",
  "description": "conciv oRPC contract: procedures and zod schemas shared by core and clients.",
  "type": "module",
  "exports": {
    ".": {"types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js"}
  },
  "files": ["dist"],
  "publishConfig": {"access": "public"},
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run",
    "publint": "publint",
    "attw": "attw --pack . --profile esm-only"
  }
}
```

(AS BUILT: protocol's actual pattern is tsdown, not `tsc -p tsconfig.build.json`; public packages also carry publint/attw scripts — Task 1 was executed this way.)

Copy `tsconfig.json`/`tsconfig.build.json`/`vitest.config.ts` from `packages/protocol` (it is the closest pure-types sibling; check its exact build setup first with `ls packages/protocol`). Then:

Run: `cd packages/contract && pnpm add zod @tanstack/ai && pnpm add -D typescript vitest`
Run: `pnpm add @orpc/contract` (same directory)
Then verify the eventIterator export location before writing code:
Run: `grep -r "eventIterator" node_modules/@orpc/contract/dist/*.d.* | head -3`
Expected: an exported `eventIterator` function. If absent, check `node_modules/@orpc/server` the same way and import it from there in Task 3.

- [ ] **Step 2: Write the failing test**

`packages/contract/src/rows.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

describe('row schemas', () => {
  it('parses a session meta with status', () => {
    const parsed = SessionMetaSchema.parse({
      id: 'conciv_1',
      title: 'hello',
      updatedAt: 1,
      messageCount: 0,
      running: false,
      origin: 'conciv',
      usage: null,
      status: 'idle',
      model: null,
    })
    expect(parsed.status).toBe('idle')
  })

  it('rejects an unknown marker kind', () => {
    expect(() => MarkerRowSchema.parse({id: 'm1', sessionId: 'conciv_1', afterTurn: 2, kind: 'weird'})).toThrow()
  })

  it('drafts are explicit about selection and grabs', () => {
    const draft = DraftRowSchema.parse({
      sessionId: 'conciv_1',
      text: 'hi',
      selectionStart: 2,
      selectionEnd: 2,
      grabs: ['<div/>'],
      updatedAt: 5,
    })
    expect(draft.grabs).toEqual(['<div/>'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @conciv/contract exec vitest run src/rows.test.ts`
Expected: FAIL — cannot resolve `./rows.js`

- [ ] **Step 4: Implement `rows.ts`**

```ts
import {z} from 'zod'

export const SessionStatusSchema = z.enum(['idle', 'running', 'compacting'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const UsageSnapshotSchema = z
  .object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    modelId: z.string().optional(),
    contextWindow: z.number().optional(),
  })
  .loose()
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

export const SessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  running: z.boolean(),
  origin: z.enum(['conciv', 'external']),
  usage: UsageSnapshotSchema.nullable(),
  status: SessionStatusSchema,
  model: z.string().nullable(),
})
export type SessionMeta = z.infer<typeof SessionMetaSchema>

export const DraftRowSchema = z.object({
  sessionId: z.string(),
  text: z.string(),
  selectionStart: z.number().int().min(0),
  selectionEnd: z.number().int().min(0),
  grabs: z.array(z.string()),
  updatedAt: z.number(),
})
export type DraftRow = z.infer<typeof DraftRowSchema>

export const MarkerKindSchema = z.enum(['new', 'compact'])
export const MarkerRowSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  afterTurn: z.number().int().min(0),
  kind: MarkerKindSchema,
})
export type MarkerRow = z.infer<typeof MarkerRowSchema>
```

Note: `UsageSnapshotSchema` mirrors `@conciv/protocol/usage-types`'s `UsageSnapshot`; before writing it, open `packages/protocol/src/usage-types.ts` and copy the real field list so the two agree — the shape above is the minimum, extend to match exactly.

Create `packages/contract/src/index.ts`:

```ts
export * from './rows.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @conciv/contract exec vitest run src/rows.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Register the package for release**

Modify `packages/publish/src/guards.ts`: add `'@conciv/contract'` to `PUBLIC_PACKAGES` (keep the array sorted the way it currently is — read the file first).

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm turbo run build --filter=@conciv/contract && pnpm --filter @conciv/contract typecheck`
Expected: exit 0

```bash
git add packages/contract packages/publish/src/guards.ts pnpm-lock.yaml
git commit -m "feat(contract): @conciv/contract package with session/draft/marker schemas" -- packages/contract packages/publish/src/guards.ts pnpm-lock.yaml
```

---

### Task 2: `@conciv/db` package (drizzle schema, openDb, migrations, SessionStore impl)

**Files:**

- Create: `packages/db/package.json` / `tsconfig.json` / `tsdown.config.ts` / `vitest.config.ts` (mirror `packages/contract` scaffold; plain node environment — no execArgv needed on Node >= 22.13)
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/db.ts`
- Create: `packages/db/src/session-store.ts`
- Create: `packages/db/src/index.ts` (package entrypoint: rows + open + stores)
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/drizzle/` (generated SQL migrations, committed)
- Modify: `packages/core/src/app.ts:128` (swap `createFsSessionStore` → `openDb` + `makeSessionStore`)
- Modify: `packages/core/vitest.config.ts` (include `src/**/*.test.ts` — the current config only includes `test/**`)
- Modify: `packages/publish/src/guards.ts` (add `@conciv/db` to `PUBLIC_PACKAGES` — public `@conciv/core` depends on it)
- Test: `packages/db/src/session-store.test.ts`

**Interfaces (locked with the user 2026-07-09):**

- Consumes: `SessionRecord`/`SessionRecordInput` + `SessionRecordSchema` from `@conciv/protocol/chat-types`. Core's `SessionStore` type (`packages/core/src/store/session-store.ts`) stays for legacy REST plumbing; db's store satisfies it structurally.
- Produces (from `@conciv/db`): `openDb(stateRoot: string): ConcivDb` (drizzle instance + migrate-on-open, one `DatabaseSync` per process), `makeSessionStore(opts: {db: ConcivDb; now?: () => number}): SessionStore` where db's `SessionStore` = core's shape + `watch(listener: () => void): () => void`, drizzle tables `sessions`, `drafts`, `markers` from `schema.ts`. The `watch` callback fires after every successful create/update/delete — Task 4's live iterator depends on it.

- [ ] **Step 1: Scaffold + install deps**

Scaffold `packages/db` mirroring `packages/contract` (tsdown build, publint/attw scripts, `homepage`/`repository` blocks, version matching the fixed set).
Run: `cd packages/db && pnpm add drizzle-orm@1.0.0-rc.4 --save-exact && pnpm add '@conciv/protocol@workspace:^' '@conciv/contract@workspace:^' && pnpm add -D drizzle-kit@1.0.0-rc.4 --save-exact typescript vitest tsdown @types/node`
Then confirm the driver exists:
Run: `ls node_modules/drizzle-orm/node-sqlite`
Expected: `index.d.ts` + `migrator.d.ts` present (verified: rc.4 ships both; `drizzle({client})` — the rc line has NO `schema` config option, plain query builder only).
Remove core's direct drizzle deps if present (`pnpm remove drizzle-orm drizzle-kit` in `packages/core`) and add `pnpm add '@conciv/db@workspace:^'` there.

- [ ] **Step 2: Write the schema**

`packages/db/src/schema.ts` — sessions mirrors `SessionRecordSchema` from `@conciv/protocol/chat-types` (open that file and match every field; the list below is from today's reading) plus nothing extra; drafts/markers mirror `@conciv/contract` rows:

```ts
import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  harnessSessionId: text('harness_session_id'),
  harnessKind: text('harness_kind').notNull(),
  origin: text('origin', {enum: ['chat', 'external', 'agent']}).notNull(),
  title: text('title'),
  model: text('model'),
  usage: text('usage', {mode: 'json'}),
  cwd: text('cwd').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const drafts = sqliteTable('drafts', {
  sessionId: text('session_id').primaryKey(),
  text: text('text').notNull(),
  selectionStart: integer('selection_start').notNull(),
  selectionEnd: integer('selection_end').notNull(),
  grabs: text('grabs', {mode: 'json'}).$type<string[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const markers = sqliteTable('markers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  afterTurn: integer('after_turn').notNull(),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})
```

Check `SessionRecordSchema`'s `origin` enum values in `packages/protocol/src/chat-types.ts` and copy them exactly into the `enum:` above.

- [ ] **Step 3: db open + migrations**

`packages/db/drizzle.config.ts`:

```ts
import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
})
```

Run: `cd packages/db && pnpm exec drizzle-kit generate --output json`
Expected: `{"status":"ok",...}` and `packages/db/drizzle/0000_*.sql` created. Commit these files (plus `drizzle/meta/`) with the task.

`packages/db/src/db.ts` (verified against installed rc.4: migrator at `drizzle-orm/node-sqlite/migrator`, sync `migrate(db, {migrationsFolder})`; `drizzle({client})` — no `schema` option in the 1.0 line):

```ts
import {mkdirSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrate} from 'drizzle-orm/node-sqlite/migrator'
import {fileURLToPath} from 'node:url'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export type ConcivDb = ReturnType<typeof openDb>

export function openDb(stateRoot: string) {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(`${stateRoot}/.conciv/conciv.db`)
  const db = drizzle({client})
  migrate(db, {migrationsFolder})
  return db
}
```

(`../drizzle` resolves from `dist/` to the package-root `drizzle/` folder; ship it via `files: ["dist", "drizzle"]` in package.json.)

- [ ] **Step 4: Write the failing store test**

`packages/db/src/session-store.test.ts` — port the behavioral contract from core's existing fs store; use a temp dir via `node:fs.mkdtempSync` (never `/tmp` hardcoded):

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from './db.js'
import {makeSessionStore} from './session-store.js'

const record = (id: string) => ({
  id,
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat' as const,
  title: null,
  model: null,
  usage: null,
  cwd: '/w',
})

describe('drizzle session store', () => {
  const make = () => makeSessionStore({db: openDb(mkdtempSync(join(tmpdir(), 'conciv-db-'))), now: () => 42})

  it('create then get round-trips', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    const got = await store.get('conciv_a')
    expect(got?.id).toBe('conciv_a')
    expect(got?.createdAt).toBe(42)
  })

  it('update patches and bumps updatedAt', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    const next = await store.update('conciv_a', {title: 'named'})
    expect(next.title).toBe('named')
  })

  it('list returns all, delete removes', async () => {
    const store = make()
    await store.create(record('conciv_a'))
    await store.create(record('conciv_b'))
    expect((await store.list()).length).toBe(2)
    await store.delete('conciv_a')
    expect((await store.list()).map((r) => r.id)).toEqual(['conciv_b'])
  })

  it('findByHarnessId matches', async () => {
    const store = make()
    await store.create({...record('conciv_a'), harnessSessionId: 'h-1'})
    expect((await store.findByHarnessId('h-1'))?.id).toBe('conciv_a')
  })

  it('watch fires on writes and unsubscribes', async () => {
    const store = make()
    let hits = 0
    const stop = store.watch(() => {
      hits += 1
    })
    await store.create(record('conciv_a'))
    await store.update('conciv_a', {title: 't'})
    stop()
    await store.delete('conciv_a')
    expect(hits).toBe(2)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @conciv/db exec vitest run src/session-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the store**

`packages/db/src/session-store.ts` (`SessionStore` is db's own type: core's shape + `watch`; core's legacy type is satisfied structurally):

```ts
import {eq} from 'drizzle-orm'
import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'

export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
  watch(listener: () => void): () => void
}

function rowToRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return SessionRecordSchema.parse(row)
}

export function makeSessionStore(opts: {db: ConcivDb; now?: () => number}): SessionStore {
  const db = opts.db
  const now = opts.now ?? Date.now
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  const read = async (id: string) => {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id))
    return rows[0] ? rowToRecord(rows[0]) : null
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await db.insert(sessions).values(record)
      emit()
      return record
    },
    get: read,
    update: async (id, patch) => {
      const current = await read(id)
      if (!current) throw new Error(`session ${id} not found`)
      const next = SessionRecordSchema.parse({...current, ...patch, id: current.id, updatedAt: now()})
      await db.update(sessions).set(next).where(eq(sessions.id, id))
      emit()
      return next
    },
    delete: async (id) => {
      await db.delete(sessions).where(eq(sessions.id, id))
      emit()
    },
    list: async () => (await db.select().from(sessions)).map(rowToRecord),
    findByHarnessId: async (harnessSessionId) => {
      const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, harnessSessionId))
      return rows[0] ? rowToRecord(rows[0]) : null
    },
    watch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

If `usage` (json column) comes back as a string or the zod parse rejects it, add drizzle `$type<...>()` on the column or map the field explicitly in `rowToRecord` — the test from Step 4 is the arbiter.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @conciv/db exec vitest run src/session-store.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Swap the store in `makeApp` + pin types**

In `packages/core/src/app.ts` line 128 replace:

```ts
const store = createFsSessionStore({stateRoot: opts.cfg.stateRoot})
```

with:

```ts
const db = openDb(opts.cfg.stateRoot)
const store = makeSessionStore({db})
```

importing both from `@conciv/db` (keep `session-store.ts` — the `SessionStore` type and `createSessionStore` used by tests still live there; `createFsSessionStore` is deleted only if nothing else imports it — check with `grep -rn createFsSessionStore packages apps --include='*.ts'` and delete it plus its unstorage deps if this was the only caller; run `pnpm exec fallow dead-code --trace 'packages/core/src/store/session-store.ts:createFsSessionStore'` to confirm).

Add a type pin test in `packages/db/src/session-store.test.ts`:

```ts
import {expectTypeOf} from 'vitest'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {sessions} from './schema.js'

it('drizzle row type matches SessionRecord', () => {
  expectTypeOf<typeof sessions.$inferSelect>().toEqualTypeOf<SessionRecord>()
})
```

If json/nullable columns make `toEqualTypeOf` too strict to hold exactly, use `toMatchObjectType` and pin the divergent fields individually — do not weaken to `toMatchTypeOf` on the whole record without pinning `usage`, `origin`, and nullability.

- [ ] **Step 9: Full core test run + commit**

Run: `pnpm turbo run test --filter=@conciv/db --filter=@conciv/core`
Expected: PASS, including every pre-existing chat/session test (they now run on drizzle).

```bash
git add packages/db packages/core/src packages/core/vitest.config.ts packages/core/package.json packages/publish/src/guards.ts pnpm-lock.yaml
git commit -m "feat(db): @conciv/db — drizzle on node:sqlite replaces unstorage session store" -- packages/db packages/core packages/publish pnpm-lock.yaml
```

- [ ] **Step 10 (review amendment M5): cross-process hardening**

Core's lock system supports FOREIGN processes on the same stateRoot (`store/lock.ts` stores pids; `session.ts` `killLock` SIGTERMs them) — two `DatabaseSync` writers on a rollback-journal db throw `SQLITE_BUSY` immediately. In `openDb`, after constructing the client: `client.exec('PRAGMA journal_mode = WAL')` and `client.exec('PRAGMA busy_timeout = 5000')` (verify the exact DatabaseSync API — a `timeout` constructor option may exist; use what the installed `@types/node` says). Add a `packages/db` test opening TWO `openDb` instances on the same stateRoot and interleaving writes — both succeed.

---

### Task 3: Contract procedures + oRPC mount in core

**Files:**

- Create: `packages/contract/src/contract.ts`
- Modify: `packages/contract/src/index.ts`
- Create: `packages/core/src/rpc/router.ts`
- Create: `packages/core/src/rpc/mount.ts`
- Modify: `packages/core/src/app.ts` (mount `/rpc/*` middleware in `composeRoutes`)
- Test: `packages/core/src/rpc/router.test.ts`

**Interfaces:**

- Consumes: `SessionMetaSchema`, `DraftRowSchema`, `MarkerRowSchema` (Task 1); `WatchedSessionStore` (Task 2); `ChatRuntime` (`packages/core/src/api/chat/chat-env.ts`).
- Produces: `contract` object (namespaces: `sessions`, `drafts`, `markers`, `chat`, `page`, `meta`) exported from `@conciv/contract`; `makeRpcRouter(deps: RpcDeps)` and `mountRpc(app: Hono, router: ReturnType<typeof makeRpcRouter>)` in core. `RpcDeps = {chat: ChatRuntime; store: WatchedSessionStore; buildSessionList(): Promise<SessionMeta[]>}` — later tasks extend `RpcDeps`, never add globals.

- [ ] **Step 1: Install oRPC server deps**

Run: `cd packages/core && pnpm add @orpc/server @conciv/contract@workspace:^`
Run: `cd packages/contract && pnpm add @orpc/contract` (if not already from Task 1)

- [ ] **Step 2: Define the contract**

`packages/contract/src/contract.ts` — contract v3, the COMPLETE client surface (adversarial-review outcome 2026-07-10; every widget→core call maps here, see the route-disposition ledger). `eventIterator` verified exported from `@orpc/contract`. Reuse protocol schemas — never redeclare shapes that exist (`ChatModelsSchema`, `ChatCommandsSchema`, `ChatToolsSchema`, `ChatLaunchSchema`, `PermissionDecisionSchema` from `@conciv/protocol/chat-types`; `OpenSourceSchema`/`OpenSourceResultSchema` + `PageReplySchema` from `@conciv/protocol/page-types` — open both files and confirm exact names first). Same for `rows.ts`: import `UsageSnapshotSchema` from `@conciv/protocol/usage-types` instead of the current duplicated copy.

Typed errors (review M4): REST's 409/400 semantics must survive — declare errors on the contract and throw the typed constructors in handlers; router tests assert `code`, never message regex. Use oRPC's `.errors({...})` (verify exact API in `node_modules/@orpc/contract`).

```ts
import {oc, eventIterator} from '@orpc/contract'
import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {
  ChatCommandsSchema,
  ChatLaunchSchema,
  ChatModelsSchema,
  ChatToolsSchema,
  PermissionDecisionSchema,
} from '@conciv/protocol/chat-types'
import {OpenSourceSchema, OpenSourceResultSchema, PageReplySchema} from '@conciv/protocol/page-types'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from './rows.js'

const StreamChunkSchema = z.custom<StreamChunk>((value) => typeof value === 'object' && value !== null)
const SessionIdInput = z.object({sessionId: z.string()})
const Ok = z.object({ok: z.literal(true)})
const busy = {BUSY: {message: 'session busy'}}
const notFound = {NOT_FOUND: {message: 'session not found'}}

export const contract = {
  sessions: {
    list: oc.output(z.array(SessionMetaSchema)),
    live: oc.output(eventIterator(z.array(SessionMetaSchema))),
    create: oc.output(SessionIdInput),
    resolve: oc.input(z.object({id: z.string().optional()})).output(SessionIdInput),
    rename: oc
      .errors(notFound)
      .input(SessionIdInput.extend({title: z.string().min(1).max(120)}))
      .output(z.object({title: z.string()})),
    remove: oc.input(SessionIdInput).output(Ok),
    setModel: oc
      .errors({...notFound, UNKNOWN_MODEL: {message: 'unknown or disabled model'}})
      .input(SessionIdInput.extend({model: z.string()}))
      .output(z.object({model: z.string()})),
    compact: oc.errors(busy).input(SessionIdInput).output(Ok),
    stop: oc.input(SessionIdInput).output(Ok),
    launch: oc
      .errors({UNSUPPORTED: {message: 'harness cannot launch'}})
      .input(SessionIdInput.extend({model: z.string().optional()}))
      .output(ChatLaunchSchema),
  },
  drafts: {
    get: oc.input(SessionIdInput).output(DraftRowSchema.nullable()),
    set: oc.input(DraftRowSchema.omit({updatedAt: true})).output(Ok),
    live: oc.input(SessionIdInput).output(eventIterator(DraftRowSchema.nullable())),
  },
  markers: {
    list: oc.input(SessionIdInput).output(z.array(MarkerRowSchema)),
    live: oc.input(SessionIdInput).output(eventIterator(z.array(MarkerRowSchema))),
  },
  chat: {
    attach: oc.input(SessionIdInput).output(eventIterator(StreamChunkSchema)),
    send: oc
      .errors(busy)
      .input(SessionIdInput.extend({text: z.string().min(1)}))
      .output(Ok),
    permissionDecision: oc.input(PermissionDecisionSchema).output(Ok),
  },
  page: {
    queries: oc.output(eventIterator(z.object({requestId: z.string(), query: z.unknown()}))),
    reply: oc
      .errors({UNKNOWN_REQUEST: {message: 'no pending request'}})
      .input(PageReplySchema)
      .output(Ok),
  },
  editor: {
    open: oc.input(z.object({file: z.string(), line: z.number().int().min(1).optional()})).output(Ok),
    openFromFrames: oc.input(OpenSourceSchema).output(OpenSourceResultSchema),
  },
  meta: {
    models: oc.output(ChatModelsSchema),
    commands: oc.input(z.object({sessionId: z.string().optional()})).output(ChatCommandsSchema),
    tools: oc.output(ChatToolsSchema),
  },
}
```

Contract semantics to encode as docblocks (they bind Plan 2's client): `chat.send` consumes the session's draft server-side (prepends grab texts, clears the row, pulses live — review M2) so the composer never orchestrates; `drafts.live` exists because two surfaces can edit one session (panel + quick pane + PiP) and the spec's focus-reconciliation rule needs a push feed (M3); `chat.attach` is snapshot-first — reconnect = fresh attach, NO lastEventId resume by design (the snapshot replays settled history + live replay covers the in-flight turn); `page.queries` is NOT resumable — a dropped in-flight query times out at the asker, same as today's SSE. `z.unknown()` remains ONLY for `page.queries.query` (validated by `PageQuerySchema` at the consumer; typed page schemas move into the contract when the page plane splits in Plan 4).

Update `packages/contract/src/index.ts`:

```ts
export * from './rows.js'
export * from './contract.js'
```

- [ ] **Step 3: Write the failing router test**

`packages/core/src/rpc/router.test.ts` — use oRPC's `call` for direct invocation; build minimal deps with the drizzle store from Task 2 in a temp dir. The `chat` runtime stub uses the real `makeTurnHub` and a minimal fake harness — copy the fake-harness pattern from an existing core test (grep: `grep -rln 'makeTurnHub\|fakeHarness\|stubHarness' packages/core/src --include='*.test.ts'` and reuse that helper; if none exists, the only fields `sessions.list` needs are `store` and `buildSessionList`):

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeSessionStore, openDb} from '@conciv/db'
import {makeRpcRouter, type RpcDeps} from './router.js'

function makeDeps(): RpcDeps {
  const store = makeSessionStore({db: openDb(mkdtempSync(join(tmpdir(), 'conciv-rpc-')))})
  return {
    store,
    buildSessionList: async () =>
      (await store.list()).map((record) => ({
        id: record.id,
        title: record.title ?? 'New session',
        updatedAt: record.updatedAt,
        messageCount: 0,
        running: false,
        origin: 'conciv' as const,
        usage: null,
        status: 'idle' as const,
        model: record.model,
      })),
  }
}

describe('rpc router', () => {
  it('sessions.list returns metas from the store', async () => {
    const deps = makeDeps()
    await deps.store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: 'hello',
      model: null,
      usage: null,
      cwd: '/w',
    })
    const router = makeRpcRouter(deps)
    const list = await call(router.sessions.list, undefined)
    expect(list.map((meta) => meta.id)).toEqual(['conciv_a'])
    expect(list[0]?.status).toBe('idle')
  })
})
```

Note: `RpcDeps` starts as `{store; buildSessionList}` here and gains `chat`, `pageBus`, etc. in later tasks — each task extends the type and this test's `makeDeps` in place.

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: FAIL — `./router.js` not found

- [ ] **Step 5: Implement router + mount**

`packages/core/src/rpc/router.ts`:

```ts
import {implement} from '@orpc/server'
import {contract, type SessionMeta} from '@conciv/contract'
import type {SessionStore} from '@conciv/db'

export type RpcDeps = {
  store: SessionStore
  buildSessionList: () => Promise<SessionMeta[]>
}

const os = implement(contract)

export function makeRpcRouter(deps: RpcDeps) {
  return os.router({
    sessions: {
      list: os.sessions.list.handler(() => deps.buildSessionList()),
      live: os.sessions.live.handler(async function* () {
        yield await deps.buildSessionList()
      }),
      create: os.sessions.create.handler(() => {
        throw new Error('implemented in task 6')
      }),
      resolve: os.sessions.resolve.handler(() => {
        throw new Error('implemented in task 6')
      }),
      launch: os.sessions.launch.handler(() => {
        throw new Error('implemented in task 6')
      }),
      rename: os.sessions.rename.handler(() => {
        throw new Error('implemented in task 6')
      }),
      remove: os.sessions.remove.handler(() => {
        throw new Error('implemented in task 6')
      }),
      setModel: os.sessions.setModel.handler(() => {
        throw new Error('implemented in task 6')
      }),
      compact: os.sessions.compact.handler(() => {
        throw new Error('implemented in task 7')
      }),
      stop: os.sessions.stop.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
    drafts: {
      get: os.drafts.get.handler(() => {
        throw new Error('implemented in task 5')
      }),
      set: os.drafts.set.handler(() => {
        throw new Error('implemented in task 5')
      }),
      live: os.drafts.live.handler(() => {
        throw new Error('implemented in task 5')
      }),
    },
    markers: {
      list: os.markers.list.handler(() => {
        throw new Error('implemented in task 5')
      }),
      live: os.markers.live.handler(() => {
        throw new Error('implemented in task 5')
      }),
    },
    chat: {
      attach: os.chat.attach.handler(() => {
        throw new Error('implemented in task 8')
      }),
      send: os.chat.send.handler(() => {
        throw new Error('implemented in task 8')
      }),
      permissionDecision: os.chat.permissionDecision.handler(() => {
        throw new Error('implemented in task 8')
      }),
    },
    page: {
      queries: os.page.queries.handler(() => {
        throw new Error('implemented in task 9')
      }),
      reply: os.page.reply.handler(() => {
        throw new Error('implemented in task 9')
      }),
    },
    editor: {
      open: os.editor.open.handler(() => {
        throw new Error('implemented in task 6')
      }),
      openFromFrames: os.editor.openFromFrames.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
    meta: {
      models: os.meta.models.handler(() => {
        throw new Error('implemented in task 6')
      }),
      commands: os.meta.commands.handler(() => {
        throw new Error('implemented in task 6')
      }),
      tools: os.meta.tools.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
  })
}
```

(`throw` placeholders are compile-time-complete and each is retired by the named task in this same plan — the plan is not done while any remain. The exact `implement`/`os.router` composition API must be checked against `node_modules/@orpc/server` types; adjust mechanically if the version differs.)

`packages/core/src/rpc/mount.ts` — Hono middleware per the oRPC Hono adapter, with the body-parse caveat handled by letting oRPC read the raw request (core has no body-consuming middleware ahead of it — verified; the cors middleware does not read bodies). The RPC context carries the raw Request: `meta.commands` needs the request origin to build `mcpUrl` (today `session.ts` reads the `host` header) — declare `RpcContext = {request: Request}` on the implementer (`implement(contract).$context<RpcContext>()`) so handlers can reach it:

```ts
import {RPCHandler} from '@orpc/server/fetch'
import type {MiddlewareHandler} from 'hono'
import type {makeRpcRouter} from './router.js'

export function rpcMiddleware(router: ReturnType<typeof makeRpcRouter>): MiddlewareHandler {
  const handler = new RPCHandler(router)
  return async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {prefix: '/rpc', context: {request: c.req.raw}})
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  }
}
```

SIGNAL/CLEANUP verification (review M7) uses oRPC's DOCUMENTED testing surfaces only (per the testing guide: `call`/`createRouterClient` in-process, `createORPCClient`+`RPCLink` for wire — never hand-rolled probe apps): Task 4's router test drives `sessions.live` via `call(..., {signal})`, aborts, and asserts iteration ends AND the feed detached its subscriber; Task 8's wire IT repeats the abort over HTTP with the real client. If those show the installed `@orpc/server` does NOT deliver an `AbortSignal` to handlers, STOP and re-design cleanup — do not paper over with `signal ?? new AbortController().signal`. Additionally every live handler wraps its loop in `try/finally` and detaches its subscription in `finally` (works even when only `iterator.return()` fires), so cleanup never depends solely on the signal.

In `packages/core/src/app.ts` `composeRoutes`, thread the router in: change `composeRoutes(vars)` to `composeRoutes(vars, rpc)` with `rpc: ReturnType<typeof makeRpcRouter>` and add before the `/api/*` routes:

```ts
.use('/rpc/*', rpcMiddleware(rpc))
```

and in `makeApp` construct it after `chatRuntime`:

```ts
const rpc = makeRpcRouter({store, buildSessionList: () => rpcSessionList(chatRuntime)})
```

where `rpcSessionList` is a small function in `router.ts` that reuses `buildSessionList` from `packages/core/src/api/chat/session.ts` (it needs `store`, the harness list, running locks, and cwd — copy how the existing GET `/sessions` route in `session.ts` assembles those arguments, and map the result to `SessionMeta` by adding `status: 'idle' | 'running'` from the same `runningKeys` set and `model` from the record).

The `makeApp` wiring is an explicit step, not an afterthought (the working tree currently has `composeRoutes(vars, rpc)` signature-changed but `makeApp` still calling it with one argument — it does not compile until this lands): construct `const rpc = makeRpcRouter({store, buildSessionList: () => rpcSessionList(chatRuntime)})` after `chatRuntime` and pass it to `composeRoutes`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: PASS

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS — old routes unaffected.

- [ ] **Step 7: HTTP smoke test through Hono**

Append to `router.test.ts` a fetch-level test with `testClient`-style direct `app.request` (mirror how existing core route tests invoke the Hono app — grep `app.request(` in `packages/core/src`):

```ts
it('mounts at /rpc/* over HTTP', async () => {
  const {makeTestApp} = await import('./test-app.js')
  const app = await makeTestApp()
  const response = await app.request('/rpc/sessions/list', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
})
```

`makeTestApp` lives in `packages/core/src/rpc/test-app.ts` and calls the real `makeApp` with a fake harness + temp stateRoot — copy the construction from the closest existing `makeApp`-based test (grep `makeApp(` under `packages/core/src`); if the oRPC RPC protocol requires a different body envelope for procedure calls, assert only `status !== 404` here (the typed-client IT in Task 8 covers the real protocol).

- [ ] **Step 8: Commit**

```bash
git add packages/contract/src packages/core/src/rpc packages/core/src/app.ts packages/core/package.json packages/contract/package.json pnpm-lock.yaml
git commit -m "feat(core): oRPC contract + RPCHandler mounted at /rpc/*" -- packages/contract packages/core pnpm-lock.yaml
```

---

### Task 4: `sessions.live` event iterator driven by store watch + turn transitions

**Files:**

- Modify: `packages/core/src/rpc/router.ts` (real `sessions.live` + `RpcDeps.signal` source)
- Create: `packages/core/src/rpc/live.ts`
- Modify: `packages/core/src/app.ts` (wire turn start/end pulses into the live feed)
- Test: `packages/core/src/rpc/live.test.ts`

**Interfaces:**

- Produces: `makeLiveFeed(): {pulse(): void; subscribe(signal: AbortSignal): AsyncGenerator<void>}` — a coalescing notifier: `pulse()` during an in-flight wait coalesces to one wake-up. `RpcDeps` gains `live: ReturnType<typeof makeLiveFeed>`.
- Consumes: `store.watch` (Task 2), `chatTurnListeners`/`onTurnEnd` wiring in `app.ts` (read `makeApp` lines 139–205 first).

- [ ] **Step 1: Write the failing feed test**

`packages/core/src/rpc/live.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {makeLiveFeed} from './live.js'

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('live feed', () => {
  it('wakes a subscriber per pulse batch and stops on abort', async () => {
    const feed = makeLiveFeed()
    const abort = new AbortController()
    const seen: number[] = []
    const consumer = (async () => {
      let n = 0
      for await (const _ of feed.subscribe(abort.signal)) {
        n += 1
        seen.push(n)
        if (n === 2) abort.abort()
      }
    })()
    await nextTick()
    feed.pulse()
    await nextTick()
    feed.pulse()
    feed.pulse()
    await nextTick()
    await consumer
    expect(seen).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/live.test.ts`
Expected: FAIL — `./live.js` not found

- [ ] **Step 3: Implement the feed**

`packages/core/src/rpc/live.ts` — REVIEW AMENDMENT C4: the original waiter-only sketch had a lost-update race (a `pulse()` landing while a subscriber is awake — i.e. mid-`buildSessionList` — found no waiter and was dropped forever). Each subscriber carries a `dirty` flag: `pulse()` marks every subscriber dirty and wakes the waiting ones; the loop re-emits until clean. One abort listener per subscription (not per iteration), cleanup in `finally`:

```ts
type Subscriber = {dirty: boolean; wake: () => void}

export type LiveFeed = {pulse: () => void; subscribe: (signal: AbortSignal) => AsyncGenerator<void>}

export function makeLiveFeed(): LiveFeed {
  const subscribers = new Set<Subscriber>()

  function pulse(): void {
    for (const subscriber of subscribers) {
      subscriber.dirty = true
      subscriber.wake()
    }
  }

  async function* subscribe(signal: AbortSignal): AsyncGenerator<void> {
    const subscriber: Subscriber = {dirty: false, wake: () => {}}
    subscribers.add(subscriber)
    const onAbort = () => subscriber.wake()
    signal.addEventListener('abort', onAbort, {once: true})
    try {
      while (!signal.aborted) {
        if (subscriber.dirty) {
          subscriber.dirty = false
          yield
          continue
        }
        await new Promise<void>((resolve) => {
          subscriber.wake = resolve
          if (subscriber.dirty || signal.aborted) resolve()
        })
        subscriber.wake = () => {}
      }
    } finally {
      subscribers.delete(subscriber)
      signal.removeEventListener('abort', onAbort)
    }
  }

  return {pulse, subscribe}
}
```

Tests must include the race case: pulse while the consumer is mid-emission (i.e. between receiving a yield and awaiting the next one — simulate with an async consumer body that `await`s a tick inside the `for await` before looping) and assert the write still produces a subsequent emission. Also assert unsubscribe-on-abort leaves `subscribers` empty (export a test-only `size()` or assert via no further wakes).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/live.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `sessions.live` and the pulse sources**

In `router.ts`, `RpcDeps` gains `live: LiveFeed`; replace the `sessions.live` handler:

```ts
live: os.sessions.live.handler(async function* ({signal}) {
  yield await deps.buildSessionList()
  for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
    yield await deps.buildSessionList()
  }
}),
```

(Verify how the installed `@orpc/server` hands the abort signal to handlers — check `node_modules/@orpc/server` types for the handler context; if it is `context` rather than a destructured `signal`, adapt.)

In `makeApp` (`packages/core/src/app.ts`):

```ts
const live = makeLiveFeed()
store.watch(() => live.pulse())
chatTurnListeners.push(() => live.pulse())
```

and pulse on turn end by appending inside `onTurnEnd` after the settled loop: `live.pulse()`. Pass `live` into `makeRpcRouter`.

- [ ] **Step 6: Router-level test**

Append to `router.test.ts` (extend `makeDeps` with `live: makeLiveFeed()`):

```ts
it('sessions.live re-emits after a store write', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const abort = new AbortController()
  const iterator = await call(router.sessions.live, undefined, {signal: abort.signal})
  const collected: string[][] = []
  const consumer = (async () => {
    for await (const metas of iterator) {
      collected.push(metas.map((meta) => meta.id))
      if (collected.length === 2) abort.abort()
    }
  })()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await deps.store.create({
    id: 'conciv_live',
    harnessSessionId: null,
    harnessKind: 'claude',
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd: '/w',
  })
  await consumer
  expect(collected[0]).toEqual([])
  expect(collected[1]).toEqual(['conciv_live'])
})
```

(If `call` does not accept a signal option in the installed version, drive the iterator manually with `iterator.next()` twice and then `iterator.return(undefined)` — same assertions.)

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/rpc packages/core/src/app.ts
git commit -m "feat(core): sessions.live event iterator on store watch + turn pulses" -- packages/core/src
```

---

### Task 5: Drafts + markers procedures (rows, intents, live)

**Files:**

- Create: `packages/db/src/ui-state.ts` (exported from `@conciv/db`)
- Modify: `packages/core/src/rpc/router.ts` (real `drafts.*`, `markers.*` handlers; `RpcDeps` gains `uiState`)
- Modify: `packages/core/src/app.ts` (construct `uiState`, pulse `live` on writes)
- Test: `packages/db/src/ui-state.test.ts`, additions to `packages/core/src/rpc/router.test.ts`

**Interfaces (locked with the user 2026-07-09):**

- Produces: `makeUiState(db: ConcivDb, now?: () => number): UiState` where `UiState = {getDraft(sessionId): Promise<DraftRow | null>; setDraft(input: Omit<DraftRow,'updatedAt'>): Promise<void>; listMarkers(sessionId): Promise<MarkerRow[]>; addMarker(input: Omit<MarkerRow,'id'>): Promise<MarkerRow>; watch(listener: () => void): () => void}`. Marker ids: `crypto.randomUUID()` (never hand-rolled).
- Consumes: `drafts`/`markers` tables (Task 2), `ConcivDb`.

- [ ] **Step 1: Write the failing test**

`packages/db/src/ui-state.test.ts`:

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from './db.js'
import {makeUiState} from './ui-state.js'

const make = () => makeUiState(openDb(mkdtempSync(join(tmpdir(), 'conciv-ui-'))), () => 7)

describe('ui-state', () => {
  it('draft get is null until set, then upserts', async () => {
    const ui = make()
    expect(await ui.getDraft('s1')).toBeNull()
    await ui.setDraft({sessionId: 's1', text: 'a', selectionStart: 1, selectionEnd: 1, grabs: []})
    await ui.setDraft({sessionId: 's1', text: 'ab', selectionStart: 2, selectionEnd: 2, grabs: []})
    expect((await ui.getDraft('s1'))?.text).toBe('ab')
  })

  it('markers append and list per session', async () => {
    const ui = make()
    await ui.addMarker({sessionId: 's1', afterTurn: 0, kind: 'new'})
    await ui.addMarker({sessionId: 's1', afterTurn: 4, kind: 'compact'})
    await ui.addMarker({sessionId: 's2', afterTurn: 1, kind: 'new'})
    const listed = await ui.listMarkers('s1')
    expect(listed.map((marker) => marker.kind)).toEqual(['new', 'compact'])
  })

  it('watch fires on draft and marker writes', async () => {
    const ui = make()
    let hits = 0
    ui.watch(() => {
      hits += 1
    })
    await ui.setDraft({sessionId: 's1', text: '', selectionStart: 0, selectionEnd: 0, grabs: []})
    await ui.addMarker({sessionId: 's1', afterTurn: 0, kind: 'new'})
    expect(hits).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/db exec vitest run src/ui-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `ui-state.ts`** (in `packages/db/src`)

```ts
import {randomUUID} from 'node:crypto'
import {asc, eq} from 'drizzle-orm'
import type {DraftRow, MarkerRow} from '@conciv/contract'
import type {ConcivDb} from './db.js'
import {drafts, markers} from './schema.js'

export type UiState = {
  getDraft: (sessionId: string) => Promise<DraftRow | null>
  setDraft: (input: Omit<DraftRow, 'updatedAt'>) => Promise<void>
  clearDraft: (sessionId: string) => Promise<void>
  listMarkers: (sessionId: string) => Promise<MarkerRow[]>
  addMarker: (input: Omit<MarkerRow, 'id'>) => Promise<MarkerRow>
  deleteFor: (sessionId: string) => Promise<void>
  watch: (listener: () => void) => () => void
}
```

(`clearDraft` is Task 8's server-side draft consumption on send — review M2; `deleteFor` removes the session's draft + marker rows on `sessions.remove` — review M1, since the schema has no FK cascade. Both `emit()`.)

```ts
export function makeUiState(db: ConcivDb, now: () => number = Date.now): UiState {
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  return {
    getDraft: async (sessionId) => {
      const rows = await db.select().from(drafts).where(eq(drafts.sessionId, sessionId))
      return rows[0] ?? null
    },
    setDraft: async (input) => {
      const row = {...input, updatedAt: now()}
      await db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
      emit()
    },
    listMarkers: async (sessionId) =>
      db.select().from(markers).where(eq(markers.sessionId, sessionId)).orderBy(asc(markers.afterTurn)),
    addMarker: async (input) => {
      const row = {...input, id: randomUUID()}
      await db.insert(markers).values(row)
      emit()
      return row
    },
    watch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

Note: `app.ts` already opens the db once (Task 2 Step 8: `const db = openDb(...)`); reuse that instance for `makeUiState(db)`. Keep one `DatabaseSync` per process.

- [ ] **Step 4: Run tests, wire router handlers**

Run: `pnpm --filter @conciv/db exec vitest run src/ui-state.test.ts`
Expected: PASS

In `router.ts` (`RpcDeps` gains `uiState: UiState`); the `?? new AbortController().signal` fallback is only legal AFTER Task 3's signal-delivery assertion proved signals arrive; every live handler detaches in `finally` (Task 3 amendment M7):

```ts
drafts: {
  get: os.drafts.get.handler(({input}) => deps.uiState.getDraft(input.sessionId)),
  set: os.drafts.set.handler(async ({input}) => {
    await deps.uiState.setDraft(input)
    return {ok: true as const}
  }),
  live: os.drafts.live.handler(async function* ({input, signal}) {
    yield await deps.uiState.getDraft(input.sessionId)
    for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
      yield await deps.uiState.getDraft(input.sessionId)
    }
  }),
},
markers: {
  list: os.markers.list.handler(({input}) => deps.uiState.listMarkers(input.sessionId)),
  live: os.markers.live.handler(async function* ({input, signal}) {
    yield await deps.uiState.listMarkers(input.sessionId)
    for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
      yield await deps.uiState.listMarkers(input.sessionId)
    }
  }),
},
```

In `app.ts`: `const uiState = makeUiState(db)` and `uiState.watch(() => live.pulse())`; pass into `makeRpcRouter`.

Append router tests exercising `drafts.set` → `drafts.get`, `drafts.live` re-emission after a `setDraft`, and `markers.live` first emission via `call` (same shape as Task 4 Step 6). Also unit-test `clearDraft` + `deleteFor` in `ui-state.test.ts`.

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src packages/core/src/rpc packages/core/src/app.ts
git commit -m "feat(db,core): drafts + markers rows with intents and live iterators" -- packages/db packages/core/src
```

---

### Task 6: Session intents (`create`/`resolve`/`rename`/`remove`/`setModel`/`stop`/`launch`) + `editor.*` + `meta.*` (review amendments C1, M1)

**Files:**

- Modify: `packages/core/src/rpc/router.ts`
- Modify: `packages/core/src/app.ts` (extend `RpcDeps` wiring: harness accessors, `killLock`, `openInEditor`, `symbolicateFrames` deps, commands accessor, `stateRoot`)
- Test: additions to `packages/core/src/rpc/router.test.ts`

**Interfaces:**

- Consumes: `resolveSession(deps, body)` from `packages/core/src/api/chat/session.ts:34`; `ensureChatRecord` from `turn.ts:36`; `hub.markStopped`; `killLock` semantics from `session.ts` (SIGTERM a foreign-pid lock holder — extract/export it); `resolveHarnessModels` from `@conciv/harness`; the `/commands` route's assembly in `session.ts` (needs `mcpUrl` built from the request origin — read it from the RPC context's `request`); `harness.launch`; `opts.openInEditor`; the open-source route's `symbolicateFrames` flow (`packages/core/src/api/page/open-source.ts` — reuse, do not duplicate); `uiState.addMarker` + `uiState.deleteFor` (Task 5).
- Produces: ALL remaining non-chat, non-page procedures working: `create`, `resolve` (external adoption via `resolveSession`), `rename` (sanitize: strip control chars, collapse whitespace, cap 120 — port the REST route's clean()), `remove` (= `killLock` + `store.delete` + `uiState.deleteFor`), `setModel` (validates against harness model list, persists `store.update(id, {model})` — turns read it in Task 8; unknown/disabled → typed `UNKNOWN_MODEL` error), `stop` (= `hub.markStopped` + `killLock` — cross-process stop must work), `launch` (typed `UNSUPPORTED` when harness can't launch), `editor.open`, `editor.openFromFrames`, `meta.models`, `meta.commands` (origin from context request), `meta.tools` (same list the REST tools route serves). `sessions.create` writes a `{kind: 'new', afterTurn: 0}` marker.

- [ ] **Step 1: Write the failing tests**

Append to `router.test.ts` (extend `makeDeps` with the fields the handlers below need; for the harness use the same fake-harness helper found in Task 3 Step 3, exposing `models: [{id: 'm1', name: 'M1'}, {id: 'm2', name: 'M2', disabled: true}]` and `defaultModel: 'm1'`):

```ts
it('sessions.create mints a record and a new-marker', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const {sessionId} = await call(router.sessions.create, undefined)
  expect(sessionId).toMatch(/^conciv_/)
  expect(await deps.store.get(sessionId)).not.toBeNull()
  const marks = await deps.uiState.listMarkers(sessionId)
  expect(marks.map((marker) => marker.kind)).toEqual(['new'])
})

it('sessions.rename persists the title', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const {sessionId} = await call(router.sessions.create, undefined)
  const renamed = await call(router.sessions.rename, {sessionId, title: 'named'})
  expect(renamed.title).toBe('named')
  expect((await deps.store.get(sessionId))?.title).toBe('named')
})

it('sessions.setModel rejects unknown and disabled models', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const {sessionId} = await call(router.sessions.create, undefined)
  await expect(call(router.sessions.setModel, {sessionId, model: 'nope'})).rejects.toThrow()
  await expect(call(router.sessions.setModel, {sessionId, model: 'm2'})).rejects.toThrow()
  const set = await call(router.sessions.setModel, {sessionId, model: 'm1'})
  expect(set.model).toBe('m1')
  expect((await deps.store.get(sessionId))?.model).toBe('m1')
})

it('sessions.remove deletes the record', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const {sessionId} = await call(router.sessions.create, undefined)
  await call(router.sessions.remove, {sessionId})
  expect(await deps.store.get(sessionId)).toBeNull()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: the four new tests FAIL with `implemented in task 6`

- [ ] **Step 3: Implement the handlers**

`RpcDeps` gains `harnessModels: () => Promise<{models: Array<{id: string; disabled?: boolean}>; defaultModel: string | null}>`, `harnessMeta: {id: string; name: string; canLaunch: boolean}`, `harnessKind: string`, `cwd: string`, `markStopped: (sessionId: string) => void`, `killLock: (sessionId: string) => void`, `launch: (sessionId: string, model?: string) => Promise<ChatLaunch>`, `commands: (opts: {sessionId?: string; origin: string}) => Promise<ChatCommands>`, `tools: ChatTool[]`, `openInEditor: OpenInEditor`, `openFromFrames: (frames: RawFrame[]) => Promise<OpenSourceResult>` — each wired in `app.ts` from what the corresponding REST route uses today (launch/commands/tools/open-source: open the routes and lift their assembly; do NOT reimplement symbolication or command sourcing). In `router.ts`:

```ts
create: os.sessions.create.handler(async () => {
  const {sessionId} = await resolveSession({store: deps.store, harnessKind: deps.harnessKind, cwd: deps.cwd}, {})
  await ensureChatRecord(deps.store, sessionId, deps.harnessKind, deps.cwd)
  await deps.uiState.addMarker({sessionId, afterTurn: 0, kind: 'new'})
  return {sessionId}
}),
resolve: os.sessions.resolve.handler(async ({input}) => {
  const {sessionId} = await resolveSession({store: deps.store, harnessKind: deps.harnessKind, cwd: deps.cwd}, input)
  return {sessionId}
}),
launch: os.sessions.launch.handler(({input, errors}) => deps.launch(input.sessionId, input.model)),
rename: os.sessions.rename.handler(async ({input}) => {
  const next = await deps.store.update(input.sessionId, {title: cleanTitle(input.title)})
  return {title: next.title ?? input.title}
}),
remove: os.sessions.remove.handler(async ({input}) => {
  deps.killLock(input.sessionId)
  await deps.store.delete(input.sessionId)
  await deps.uiState.deleteFor(input.sessionId)
  return {ok: true as const}
}),
setModel: os.sessions.setModel.handler(async ({input, errors}) => {
  const {models} = await deps.harnessModels()
  const found = models.find((model) => model.id === input.model && !model.disabled)
  if (!found) throw new Error(`unknown or disabled model ${input.model}`)
  await deps.store.update(input.sessionId, {model: input.model})
  return {model: input.model}
}),
stop: os.sessions.stop.handler(({input}) => {
  deps.markStopped(input.sessionId)
  deps.killLock(input.sessionId)
  return {ok: true as const}
}),
```

(`cleanTitle` ports the REST rename sanitization from `session.ts`: strip control chars, collapse whitespace, cap 120.)

and:

```ts
editor: {
  open: os.editor.open.handler(async ({input}) => {
    await deps.openInEditor(input.file, input.line)
    return {ok: true as const}
  }),
  openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
},
meta: {
  models: os.meta.models.handler(async () => {
    const {models, defaultModel} = await deps.harnessModels()
    return {models, defaultModel, harness: deps.harnessMeta}
  }),
  commands: os.meta.commands.handler(({input, context}) =>
    deps.commands({sessionId: input.sessionId, origin: new URL(context.request.url).origin}),
  ),
  tools: os.meta.tools.handler(() => ({tools: deps.tools})),
},
```

(`context.request` exists because Task 3 declared `RpcContext = {request: Request}` and `mount.ts` passes it.)

Wire in `app.ts`: `harnessModels` reuses whatever the existing GET `/models` route in `session.ts` calls (`resolveHarnessModels(harness, ...)` — open `session.ts` lines 80+ and reuse the exact call), `harnessMeta` copies the fields that route returns today, `markStopped: (sessionId) => hub.markStopped(sessionId)`, `killLock` extracted/exported from `session.ts`, `launch`/`commands` lift the corresponding REST route bodies, `tools` is the same `toolList` already built in `makeApp`, `openInEditor: opts.openInEditor`, `openFromFrames` lifts the open-source route's symbolicate+open flow. The existing REST routes stay untouched.

Additional Step 1 tests beyond the four above: `sessions.resolve` with `{}` mints, with a known id returns it, with a foreign harness id adopts (origin `external`); `sessions.stop` calls both `markStopped` and `killLock` (spy deps); `sessions.remove` clears draft+marker rows; `rename` sanitizes (`'  a\n\tb  '` → `'a b'`) and rejects >120; `meta.commands` receives the origin derived from the context request; `editor.open` forwards file+line to a spy.

- [ ] **Step 4: Run tests + commit**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: PASS

```bash
git add packages/core/src/rpc packages/core/src/app.ts
git commit -m "feat(core): session intents + model policy + meta.models over rpc" -- packages/core/src
```

---

### Task 7: Server-side compaction (`sessions.compact`)

**Files:**

- Create: `packages/core/src/api/chat/compact.ts`
- Modify: `packages/core/src/rpc/router.ts` (real `compact` handler; `RpcDeps` gains `compact`)
- Modify: `packages/core/src/app.ts`
- Test: `packages/core/src/api/chat/compact.it.test.ts`

**Interfaces:**

- Consumes: `startTurn`-equivalent flow. `startTurn` is not exported from `turn.ts` — export it (it is pure given `deps, sessionId, chatReq`) and reuse; also `acquireLock`/`releaseLock` from `store/lock.js`, `hub.generating`, `uiState.addMarker`, `compacting` state.
- Produces: `makeCompactor(deps: {chat: ChatRuntime; uiState: UiState; onChange(): void}): {run(sessionId: string): Promise<void>; compacting(sessionId: string): boolean}`. `buildSessionList` maps `status: 'compacting'` from `compacting()` (update the mapper from Task 3) so the client spinner is pure render.

- [ ] **Step 1: Export `startTurn` from `turn.ts`**

Change `async function startTurn(` to `export async function startTurn(` in `packages/core/src/api/chat/turn.ts:128`. Run `pnpm --filter @conciv/core typecheck` — exit 0.

- [ ] **Step 2: Write the failing IT**

`packages/core/src/api/chat/compact.it.test.ts` — drive with the fake harness used by existing turn tests (find it: `grep -rln 'chatConfig' packages/core/src --include='*.test.ts' packages/harness-testkit/src 2>/dev/null | head -5`; `@conciv/harness-testkit` is already a core devDep per `packages/widget/package.json` sibling usage — confirm in `packages/core/package.json` and add if missing). The fake harness must emit a complete tiny turn (RUN_STARTED → text → RUN_FINISHED):

```ts
import {describe, expect, it} from 'vitest'
import {makeCompactor} from './compact.js'

describe('compactor', () => {
  it('runs a compact turn, writes marker, flips compacting during the run', async () => {
    const {chat, uiState, sessionId} = await makeCompactFixture()
    const compactor = makeCompactor({chat, uiState, onChange: () => {}})
    const run = compactor.run(sessionId)
    expect(compactor.compacting(sessionId)).toBe(true)
    await run
    expect(compactor.compacting(sessionId)).toBe(false)
    const kinds = (await uiState.listMarkers(sessionId)).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })
})
```

`makeCompactFixture` builds a real `ChatRuntime` around the fake harness + drizzle store in a temp dir — assemble it exactly like `makeApp` does (Task 3's `test-app.ts` already constructs one; extract the runtime construction there into a shared `packages/core/src/rpc/test-fixtures.ts` and reuse).

- [ ] **Step 3: Run to verify failure, implement**

Run: `pnpm --filter @conciv/core exec vitest run src/api/chat/compact.it.test.ts`
Expected: FAIL — `./compact.js` not found

`packages/core/src/api/chat/compact.ts`:

```ts
import type {ChatRuntime} from './chat-env.js'
import type {UiState} from '@conciv/db'
import {startTurn} from './turn.js'
import {acquireLock, releaseLock} from '../../store/lock.js'

export type Compactor = {run: (sessionId: string) => Promise<void>; compacting: (sessionId: string) => boolean}

export function makeCompactor(deps: {chat: ChatRuntime; uiState: UiState; onChange: () => void}): Compactor {
  const active = new Set<string>()

  async function run(sessionId: string): Promise<void> {
    const chat = deps.chat
    if (chat.hub.generating(sessionId) || active.has(sessionId)) throw new Error('session busy')
    if (!acquireLock(chat.stateRoot, sessionId, 'chat', process.pid)) throw new Error('session busy')
    active.add(sessionId)
    chat.onTurnStart?.(sessionId)
    deps.onChange()
    try {
      await deps.uiState.addMarker({sessionId, afterTurn: 0, kind: 'compact'})
      await startTurn(chat, sessionId, {
        messages: [{role: 'user', content: '/compact'}],
        forwardedProps: {intent: 'compact'},
      })
      await waitForIdle(chat, sessionId)
    } finally {
      active.delete(sessionId)
      releaseLock(chat.stateRoot, sessionId)
      deps.onChange()
    }
  }

  return {run, compacting: (sessionId) => active.has(sessionId)}
}

async function waitForIdle(chat: ChatRuntime, sessionId: string): Promise<void> {
  while (chat.hub.generating(sessionId)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
```

Two realities to reconcile while implementing (the IT is the arbiter):

1. `startTurn` fires the hub run asynchronously (`void deps.hub.start(...)`), so `waitForIdle` must first wait for `generating` to flip true (bounded, 3s max — mirror the client's old `waitForGenerating` semantics server-side) and then false. Implement `waitForIdle` accordingly:

```ts
async function waitForIdle(chat: ChatRuntime, sessionId: string): Promise<void> {
  const deadline = Date.now() + 3000
  while (!chat.hub.generating(sessionId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  while (chat.hub.generating(sessionId)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
```

2. `startTurn`'s lock handling: the chat POST route acquires the lock before calling `startTurn` and `withLockRelease` releases it. Since the compactor acquires the same lock, releasing twice must be a no-op — `releaseLock` already guards via the `lockReleaser` pattern; verify by reading `store/lock.ts` and adjust (drop the compactor's own acquire if `startTurn`'s pipeline owns it — the IT plus a concurrent-`run` assertion decides).

`afterTurn` for the compact marker: use the current settled message count — call `deps.chat.harness.history ? (await transcriptLength()) : 0` is over-engineering; the marker's `afterTurn` is only used for ordering in the thread, and the client positions markers by `afterTurn` relative to `messages.length`. Compute it as the message count the caller sees: extend `Compactor.run(sessionId, afterTurn: number)` — wait, the client may not send counts (client = UI only). Server derives it: reuse `transcriptMessages` from `packages/core/src/api/chat/attach.ts:17` (export it) and use `history.length`. Update the handler accordingly:

```ts
const history = await transcriptMessages(deps.chat, sessionId)
await deps.uiState.addMarker({sessionId, afterTurn: history.length, kind: 'compact'})
```

(Same for `sessions.create`'s marker in Task 6: `afterTurn: 0` is correct there — a new session has no history.)

Router wiring (`RpcDeps` gains `compactor: Compactor`):

```ts
compact: os.sessions.compact.handler(async ({input, errors}) => {
  if (deps.compactor.compacting(input.sessionId) || deps.chat.hub.generating(input.sessionId)) throw errors.BUSY()
  await deps.compactor.run(input.sessionId)
  return {ok: true as const}
}),
```

(The busy check maps to the contract's typed `BUSY` error — assert `code === 'BUSY'` in the test, never a message regex.)

`buildSessionList` mapper: `status: deps.compactor.compacting(id) ? 'compacting' : running ? 'running' : 'idle'`.

In `app.ts`: `const compactor = makeCompactor({chat: chatRuntime, uiState, onChange: () => live.pulse()})`.

- [ ] **Step 4: Run tests + commit**

Run: `pnpm --filter @conciv/core exec vitest run src/api/chat/compact.it.test.ts src/rpc/router.test.ts`
Expected: PASS

```bash
git add packages/core/src/api/chat packages/core/src/rpc packages/core/src/app.ts
git commit -m "feat(core): server-side compaction procedure with compacting status" -- packages/core/src
```

---

### Task 8: `chat.attach` + `chat.send` + `chat.permissionDecision` (native TanStack AI over oRPC) — review amendments C1-C3, M2, M4

**Files:**

- Modify: `packages/core/src/api/chat/attach.ts` (export the snapshot+stream assembly as a function)
- Modify: `packages/core/src/rpc/router.ts`
- Modify: `packages/core/package.json` (devDep `@orpc/client` for the wire-level IT)
- Test: `packages/core/src/rpc/chat-rpc.it.test.ts` (in-process) + `packages/core/src/rpc/wire.it.test.ts` (HTTP-level, typed client)

**Interfaces:**

- Consumes: `transcriptMessages`, `aguiSnapshotFor`, `settledMessages`/`userText` (all in/near `attach.ts` — read it), `hub.attach`, `startTurn` (Task 7), lock acquire flow from the chat POST route (`turn.ts:148-169`), `gate` (permission resolution — read `permission.ts`, the REST `/permission-decision` handler shows the call), `uiState.getDraft`/`clearDraft` (Task 5).
- Produces: `attachStream(deps: ChatRuntime, sessionId: string, signal: AbortSignal): AsyncGenerator<StreamChunk>` exported from `attach.ts`; rpc `chat.attach`/`chat.send`/`chat.permissionDecision` handlers. Plan 2's client bridge consumes `chat.attach` verbatim.
- SEND SEMANTICS (binding): (a) busy → typed `BUSY` error; (b) the session's draft is consumed server-side — grab texts prepended to the outgoing user text, row cleared after the turn starts, live pulsed (the client composer never orchestrates grabs); (c) HISTORY RULE (review C3): when `harness.capabilities.resume` is false OR no resumable transcript token exists, the server rebuilds `messages` from `transcriptMessages(...)` + the new user text before `startTurn` — otherwise non-resume harnesses (pi) get amnesiac turns. Pin with an IT using a fake harness with `resume: false` asserting the adapter received prior turns.

- [ ] **Step 1: Extract `attachStream` from the route**

In `packages/core/src/api/chat/attach.ts`, lift the body of the GET handler into:

```ts
export async function attachStream(
  deps: ChatRuntime,
  sessionId: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamChunk>> {
  const history = await transcriptMessages(deps, sessionId)
  const pending = deps.hub.pendingUserMessage(sessionId)
  const generating = deps.hub.generating(sessionId)
  const {replay, live} = deps.hub.attach(sessionId, signal)
  const settled = settledMessages(history, pending ? userText(pending) : null)
  const messages = pending ? [...settled, pending] : settled
  async function* chunks(): AsyncGenerator<StreamChunk> {
    yield aguiSnapshotFor({generating, messages})
    yield* replay
    yield* live
  }
  return chunks()
}
```

and rewrite the existing GET route to call it (behavior identical — the old widget keeps working):

```ts
const app = new Hono<ChatEnv>().get('/attach', async (c) => {
  const deps = c.var.chat
  const sessionId = sessionIdFromHeaders(c.req.raw.headers)
  if (!sessionId) throw new HTTPException(400, {message: 'no session'})
  const abort = new AbortController()
  c.req.raw.signal.addEventListener('abort', () => abort.abort())
  const stream = await attachStream(deps, sessionId, abort.signal)
  return new Response(toServerSentEventsStream(stream, abort), {status: 200, headers: SSE_HEADERS})
})
```

Run: `pnpm turbo run test --filter=@conciv/core` — the existing attach ITs must stay green before proceeding.

- [ ] **Step 2: Write the failing rpc IT**

`packages/core/src/rpc/chat-rpc.it.test.ts` (fixture from Task 7; fake harness emits RUN_STARTED → TEXT_MESSAGE chunks → RUN_FINISHED):

```ts
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {EventType} from '@tanstack/ai'
import {makeRpcFixture} from './test-fixtures.js'

describe('chat over rpc', () => {
  it('send starts a turn; attach replays snapshot then live chunks to RUN_FINISHED', async () => {
    const {router, sessionId} = await makeRpcFixture()
    await call(router.chat.send, {sessionId, text: 'hello'})
    const abort = new AbortController()
    const iterator = await call(router.chat.attach, {sessionId}, {signal: abort.signal})
    const types: string[] = []
    for await (const chunk of iterator) {
      types.push(chunk.type)
      if (chunk.type === EventType.RUN_FINISHED) abort.abort()
    }
    expect(types[0]).toBe(EventType.CUSTOM)
    expect(types).toContain(EventType.RUN_FINISHED)
  })

  it('send rejects while generating', async () => {
    const {router, sessionId, holdTurnOpen} = await makeRpcFixture()
    const release = holdTurnOpen()
    await call(router.chat.send, {sessionId, text: 'first'})
    await expect(call(router.chat.send, {sessionId, text: 'second'})).rejects.toThrow(/busy/)
    release()
  })
})
```

(`types[0]` is the AG-UI snapshot custom event — confirm the exact chunk type `aguiSnapshotFor` produces by reading `packages/protocol/src/ui-types.ts` and assert on that; `holdTurnOpen` makes the fake harness stall until released — implement it in the fixture with a promise the fake adapter awaits before emitting RUN_FINISHED.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/chat-rpc.it.test.ts`
Expected: FAIL with `implemented in task 8`

- [ ] **Step 4: Implement the handlers**

In `router.ts` (`RpcDeps` gains `chat: ChatRuntime`, `sendTurn: (sessionId: string, text: string) => Promise<void>`, and `decidePermission: (approvalId: string, approved: boolean) => void` wired to the gate exactly as the REST `/permission-decision` route does):

```ts
chat: {
  attach: os.chat.attach.handler(async function* ({input, signal}) {
    const abort = new AbortController()
    signal?.addEventListener('abort', () => abort.abort(), {once: true})
    try {
      yield* await attachStream(deps.chat, input.sessionId, abort.signal)
    } finally {
      abort.abort()
    }
  }),
  send: os.chat.send.handler(async ({input, errors}) => {
    if (deps.chat.hub.generating(input.sessionId)) throw errors.BUSY()
    await deps.sendTurn(input.sessionId, input.text)
    return {ok: true as const}
  }),
  permissionDecision: os.chat.permissionDecision.handler(({input}) => {
    deps.decidePermission(input.approvalId, input.approved)
    return {ok: true as const}
  }),
},
```

Test `permissionDecision` end-to-end: fake harness stalls on a gated tool mid-turn, the IT resolves it via the procedure, the turn completes.

`sendTurn` lives in `app.ts` beside the runtime construction and mirrors the chat POST route's flow exactly (busy check → lock → `onTurnStart` → `ensureChatRecord` → `startTurn` with a `ChatRequest` of `{messages: [{role: 'user', content: text}], forwardedProps: {model: <session record model>}}`); the session's stored `model` (Task 6) rides `forwardedProps.model` so `requestedModelFor` picks it up unchanged:

```ts
const sendTurn = async (sessionId: string, text: string): Promise<void> => {
  if (chatRuntime.hub.generating(sessionId)) throw new Error('session busy')
  if (!acquireLock(chatRuntime.stateRoot, sessionId, 'chat', process.pid)) throw new Error('session busy')
  try {
    chatRuntime.onTurnStart?.(sessionId)
    await ensureChatRecord(chatRuntime.store, sessionId, harness.id, opts.cwd)
    const draft = await uiState.getDraft(sessionId)
    const grabs = draft?.grabs?.length ? `${draft.grabs.join('\n')}\n` : ''
    const userText = `${grabs}${text}`
    const record = await chatRuntime.store.get(sessionId)
    const model = record?.model ?? undefined
    const resumable = harness.capabilities.resume && (await resumeTokenFor(chatRuntime.store, sessionId)) !== null
    const history = resumable ? [] : await transcriptMessages(chatRuntime, sessionId)
    await startTurn(chatRuntime, sessionId, {
      messages: [...history, {role: 'user', content: userText}],
      ...(model ? {forwardedProps: {model}} : {}),
    })
    await uiState.clearDraft(sessionId)
  } catch (error) {
    releaseLock(chatRuntime.stateRoot, sessionId)
    throw error
  }
}
```

(Match `ChatRequest`'s exact zod shape from `@conciv/protocol/chat-types` — if `forwardedProps.model` is not in the schema, pass `model` at the top level; `requestedModelFor` in `turn.ts:77` accepts both. Verify the exact resumability check against `turn.ts`'s own `resumableToken` logic — reuse its helper rather than reimplementing; the shape above is directional. The history rebuild is review C3: without it, non-resume harnesses receive one-message context.)

- [ ] **Step 5 (review amendment C2): wire-level IT with the real typed client**

`packages/core/src/rpc/wire.it.test.ts` — the ONLY test in the plan that exercises the actual RPC wire (serializer envelope, event-iterator streaming through `RPCHandler` → Hono → `c.newResponse`, disconnect propagation). Install `pnpm add -D @orpc/client` in core. Build a client whose fetch is bound to the Hono app:

```ts
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'

const link = new RPCLink({url: 'http://conciv.test/rpc', fetch: (request) => app.request(request)})
const client: ContractRouterClient<typeof contract> = createORPCClient(link)
```

(Verify exact `RPCLink` options + client typing against `node_modules/@orpc/client` — adjust mechanically.) Assert, over HTTP: (a) `client.chat.send` then `client.chat.attach` streams snapshot → chunks → RUN_FINISHED with `StreamChunk` payloads intact through the serializer; (b) `client.sessions.live` re-emits after a store write; (c) aborting the client signal detaches the server subscriber (`hub` subscriber count back to zero — expose a test hook or observe via no further writes); (d) a typed error (`BUSY`) round-trips with its `code`.

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/wire.it.test.ts`
Expected: PASS

- [ ] **Step 6: Run tests + full suite + commit**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/chat-rpc.it.test.ts src/rpc/wire.it.test.ts`
Expected: PASS
Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS

```bash
git add packages/core/src/api/chat/attach.ts packages/core/src/rpc packages/core/src/app.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): chat.attach/send/permissionDecision — native StreamChunks over oRPC + wire IT" -- packages/core pnpm-lock.yaml
```

---

### Task 9: Page bus over oRPC (`page.queries` iterator + `page.reply`)

**Files:**

- Read first: `packages/core/src/api/page/page.ts` (`makePageBus` — the existing ask/reply/stream mechanics)
- Modify: `packages/core/src/rpc/router.ts`
- Modify: `packages/core/src/app.ts` (pass `pageBus` into `RpcDeps`)
- Test: additions to `packages/core/src/rpc/router.test.ts`

**Interfaces:**

- Consumes: the existing `PageBus` (`makePageBus()` in `app.ts:141`) — whatever subscribe/next mechanism its SSE route uses today, reuse it; do NOT build a second bus.
- Produces: `page.queries` yielding `{requestId, query}` objects (today's SSE `data:` payload, parsed), `page.reply` resolving the pending `ask`.

- [ ] **Step 1: Read `page.ts` and write the failing test**

Open `packages/core/src/api/page/page.ts`; identify (a) how the SSE route obtains queries from the bus (an emitter/queue) and (b) the reply POST handler. Then append to `router.test.ts`:

```ts
it('page.ask round-trips through queries iterator + reply', async () => {
  const deps = makeDeps()
  const router = makeRpcRouter(deps)
  const abort = new AbortController()
  const iterator = await call(router.page.queries, undefined, {signal: abort.signal})
  const asked = deps.pageBus.ask({kind: 'snapshot'})
  const first = await iterator.next()
  abort.abort()
  const event = first.value
  expect(event?.requestId).toBeTruthy()
  await call(router.page.reply, {requestId: event.requestId, data: {ok: true, value: 'snap'}})
  await expect(asked).resolves.toMatchObject({ok: true})
})
```

(Adjust `ask` input/resolution shape to the real `PageBus` API from step 1's reading — the query kinds live in `@conciv/protocol/page-types`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: new test FAILS with `implemented in task 9`

- [ ] **Step 3: Implement handlers**

`RpcDeps` gains `pageBus: ReturnType<typeof makePageBus>`. The handlers adapt the bus's existing subscribe/reply mechanics (exact code depends on step 1's reading; the shape):

```ts
page: {
  queries: os.page.queries.handler(async function* ({signal}) {
    for await (const query of deps.pageBus.stream(signal ?? new AbortController().signal)) {
      yield {requestId: query.requestId, query}
    }
  }),
  reply: os.page.reply.handler(({input, errors}) => {
    const accepted = deps.pageBus.reply(input.requestId, input.data)
    if (accepted === false) throw errors.UNKNOWN_REQUEST()
    return {ok: true as const}
  }),
},
```

(The contract's `page.reply` input is `PageReplySchema` from `@conciv/protocol/page-types` — no cast needed on `data`; if the bus's resolve doesn't report unknown ids today, have the adapter return a boolean rather than swallowing. `page.queries` is NOT resumable by design — a dropped in-flight query times out at the asker exactly like today's SSE; documented in the contract docblock.)

If `makePageBus` exposes no `stream(signal)` async-iterable today (the SSE route probably wires an emitter inline), add one to the bus using the Task 4 `makeLiveFeed` waiter pattern with a queue — inside `page.ts`, exported alongside the existing API, leaving the SSE route untouched.

- [ ] **Step 4: Run tests + commit**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/router.test.ts`
Expected: PASS

```bash
git add packages/core/src/rpc packages/core/src/api/page packages/core/src/app.ts
git commit -m "feat(core): page bus queries/reply over oRPC" -- packages/core/src
```

---

### Task 10: Turn-stream completeness — tool durations in-stream + attach replay IT

**Files:**

- Read first: `grep -rn 'CONCIV_TOOL_DURATION_EVENT\|tool-duration' packages --include='*.ts' | grep -v widget | grep -v node_modules`
- Modify: whichever core/tools module emits (or fails to emit) tool-duration events so they ride the turn stream (most likely `packages/core/src/runtime/ui-bus.ts` or the tool middleware in `packages/core/src/api/chat/chat-tools.ts`)
- Test: `packages/core/src/rpc/chat-rpc.it.test.ts` additions

**Interfaces:**

- Consumes: `uiBus.run` merge (read `packages/core/src/runtime/ui-bus.ts` fully first), `hub` replay (`turn-hub.ts` `view.record`).
- Produces: guarantee: every custom event the panel used to demux (`conciv.ui`, tool-duration, usage) is (a) emitted inside the turn stream and (b) replayed to a late `chat.attach` while the run is still live. Gen-UI/tool-timing rendering as parts is client-side work (Plan 2/3); server-side the chunks are already in-stream — this task pins it.

- [ ] **Step 1: Write the failing/verifying IT**

Append to `chat-rpc.it.test.ts` — fake harness turn includes one tool call; the conciv tool context `injectUi` fires a gen-ui spec mid-turn:

```ts
it('custom events (gen-ui) ride the stream and replay to a late attach', async () => {
  const {router, sessionId, injectUiMidTurn, holdTurnOpen} = await makeRpcFixture()
  const release = holdTurnOpen()
  await call(router.chat.send, {sessionId, text: 'draw'})
  injectUiMidTurn({renderId: 'r1', kind: 'question', title: 'pick one'})
  const abort = new AbortController()
  const iterator = await call(router.chat.attach, {sessionId}, {signal: abort.signal})
  const customNames: string[] = []
  const consumer = (async () => {
    for await (const chunk of iterator) {
      if (chunk.type === EventType.CUSTOM) customNames.push(chunk.name)
      if (chunk.type === EventType.RUN_FINISHED) abort.abort()
    }
  })()
  release()
  await consumer
  expect(customNames.some((name) => name.includes('ui') || name.includes('conciv'))).toBe(true)
})
```

(Pin the exact event name from `packages/protocol/src/ui-types.ts` `CONCIV_UI_EVENT` — import and assert equality, not `includes`.)

- [ ] **Step 2: Run, fix whatever it exposes**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/chat-rpc.it.test.ts`
If it passes immediately: the server side was already complete (uiBus merges into the stream, hub records replay) — keep the test as the regression pin.
If replay misses the injected event: the gap is in `turn-hub.ts` `view.record` vs `uiBus.run` ordering — fix so injected chunks pass through `hub.start`'s relay (they already should, since `uiBus.run(sessionId, stream)` wraps the stream _before_ `hub.start` consumes it; the test decides).

For tool durations: run the grep from Files. If nothing server-side emits `CONCIV_TOOL_DURATION_EVENT` (it may be emitted by tool middleware already), add emission where tool results resolve in `buildChatTools` (`packages/core/src/api/chat/chat-tools.ts`) by measuring wall time around `execute` and injecting via `uiBus.inject(sessionId, ...)` with the `ToolDurationSchema` payload from `@conciv/protocol/tool-timing` — then extend the IT to assert a duration event follows the tool result.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src
git commit -m "test(core): pin custom-event replay through attach; tool durations in-stream" -- packages/core/src
```

---

### Task 11: DEMOLITION — delete client-facing REST + packages/widget + packages/api-client (user decision 2026-07-10)

Replaces the dropped extension-oRPC task (extension comms stay Hono, deferred phase — do not modify `packages/extension`'s comms). With the oRPC surface complete (Tasks 3-10), delete the old client plane in one sweep:

- [ ] **Step 1: Delete the packages.** `git rm -r packages/widget packages/api-client`; prune both from `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts` and from any turbo/e2e wiring that references them (grep `@conciv/widget` and `@conciv/api-client` across the repo, including `.github/workflows`).
- [ ] **Step 2: Fix collateral consumers.** `packages/extensions/terminal/src/client/terminal-actions.tsx` and `packages/extension-testkit/src/host/host-runtime.tsx` import `@conciv/api-client` — rewire them to a minimal local shim over the oRPC client or inline fetches against `/rpc` (extensions phase does it properly; here just keep them compiling). `packages/plugin` widget-middleware serves the widget bundle — stub or gate the middleware (the new client arrives in plan 3; until then the plugin serves no UI).
- [ ] **Step 3: Delete client-facing REST routes.** Remove from `composeRoutes`/route files: `/api/chat` (turn POST, attach, session*, models, commands, history, sessions, title, stop, launch, permission-decision), `/api/editor/open`, `/api/page/open-source`, `/api/page/stream`, `/api/page/reply`. KEEP: `/api/mcp` (MCP protocol), `/api/ext/*`(extensions),`/api/chat/ui`+`/api/page/:verb`+`/api/page/changes*`+`/api/server/*` (conciv CLI agent tooling). Where a route file also hosts shared logic (`launch.ts`helpers,`session.ts` `resolveSession`/`buildSessionList`/`killLock`/`listCommands`, `open-source.ts`symbolication adapter,`attach.ts` `attachStream`), keep the functions, delete the Hono apps.
- [ ] **Step 3b: Re-home the red core ITs (route deletion fallout, known set from Task 6).** `packages/harness-testkit`'s session bootstrap calls the deleted REST resolve — port it to `/rpc/sessions/resolve` via the typed oRPC client (testkit may depend on `@conciv/contract`). Then triage the failing files: `chat.it.test.ts`, `sessions.it.test.ts`, `commands.it.test.ts`, `turn-detach.it.test.ts`, `turn-end.it.test.ts`, `turn-error-flood.it.test.ts`, `create-testkit.it.test.ts`, `extension-server-surfaces.it.test.ts`, `cors.it.test.ts` (probes deleted `/api/chat/models` — probe `/rpc` instead) — rewrite each against the rpc surface where the behavior still exists, delete where the test only exercised a deleted route.
- [ ] **Step 4: Gates.** `pnpm typecheck && pnpm build && pnpm test` green (widget tests are gone with the package); `pnpm exec fallow audit --changed-since main` — the sweep will surface newly-dead exports (unstorage memory driver, session-id header helpers, SSE utilities); delete what fallow flags INTRODUCED-dead, verifying each with `--trace`.
- [ ] **Step 5: Commit** with pathspec covering the deleted trees + touched packages.

The original extension-oRPC task body is preserved below for the future extensions phase, unchecked and inert.

<details>
<summary>Deferred original Task 11 content</summary>

**Files:**

- Modify: `packages/extension/src/extension-api.ts` or `types.ts` (server result type gains optional `rpc`)
- Modify: `packages/core/src/app.ts:255-257` (mount extension rpc handlers beside the existing Hono mount)
- Test: `packages/core/src/rpc/ext-rpc.it.test.ts`

**Interfaces:**

- Consumes: extension server hook result (`extension.__server?.(...)` returning `{app?, context?, dispose?, turnEnd?}` — see `app.ts:174-188`).
- Produces: extensions may return `rpc: AnyRouter` (type from `@orpc/server`); core mounts each at `/rpc/ext/<slug(extension.name)>/*` with its own `RPCHandler`. Client-side typed consumption lands in Plan 2.

- [ ] **Step 1: Extend the server result type**

In `packages/extension` (find the server-result type: `grep -n 'app?' packages/extension/src/*.ts`), add `rpc?: unknown` narrowed in core (extension must not depend on `@orpc/server`; core validates):

In `app.ts`, beside `narrowExtensionApp`:

```ts
import {RPCHandler} from '@orpc/server/fetch'

function narrowExtensionRpc(name: string, rpc: unknown): RPCHandler<Record<never, never>> | null {
  if (rpc === undefined || rpc === null) return null
  return new RPCHandler(rpc as Parameters<typeof RPCHandler>[0])
}
```

(`as` is banned — instead type the extension field as the oRPC router type by adding `@orpc/server` as a type-only dependency of `@conciv/extension`: `rpc?: AnyRouter` with `import type {AnyRouter} from '@orpc/server'`. Then no cast is needed. Do it this way.)

- [ ] **Step 2: Write the failing IT**

`packages/core/src/rpc/ext-rpc.it.test.ts` — a test extension returning a one-procedure router:

```ts
import {describe, expect, it} from 'vitest'
import {os} from '@orpc/server'
import {z} from 'zod'
import {makeTestAppWithExtension} from './test-fixtures.js'

describe('extension rpc', () => {
  it('mounts extension routers under /rpc/ext/<slug>', async () => {
    const router = {
      ping: os.input(z.object({value: z.string()})).handler(({input}) => ({echo: input.value})),
    }
    const app = await makeTestAppWithExtension({name: 'echo-ext', rpc: router})
    const response = await app.request('/rpc/ext/echo-ext/ping', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({json: {value: 'hi'}}),
    })
    expect(response.status).toBe(200)
  })
})
```

(The RPC wire envelope (`{json: ...}`) must match the installed oRPC serializer — if the raw request shape differs, drive this test through `createORPCClient` with a fetch link bound to `app.request` instead of hand-rolling the body; that is the more faithful test and Plan 2 needs the same pattern.)

- [ ] **Step 3: Implement the mount**

In `makeApp`, extend the `mounted.forEach` at line 255:

```ts
mounted.forEach((entry) => {
  if (entry.app) app.route(`/api/ext/${slug(entry.extensionName)}`, entry.app)
  if (entry.rpcHandler) {
    const prefix = `/rpc/ext/${slug(entry.extensionName)}`
    app.use(`${prefix}/*`, async (c, next) => {
      const {matched, response} = await entry.rpcHandler.handle(c.req.raw, {prefix, context: {}})
      if (matched && response) return c.newResponse(response.body, response)
      await next()
    })
  }
})
```

with `rpcHandler` built in the `mounted` map step from `result?.rpc` via `new RPCHandler(result.rpc)` when present.

- [ ] **Step 4: Run tests + commit**

Run: `pnpm --filter @conciv/core exec vitest run src/rpc/ext-rpc.it.test.ts`
Expected: PASS

```bash
git add packages/core/src packages/extension/src packages/extension/package.json pnpm-lock.yaml
git commit -m "feat(core,extension): extensions contribute oRPC routers at /rpc/ext/<slug>" -- packages/core packages/extension pnpm-lock.yaml
```

</details>

---

### Task 12: Plan-wide gates

**Files:**

- No new files; whole-repo verification.

- [ ] **Step 1: No placeholder handlers remain**

Run: `grep -n 'implemented in task' packages/core/src/rpc/router.ts`
Expected: no output. Any hit means a task above was skipped — go back.

- [ ] **Step 2: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: exit 0 — including every pre-existing widget/core/extension test (old REST surface untouched). KNOWN pre-existing failure on this machine (fails identically on main, live-LLM environmental): `packages/core/test/api/mcp/claude-image.it.test.ts` — does not gate this plan; everything else must be green.

- [ ] **Step 3: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. Dead-code hits on `createFsSessionStore`/unstorage remnants mean Task 2 Step 8's cleanup was incomplete — verify with `pnpm exec fallow dead-code --trace` before deleting.

- [ ] **Step 4: Commit any gate fixes**

```bash
git add -A packages/core packages/contract packages/extension
git commit -m "chore(core): widget-rewrite plan 1 gates — typecheck, tests, fallow clean" -- packages/core packages/contract packages/extension
```

---

## Self-review notes (kept for the executor)

- **Adversarial review 2026-07-10 (two independent agents: client-comms audit + plan soundness) folded in:** contract v3 is the COMPLETE client surface (see route-disposition ledger); Task 11 dropped (extensions deferred); C1 orphaned procedures now owned by T6/T8; C2 wire-level IT added (T8 Step 5); C3 history rebuild for non-resume harnesses (T8); C4 live-feed dirty-flag redesign (T4); M1 killLock + row cleanup (T6); M2 server-side draft consumption (T8); M3 drafts.live (T5); M4 typed errors (T3 contract); M5 WAL + busy_timeout (T2 Step 10); M7 signal assertion + finally-detach (T3); M8 compactor onTurnStart (T7).
- **Spec coverage in this plan:** contract package ✓ (T1, T3), drizzle/node:sqlite storage in `@conciv/db` ✓ (T2), oRPC Hono mount + body caveat ✓ (T3), sessions.live ✓ (T4), drafts/markers (+live) ✓ (T5), intents + model policy + resolve/launch/editor/meta ✓ (T6), compaction ✓ (T7), native chat + permission decisions over oRPC + wire IT ✓ (T8), page bus ✓ (T9), custom-event/parts server guarantee ✓ (T10). Deliberately NOT here (later plans/phases): extension oRPC (deferred phase), `client`/`storage-history` packages, TanStack Query integration, `apps/conciv`, `embed`, page package split, widget/api-client deletion, old REST route removal, `PUBLIC_PACKAGES` pruning for deleted packages.
- **oRPC API surfaces** (handler signatures, `eventIterator` export home, RPC wire envelope, `call` options, `.errors` API, `RPCLink` options) were written from the docs; the installed major may differ mechanically — every task that touches them starts with a `node_modules` types check. Adjust call-sites, not the architecture.
- **Type consistency:** `RpcDeps` grows monotonically across T3→T9: `store`, `buildSessionList`, `live`, `uiState`, `harnessModels`, `harnessMeta`, `harnessKind`, `cwd`, `markStopped`, `killLock`, `launch`, `commands`, `tools`, `openInEditor`, `openFromFrames`, `compactor`, `chat`, `sendTurn`, `decidePermission`, `pageBus`. The implementer carries `RpcContext = {request: Request}`. `test-fixtures.ts` (T7) is the single fixture home; T3's `test-app.ts` folds into it when created.
- **Working-tree state when this revision landed:** T1+T2 committed; T3 partially applied (contract v2 code, router placeholders, mount, app.ts half-wired — DOES NOT COMPILE until T3's makeApp wiring step). First execution move: reconcile the working tree to contract v3 (this doc), then finish T3.
