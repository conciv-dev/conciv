# Widget Rewrite Plan 1/4: @conciv/db + TrailBase in core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@conciv/db` (TrailBase schema, server lifecycle, TanStack DB collection factories, Solid hooks) and make core spawn TrailBase, store sessions in it, publish turn status, and own compaction.

**Architecture:** Core downloads and supervises a single `trail` binary (sqlite in the state dir). The engine writes through a `SessionStore`-compatible adapter over TrailBase's records HTTP API, so existing call sites do not change. Widget-facing collection factories and hooks ship now, consumed by Plan 3. Spec: `docs/superpowers/specs/2026-07-09-widget-rewrite-design.md`.

**Declared deviations from the spec (approved):**

- Compaction endpoint is `POST /api/chat/compact` with the session id in the `conciv-session-id` header (matches every existing chat route), not the spec's `POST /api/sessions/:id/compact`.
- The `trail` binary caches in `~/.cache/conciv/trailbase/<version>/` (shared across projects, Playwright-style), not the per-project state dir. The traildepot data dir IS per-project (`<stateRoot>/.conciv/trailbase`).
- The old fs session store, its in-memory test twin (`test/helpers/memory-store.ts`), and their tests are DELETED, not adapted. Core tests run against a real spawned TrailBase — no stubs, no in-memory store anywhere.

**Tech Stack:** TrailBase v0.30.0 (pinned binary), `trailbase` npm client 0.13.x (pinned), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection`, zod, Hono (existing core). New workspace packages: `@conciv/errors` (typed error contract, zero deps) and `@conciv/db`.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (lint deletes them). No `any`/`as`/non-null `!`; strict TS (`noUncheckedIndexedAccess`, NodeNext).
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Every Solid package vitest config pins `test: {environment: 'node'}`.
- No new npm dependency without it appearing in this plan. New deps here: `trailbase`, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/trailbase-db-collection` (state package only).
- No stubs/mocks: integration tests run a real downloaded TrailBase binary.
- Build via turbo: `pnpm turbo run build --filter=@conciv/db`. Tests build first (`pnpm test` depends on build).
- TrailBase gotchas (from spike): record-API PKs must be UUIDv7 blob or INTEGER; `--data-dir` is a global flag (`trail --data-dir X run`, not `trail run --data-dir X`); `--dev` enables permissive CORS; `trailBaseCollectionOptions` requires `parse: {}` and `serialize: {}`.
- Session ids are `conciv_<uuid>` strings (`SessionId` in `packages/protocol/src/chat-types.ts:38`) and CANNOT be record PKs. Every table uses an auto UUIDv7 `id` PK plus a `session_id` TEXT business key.
- Pre-release v0: no data migration from the old fs session store; old `.conciv/sessions` JSON files are simply no longer read.
- Error handling is production-grade throughout, centralized in the NEW `@conciv/errors` package (Task 1): every failure thrown by code this plan touches is a `ConcivError` — built by the `defineErrors` factory (no `Error` subclasses, the repo bans classes) carrying `name: 'ConcivError'`, a package `scope`, a machine-readable `code`, and structured `details` — NEVER a bare `new Error(string)`. Errors preserve the underlying cause (stderr tail, HTTP status + body, url) so the UI can branch on `code`/render `details` and operators can debug from one message. Fire-and-forget writes (`void ...`) are only allowed for status flips where the turn must not die on a state-plane hiccup, and each one has a `.catch` that logs via core's logger rather than swallowing silently.
- Commit after every task with pathspecs (`git commit -- <paths>`).

---

### Task 1: Scaffold `@conciv/errors` + `@conciv/db`

**Files:**

- Create: `packages/errors/package.json`, `packages/errors/tsconfig.json`, `packages/errors/tsdown.config.ts`, `packages/errors/vitest.config.ts`
- Create: `packages/errors/src/index.ts` (the whole package — `ConcivError`, `defineErrors`, `isConcivError`)
- Create: `packages/errors/src/index.test.ts`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/tsdown.config.ts`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/src/index.ts` (placeholder export, replaced in Task 2)
- Create: `packages/db/src/server/index.ts` (placeholder, replaced in Task 4)
- Create: `packages/db/src/solid/index.ts` (placeholder, replaced in Task 6)
- Modify: `packages/publish/src/guards.ts` (add `@conciv/errors` and `@conciv/db` to `PUBLIC_PACKAGES`)

**Interfaces:**

- Produces: package `@conciv/errors` (export `.`) — the single error contract for the whole workspace; package `@conciv/db` with exports `.`, `./server`, `./solid`.

- [ ] **Step 0: `@conciv/errors` — the workspace error contract**

Scaffold mirrors `packages/grab` (same scripts, tsdown/tsconfig/vitest shape, `homepage`, `repository.directory: packages/errors`, lockstep version, zero runtime dependencies). `src/index.ts` IS the package:

```ts
export type ConcivError<Code extends string = string> = Error & {
  name: 'ConcivError'
  scope: string
  code: Code
  userCode: string
  userMessage: string
  httpStatus: number
  details: Record<string, unknown>
}

export type ClientErrorPayload = {
  message: string
  code: string
  internal?: {scope: string; code: string; message: string; details: Record<string, unknown>}
}

export function defineErrors<Code extends string>(opts: {
  scope: string
  userMessages: Record<Code, string>
  httpStatus?: Partial<Record<Code, number>>
}): {
  error: (code: Code, message: string, details?: Record<string, unknown>) => ConcivError<Code>
  is: (error: unknown) => error is ConcivError<Code>
} {
  return {
    error: (code, message, details = {}) =>
      Object.assign(new Error(message), {
        name: 'ConcivError' as const,
        scope: opts.scope,
        code,
        userCode: `${opts.scope}.${code}`,
        userMessage: opts.userMessages[code],
        httpStatus: opts.httpStatus?.[code] ?? 500,
        details,
      }),
    is: (error): error is ConcivError<Code> => isConcivError(error) && error.scope === opts.scope,
  }
}

export function isConcivError(error: unknown): error is ConcivError {
  return error instanceof Error && error.name === 'ConcivError' && 'scope' in error && 'code' in error
}

export function clientPayload(error: ConcivError, dev: boolean): ClientErrorPayload {
  const payload: ClientErrorPayload = {message: error.userMessage, code: error.userCode}
  return dev
    ? {...payload, internal: {scope: error.scope, code: error.code, message: error.message, details: error.details}}
    : payload
}
```

The split, and what crosses the wire:

- `message`/`details` are INTERNAL — precise, may contain paths, stderr, HTTP bodies. Logs only.
- `userMessage`/`userCode` are the CLIENT-SAFE pair, written once per code in the `userMessages` map (not at every throw site — throw sites stay `error(code, message, details)`). On transport they become the response's `message` and `code`.
- `clientPayload(error, dev)` is the one serializer: normal mode ships only `{message: userMessage, code: userCode}`; dev mode adds the `internal` block so you can debug from the browser while developing. No Hono built-in does this — Hono's idiom is exactly a central `app.onError` formatter (plus `HTTPException` for intentional statuses), which is where this gets called.

All code this plan writes throws ONLY through a `defineErrors` factory — a bare `new Error` in review is a defect. No classes: `Object.assign` builds the intersection without casts.

`src/index.test.ts` (TDD like every other task): factory output shape (`instanceof Error`, `name`, `scope`, `code`, `userCode` = `scope.code`, `userMessage` from the map, `httpStatus` from the map with 500 default, `details` default `{}`); `is` accepts own scope, rejects other scopes / bare errors / non-errors; `isConcivError` accepts any scope; `clientPayload` redacts `internal` when `dev` is false and includes it when true.

- [ ] **Step 1: Write package.json** (mirror `packages/grab/package.json` fields: homepage `https://conciv.dev`, repository with `directory: packages/db`, MIT, publishConfig public)

