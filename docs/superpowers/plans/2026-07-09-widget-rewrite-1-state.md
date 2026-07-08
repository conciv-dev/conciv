# Widget Rewrite Plan 1/4: @conciv/state + TrailBase in core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@conciv/state` (TrailBase schema, server lifecycle, TanStack DB collection factories, Solid hooks) and make core spawn TrailBase, store sessions in it, publish turn status, and own compaction.

**Architecture:** Core downloads and supervises a single `trail` binary (sqlite in the state dir). The engine writes through a `SessionStore`-compatible adapter over TrailBase's records HTTP API, so existing call sites do not change. Widget-facing collection factories and hooks ship now, consumed by Plan 3. Spec: `docs/superpowers/specs/2026-07-09-widget-rewrite-design.md`.

**Tech Stack:** TrailBase v0.30.0 (pinned binary), `trailbase` npm client 0.13.x (pinned), `@tanstack/db` + `@tanstack/solid-db` + `@tanstack/trailbase-db-collection`, zod, Hono (existing core).

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (lint deletes them). No `any`/`as`/non-null `!`; strict TS (`noUncheckedIndexedAccess`, NodeNext).
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Every Solid package vitest config pins `test: {environment: 'node'}`.
- No new npm dependency without it appearing in this plan. New deps here: `trailbase`, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/trailbase-db-collection` (state package only).
- No stubs/mocks: integration tests run a real downloaded TrailBase binary.
- Build via turbo: `pnpm turbo run build --filter=@conciv/state`. Tests build first (`pnpm test` depends on build).
- TrailBase gotchas (from spike): record-API PKs must be UUIDv7 blob or INTEGER; `--data-dir` is a global flag (`trail --data-dir X run`, not `trail run --data-dir X`); `--dev` enables permissive CORS; `trailBaseCollectionOptions` requires `parse: {}` and `serialize: {}`.
- Session ids are `conciv_<uuid>` strings (`SessionId` in `packages/protocol/src/chat-types.ts:38`) and CANNOT be record PKs. Every table uses an auto UUIDv7 `id` PK plus a `session_id` TEXT business key.
- Pre-release v0: no data migration from the old fs session store; old `.conciv/sessions` JSON files are simply no longer read.
- Commit after every task with pathspecs (`git commit -- <paths>`).

---

### Task 1: Scaffold `@conciv/state`

**Files:**

- Create: `packages/state/package.json`
- Create: `packages/state/tsconfig.json`
- Create: `packages/state/tsdown.config.ts`
- Create: `packages/state/vitest.config.ts`
- Create: `packages/state/src/index.ts` (placeholder export, replaced in Task 2)
- Create: `packages/state/src/server/index.ts` (placeholder, replaced in Task 4)
- Create: `packages/state/src/solid/index.ts` (placeholder, replaced in Task 6)
- Modify: `packages/publish/src/guards.ts` (add `@conciv/state` to `PUBLIC_PACKAGES`)

**Interfaces:**

- Produces: package `@conciv/state` with exports `.`, `./server`, `./solid`.

- [ ] **Step 1: Write package.json** (mirror `packages/grab/package.json` fields: homepage `https://conciv.dev`, repository with `directory: packages/state`, MIT, publishConfig public)

```json
{
  "name": "@conciv/state",
  "version": "0.0.7",
  "description": "conciv domain-state plane: TrailBase schema and lifecycle, TanStack DB collection factories, and Solid hooks shared by core, surface, and extensions.",
  "homepage": "https://conciv.dev",
  "bugs": "https://github.com/conciv-dev/conciv/issues",
  "license": "MIT",
  "repository": {"type": "git", "url": "git+https://github.com/conciv-dev/conciv.git", "directory": "packages/state"},
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
    "@conciv/protocol": "workspace:*",
    "@tanstack/db": "^0.5.13",
    "@tanstack/solid-db": "^0.1.24",
    "@tanstack/trailbase-db-collection": "^0.1.19",
    "trailbase": "^0.13.0",
    "zod": "^4.1.0"
  },
  "peerDependencies": {"solid-js": "^1.9.0"},
  "devDependencies": {"solid-js": "^1.9.7", "tsdown": "^0.22.2", "typescript": "^6.0.3", "vitest": "^3.2.0"}
}
```

Match the exact versions of `zod`, `vitest`, `tsdown`, `typescript`, `solid-js` to what other packages in the repo use (`grep '"zod"' packages/*/package.json`); the numbers above are floors, the repo's existing pins win. Set `version` to the current lockstep version of the `@conciv/*` set (check any published package).

- [ ] **Step 2: tsconfig, tsdown, vitest configs**

`packages/state/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {"rootDir": ".", "noEmit": true, "lib": ["ES2023", "DOM", "DOM.Iterable"], "types": ["node"]},
  "include": ["src/**/*.ts", "vitest.config.ts", "tsdown.config.ts"]
}
```

`packages/state/tsdown.config.ts`:

```ts
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server/index.ts', 'src/solid/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: true,
})
```

`packages/state/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {environment: 'node', testTimeout: 30000},
})
```

Placeholder `src/index.ts` / `src/server/index.ts` / `src/solid/index.ts`: `export {}` each.

- [ ] **Step 3: Register in publish guards**

In `packages/publish/src/guards.ts` add `'@conciv/state'` to the `PUBLIC_PACKAGES` array (alphabetical position).

- [ ] **Step 4: Install and verify**

Run: `pnpm install` (workspace root; lockfile update), then `pnpm turbo run build --filter=@conciv/state`
Expected: build succeeds, dist/ contains index.js, server/index.js, solid/index.js.

- [ ] **Step 5: Commit**

```bash
git add packages/state packages/publish/src/guards.ts pnpm-lock.yaml pnpm-workspace.yaml
git commit -m 'feat(state): scaffold @conciv/state package' -- packages/state packages/publish/src/guards.ts pnpm-lock.yaml pnpm-workspace.yaml
```

---

### Task 2: Row schemas

**Files:**

- Create: `packages/state/src/rows.ts`
- Create: `packages/state/src/rows.test.ts`
- Modify: `packages/state/src/index.ts`

**Interfaces:**