```json
{
  "name": "@conciv/db",
  "version": "0.0.7",
  "description": "conciv domain-state plane: TrailBase schema and lifecycle, TanStack DB collection factories, and Solid hooks shared by core, surface, and extensions.",
  "homepage": "https://conciv.dev",
  "bugs": "https://github.com/conciv-dev/conciv/issues",
  "license": "MIT",
  "repository": {"type": "git", "url": "git+https://github.com/conciv-dev/conciv.git", "directory": "packages/db"},
  "files": ["dist"],
  "type": "module",
  "exports": {
    ".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"},
    "./server": {"types": "./dist/server/index.d.ts", "import": "./dist/server/index.js"},
    "./solid": {"types": "./dist/solid/index.d.ts", "import": "./dist/solid/index.js"}
  },
  "publishConfig": {"access": "public"},
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run --passWithNoTests",
    "publint": "publint",
    "attw": "attw --pack . --profile esm-only"
  },
  "dependencies": {
    "@conciv/errors": "workspace:*",
    "@conciv/protocol": "workspace:*",
    "@tanstack/db": "0.6.14",
    "@tanstack/solid-db": "^0.2.28",
    "@tanstack/trailbase-db-collection": "^0.1.92",
    "trailbase": "^0.13.0",
    "zod": "^4.4.3"
  },
  "peerDependencies": {"solid-js": "^1.9.0"},
  "devDependencies": {
    "@types/node": "^22.19.21",
    "get-port": "^7.1.0",
    "solid-js": "^1.9.13",
    "tsdown": "^0.22.2",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

The `@tanstack/db` trio is pinned deliberately and must NOT drift: `@tanstack/solid-db ^0.2.28` and `@tanstack/trailbase-db-collection ^0.1.92` both hard-pin `@tanstack/db` to the EXACT string `0.6.14`, so the direct dep must be exact `"0.6.14"` (no caret — a caret would resolve our copy to a future 0.6.15 while the other two stay on 0.6.14, giving two `@tanstack/db` copies; reproduced failure: `CollectionConfig<T>` not assignable across copies). The whiteboard extension already ships `@tanstack/solid-db ^0.2.28` — one workspace copy total. (The spike's older `solid-db ^0.1.24` pin would drag in a second db copy — do not copy the spike's manifest; the spike also resolves `trailbase` types to `any`, so it proves nothing about typing.) `@types/node` is required because the tsconfig sets `"types": ["node"]`. Match `zod`/`vitest`/`tsdown`/`typescript`/`solid-js`/`get-port` to the repo's existing pins if they have moved. Set `version` to the current lockstep version of the `@conciv/*` set (currently 0.0.7 — check any published package).

- [ ] **Step 2: tsconfig, tsdown, vitest configs**

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {"rootDir": ".", "noEmit": true, "lib": ["ES2023", "DOM", "DOM.Iterable"], "types": ["node"]},
  "include": ["src/**/*.ts", "vitest.config.ts", "tsdown.config.ts"]
}
```

`packages/db/tsdown.config.ts`:

```ts
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server/index.ts', 'src/solid/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
```

`packages/db/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {environment: 'node', testTimeout: 30000},
})
```

Placeholder `src/index.ts` / `src/server/index.ts` / `src/solid/index.ts`: `export {}` each.

- [ ] **Step 3: Register in publish guards**

In `packages/publish/src/guards.ts` add `'@conciv/db'` to the `PUBLIC_PACKAGES` array (alphabetical position).

- [ ] **Step 4: Install and verify**

Run: `pnpm install` (workspace root; lockfile update), then `pnpm turbo run build --filter=@conciv/errors --filter=@conciv/db` and `pnpm --filter @conciv/errors test`
Expected: builds succeed (state dist/ contains index.js, server/index.js, solid/index.js), errors tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/errors packages/db packages/publish/src/guards.ts pnpm-lock.yaml
git commit -m 'feat: scaffold @conciv/errors + @conciv/db packages' -- packages/errors packages/db packages/publish/src/guards.ts pnpm-lock.yaml
```

---

### Task 2: Row schemas + error model

**Files:**

- Create: `packages/db/src/errors.ts`
- Create: `packages/db/src/rows.ts`
- Create: `packages/db/src/rows.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**

- Consumes: `SessionRecordSchema`, `UsageSnapshotSchema` from `@conciv/protocol/chat-types` / `@conciv/protocol/usage-types`.
- Produces (errors): `StateErrorCode`, `stateError`, `isStateError` — the state-scoped instantiation of `@conciv/errors`. Every throw in this package goes through `stateError`; consumers (core routes, later the widget) branch on `error.code` instead of parsing message strings.

`packages/db/src/errors.ts` — no local error machinery, just the scope binding:

```ts
import {defineErrors, type ConcivError} from '@conciv/errors'

export type StateErrorCode =
  | 'unsupported-platform'
  | 'download-failed'
  | 'unpack-failed'
  | 'install-raced'
  | 'server-unhealthy'
  | 'records-request-failed'
  | 'record-not-found'

const scoped = defineErrors<StateErrorCode>({
  scope: 'state',
  userMessages: {
    'unsupported-platform': 'conciv does not support this platform yet',
    'download-failed': 'could not download the conciv state server',
    'unpack-failed': 'could not install the conciv state server',
    'install-raced': 'could not install the conciv state server',
    'server-unhealthy': 'the conciv state server failed to start',
    'records-request-failed': 'saving conciv state failed',
    'record-not-found': 'session not found',
  },
  httpStatus: {'record-not-found': 404, 'records-request-failed': 502},
})
export const stateError = scoped.error
export const isStateError = scoped.is
export type StateError = ConcivError<StateErrorCode>
```

Client-safe text lives here, once per code — throw sites never carry user copy.

Re-export from `src/index.ts` and `src/server/index.ts` alongside the rows.

- Produces: `SessionRowSchema`/`SessionRow`, `DraftRowSchema`/`DraftRow`, `MarkerRowSchema`/`MarkerRow`, `SessionStatusSchema`/`SessionStatus`, `sessionRowToRecord(row): SessionRecord`, `sessionRecordToRow(record): SessionRowInput`. Rows are wire shapes of the TrailBase tables (snake_case columns, `usage` JSON-encoded as string or null). `SessionRowInput` deliberately EXCLUDES `status`: record-derived writes (create/update) never touch the status column, so they can never clobber a concurrent `setStatus` — status is written only by `setStatus` and defaulted by the DB (`DEFAULT 'idle'`).

- [ ] **Step 1: Write failing tests**

```ts
import {describe, expect, it} from 'vitest'
import {SessionRowSchema, sessionRecordToRow, sessionRowToRecord} from './rows.js'
import {SessionRecordSchema} from '@conciv/protocol/chat-types'

const record = SessionRecordSchema.parse({
  id: 'conciv_5e0c2f34-0000-4000-8000-000000000000',
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat',
  title: null,
  model: null,
  usage: {inputTokens: 10, outputTokens: 2},
  cwd: '/tmp/project',
  createdAt: 1,
  updatedAt: 2,
})