- Consumes: `SessionRecordSchema`, `UsageSnapshotSchema` from `@conciv/protocol/chat-types` / `@conciv/protocol/usage-types`.
- Produces: `SessionRowSchema`/`SessionRow`, `DraftRowSchema`/`DraftRow`, `MarkerRowSchema`/`MarkerRow`, `SessionStatusSchema`/`SessionStatus`, `sessionRowToRecord(row): SessionRecord`, `sessionRecordToRow(record, id?): SessionRowInput`. Rows are wire shapes of the TrailBase tables (snake_case columns, `usage` JSON-encoded as string or null).

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
  it('defaults status to idle', () => {
    const row = SessionRowSchema.parse({...sessionRecordToRow(record), id: 'x'})
    expect(row.status).toBe('idle')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/state exec vitest run src/rows.test.ts`
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
export type SessionRowInput = Omit<SessionRow, 'id'>

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
    status: 'idle',
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

Run: `pnpm --filter @conciv/state exec vitest run src/rows.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(state): session/draft/marker row schemas' -- packages/state/src
```

---

### Task 3: Migrations + traildepot template

**Files:**

- Create: `packages/state/src/server/depot.ts`
- Create: `packages/state/src/server/depot.test.ts`

**Interfaces:**

- Produces: `prepareDepot(opts: {dataDir: string}): void` — idempotently writes `migrations/main/U0001__conciv.sql` and appends record-API entries to `config.textproto` if absent. Exported constants `MIGRATION_SQL`, `RECORD_API_CONFIG`.

- [ ] **Step 1: Failing test**

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {prepareDepot} from './depot.js'

describe('prepareDepot', () => {
  it('writes migration and record apis once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'depot-'))
    prepareDepot({dataDir: dir})
    prepareDepot({dataDir: dir})
    const sql = readFileSync(join(dir, 'migrations/main/U0001__conciv.sql'), 'utf8')
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

export function prepareDepot(opts: {dataDir: string}): void {
  const migrationsDir = join(opts.dataDir, 'migrations/main')
  mkdirSync(migrationsDir, {recursive: true})
  const migration = join(migrationsDir, 'U0001__conciv.sql')
  if (!existsSync(migration)) writeFileSync(migration, MIGRATION_SQL)
  const configPath = join(opts.dataDir, 'config.textproto')
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
  if (!existing.includes('name: "sessions"')) appendFileSync(configPath, RECORD_API_CONFIG)
}
```

Note: TrailBase migration filenames require a numeric timestamp prefix; if the server rejects `U0001`, use `U1700000000001__conciv.sql` (the spike used `U<epoch>`). The integration test in Task 4 is the arbiter; adjust the constant there, not the test.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit** (`git commit -m 'feat(state): traildepot migrations + record apis' -- packages/state/src/server`)

---

### Task 4: Binary manager + lifecycle

**Files:**

- Create: `packages/state/src/server/binary.ts`
- Create: `packages/state/src/server/lifecycle.ts`
- Create: `packages/state/src/server/lifecycle.it.test.ts`
- Modify: `packages/state/src/server/index.ts`

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

Add `get-port` to `@conciv/state` devDependencies (same version core uses).

- [ ] **Step 2: Run, expect FAIL** (`ensureTrailBinary` not exported)

- [ ] **Step 3: Implement `binary.ts`**

```ts
import {chmodSync, existsSync, mkdirSync, renameSync} from 'node:fs'
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
  if (!asset) throw new Error(`trailbase: unsupported platform ${key}`)
  return `trailbase_${version}_${asset}.zip`
}

export async function ensureTrailBinary(opts: {cacheDir: string; version?: string}): Promise<string> {
  const version = opts.version ?? TRAILBASE_VERSION
  const dir = join(opts.cacheDir, version)
  const executable = join(dir, process.platform === 'win32' ? 'trail.exe' : 'trail')
  if (existsSync(executable)) return executable
  mkdirSync(dir, {recursive: true})
  const asset = assetName(version)
  const url = `https://github.com/trailbaseio/trailbase/releases/download/${version}/${asset}`
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`trailbase download failed: ${response.status} ${url}`)
  const zipPath = join(dir, asset)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const {writeFileSync} = await import('node:fs')
  writeFileSync(`${zipPath}.part`, bytes)
  renameSync(`${zipPath}.part`, zipPath)
  const unzip = spawnSync('unzip', ['-o', '-q', zipPath, '-d', dir])
  if (unzip.status !== 0) {
    const tar = spawnSync('tar', ['-xf', zipPath, '-C', dir])
    if (tar.status !== 0) throw new Error('trailbase: could not unpack (need unzip or bsdtar)')
  }
  chmodSync(executable, 0o755)
  return executable
}
```

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
  throw new Error(`trailbase: not healthy after ${timeoutMs}ms at ${url}`)
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
export {prepareDepot, MIGRATION_SQL, RECORD_API_CONFIG} from './depot.js'
```

- [ ] **Step 5: Run the IT, expect PASS** (first run downloads ~23MB)

Run: `pnpm turbo run build --filter=@conciv/protocol && pnpm --filter @conciv/state exec vitest run src/server/lifecycle.it.test.ts`
Expected: PASS. If it fails with a migration filename error, fix `depot.ts` per the Task 3 note.

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): trailbase binary manager + lifecycle' -- packages/state`)

---

### Task 5: Records client + TrailBase-backed SessionStore

**Files:**

- Create: `packages/state/src/server/records.ts`
- Create: `packages/state/src/server/session-store.ts`
- Create: `packages/state/src/server/session-store.it.test.ts`
- Modify: `packages/state/src/server/index.ts`

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

- [ ] **Step 3: Implement `records.ts`**