describe('session rows', () => {
  it('round-trips record -> row -> record', () => {
    const row = SessionRowSchema.parse({...sessionRecordToRow(record), id: 'AZ9DoWFmdZCnwINWnCVR_g=='})
    expect(sessionRowToRecord(row)).toEqual(record)
  })
  it('defaults status to idle when the column is absent from input', () => {
    const row = SessionRowSchema.parse({...sessionRecordToRow(record), id: 'x'})
    expect(row.status).toBe('idle')
    expect('status' in sessionRecordToRow(record)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/db exec vitest run src/rows.test.ts`
Expected: FAIL, module `./rows.js` not found.

- [ ] **Step 3: Implement `rows.ts`**

```ts
import {z} from 'zod'
import {SessionId, type SessionRecord} from '@conciv/protocol/chat-types'
import {UsageSnapshotSchema} from '@conciv/protocol/usage-types'

export const SessionStatusSchema = z.enum(['idle', 'thinking', 'streaming', 'compacting'])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const SessionRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  harness_session_id: z.string().nullable(),
  harness_kind: z.string(),
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  usage: z.string().nullable(),
  status: SessionStatusSchema.default('idle'),
  cwd: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
})
export type SessionRow = z.infer<typeof SessionRowSchema>
export type SessionRowInput = Omit<SessionRow, 'id' | 'status'>

export const DraftRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  text: z.string(),
  selection_start: z.number(),
  selection_end: z.number(),
  grabs: z.string(),
  scroll_top: z.number().nullable(),
  updated_at: z.number(),
})
export type DraftRow = z.infer<typeof DraftRowSchema>

export const MarkerRowSchema = z.object({
  id: z.string(),
  session_id: SessionId,
  after_turn: z.number(),
  kind: z.enum(['new', 'compact']),
  pending: z.number(),
  created_at: z.number(),
})
export type MarkerRow = z.infer<typeof MarkerRowSchema>

export function sessionRecordToRow(record: SessionRecord): SessionRowInput {
  return {
    session_id: record.id,
    harness_session_id: record.harnessSessionId,
    harness_kind: record.harnessKind,
    origin: record.origin,
    title: record.title,
    model: record.model,
    usage: record.usage === null ? null : JSON.stringify(record.usage),
    cwd: record.cwd,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

export function sessionRowToRecord(row: SessionRow): SessionRecord {
  return {
    id: row.session_id,
    harnessSessionId: row.harness_session_id,
    harnessKind: row.harness_kind,
    origin: row.origin,
    title: row.title,
    model: row.model,
    usage: row.usage === null ? null : UsageSnapshotSchema.parse(JSON.parse(row.usage)),
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

Re-export from `src/index.ts`:

```ts
export * from './rows.js'
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @conciv/db exec vitest run src/rows.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(state): session/draft/marker row schemas' -- packages/db/src
```

---

### Task 3: Migrations + traildepot template

**Files:**

- Create: `packages/db/src/server/depot.ts`
- Create: `packages/db/src/server/depot.test.ts`

**Interfaces:**

- Produces: `prepareDepot(opts: {dataDir: string}): void` — idempotently writes `migrations/main/<MIGRATION_FILENAME>` and seeds/appends record-API entries in `config.textproto`. Exported constants `MIGRATION_FILENAME`, `MIGRATION_SQL`, `BASE_CONFIG`, `RECORD_API_CONFIG`.

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MIGRATION_FILENAME, prepareDepot} from './depot.js'

describe('prepareDepot', () => {
  it('writes migration and record apis once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'depot-'))
    prepareDepot({dataDir: dir})
    prepareDepot({dataDir: dir})
    const sql = readFileSync(join(dir, 'migrations/main', MIGRATION_FILENAME), 'utf8')
    expect(sql).toContain('CREATE TABLE sessions')
    const config = readFileSync(join(dir, 'config.textproto'), 'utf8')
    expect(config.match(/name: "sessions"/g)).toHaveLength(1)
    expect(existsSync(join(dir, 'migrations/main'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (`./depot.js` not found)

- [ ] **Step 3: Implement `depot.ts`**

```ts
import {existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync} from 'node:fs'
import {join} from 'node:path'

export const MIGRATION_FILENAME = 'U1783545917__conciv.sql'

export const MIGRATION_SQL = `CREATE TABLE sessions (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL UNIQUE,
  harness_session_id TEXT,
  harness_kind TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'chat',
  title TEXT,
  model TEXT,
  usage TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE drafts (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL DEFAULT '',
  selection_start INTEGER NOT NULL DEFAULT 0,
  selection_end INTEGER NOT NULL DEFAULT 0,
  grabs TEXT NOT NULL DEFAULT '[]',
  scroll_top INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE markers (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  session_id TEXT NOT NULL,
  after_turn INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
) STRICT;
`

const api = (name: string) => `record_apis: [
  {
    name: "${name}"
    table_name: "${name}"
    acl_world: [CREATE, READ, UPDATE, DELETE]
    enable_subscriptions: true
  }
]
`

export const RECORD_API_CONFIG = ['sessions', 'drafts', 'markers'].map(api).join('')

export const BASE_CONFIG = `server {
  application_name: "conciv"
}
`

export function prepareDepot(opts: {dataDir: string}): void {
  const migrationsDir = join(opts.dataDir, 'migrations/main')
  mkdirSync(migrationsDir, {recursive: true})
  const migration = join(migrationsDir, MIGRATION_FILENAME)
  if (!existsSync(migration)) writeFileSync(migration, MIGRATION_SQL)
  const configPath = join(opts.dataDir, 'config.textproto')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${BASE_CONFIG}${RECORD_API_CONFIG}`)
    return
  }
  const existing = readFileSync(configPath, 'utf8')
  if (!existing.includes('name: "sessions"')) appendFileSync(configPath, RECORD_API_CONFIG)
}
```

Empirically verified against the real v0.30.0 binary: a config containing ONLY `record_apis` dies at boot with `Config(Invalid("Missing application name"))` — the `server { application_name }` block is the required minimum (`email`/`auth`/`jobs` fall back to proto defaults). Fresh depot ⇒ write base + record apis in one file (single boot); existing server-generated config ⇒ append only the record apis (never a second `server` block). Migration versioning: TrailBase ships built-ins `V1, U2…U7` and applies by numeric order — the epoch-seconds prefix sorts after them; a small prefix like `U0001` would misorder. `trail migration --help` confirms the `U<timestamp>__<suffix>.sql` format.

Notes:

- `MIGRATION_FILENAME` uses the spike-verified epoch-seconds prefix (`U1783545917__create_tables.sql` in `spikes/sync-trailbase/traildepot/migrations/main/`). The Task 4 integration test against the real binary is the arbiter; if the prefix format ever needs adjusting, change `MIGRATION_FILENAME` — the test imports the constant, so it never needs touching.
- Raw SQL, not drizzle, on purpose: TrailBase owns the sqlite file and applies these files through ITS migration system on boot. No conciv code ever holds a sqlite connection (core writes via the records HTTP API, the browser syncs via the collection adapter), so an ORM has no seam to attach to — and writing the db file directly would bypass TrailBase's record API and break its subscriptions. This one DDL file is the only SQL in the plan, and it uses TrailBase-specific constructs (`STRICT`, `CHECK(is_uuid_v7(id))`, `DEFAULT (uuid_v7())`) drizzle could only express as raw fragments anyway. Boundary type-safety comes from the zod row schemas (Task 2).
- The spike appended `record_apis` to a server-generated `config.textproto` after first boot; `prepareDepot` pre-seeds it before first boot instead. If the pinned binary rejects a partial pre-seeded config (Task 4 IT is the arbiter), fall back to the spike sequence inside `startTrailBase`: spawn once with no config, wait healthy, stop, append `RECORD_API_CONFIG`, spawn again.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit** (`git commit -m 'feat(state): traildepot migrations + record apis' -- packages/db/src/server`)

---

### Task 4: Binary manager + lifecycle

**Files:**

- Create: `packages/db/src/server/binary.ts`
- Create: `packages/db/src/server/lifecycle.ts`
- Create: `packages/db/src/server/lifecycle.it.test.ts`
- Modify: `packages/db/src/server/index.ts`

**Interfaces:**

- Produces:
  - `ensureTrailBinary(opts: {cacheDir: string; version?: string}): Promise<string>` — returns absolute path to executable, downloading+unpacking on first call.
  - `startTrailBase(opts: {binary: string; dataDir: string; port: number; dev?: boolean}): Promise<{port: number; url: string; stop(): Promise<void>}>` — calls `prepareDepot`, spawns `trail --data-dir <dataDir> run -a 127.0.0.1:<port> [--dev]`, resolves when `GET /api/healthcheck` returns 200, kills the process tree on `stop()`.

- [ ] **Step 1: Failing integration test**

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase} from './index.js'

describe('trailbase lifecycle', () => {
  it('downloads, starts, serves records, stops', async () => {
    const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
    const dataDir = mkdtempSync(join(tmpdir(), 'traildepot-'))
    const port = await getPort()
    const server = await startTrailBase({binary, dataDir, port, dev: true})
    const response = await fetch(`${server.url}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({total_count: 0, records: []})
    await server.stop()
  }, 120000)
})
```

(`get-port` is already in the Task 1 devDependencies.)

- [ ] **Step 2: Run, expect FAIL** (`ensureTrailBinary` not exported)

- [ ] **Step 3: Implement `binary.ts`**

```ts
import {chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

export const TRAILBASE_VERSION = 'v0.30.0'

const ASSETS: Record<string, string> = {
  'darwin-arm64': 'arm64_apple_darwin',
  'darwin-x64': 'x86_64_apple_darwin',
  'linux-arm64': 'arm64_linux',
  'linux-x64': 'x86_64_linux',
  'win32-x64': 'x86_64_windows',
}

function assetName(version: string): string {
  const key = `${process.platform}-${process.arch}`
  const asset = ASSETS[key]
  if (!asset) throw stateError('unsupported-platform', `trailbase has no ${key} build`, {platform: key, version})
  return `trailbase_${version}_${asset}.zip`
}

export async function ensureTrailBinary(opts: {cacheDir: string; version?: string}): Promise<string> {
  const version = opts.version ?? TRAILBASE_VERSION
  const dir = join(opts.cacheDir, version)
  const binaryName = process.platform === 'win32' ? 'trail.exe' : 'trail'
  const executable = join(dir, binaryName)
  if (existsSync(executable)) return executable
  const staging = `${dir}.staging-${process.pid}`
  mkdirSync(staging, {recursive: true})
  const asset = assetName(version)
  const url = `https://github.com/trailbaseio/trailbase/releases/download/${version}/${asset}`
  const response = await fetch(url)
  if (!response.ok)
    throw stateError('download-failed', `trailbase download failed: ${response.status}`, {status: response.status, url})
  const zipPath = join(staging, asset)
  writeFileSync(zipPath, new Uint8Array(await response.arrayBuffer()))
  const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', staging])
  if (unzip.status !== 0) {
    const tar = spawnSync('tar', ['-xf', zipPath, '-C', staging])
    if (tar.status !== 0) {
      throw stateError('unpack-failed', 'trailbase: could not unpack (need unzip or bsdtar)', {
        unzip: String(unzip.stderr ?? ''),
        tar: String(tar.stderr ?? ''),
        zipPath,
      })
    }
  }
  rmSync(zipPath)
  chmodSync(join(staging, binaryName), 0o755)
  try {
    renameSync(staging, dir)
  } catch {
    rmSync(staging, {recursive: true, force: true})
    if (!existsSync(executable)) {
      throw stateError('install-raced', 'trailbase: install race lost and binary still missing', {executable})
    }
  }
  return executable
}
```

(Import `stateError` from `../errors.js` in both `binary.ts` and `lifecycle.ts`.)

Download + extract happen in a per-process staging dir, promoted with one atomic `renameSync` — concurrent vitest workers (Tasks 4/5/6 ITs run in parallel files) and concurrent core test files can all call `ensureTrailBinary` on a cold cache without corrupting each other; losers of the rename race just use the winner's install. The asset names are verified against the real v0.30.0 release (`trailbase_v0.30.0_arm64_apple_darwin.zip` etc.), and the zip contains `trail` at its root.

- [ ] **Step 4: Implement `lifecycle.ts`**

```ts
import {spawn} from 'node:child_process'
import {prepareDepot} from './depot.js'

async function waitHealthy(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/healthcheck`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw stateError('server-unhealthy', `trailbase not healthy after ${timeoutMs}ms`, {url, timeoutMs})
}

export async function startTrailBase(opts: {
  binary: string
  dataDir: string
  port: number
  dev?: boolean
}): Promise<{port: number; url: string; stop(): Promise<void>}> {
  prepareDepot({dataDir: opts.dataDir})
  const url = `http://127.0.0.1:${opts.port}`
  const args = ['--data-dir', opts.dataDir, 'run', '-a', `127.0.0.1:${opts.port}`, ...(opts.dev ? ['--dev'] : [])]
  const child = spawn(opts.binary, args, {stdio: ['ignore', 'ignore', 'pipe']})
  const stderr: string[] = []
  child.stderr.on('data', (chunk: Buffer) => {
    stderr.push(String(chunk))
    if (stderr.length > 50) stderr.shift()
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  try {
    await waitHealthy(url, 30000)
  } catch (error) {
    child.kill('SIGKILL')
    throw new Error(`${String(error)}\n${stderr.join('')}`)
  }
  return {
    port: opts.port,
    url,
    stop: async () => {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
      await exited
      clearTimeout(killTimer)
    },
  }
}
```

`src/server/index.ts`:

```ts
export {ensureTrailBinary, TRAILBASE_VERSION} from './binary.js'
export {startTrailBase} from './lifecycle.js'
export {prepareDepot, MIGRATION_FILENAME, MIGRATION_SQL, BASE_CONFIG, RECORD_API_CONFIG} from './depot.js'
```

- [ ] **Step 5: Run the IT, expect PASS** (first run downloads ~23MB)

Run: `pnpm turbo run build --filter=@conciv/protocol && pnpm --filter @conciv/db exec vitest run src/server/lifecycle.it.test.ts`
Expected: PASS. If it fails with a migration filename error, fix `depot.ts` per the Task 3 note.

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): trailbase binary manager + lifecycle' -- packages/db`)

---

### Task 5: Records client + TrailBase-backed SessionStore

**Files:**

- Create: `packages/db/src/trailbase.d.ts` (ambient type shim — see Step 3 note)
- Create: `packages/db/src/server/records.ts`
- Create: `packages/db/src/server/session-store.ts`
- Create: `packages/db/src/server/plane.ts`
- Create: `packages/db/src/server/session-store.it.test.ts`
- Modify: `packages/db/src/server/index.ts`

**Interfaces:**

- Consumes: `startTrailBase` (Task 4), row schemas (Task 2).
- Produces:
  - `recordsClient(baseUrl: string)` with `list<T>(api, filter?): Promise<T[]>`, `getBy<T>(api, field, value): Promise<T | null>`, `create(api, body): Promise<string>`, `update(api, id, patch): Promise<void>`, `remove(api, id): Promise<void>`.
  - `createTrailBaseSessionStore(opts: {baseUrl: string; now?: () => number}): SessionStore` — implements the exact `SessionStore` interface from `packages/core/src/store/session-store.ts` (`create/get/update/delete/list/findByHarnessId` over `SessionRecord`), plus `setStatus(id: string, status: SessionStatus): Promise<void>`. The interface type moves here (Task 7 re-points core's import).

- [ ] **Step 1: Failing integration test**

```ts
import {beforeAll, afterAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, createTrailBaseSessionStore} from './index.js'
import {SessionId} from '@conciv/protocol/chat-types'

let server: {url: string; stop(): Promise<void>}

beforeAll(async () => {
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  server = await startTrailBase({
    binary,
    dataDir: mkdtempSync(join(tmpdir(), 'depot-')),
    port: await getPort(),
    dev: true,
  })
}, 120000)

afterAll(async () => server.stop())

describe('trailbase session store', () => {
  const id = SessionId.parse('conciv_11111111-2222-4333-8444-555555555555')

  it('create/get/update/list/findByHarnessId/delete round-trip', async () => {
    const store = createTrailBaseSessionStore({baseUrl: server.url, now: () => 42})
    const created = await store.create({
      id,
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/tmp/x',
    })
    expect(created.createdAt).toBe(42)
    expect(await store.get(id)).toEqual(created)
    const updated = await store.update(id, {harnessSessionId: 'h-1', usage: {inputTokens: 5, outputTokens: 1}})
    expect(updated.harnessSessionId).toBe('h-1')
    expect(await store.findByHarnessId('h-1')).toEqual(updated)
    expect(await store.list()).toHaveLength(1)
    await store.setStatus(id, 'thinking')
    await store.delete(id)
    expect(await store.get(id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (`createTrailBaseSessionStore` not exported)

- [ ] **Step 3: Implement `records.ts` — thin wrapper over the OFFICIAL `trailbase` client, not raw fetch**

The official `trailbase` 0.13 client (already a dependency for the browser collections) is Node-safe (global-fetch transport, no browser globals on the record path — verified empirically against the live v0.30.0 binary) and ships everything this file needs: `initClient(url).records(name)` → `list({filters})`, `read`, `create` (returns the record id directly), `update(id, partial)`, `delete(id)`, typed `Filter = {column, op?, value}`, consistent url-safe-base64 handling for UUIDv7-blob ids. Do NOT hand-roll HTTP here. `records.ts` only adds the two conciv rules on top: zod at the boundary (callers parse rows; use the client's default `Record<string, unknown>` generic — the typed generic is an unchecked assertion) and `ConcivError` on every failure (the client throws `FetchError` carrying `.status`):

```ts
import {initClient} from 'trailbase'
import {stateError} from '../errors.js'

export type RecordsClient = {
  list(api: string, filter?: Record<string, string>): Promise<unknown[]>
  getBy(api: string, field: string, value: string): Promise<unknown>
  create(api: string, body: Record<string, unknown>): Promise<string>
  update(api: string, id: string, patch: Record<string, unknown>): Promise<void>
  remove(api: string, id: string): Promise<void>
}

async function guarded<T>(api: string, action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? error.status : undefined
    throw stateError('records-request-failed', `trailbase ${action} ${api}: ${String(error)}`, {api, action, status})
  }
}

export function recordsClient(baseUrl: string): RecordsClient {
  const client = initClient(baseUrl)
  const list = (api: string, filter?: Record<string, string>): Promise<unknown[]> =>
    guarded(api, 'list', async () => {
      const filters = Object.entries(filter ?? {}).map(([column, value]) => ({column, value}))
      const response = await client.records(api).list({filters})
      return response.records
    })
  return {
    list,
    getBy: async (api, field, value) => (await list(api, {[field]: value}))[0] ?? null,
    create: (api, body) => guarded(api, 'create', async () => String(await client.records(api).create(body))),
    update: (api, id, patch) => guarded(api, 'update', () => client.records(api).update(id, patch)),
    remove: (api, id) => guarded(api, 'remove', () => client.records(api).delete(id)),
  }
}
```

No `as` casts (repo rule): rows come back as `unknown` and every caller zod-parses (`SessionRowSchema.parse`) — "zod validates every HTTP boundary" holds even through the library client. `create` returns the id directly, so there is no ids-array edge case. BigInt note: the client's JSON reviver promotes integers above `MAX_SAFE_INTEGER` to BigInt; all conciv integer columns (timestamps, offsets, `after_turn`, `pending`) stay in safe range, so `z.number()` row schemas are fine.

KNOWN UPSTREAM DEFECT — `trailbase@0.13.0` types are mis-packaged (verified on a clean install): `package.json` points `types` at `./dist/index.d.ts` which does not exist (real declarations sit at `./dist/src/index.d.ts`), and even those use extensionless internal re-exports NodeNext cannot resolve. Runtime is fine; `tsc` fails with TS7016 (implicit `any` — banned). Fix: ship a hand-written ambient shim `packages/db/src/trailbase.d.ts` (verified to compile clean under NodeNext strict; `pnpm patch` is not an option per repo rule without approval):

```ts
declare module 'trailbase' {
  export type RecordId = string | number
  export interface RecordApi<T = Record<string, unknown>> {
    list(opts?: unknown): Promise<{records: T[]; total_count?: number}>
    read(id: RecordId, opt?: unknown): Promise<T>
    create(record: T): Promise<RecordId>
    update(id: RecordId, record: Partial<T>): Promise<void>
    delete(id: RecordId): Promise<void>
    subscribe(id: RecordId, opts?: unknown): Promise<ReadableStream>
    subscribeAll(opts?: unknown): Promise<ReadableStream>
  }
  export interface Client {
    records<T = Record<string, unknown>>(name: string): RecordApi<T>
  }
  export function initClient(site?: URL | string, opts?: unknown): Client
}
```

Keep the shim minimal (only what conciv calls), and file/track an upstream issue so the shim dies when trailbase ships fixed types. The `list` filters option is typed `unknown` in the shim; the `{filters: [{column, value}]}` shape was verified against the real `record_api.d.ts` and the live server (equality and `$ne` both work).

- [ ] **Step 4: Implement `session-store.ts`**

```ts
import {SessionRecordSchema, type SessionRecord, type SessionRecordInput} from '@conciv/protocol/chat-types'
import {recordsClient} from './records.js'
import {SessionRowSchema, sessionRecordToRow, sessionRowToRecord, type SessionStatus} from '../rows.js'

export type SessionStore = {
  create(record: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecordInput>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
  setStatus(id: string, status: SessionStatus): Promise<void>
}

export function createTrailBaseSessionStore(opts: {baseUrl: string; now?: () => number}): SessionStore {
  const now = opts.now ?? Date.now
  const client = recordsClient(opts.baseUrl)
  const rowFor = async (sessionId: string) => {
    const raw = await client.getBy('sessions', 'session_id', sessionId)
    return raw === null ? null : SessionRowSchema.parse(raw)
  }
  const mustRow = async (sessionId: string) => {
    const row = await rowFor(sessionId)
    if (!row) throw stateError('record-not-found', `session ${sessionId} not found`, {api: 'sessions', sessionId})
    return row
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await client.create('sessions', sessionRecordToRow(record))
      return record
    },
    get: async (id) => {
      const row = await rowFor(id)
      return row ? sessionRowToRecord(row) : null
    },
    update: async (id, patch) => {
      const row = await mustRow(id)
      const merged = SessionRecordSchema.parse({
        ...sessionRowToRecord(row),
        ...patch,
        id: row.session_id,
        updatedAt: now(),
      })
      await client.update('sessions', row.id, sessionRecordToRow(merged))
      return merged
    },
    delete: async (id) => {
      const row = await rowFor(id)
      if (row) await client.remove('sessions', row.id)
    },
    list: async () => {
      const rows = await client.list('sessions')
      return rows.map((raw) => sessionRowToRecord(SessionRowSchema.parse(raw)))
    },
    findByHarnessId: async (harnessSessionId) => {
      const raw = await client.getBy('sessions', 'harness_session_id', harnessSessionId)
      return raw === null ? null : sessionRowToRecord(SessionRowSchema.parse(raw))
    },
    setStatus: async (id, status) => {
      const row = await mustRow(id)
      await client.update('sessions', row.id, {status, updated_at: now()})
    },
  }
}
```

No `as` casts: create/update round through `SessionRecordSchema.parse` (matches the old store). `update` writes only record-derived columns — `sessionRecordToRow` excludes `status` (Task 2), so a record update can never clobber a concurrent `setStatus`. Statuses are single-writer (core), so no other write-write race exists; the old store's per-key promise queues are intentionally not reproduced.

- [ ] **Step 4b: `startStatePlane` facade**

Core and every test helper would otherwise each hand-assemble binary → server → store → records client (engine.ts, `boot.ts`, `state-plane.ts` — three copies). One facade in `packages/db/src/server/plane.ts` is the ONLY way consumers boot the plane:

```ts
import {homedir} from 'node:os'
import {join} from 'node:path'
import {ensureTrailBinary} from './binary.js'
import {startTrailBase} from './lifecycle.js'
import {recordsClient, type RecordsClient} from './records.js'
import {createTrailBaseSessionStore, type SessionStore} from './session-store.js'

export type StatePlane = {
  url: string
  port: number
  store: SessionStore
  records: RecordsClient
  stop(): Promise<void>
}

export async function startStatePlane(opts: {
  dataDir: string
  port: number
  cacheDir?: string
  now?: () => number
}): Promise<StatePlane> {
  const binary = await ensureTrailBinary({cacheDir: opts.cacheDir ?? join(homedir(), '.cache/conciv/trailbase')})
  const server = await startTrailBase({binary, dataDir: opts.dataDir, port: opts.port, dev: true})
  return {
    url: server.url,
    port: server.port,
    store: createTrailBaseSessionStore({baseUrl: server.url, now: opts.now}),
    records: recordsClient(server.url),
    stop: server.stop,
  }
}
```

`ensureTrailBinary`/`startTrailBase` stay exported for the lifecycle ITs, but engine and test plumbing consume `startStatePlane` only.

Append to `src/server/index.ts`:

```ts
export {recordsClient, type RecordsClient} from './records.js'
export {createTrailBaseSessionStore, type SessionStore} from './session-store.js'
export {startStatePlane, type StatePlane} from './plane.js'
export {stateError, isStateError, type StateError, type StateErrorCode} from '../errors.js'
```

- [ ] **Step 5: Run IT, expect PASS**

Run: `pnpm --filter @conciv/db exec vitest run src/server/session-store.it.test.ts`

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): records client + trailbase session store' -- packages/db/src/server`)

---

### Task 6: Collection factories + Solid hooks

**Files:**

- Create: `packages/db/src/collections.ts`
- Create: `packages/db/src/solid/hooks.ts`
- Create: `packages/db/src/collections.it.test.ts`
- Modify: `packages/db/src/index.ts`, `packages/db/src/solid/index.ts`

**Interfaces:**

- Consumes: row types (Task 2); a running TrailBase (Tasks 4–5) in tests.
- Produces:
  - `stateClient(baseUrl: string)` — wraps `initClient` from `trailbase`.
  - `sessionsCollection(client)`, `draftsCollection(client)`, `markersCollection(client)` — TanStack DB collections keyed by `id`, typed with the row types, with `parse: {}`/`serialize: {}` set.
  - Solid: `useSessions()`, `useSession(sessionId: () => string | null)`, `useDraft(sessionId: () => string)`, `useMarkers(sessionId: () => string)` — `useLiveQuery` wrappers. Hooks take collections from a `StateProvider` context created here: `StateProvider(props: {client; children})`, `useStateCollections()`.

- [ ] **Step 1: Failing integration test (node, real server, collection sync)**

```ts
import {beforeAll, afterAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, recordsClient} from './server/index.js'
import {stateClient, sessionsCollection} from './index.js'

let server: {url: string; stop(): Promise<void>}

beforeAll(async () => {
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  server = await startTrailBase({
    binary,
    dataDir: mkdtempSync(join(tmpdir(), 'depot-')),
    port: await getPort(),
    dev: true,
  })
}, 120000)

afterAll(async () => server.stop())

describe('sessions collection', () => {
  it('sees server-side inserts', async () => {
    const writer = recordsClient(server.url)
    await writer.create('sessions', {
      session_id: 'conciv_aaaaaaaa-1111-4222-8333-444444444444',
      harness_kind: 'claude',
      cwd: '/tmp',
      created_at: 1,
      updated_at: 1,
    })
    const collection = sessionsCollection(stateClient(server.url))
    const rows = await collection.toArrayWhenReady()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.session_id).toBe('conciv_aaaaaaaa-1111-4222-8333-444444444444')
  })
})
```

(`toArrayWhenReady()` verified present on db 0.6.14's `Collection` — one call replaces `preload()` + `Array.from(collection.state.values())`. Note the seeded row omits `harness_session_id`: the column is nullable, the server returns `harness_session_id: null` in responses — verified — so `SessionRowSchema` (`z.string().nullable()`, present-but-null) is satisfied by what actually syncs.)

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `collections.ts`**

```ts
import {createCollection} from '@tanstack/db'
import {trailBaseCollectionOptions} from '@tanstack/trailbase-db-collection'
import {initClient, type Client} from 'trailbase'
import type {SessionRow, DraftRow, MarkerRow} from './rows.js'

export type StateClient = Client

export function stateClient(baseUrl: string): StateClient {
  return initClient(baseUrl)
}

export function sessionsCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<SessionRow>({
      id: 'sessions',
      recordApi: client.records('sessions'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export function draftsCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<DraftRow>({
      id: 'drafts',
      recordApi: client.records('drafts'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export function markersCollection(client: StateClient) {
  return createCollection(
    trailBaseCollectionOptions<MarkerRow>({
      id: 'markers',
      recordApi: client.records('markers'),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}
```

Append to `src/index.ts`:

```ts
export * from './collections.js'
```

- [ ] **Step 4: Implement `solid/hooks.ts`**

```ts
import {createComponent, createContext, useContext, type JSX} from 'solid-js'
import {useLiveQuery, eq} from '@tanstack/solid-db'
import {sessionsCollection, draftsCollection, markersCollection, type StateClient} from '../collections.js'

type StateCollections = {
  sessions: ReturnType<typeof sessionsCollection>
  drafts: ReturnType<typeof draftsCollection>
  markers: ReturnType<typeof markersCollection>
}

const StateContext = createContext<StateCollections>()

export function StateProvider(props: {client: StateClient; children: JSX.Element}): JSX.Element {
  const value: StateCollections = {
    sessions: sessionsCollection(props.client),
    drafts: draftsCollection(props.client),
    markers: markersCollection(props.client),
  }
  return createComponent(StateContext.Provider, {
    value,
    get children() {
      return props.children
    },
  })
}

export function useStateCollections(): StateCollections {
  const value = useContext(StateContext)
  if (!value) throw new Error('useStateCollections must be used within StateProvider')
  return value
}

export function useSessions() {
  const {sessions} = useStateCollections()
  return useLiveQuery((q) => q.from({session: sessions}))
}

export function useSession(sessionId: () => string | null) {
  const {sessions} = useStateCollections()
  return useLiveQuery((q) =>
    q
      .from({session: sessions})
      .where(({session}) => eq(session.session_id, sessionId() ?? ''))
      .findOne(),
  )
}

export function useDraft(sessionId: () => string) {
  const {drafts} = useStateCollections()
  return useLiveQuery((q) =>
    q
      .from({draft: drafts})
      .where(({draft}) => eq(draft.session_id, sessionId()))
      .findOne(),
  )
}

export function useMarkers(sessionId: () => string) {
  const {markers} = useStateCollections()
  return useLiveQuery((q) => q.from({marker: markers}).where(({marker}) => eq(marker.session_id, sessionId())))
}
```

Deliberately NO JSX in this package: `createComponent(StateContext.Provider, ...)` keeps the file plain `.ts` so tsdown builds it as-is. Solid JSX requires babel-preset-solid, which only the vite-plugin-solid packages (`ui-kit-*`, built with `vite build && tsc`) run — tsdown does not, and `jsx: preserve` would emit raw JSX into the ESM output. If this package ever grows real components, move it to the ui-kit vite build recipe; until then, hooks stay JSX-free. `src/solid/index.ts`:

```ts
export * from './hooks.js'
```

- [ ] **Step 5: Run IT + typecheck, expect PASS**

Run: `pnpm --filter @conciv/db exec vitest run src/collections.it.test.ts && pnpm --filter @conciv/db run typecheck`

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): collection factories + solid hooks' -- packages/db`)

---

### Task 7: Core spawns TrailBase and adopts the store

**Files:**

- Modify: `packages/core/src/state-paths.ts` (add `trailDir`)
- Modify: `packages/core/src/engine.ts` (start/stop TrailBase, expose `statePort`)
- Modify: `packages/core/src/app.ts:128` (store construction becomes injectable; TrailBase store passed from engine)
- Modify: `packages/core/src/store/session-store.ts` (delete implementation; re-export type from `@conciv/db/server` for the transition)
- Modify: `packages/core/package.json` (add `"@conciv/db": "workspace:*"`, remove `unstorage`)
- Delete: `packages/core/test/helpers/memory-store.ts` (in-memory store dies with the fs store — NO in-memory stand-in survives)
- Delete: `packages/core/test/store/session-store.test.ts` (tested the deleted fs store; the real store is covered by `@conciv/db`'s session-store IT from Task 5)
- Create: `packages/core/test/helpers/state-plane.ts` (`startTestStore`, `startTestEngine` — real-TrailBase test plumbing)
- Modify: `packages/core/test/helpers/boot.ts` (spawn TrailBase per kit, pass `store` into `makeApp`, stop it in dispose; export `fakeClaudeBinDir`)
- Modify: `packages/core/test/app-harness-di.test.ts`, `packages/core/test/api/cors.it.test.ts` (both call `makeApp` directly — feed them a `startTestStore` store)
- Modify: `packages/core/test/api/chat/resolve.test.ts`, `sessions-list.test.ts`, `turn-session.test.ts`, `agent-handoff.test.ts` (drop `memoryStore` for `startTestStore`)
- Modify: `packages/core/test/engine-port.test.ts` (run with a tmp-dir root so the engine's traildepot lands in tmp, not the repo working tree)
- Create: `packages/core/test/api/chat/state-plane.it.test.ts` (engine IT — must live under `test/`, core's vitest `include` is `test/**/*.test.ts`; a file in `src/` never runs)

**Interfaces:**

- Consumes: `ensureTrailBinary`, `startTrailBase`, `createTrailBaseSessionStore` from `@conciv/db/server`.
- Produces: `Engine` gains `statePort: number`; `MakeAppOpts` gains required `store: SessionStore` (constructed in `engine.ts`, passed into `makeApp`). `SessionStore` type now imported from `@conciv/db/server` everywhere in core. Test plumbing: `startTestStore(): Promise<{store: SessionStore; url: string; stop(): Promise<void>}>`, `startTestEngine(overrides?): Promise<Engine>`.

- [ ] **Step 1: Test plumbing helper**

`packages/core/test/helpers/state-plane.ts` — the ONLY store used anywhere in core tests is the real TrailBase-backed one:

```ts
import {mkdtempSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, createTrailBaseSessionStore, type SessionStore} from '@conciv/db/server'
import {start, type Engine, type StartOpts} from '../../src/engine.js'
import {fakeClaudeBinDir} from './boot.js'

export async function startTestStore(now?: () => number): Promise<StatePlane> {
  return startStatePlane({dataDir: mkdtempSync(join(tmpdir(), 'conciv-depot-')), port: await getPort(), now})
}

export async function startTestEngine(overrides: Partial<StartOpts> = {}): Promise<Engine> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-'))
  const binDir = fakeClaudeBinDir(root)
  return start({
    options: {},
    root,
    launchEditor: () => {},
    childEnv: () => ({...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}`}),
    ...overrides,
  })
}
```

Export `fakeClaudeBinDir` from `boot.ts` (it exists there already, module-private). `startTestEngine` is NEW plumbing — core has no engine-level IT harness today (the harness-testkit path goes through `makeApp` directly and never touches `engine.start`); the only prior `start()` test is `engine-port.test.ts`. Adjust the fake-claude env seam if `childEnv` alone doesn't reach the harness the way `bootCoreApp`'s `harnessEnv` does — the fake binary must win `PATH` resolution for spawned turns.

- [ ] **Step 2: Write the failing engine IT**

`packages/core/test/api/chat/state-plane.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {startTestEngine} from '../../helpers/state-plane.js'

describe('engine state plane', () => {
  it('starts trailbase and serves the sessions record api', async () => {
    const engine = await startTestEngine()
    const response = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    await engine.stop()
  }, 120000)
})
```

Run: `pnpm turbo run test --filter=@conciv/core -- state-plane` — expect FAIL (`statePort` undefined).

- [ ] **Step 3: state-paths + engine wiring**

`state-paths.ts` — add to the returned object and type: `trailDir: join(dir, 'trailbase')`.

`engine.ts` inside `start()` before `makeApp` (after `statePaths`):

```ts
const plane = await startStatePlane({dataDir: paths.trailDir, port: await getPort()})
```

Pass `plane.store` through `MakeAppOpts` into `makeApp` (replace the `createFsSessionStore` call at `app.ts:128` with `opts.store`; `store` is REQUIRED — no fallback construction inside `makeApp`). Extend `Engine` with `statePort: plane.port` and make `stop()` also await `plane.stop()`; if `makeApp`/`serveHono` throws after the plane spawned, stop it before rethrowing (try/catch around the rest of `start()`). Imports: `getPort` already used in `engine.ts`; add `startStatePlane` from `@conciv/db/server`.

Core's `onError` in `app.ts` (composeRoutes) additionally maps conciv errors so the widget gets structured, redacted failures instead of a generic 500 (this is the Hono-idiomatic spot — `HTTPException` keeps handling intentional route statuses, everything else funnels here):

```ts
.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({message: error.message, code: `http.${error.status}`}, error.status)
  if (isConcivError(error)) {
    logError(`[core] ${error.scope}/${error.code}: ${error.message} ${JSON.stringify(error.details)}`)
    return c.json(clientPayload(error, process.env.NODE_ENV !== 'production'), error.httpStatus)
  }
  logError(`[core] unhandled route error: ${String(error)}`)
  return c.json({message: 'internal error', code: 'core.internal'}, 500)
})
```

(`isConcivError`/`clientPayload` from `@conciv/errors` — add it to core's dependencies. Normal mode ships only `userMessage`→`message` and `userCode`→`code`; dev mode adds the `internal` block. Full `message` + `details` always land in the server log. Status comes from the error's per-code `httpStatus` (e.g. `record-not-found` → 404, `records-request-failed` → 502) so a not-found never reads as a 500; every branch carries a `code` so clients can always branch on it. Hono type note: this does NOT affect `AppType`/RPC inference (error shapes aren't part of the inferred schema), and the `/compact` handler must stay inline in the route chain for inference. SECURITY: `NODE_ENV` unset ⇒ dev mode ⇒ `internal` block ships — the production entrypoint MUST set `NODE_ENV=production`; acceptable today because core binds 127.0.0.1 only, but do not lose this when that changes.)

`store/session-store.ts` becomes:

```ts
export type {SessionStore} from '@conciv/db/server'
```

Delete `createSessionStore`/`createFsSessionStore` and the unstorage imports; remove `unstorage` from core's dependencies (verify nothing else imports it: `grep -rn 'unstorage' packages/core/src`).

- [ ] **Step 4: Rework the test suite — delete the old store world**

- Delete `test/helpers/memory-store.ts` and `test/store/session-store.test.ts` outright.
- `test/helpers/boot.ts`: `bootCoreApp` calls `startTestStore()` (import from `./state-plane.js` — watch the import cycle: `state-plane.ts` imports `fakeClaudeBinDir` from `boot.ts`; if that bites, move `fakeClaudeBinDir` into `state-plane.ts`), passes `store` into `makeApp`, and the returned `dispose` also awaits the TrailBase `stop()`.
- `test/app-harness-di.test.ts:22` and `test/api/cors.it.test.ts:21`: create a store via `startTestStore()` in the test (before/after hooks), pass it to `makeApp`.
- `test/api/chat/resolve.test.ts`, `sessions-list.test.ts`, `turn-session.test.ts`, `agent-handoff.test.ts`: replace `memoryStore(...)` with one `startTestStore()` per file (`beforeAll`/`afterAll`); tests that passed a custom `now` to `memoryStore` pass it to `createTrailBaseSessionStore({baseUrl, now})` via the helper (add an optional `now` param to `startTestStore`).
- `test/engine-port.test.ts`: change `root: process.cwd()` to a `mkdtempSync` tmp dir so the engine's traildepot and lock files land in tmp, not the repo.

- [ ] **Step 5: Typecheck + full core tests**

Run: `pnpm turbo run typecheck --filter=@conciv/core && pnpm turbo run test --filter=@conciv/core`
Expected: PASS including the new IT. Src fallout is limited to import sites (`chat-env.ts`, `session.ts`, `turn.ts`, `app.ts`) which keep importing `type {SessionStore} from '../../store/session-store.js'` (still re-exports). Dev-loop note: core changes need a dev-server restart to observe manually.

- [ ] **Step 6: Commit** (`git commit -m 'feat(core): spawn trailbase, adopt trailbase-backed session store' -- packages/core packages/db pnpm-lock.yaml`)

---

### Task 8: Turn status transitions

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts`
- Test: extend the engine IT from Task 7 (same file)

**Interfaces:**

- Consumes: `store.setStatus(id, status)` (Task 5).
- Produces: `sessions.status` transitions: `thinking` when the POST turn is accepted; `streaming` on the first content chunk (`EventType.TEXT_MESSAGE_CONTENT` or `EventType.TOOL_CALL_START`); `idle` on lock release (terminal chunk, abort, or throw).

- [ ] **Step 1: Extend the IT**

Same file as Task 7 (`test/api/chat/state-plane.it.test.ts`), same `startTestEngine` + fake-claude plumbing:

```ts
it('walks status thinking -> idle across a turn', async () => {
  const engine = await startTestEngine()
  const sessionId = await resolveSession(engine)
  const seen = new Set<string>()
  const collector = (async () => {
    while (!seen.has('idle')) {
      seen.add((await fetchSessionRow(engine, sessionId)).status)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })()
  await postChat(engine, sessionId, 'say hi')
  await collector
  expect(seen.has('thinking')).toBe(true)
  expect((await fetchSessionRow(engine, sessionId)).status).toBe('idle')
  await engine.stop()
}, 30000)
```

`fetchSessionRow` = GET `/api/records/v1/sessions?filter[session_id]=<id>` on `engine.statePort`, first record, `SessionRowSchema.parse`d. The collector starts polling BEFORE the POST and runs until idle, so it cannot miss the `thinking` phase no matter how fast the fake turn finishes: `thinking` is written (awaited) inside the POST handler before the turn starts, and the collector samples every 10ms while the fake-claude process spawn alone takes far longer. Do not assert `streaming` was seen — with a fast fake turn that window is legitimately missable; `thinking` and terminal `idle` are the deterministic checkpoints.

- [ ] **Step 2: Run, expect FAIL** (status stays `idle` — never set)

- [ ] **Step 3: Implement transitions in `turn.ts`**

In the POST `/` handler after `ensureChatRecord(...)` (line ~161):

```ts
await deps.store.setStatus(sessionId, turnKindFor(c.req.valid('json')) === 'compact' ? 'compacting' : 'thinking')
```

The handler's existing `catch` (turn.ts:165–168) releases the lock directly WITHOUT going through `withLockRelease` — it must also reset status, or a throw between `setStatus` and the first stream chunk leaves the session stuck on `thinking` forever:

```ts
} catch (e) {
  releaseLock(deps.stateRoot, sessionId)
  await deps.store.setStatus(sessionId, 'idle').catch((error) => logError(`[core] status reset failed: ${String(error)}`))
  throw e
}
```

In `withLockRelease`, flip to streaming on first content and to idle on release. Replace `lockReleaser` usage so release also resets status:

```ts
function lockReleaser(deps: TurnDeps, sessionId: string): () => void {
  const lock = {held: true}
  return () => {
    if (!lock.held) return
    lock.held = false
    releaseLock(deps.stateRoot, sessionId)
    void deps.store
      .setStatus(sessionId, 'idle')
      .catch((error) => logError(`[core] status reset failed: ${String(error)}`))
  }
}
```

(Status flips are fire-and-forget on purpose — a state-plane hiccup must not kill the turn — but they always log through `logError` (`runtime/harness-logger.js`, already imported in `turn.ts`), never swallow silently.)

Inside the `for await` loop of `withLockRelease`, before yielding:

```ts
if (!streamed && STREAM_STARTERS.has(chunk.type)) {
  streamed = true
  void deps.store
    .setStatus(sessionId, 'streaming')
    .catch((error) => logError(`[core] status flip failed: ${String(error)}`))
}
```

with `let streamed = false` declared next to `let finished = false`, and at module level:

```ts
const STREAM_STARTERS = new Set<string>([
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_CHUNK,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_CHUNK,
])
```

All four member names verified against `@tanstack/ai` 0.40.0's `EventType` enum. The current conciv adapters only emit the discrete `CONTENT`/`START` events, but the `CHUNK` variants are legal AG-UI events a future adapter may emit — turn.ts is harness-generic, so cover them. DELIBERATE: `REASONING_*` events do NOT flip status — reasoning IS "thinking"; claude extended-thinking emits reasoning chunks before any text, and flipping there (or on `RUN_STARTED`/first chunk) would show `streaming` prematurely. A reasoning-only turn goes `thinking → idle` without ever hitting `streaming`; that is correct. Do not broaden this set to reasoning events.

Status placement verified against 0.40's middleware seam (`defineChatMiddleware`/`onChunk`): a status middleware was considered and rejected — the `idle` flip must stay atomic with lock release in `lockReleaser` (the generator `finally` also covers consumer-side termination and the synthetic post-abort path), and splitting `idle` into a middleware would create two divergent writers.

Do not set `streaming` for compact turns: guard with the turn kind — thread `turnKind` into `withLockRelease` as a parameter (`turnKind: 'chat' | 'compact'`) from `startTurn`, and skip the streaming flip when `turnKind === 'compact'`.

- [ ] **Step 4: Run IT, expect PASS**

- [ ] **Step 5: Commit** (`git commit -m 'feat(core): publish session status transitions to state plane' -- packages/core/src/api/chat/turn.ts <it-file>`)

---

### Task 9: Server-side compaction endpoint

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts` (new route `POST /compact`)
- Test: extend the engine IT (same file as Tasks 7–8)

**Interfaces:**

- Consumes: `startTurn` (existing), `recordsClient` (Task 5); a `MarkerWriter` constructed in `engine.ts` and threaded on `ChatRuntime` as `markers: MarkerWriter` where `type MarkerWriter = {create(sessionId: string, kind: 'new' | 'compact', afterTurn: number): Promise<string>; settle(id: string): Promise<void>; remove(id: string): Promise<void>}` (route code below reads `deps.markers` — the field name IS `markers`, flat on `ChatRuntime`, matching how `store` sits there).
- Produces: `POST /api/chat/compact` (session id from the `conciv-session-id` header via `sessionIdFromHeaders`, same as `POST /`): 409 when busy, otherwise writes a pending `compact` marker, sets status `compacting`, runs a compact turn server-side, settles the marker, returns `{ok: true}` immediately after starting (fire-and-follow via status).
- `after_turn` is written as 0 in Plan 1 — DELIBERATE deferral: dividers render in `created_at` order until Plan 3, which owns marker positioning (the widget knows its message count; core does not). Plan 3 must revisit before rendering markers inside a thread.

- [ ] **Step 1: Extend the IT**

```ts
it('compacts server-side: marker written, status walks compacting -> idle', async () => {
  const engine = await startTestEngine()
  const sessionId = await resolveSession(engine)
  await postChat(engine, sessionId, 'hello')
  await waitForIdleRow(engine, sessionId, 30000)
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/chat/compact`, {
    method: 'POST',
    headers: {'conciv-session-id': sessionId},
  })
  expect(response.status).toBe(200)
  await waitForIdleRow(engine, sessionId, 30000)
  const markers = await fetchRecords(engine, 'markers', {session_id: sessionId})
  expect(markers).toHaveLength(1)
  expect(markers[0]?.kind).toBe('compact')
  expect(markers[0]?.pending).toBe(0)
  await engine.stop()
})
```

(Header verified: `sessionIdFromHeaders` reads `CONCIV_SESSION_HEADER = 'conciv-session-id'` from `@conciv/protocol/chat-types` — import the constant in the test rather than the literal.)

- [ ] **Step 2: Run, expect FAIL** (404 on /compact)

- [ ] **Step 3: Marker writer in engine wiring**

In `engine.ts` where the store is created (Task 7), also create:

```ts
const records = recordsClient(trailbase.url)
const markers: MarkerWriter = {
  create: (sessionId, kind, afterTurn) =>
    records.create('markers', {session_id: sessionId, kind, after_turn: afterTurn, pending: 1, created_at: Date.now()}),
  settle: (id) => records.update('markers', id, {pending: 0}),
  remove: (id) => records.remove('markers', id),
}
```

`MarkerWriter` type lives in `chat-env.ts` next to `ChatRuntime`; thread `markers: MarkerWriter` through `MakeAppOpts` into `ChatRuntime` exactly like `store`. Test plumbing: `startTestStore`/`bootCoreApp` (Task 7) construct their `markers` from `recordsClient(url)` the same way.

- [ ] **Step 4: Route in `turn.ts`**

```ts
.post('/compact', async (c) => {
  const deps = c.var.chat
  const sessionId = sessionIdFromHeaders(c.req.raw.headers)
  if (!sessionId) throw new HTTPException(400, {message: 'no session (resolve first)'})
  if (deps.hub.generating(sessionId)) throw new HTTPException(409, {message: 'session busy'})
  if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) throw new HTTPException(409, {message: 'session busy'})
  let markerId: string | null = null
  try {
    deps.onTurnStart?.(sessionId)
    await ensureChatRecord(deps.store, sessionId, deps.harness.id, deps.cwd)
    markerId = await deps.markers.create(sessionId, 'compact', 0)
    await deps.store.setStatus(sessionId, 'compacting')
    const chatReq: ChatRequest = {messages: [{role: 'user', content: '/compact'}], intent: 'compact'}
    const settled = markerId
    await startTurn(deps, sessionId, chatReq, () =>
      void deps.markers.settle(settled).catch((error) => logError(`[core] marker settle failed: ${String(error)}`)),
    )
    return c.json({ok: true} satisfies Ok)
  } catch (error) {
    releaseLock(deps.stateRoot, sessionId)
    if (markerId) await deps.markers.remove(markerId).catch((e) => logError(`[core] marker cleanup failed: ${String(e)}`))
    await deps.store.setStatus(sessionId, 'idle').catch((e) => logError(`[core] status reset failed: ${String(e)}`))
    throw error
  }
})
```

The catch mirrors POST `/`'s hardened error path (Task 8): release the lock, delete the never-run pending marker, reset status — a throw after marker creation must not leave a forever-pending marker or a stuck `compacting` status. `onTurnStart` fires like the chat route so extension `onChatTurn` listeners see compaction turns too.

Verified behavior notes (from @tanstack/ai 0.40 review):

- The `content: '/compact'` literal is a placeholder — the harness compaction path rewrites it in every case: claude (`capabilities.compaction: true`) `prepareMessages` swaps in the real `/compact` slash command; non-compaction harnesses get `COMPACT_FALLBACK_PROMPT` via `turnMessages`. The plan already uses the built-in compaction path; there is no separate library compaction API to adopt.
- `onSettled` fires in `withLockRelease`'s `finally` UNCONDITIONALLY — a compaction that dies mid-stream (`RUN_ERROR`) still settles its marker (`pending: 0`). Accepted for v0 (the marker only renders a divider); the route's catch covers pre-stream throws only. Gating settle on finish-reason is deliberately not worth the threading.

`startTurn` gains an optional FOURTH parameter — signatures change end to end:

```ts
async function startTurn(deps: TurnDeps, sessionId: string, chatReq: ChatRequest, onSettled?: () => void): Promise<void>
async function* withLockRelease(src, deps, sessionId, modelId, abort, onSettled?: () => void): AsyncGenerator<StreamChunk>
```

`startTurn` forwards `onSettled` into `withLockRelease`, which invokes it in its `finally` after `release()`. Parse `chatReq` through `ChatRequestSchema.parse` if the literal doesn't satisfy the type directly.

- [ ] **Step 5: Run IT, expect PASS**

- [ ] **Step 6: Commit** (`git commit -m 'feat(core): server-side compaction endpoint + markers' -- packages/core/src`)

---

### Task 10: Gates and changeset

**Files:**

- Modify: `.fallowrc.json` (add `@conciv/db` to `publicPackages`)
- Modify: `.github/workflows/ci.yml` (cache the TrailBase binary)
- Create: `.changeset/widget-rewrite-state-plane.md`

- [ ] **Step 1: Fallow + CI config**

Add `"@conciv/errors"` and `"@conciv/db"` to `publicPackages` in `.fallowrc.json` (alphabetical). Without them, fallow flags every Plan-3-facing export (solid hooks, drafts/markers collections, row types, `clientPayload`) as INTRODUCED unused exports — they have no in-repo consumer until Plan 3; `publicPackages` is exactly the mechanism for published API.

In `.github/workflows/ci.yml`, next to the existing playwright cache step, add:

```yaml
- uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ~/.cache/conciv/trailbase
    key: trailbase-v0.30.0-${{ runner.os }}
```

Core + state ITs now download a ~23MB binary from GitHub releases on a cold cache; this keeps CI off the network (and off release-asset rate limits) after the first run. Bump the key together with `TRAILBASE_VERSION`.

- [ ] **Step 2: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all green. Widget still compiles against the re-exported `SessionStore` type — this plan must not touch `packages/widget` behavior.

- [ ] **Step 3: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. Likely flags: `unstorage` now-unused in core (already removed from `packages/core/package.json` in Task 7). Verify suspicious dead-code claims with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'` before deleting.

- [ ] **Step 4: Changeset**

`.changeset/widget-rewrite-state-plane.md`:

```markdown
---
'@conciv/errors': patch
'@conciv/db': patch
'@conciv/core': patch
---

New @conciv/errors package (typed ConcivError contract with client-safe userMessage/userCode) and @conciv/db package: TrailBase-backed domain-state plane (sessions, drafts, markers) with server lifecycle, records client, TanStack DB collection factories, and Solid hooks. Core now spawns TrailBase, stores sessions in it, publishes turn status, owns compaction server-side, and returns structured redacted errors.
```

- [ ] **Step 5: Commit** (`git commit -m 'chore: state plane gates, ci cache, changeset' -- .changeset .fallowrc.json .github/workflows/ci.yml`)

---

## Out of scope for Plan 1 (later plans)

- Plan 2: extension contract v2 (`useSlot`/`useHost`, capability-typed manifest, `ext_<id>_*` table registration).
- Plan 3: `@conciv/surface` + `@conciv/embed` (dock, compound chat components, stock `fetchServerSentEvents` adapter, drafts/markers consumption, widget IT migration, mount-externals test). Draft editing MUST use TanStack DB's built-in optimistic mutation (`collection.insert/update/delete`, `createOptimisticAction` — trailBaseCollectionOptions already wires `onInsert/onUpdate/onDelete`), never a hand-rolled optimistic layer. Marker positioning (`after_turn`) is also Plan 3's (see Task 9).
- Plan 4: rewire terminal/test-runner/whiteboard extensions, `git rm -r packages/widget`, PUBLIC_PACKAGES removal, final fallow sweep.
- Records-API auth hardening (world ACL + 127.0.0.1 binding accepted for now; revisit before any non-localhost exposure).