```ts
export type RecordsClient = {
  list<T>(api: string, filter?: Record<string, string>): Promise<T[]>
  getBy<T>(api: string, field: string, value: string): Promise<T | null>
  create(api: string, body: Record<string, unknown>): Promise<string>
  update(api: string, id: string, patch: Record<string, unknown>): Promise<void>
  remove(api: string, id: string): Promise<void>
}

async function ensureOk(response: Response, context: string): Promise<Response> {
  if (!response.ok) throw new Error(`trailbase ${context}: ${response.status} ${await response.text()}`)
  return response
}

export function recordsClient(baseUrl: string): RecordsClient {
  const root = `${baseUrl}/api/records/v1`
  const json = {'content-type': 'application/json'}
  return {
    list: async (api, filter) => {
      const params = new URLSearchParams()
      for (const [field, value] of Object.entries(filter ?? {})) params.set(`filter[${field}]`, value)
      const query = params.size > 0 ? `?${params}` : ''
      const response = await ensureOk(await fetch(`${root}/${api}${query}`), `list ${api}`)
      const body = (await response.json()) as {records: unknown[]}
      return body.records as never
    },
    getBy: async function getBy<T>(this: void, api: string, field: string, value: string): Promise<T | null> {
      const params = new URLSearchParams({[`filter[${field}]`]: value})
      const response = await ensureOk(await fetch(`${root}/${api}?${params}`), `get ${api}`)
      const body = (await response.json()) as {records: T[]}
      return body.records[0] ?? null
    },
    create: async (api, body) => {
      const response = await ensureOk(
        await fetch(`${root}/${api}`, {method: 'POST', headers: json, body: JSON.stringify(body)}),
        `create ${api}`,
      )
      const result = (await response.json()) as {ids: string[]}
      const created = result.ids[0]
      if (!created) throw new Error(`trailbase create ${api}: no id returned`)
      return created
    },
    update: async (api, id, patch) => {
      await ensureOk(
        await fetch(`${root}/${api}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: json,
          body: JSON.stringify(patch),
        }),
        `update ${api}`,
      )
    },
    remove: async (api, id) => {
      await ensureOk(await fetch(`${root}/${api}/${encodeURIComponent(id)}`, {method: 'DELETE'}), `delete ${api}`)
    },
  }
}
```

(If the exact `filter[field]=value` query syntax differs on the pinned server, the integration test is the arbiter; the spike verified `filter[state][$ne]=pending` style for operators and plain `filter[field]=value` for equality.)

- [ ] **Step 4: Implement `session-store.ts`**

```ts
import type {SessionRecord, SessionRecordInput} from '@conciv/protocol/chat-types'
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
    if (!row) throw new Error(`session ${sessionId} not found`)
    return row
  }
  return {
    create: async (input) => {
      const ts = now()
      const record: SessionRecord = {...input, createdAt: ts, updatedAt: ts} as SessionRecord
      await client.create('sessions', sessionRecordToRow(record))
      return record
    },
    get: async (id) => {
      const row = await rowFor(id)
      return row ? sessionRowToRecord(row) : null
    },
    update: async (id, patch) => {
      const row = await mustRow(id)
      const merged: SessionRecord = {...sessionRowToRecord(row), ...patch, id: row.session_id, updatedAt: now()}
      await client.update('sessions', row.id, {...sessionRecordToRow(merged), status: row.status})
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

Note on the single `as SessionRecord`: `SessionRecordInput` fields are all provided; if strict TS rejects without the assertion, parse instead: `SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})` (preferred, matches old store; use that and drop the assertion).

Append to `src/server/index.ts`:

```ts
export {recordsClient, type RecordsClient} from './records.js'
export {createTrailBaseSessionStore, type SessionStore} from './session-store.js'
```

- [ ] **Step 5: Run IT, expect PASS**

Run: `pnpm --filter @conciv/state exec vitest run src/server/session-store.it.test.ts`

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): records client + trailbase session store' -- packages/state/src/server`)

---

### Task 6: Collection factories + Solid hooks

**Files:**

- Create: `packages/state/src/collections.ts`
- Create: `packages/state/src/solid/hooks.ts`
- Create: `packages/state/src/collections.it.test.ts`
- Modify: `packages/state/src/index.ts`, `packages/state/src/solid/index.ts`

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
    await collection.preload()
    const rows = Array.from(collection.state.values())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.session_id).toBe('conciv_aaaaaaaa-1111-4222-8333-444444444444')
  })
})
```

(`collection.preload()` and `collection.state` are the TanStack DB collection API; if the pinned version names differ — e.g. `toArray` — follow the version's types, keep the assertion meaning.)

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

```tsx
import {createContext, useContext, type JSX} from 'solid-js'
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
  return <StateContext.Provider value={value}>{props.children}</StateContext.Provider>
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
    q.from({session: sessions}).where(({session}) => eq(session.session_id, sessionId() ?? '')),
  )
}

export function useDraft(sessionId: () => string) {
  const {drafts} = useStateCollections()
  return useLiveQuery((q) => q.from({draft: drafts}).where(({draft}) => eq(draft.session_id, sessionId())))
}

export function useMarkers(sessionId: () => string) {
  const {markers} = useStateCollections()
  return useLiveQuery((q) => q.from({marker: markers}).where(({marker}) => eq(marker.session_id, sessionId())))
}
```

File must be `.tsx` (JSX): name it `packages/state/src/solid/hooks.tsx`, add `"jsx": "preserve", "jsxImportSource": "solid-js"` to the package tsconfig `compilerOptions`, and confirm tsdown handles the `.tsx` entry re-export. `src/solid/index.ts`:

```ts
export * from './hooks.jsx'
```

- [ ] **Step 5: Run IT + typecheck, expect PASS**

Run: `pnpm --filter @conciv/state exec vitest run src/collections.it.test.ts && pnpm --filter @conciv/state run typecheck`

- [ ] **Step 6: Commit** (`git commit -m 'feat(state): collection factories + solid hooks' -- packages/state`)

---

### Task 7: Core spawns TrailBase and adopts the store

**Files:**

- Modify: `packages/core/src/state-paths.ts` (add `trailDir`)
- Modify: `packages/core/src/engine.ts` (start/stop TrailBase, expose `statePort`)
- Modify: `packages/core/src/app.ts:128` (store construction becomes injectable; TrailBase store passed from engine)
- Modify: `packages/core/src/store/session-store.ts` (delete implementation; re-export type from `@conciv/state/server` for the transition)
- Modify: `packages/core/package.json` (add `"@conciv/state": "workspace:*"`)
- Test: `packages/core/src/store/session-store.it.test.ts` (if an existing store test exists, re-point it; otherwise add)

**Interfaces:**

- Consumes: `ensureTrailBinary`, `startTrailBase`, `createTrailBaseSessionStore` from `@conciv/state/server`.
- Produces: `Engine` gains `statePort: number`; `MakeAppOpts` gains `store: SessionStore` (constructed in `engine.ts`, passed into `makeApp`). `SessionStore` type now imported from `@conciv/state/server` everywhere in core.

- [ ] **Step 1: Write the engine integration test first**

Locate core's existing engine/server IT harness (`packages/core/src` tests or `packages/it`). Add:

```ts
import {describe, expect, it} from 'vitest'

describe('engine state plane', () => {
  it('starts trailbase and serves the sessions record api', async () => {
    const engine = await startTestEngine()
    const response = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    await engine.stop()
  })
})
```

Use the repo's existing engine-test bootstrap helper (grep for `start(` usages in `packages/core`/`packages/it` tests) rather than inventing one; `startTestEngine` above stands for that helper plus the new `statePort` field.

- [ ] **Step 2: Run, expect FAIL** (`statePort` undefined)

- [ ] **Step 3: state-paths + engine wiring**

`state-paths.ts` — add to the returned object and type: `trailDir: join(dir, 'trailbase')`.

`engine.ts` inside `start()` before `makeApp` (after `statePaths`):

```ts
const trailBinary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
const statePort = await getPort()
const trailbase = await startTrailBase({binary: trailBinary, dataDir: paths.trailDir, port: statePort, dev: true})
const store = createTrailBaseSessionStore({baseUrl: trailbase.url})
```

Pass `store` through `MakeAppOpts` into `makeApp` (replace the `createFsSessionStore` call at `app.ts:128` with `opts.store`). Extend `Engine` with `statePort` and make `stop()` also await `trailbase.stop()`. Imports: `getPort` already used in `engine.ts`; add `homedir` from `node:os`, `join` from `node:path`, and the three `@conciv/state/server` functions.

`store/session-store.ts` becomes:

```ts
export type {SessionStore} from '@conciv/state/server'
```

Delete `createSessionStore`/`createFsSessionStore` and the unstorage imports; remove `unstorage` from core's dependencies if nothing else imports it (`grep -rn 'unstorage' packages/core/src`).

- [ ] **Step 4: Fix compile fallout**

Run: `pnpm turbo run typecheck --filter=@conciv/core`
Expected first pass: errors at each old import site (`chat-env.ts`, `session.ts`, `turn.ts`, `app.ts`). All keep importing `type {SessionStore} from '../../store/session-store.js'` which still re-exports; fix any signature drift (the new store adds `setStatus`, which is additive).

- [ ] **Step 5: Run core tests**

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS including the new IT. Dev-loop note: core changes need a dev-server restart to observe manually.

- [ ] **Step 6: Commit** (`git commit -m 'feat(core): spawn trailbase, adopt trailbase-backed session store' -- packages/core packages/state pnpm-lock.yaml`)

---

### Task 8: Turn status transitions

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts`
- Test: extend the engine IT from Task 7 (same file)

**Interfaces:**

- Consumes: `store.setStatus(id, status)` (Task 5).
- Produces: `sessions.status` transitions: `thinking` when the POST turn is accepted; `streaming` on the first content chunk (`EventType.TEXT_MESSAGE_CONTENT` or `EventType.TOOL_CALL_START`); `idle` on lock release (terminal chunk, abort, or throw).

- [ ] **Step 1: Extend the IT**

```ts
it('walks status thinking -> idle across a turn', async () => {
  const engine = await startTestEngine()
  const sessionId = await resolveSession(engine)
  await postChat(engine, sessionId, 'say hi')
  const during = await fetchSessionRow(engine, sessionId)
  expect(['thinking', 'streaming']).toContain(during.status)
  await waitForIdleRow(engine, sessionId, 30000)
  const after = await fetchSessionRow(engine, sessionId)
  expect(after.status).toBe('idle')
  await engine.stop()
})
```

`fetchSessionRow` = GET `/api/records/v1/sessions?filter[session_id]=<id>` on `engine.statePort`, first record. `waitForIdleRow` = poll every 250ms until `status === 'idle'`. Use the fake harness the existing core ITs use (grep `packages/harness-testkit` usage) so the turn completes without a real CLI.

- [ ] **Step 2: Run, expect FAIL** (status stays `idle` — never set)

- [ ] **Step 3: Implement transitions in `turn.ts`**

In the POST `/` handler after `ensureChatRecord(...)` (line ~161):

```ts
await deps.store.setStatus(sessionId, turnKindFor(c.req.valid('json')) === 'compact' ? 'compacting' : 'thinking')
```

In `withLockRelease`, flip to streaming on first content and to idle on release. Replace `lockReleaser` usage so release also resets status:

```ts
function lockReleaser(deps: TurnDeps, sessionId: string): () => void {
  const lock = {held: true}
  return () => {
    if (!lock.held) return
    lock.held = false
    releaseLock(deps.stateRoot, sessionId)
    void deps.store.setStatus(sessionId, 'idle').catch(() => {})
  }
}
```

Inside the `for await` loop of `withLockRelease`, before yielding:

```ts
if (!streamed && (chunk.type === EventType.TEXT_MESSAGE_CONTENT || chunk.type === EventType.TOOL_CALL_START)) {
  streamed = true
  void deps.store.setStatus(sessionId, 'streaming').catch(() => {})
}
```

with `let streamed = false` declared next to `let finished = false`. (Verify the exact `EventType` member names against `@tanstack/ai`'s `EventType` enum in node_modules; use the text-content and tool-call-start members it actually defines.)

Do not set `streaming` for compact turns: guard with the turn kind — thread `turnKind` into `withLockRelease` as a parameter (`turnKind: 'chat' | 'compact'`) from `startTurn`, and skip the streaming flip when `turnKind === 'compact'`.

- [ ] **Step 4: Run IT, expect PASS**

- [ ] **Step 5: Commit** (`git commit -m 'feat(core): publish session status transitions to state plane' -- packages/core/src/api/chat/turn.ts <it-file>`)

---

### Task 9: Server-side compaction endpoint

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts` (new route `POST /compact`)
- Test: extend the engine IT (same file as Tasks 7–8)

**Interfaces:**

- Consumes: `startTurn` (existing), `recordsClient` semantics for markers via a new store-adjacent writer; add `markers` writes through a `RecordsClient` constructed in `engine.ts` and threaded on `ChatRuntime` as `state: {markers: {create(sessionId: string, kind: 'new' | 'compact', afterTurn: number): Promise<string>; settle(id: string): Promise<void>}}`.
- Produces: `POST /api/chat/compact` (session id from headers, same as `POST /`): 409 when busy, otherwise writes a pending `compact` marker, sets status `compacting`, runs a compact turn server-side, settles the marker, returns `{ok: true}` immediately after starting (fire-and-follow via status).

- [ ] **Step 1: Extend the IT**

```ts
it('compacts server-side: marker written, status walks compacting -> idle', async () => {
  const engine = await startTestEngine()
  const sessionId = await resolveSession(engine)
  await postChat(engine, sessionId, 'hello')
  await waitForIdleRow(engine, sessionId, 30000)
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/chat/compact`, {
    method: 'POST',
    headers: {'x-conciv-session': sessionId},
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

(Header name: use the same session header `sessionIdFromHeaders` reads — grep `packages/core/src/api/chat/session-id.ts` for the exact name and use it.)

- [ ] **Step 2: Run, expect FAIL** (404 on /compact)

- [ ] **Step 3: Marker writer in engine wiring**

In `engine.ts` where the store is created (Task 7), also create:

```ts
const records = recordsClient(trailbase.url)
const markers = {
  create: (sessionId: string, kind: 'new' | 'compact', afterTurn: number) =>
    records.create('markers', {session_id: sessionId, kind, after_turn: afterTurn, pending: 1, created_at: Date.now()}),
  settle: (id: string) => records.update('markers', id, {pending: 0}),
}
```

Thread `markers` through `MakeAppOpts` into `ChatRuntime` (follow how `store` flows in `chat-env.ts`).

- [ ] **Step 4: Route in `turn.ts`**

```ts
.post('/compact', async (c) => {
  const deps = c.var.chat
  const sessionId = sessionIdFromHeaders(c.req.raw.headers)
  if (!sessionId) throw new HTTPException(400, {message: 'no session (resolve first)'})
  if (deps.hub.generating(sessionId)) throw new HTTPException(409, {message: 'session busy'})
  if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) throw new HTTPException(409, {message: 'session busy'})
  try {
    await ensureChatRecord(deps.store, sessionId, deps.harness.id, deps.cwd)
    const markerId = await deps.markers.create(sessionId, 'compact', 0)
    await deps.store.setStatus(sessionId, 'compacting')
    const chatReq: ChatRequest = {messages: [{role: 'user', content: '/compact'}], intent: 'compact'}
    await startTurn(deps, sessionId, chatReq, () => void deps.markers.settle(markerId).catch(() => {}))
    return c.json({ok: true} satisfies Ok)
  } catch (error) {
    releaseLock(deps.stateRoot, sessionId)
    throw error
  }
})
```

`startTurn` gains an optional `onSettled?: () => void` third parameter, invoked in `withLockRelease`'s `finally` (after `release()`); parse `chatReq` through `ChatRequestSchema.parse` if the literal doesn't satisfy the type directly.

- [ ] **Step 5: Run IT, expect PASS**

- [ ] **Step 6: Commit** (`git commit -m 'feat(core): server-side compaction endpoint + markers' -- packages/core/src`)

---

### Task 10: Gates and changeset

**Files:**

- Create: `.changeset/widget-rewrite-state-plane.md`

- [ ] **Step 1: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all green. Widget still compiles against the re-exported `SessionStore` type — this plan must not touch `packages/widget` behavior.

- [ ] **Step 2: Fallow**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. Likely flags: `unstorage` now-unused in core (remove from `packages/core/package.json`), any unused re-export in `@conciv/state`. Verify suspicious dead-code claims with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'` before deleting.

- [ ] **Step 3: Changeset**

`.changeset/widget-rewrite-state-plane.md`:

```markdown
---
'@conciv/state': patch
'@conciv/core': patch
---

New @conciv/state package: TrailBase-backed domain-state plane (sessions, drafts, markers) with server lifecycle, records client, TanStack DB collection factories, and Solid hooks. Core now spawns TrailBase, stores sessions in it, publishes turn status, and owns compaction server-side.
```

- [ ] **Step 4: Commit** (`git commit -m 'chore: changeset for state plane' -- .changeset`)

---

## Out of scope for Plan 1 (later plans)

- Plan 2: extension contract v2 (`useSlot`/`useHost`, capability-typed manifest, `ext_<id>_*` table registration).
- Plan 3: `@conciv/surface` + `@conciv/embed` (dock, compound chat components, stock `fetchServerSentEvents` adapter, drafts/markers consumption, widget IT migration, mount-externals test).
- Plan 4: rewire terminal/test-runner/whiteboard extensions, `git rm -r packages/widget`, PUBLIC_PACKAGES removal, final fallow sweep.
- Records-API auth hardening (world ACL + 127.0.0.1 binding accepted for now; revisit before any non-localhost exposure).
