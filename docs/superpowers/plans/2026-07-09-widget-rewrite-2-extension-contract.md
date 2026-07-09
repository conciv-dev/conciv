# Widget Rewrite Plan 2/4: Extension Contract v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the extension contract around one doorway — `useHost()`/`useSlot()` hooks over a `HostApi` of four planes (state, chat, ui, page) — plus a capability-typed manifest that can declare `ext_<id>_*` TrailBase tables, registered into core's state plane at boot.

**Architecture:** The v2 contract is ADDITIVE in this plan: new `HostProvider`/`useHost`/`useSlot` from `@conciv/extension/client` and new manifest fields (`tables`, `composerActions`, `controls`) land alongside the v1 `ExtensionHostContext`/`mountExtension` world, which `packages/widget` still consumes. Plan 3 (`@conciv/surface`) builds the real host on v2; Plan 4 rewires the built-in extensions and deletes v1 together with the widget. Extension tables ride Plan 1's state plane: `@conciv/state` generates their migrations + record APIs, core's engine collects declarations from manifests and passes them to `startStatePlane`. `@conciv/extension-testkit` gains a fake host implementing the hook API against the real engine-spawned TrailBase.

**Spec:** `docs/superpowers/specs/2026-07-09-widget-rewrite-design.md` (sections "Host access: hooks only", "Composition, not registration", "Testing and rollout"). Depends on Plan 1 (landed: PR #49) — `@conciv/state`, `startStatePlane`, `Engine.statePort`.

**Tech Stack:** Solid context (no JSX in `@conciv/extension` — `createComponent`, same rule as `@conciv/state/solid`), TanStack DB `Collection` types, `@conciv/state` collection factories, `@conciv/errors` for every throw, TrailBase v0.30.0 (already pinned).

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (lint deletes them). No `any`/`as`/non-null `!`; strict TS (`noUncheckedIndexedAccess`, NodeNext).
- oxfmt style: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Every throw in code this plan touches goes through `@conciv/errors` (`makeError` for new errors, `decorateError` to brand a caught one; package wrappers like `stateError` sit on top) — a bare `new Error` is a defect. New client-facing codes are added to the central `UserCode` union in `packages/errors/src/user-codes.ts`. Exception: test files and test helpers may throw bare `Error` (existing repo practice).
- `@tanstack/db` must be pinned EXACT `"0.6.14"` wherever added (no caret — two copies break `Collection` assignability; verified in Plan 1).
- No new npm dependency beyond those named here: `@conciv/extension` gains `@conciv/state` (workspace), `@conciv/errors` (workspace), `@tanstack/db` (exact 0.6.14). Nothing else.
- v1 contract (`ExtensionHostContext`, `mountExtension`, `ClientApi`, `getExtensionApi`) is NOT modified or deleted — `packages/widget` and the three built-in extensions must keep compiling and passing untouched. Plan 4 deletes v1.
- No stubs/mocks for state: integration tests run the real downloaded TrailBase binary (Plan 1 harness). The testkit fake host's chat plane is a RECORDING implementation (spec-sanctioned "fake host implementing the hook API") — it records calls observably in the DOM; everything else in the fake host is real (real state plane, real Ark dialog/popover, real grab).
- Commit after every task with pathspecs (`git commit -- <paths>`). Known prek `next-index-*.lock.lock` race: recover with `pnpm exec oxfmt --write <files>` then `git commit --no-verify`.
- Build via turbo. `pnpm --filter @conciv/state exec vitest run <file>` style for single-file runs.
- Deviation rule: if a TrailBase/TanStack behavior contradicts a note here, the integration test is the arbiter — fix the constant/impl, keep the assertion meaning, note the deviation in the final summary.

---

### Task 1: `@conciv/state` — extension tables + uuidv7 ids + table-factory

**Files:**

- Create: `packages/state/src/server/extension-tables.ts`
- Create: `packages/state/src/server/extension-tables.test.ts`
- Create: `packages/state/src/uuid.ts`
- Create: `packages/state/src/uuid.test.ts`
- Create: `packages/state/src/server/extension-tables.it.test.ts`
- Modify: `packages/errors/src/user-codes.ts` (add `'state.invalid-table'` to `UserCode` + `USER_MESSAGES`)
- Modify: `packages/state/src/errors.ts` (add `invalid-table` to `StateErrorCode` + `USER_CODES`)
- Modify: `packages/state/src/server/depot.ts` (`prepareDepot` gains `extensionTables`, export `recordApiConfig`)
- Modify: `packages/state/src/server/plane.ts` (`startStatePlane` gains `extensionTables`)
- Modify: `packages/state/src/collections.ts` (add `extensionTableCollection`, `makeTableFactory`)
- Modify: `packages/state/src/server/index.ts`, `packages/state/src/index.ts` (exports)

**Interfaces:**

- Consumes: Plan 1's `prepareDepot`, `recordsClient`, `stateClient`, `startStatePlane`.
- Produces:
  - `ExtensionTableSpec = {extension: string; name: string; columns: string}`
  - `extensionTableName(spec): string` → `ext_<slug>_<slug>` (physical table name)
  - `extensionTableSql(spec): string`, `extensionMigrationFilename(spec): string` (deterministic, order-independent)
  - `prepareDepot(opts: {dataDir: string; extensionTables?: ExtensionTableSpec[]})`
  - `startStatePlane(opts: {...; extensionTables?: ExtensionTableSpec[]})`
  - `uuidv7Base64(now?: () => number): string` — url-safe-base64 UUIDv7 record id (client-side inserts)
  - `ExtensionRow = {id: string} & Record<string, unknown>`, `extensionTableCollection(client, extension, name): Collection<ExtensionRow>`, `ExtensionTableCollection = ReturnType<typeof extensionTableCollection>`, and `makeTableFactory(client, extension): (name: string) => ExtensionTableCollection` (cached per name). Deliberately NOT generic per row type: a generic `table<Row>()` cannot be implemented cast-free over a shared cache, and the repo rule is zod at every boundary anyway — extensions parse rows with their own schema on read and insert structurally-compatible objects.

- [ ] **Step 1: Failing unit tests**

`packages/state/src/server/extension-tables.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync, readFileSync, readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {extensionMigrationFilename, extensionTableName, extensionTableSql} from './extension-tables.js'
import {prepareDepot} from './depot.js'

const spec = {extension: 'My-Ext', name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}

describe('extension tables', () => {
  it('derives a slugged physical name', () => {
    expect(extensionTableName(spec)).toBe('ext_my_ext_notes')
  })

  it('generates STRICT ddl with the uuid_v7 blob pk', () => {
    const sql = extensionTableSql(spec)
    expect(sql).toContain('CREATE TABLE ext_my_ext_notes')
    expect(sql).toContain('id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7())')
    expect(sql).toContain('session_id TEXT NOT NULL')
    expect(sql).toContain(') STRICT;')
  })

  it('migration filename is deterministic, order-independent, and sorts after the conciv base migration', () => {
    const filename = extensionMigrationFilename(spec)
    expect(filename).toBe(extensionMigrationFilename(spec))
    expect(filename).toMatch(/^U\d+__ext_my_ext_notes\.sql$/)
    const version = Number(filename.slice(1).split('__')[0])
    expect(version).toBeGreaterThan(1783545917)
  })

  it('rejects names that do not survive slugging', () => {
    expect(() => extensionTableName({extension: 'x', name: '9bad', columns: 'a TEXT'})).toThrowError(
      expect.objectContaining({code: 'invalid-table'}),
    )
  })

  it('prepareDepot writes extension migrations + record apis idempotently', () => {
    const dir = mkdtempSync(join(tmpdir(), 'depot-ext-'))
    prepareDepot({dataDir: dir, extensionTables: [spec]})
    prepareDepot({dataDir: dir, extensionTables: [spec]})
    const files = readdirSync(join(dir, 'migrations/main'))
    expect(files.filter((file) => file.includes('ext_my_ext_notes'))).toHaveLength(1)
    const config = readFileSync(join(dir, 'config.textproto'), 'utf8')
    expect(config.match(/ name: "ext_my_ext_notes"/g)).toHaveLength(1)
  })
})
```

`packages/state/src/uuid.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {uuidv7Base64} from './uuid.js'

describe('uuidv7Base64', () => {
  it('emits url-safe base64 of 16 bytes with version and variant bits', () => {
    const id = uuidv7Base64(() => 1783545917000)
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}==$/)
    const bytes = Uint8Array.from(atob(id.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
    expect(bytes).toHaveLength(16)
    expect((bytes[6] ?? 0) >> 4).toBe(7)
    expect((bytes[8] ?? 0) >> 6).toBe(2)
  })

  it('encodes the timestamp big-endian in the first 6 bytes', () => {
    const id = uuidv7Base64(() => 0x0102030405aa)
    const bytes = Uint8Array.from(atob(id.replaceAll('-', '+').replaceAll('_', '/')), (ch) => ch.charCodeAt(0))
    expect([...bytes.slice(0, 6)]).toEqual([0x01, 0x02, 0x03, 0x04, 0x05, 0xaa])
  })
})
```

- [ ] **Step 2: Run both, expect FAIL** (`./extension-tables.js` / `./uuid.js` not found)

Run: `pnpm --filter @conciv/state exec vitest run src/server/extension-tables.test.ts src/uuid.test.ts`

- [ ] **Step 3: Implement**

Add to `packages/errors/src/user-codes.ts` — extend `UserCode` with `'state.invalid-table'` and `USER_MESSAGES` with `'state.invalid-table': 'extension declared an invalid table'`. Add to `packages/state/src/errors.ts` — extend `StateErrorCode` with `'invalid-table'` and `USER_CODES` with `'invalid-table': 'state.invalid-table'`.

`packages/state/src/server/extension-tables.ts`:

```ts
import {stateError} from '../errors.js'

export type ExtensionTableSpec = {extension: string; name: string; columns: string}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function assertIdentifier(kind: string, raw: string): string {
  const slugged = slug(raw)
  if (!/^[a-z][a-z0-9_]*$/.test(slugged)) {
    throw stateError('invalid-table', `extension table ${kind} ${JSON.stringify(raw)} slugs to ${JSON.stringify(slugged)}`, {kind, raw, slugged})
  }
  return slugged
}

export function extensionTableName(spec: ExtensionTableSpec): string {
  return `ext_${assertIdentifier('extension', spec.extension)}_${assertIdentifier('name', spec.name)}`
}

export function extensionTableSql(spec: ExtensionTableSpec): string {
  const columns = spec.columns.trim()
  if (!columns) throw stateError('invalid-table', `extension table ${spec.name} declares no columns`, {spec})
  return `CREATE TABLE ${extensionTableName(spec)} (
  id BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
  ${columns}
) STRICT;
`
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function extensionMigrationFilename(spec: ExtensionTableSpec): string {
  const physical = extensionTableName(spec)
  return `U${1790000000 + (fnv1a32(physical) % 100000000)}__${physical}.sql`
}
```

Why hash-versioned filenames: TrailBase applies migrations by numeric filename order and tracks them by filename, so the name must be stable across boots and INDEPENDENT of the order extensions appear in config (reordering must not rename an applied migration). `1790000000 + (hash % 1e8)` keeps every extension migration sorted after the conciv base `U1783545917` while staying deterministic per table. Collisions between two distinct tables are theoretically possible (1e8 space) — the engine IT registers two tables and would surface it; accepted for v0.

`packages/state/src/uuid.ts`:

```ts
export function uuidv7Base64(now: () => number = Date.now): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const ts = now()
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff
  bytes[5] = ts & 0xff
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_')
}
```

(Node >= 22 and browsers both have global `crypto.getRandomValues` and `btoa`. The `==` padding stays — TrailBase record ids observed in Plan 1 carry it: `AZ9DoWFmdZCnwINWnCVR_g==`.)

`packages/state/src/server/depot.ts` changes — export the record-api snippet builder and thread extension tables through:

```ts
export function recordApiConfig(name: string): string {
  return `record_apis: [
  {
    name: "${name}"
    table_name: "${name}"
    acl_world: [CREATE, READ, UPDATE, DELETE]
    enable_subscriptions: true
  }
]
`
}
```

Refactor `RECORD_API_CONFIG` to `['sessions', 'drafts', 'markers'].map(recordApiConfig).join('')` (delete the old module-private `api`). Change the signature and body of `prepareDepot`:

```ts
import {extensionMigrationFilename, extensionTableSql, type ExtensionTableSpec} from './extension-tables.js'

export function prepareDepot(opts: {dataDir: string; extensionTables?: ExtensionTableSpec[]}): void {
  const migrationsDir = join(opts.dataDir, 'migrations/main')
  mkdirSync(migrationsDir, {recursive: true})
  const migration = join(migrationsDir, MIGRATION_FILENAME)
  if (!existsSync(migration)) writeFileSync(migration, MIGRATION_SQL)
  const tables = opts.extensionTables ?? []
  for (const spec of tables) {
    const file = join(migrationsDir, extensionMigrationFilename(spec))
    if (!existsSync(file)) writeFileSync(file, extensionTableSql(spec))
  }
  const configPath = join(opts.dataDir, 'config.textproto')
  const extensionApis = tables.map((spec) => extensionTableName(spec))
  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${BASE_CONFIG}${RECORD_API_CONFIG}${extensionApis.map(recordApiConfig).join('')}`)
    return
  }
  const existing = readFileSync(configPath, 'utf8')
  const missing = [
    ...(existing.includes(' name: "sessions"') ? [] : ['sessions', 'drafts', 'markers']),
    ...extensionApis.filter((name) => !existing.includes(` name: "${name}"`)),
  ]
  if (missing.length > 0) appendFileSync(configPath, missing.map(recordApiConfig).join(''))
}
```

(The idempotence probe is ` name: "x"` with a leading space — `table_name: "x"` contains `name: "x"` as a substring; learned in Plan 1.)

`packages/state/src/server/plane.ts` — add `extensionTables?: ExtensionTableSpec[]` to the opts type and pass it through: `startTrailBase` does NOT change; instead move the `prepareDepot` call: `startTrailBase` currently calls `prepareDepot({dataDir})` itself. Give `startTrailBase` an optional `extensionTables` opt and forward:

```ts
export async function startTrailBase(opts: {
  binary: string
  dataDir: string
  port: number
  dev?: boolean
  extensionTables?: ExtensionTableSpec[]
}): ...
  prepareDepot({dataDir: opts.dataDir, extensionTables: opts.extensionTables})
```

and in `plane.ts`:

```ts
export async function startStatePlane(opts: {
  dataDir: string
  port: number
  cacheDir?: string
  now?: () => number
  extensionTables?: ExtensionTableSpec[]
}): Promise<StatePlane> {
  const binary = await ensureTrailBinary({cacheDir: opts.cacheDir ?? join(homedir(), '.cache/conciv/trailbase')})
  const server = await startTrailBase({
    binary,
    dataDir: opts.dataDir,
    port: opts.port,
    dev: true,
    extensionTables: opts.extensionTables,
  })
  ...
```

`packages/state/src/collections.ts` — append:

```ts
import {extensionTableName} from './server/extension-tables.js'
```

WAIT — `collections.ts` is browser-facing; `server/extension-tables.ts` imports `stateError` only (no node APIs), so the import is safe, but keep the dependency direction clean instead: move `extensionTableName`/`slug`/`assertIdentifier` into a NEW shared module `packages/state/src/table-names.ts` (no node imports), and have `server/extension-tables.ts` re-export it plus keep the sql/filename builders (which are also node-free but server-only in spirit). Concretely:

`packages/state/src/table-names.ts`:

```ts
import {stateError} from './errors.js'

export type ExtensionTableSpec = {extension: string; name: string; columns: string}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function assertIdentifier(kind: string, raw: string): string {
  const slugged = slug(raw)
  if (!/^[a-z][a-z0-9_]*$/.test(slugged)) {
    throw stateError('invalid-table', `extension table ${kind} ${JSON.stringify(raw)} slugs to ${JSON.stringify(slugged)}`, {kind, raw, slugged})
  }
  return slugged
}

export function extensionTableName(spec: Pick<ExtensionTableSpec, 'extension' | 'name'>): string {
  return `ext_${assertIdentifier('extension', spec.extension)}_${assertIdentifier('name', spec.name)}`
}
```

`server/extension-tables.ts` then contains only `extensionTableSql`, `extensionMigrationFilename`, re-exports `extensionTableName` and `type ExtensionTableSpec` from `../table-names.js`.

`packages/state/src/collections.ts` — append:

```ts
import {extensionTableName} from './table-names.js'

export type ExtensionRow = {id: string} & Record<string, unknown>

export function extensionTableCollection(client: StateClient, extension: string, name: string) {
  const physical = extensionTableName({extension, name})
  return createCollection(
    trailBaseCollectionOptions<ExtensionRow>({
      id: physical,
      recordApi: client.records(physical),
      getKey: (row) => row.id,
      parse: {},
      serialize: {},
    }),
  )
}

export type ExtensionTableCollection = ReturnType<typeof extensionTableCollection>

export function makeTableFactory(client: StateClient, extension: string): (name: string) => ExtensionTableCollection {
  const cache = new Map<string, ExtensionTableCollection>()
  return (name) => {
    const cached = cache.get(name)
    if (cached) return cached
    const collection = extensionTableCollection(client, extension, name)
    cache.set(name, collection)
    return collection
  }
}
```

(The cache exists because `createCollection` with a duplicate `id` in one runtime is an error; every `table('x')` call must return the same instance.)

Exports: add to `packages/state/src/index.ts`: `export {extensionTableName, type ExtensionTableSpec} from './table-names.js'` and `export {uuidv7Base64} from './uuid.js'` (collections re-exported via the existing `export * from './collections.js'`). Add to `packages/state/src/server/index.ts`: `export {extensionTableSql, extensionMigrationFilename, extensionTableName, type ExtensionTableSpec} from './extension-tables.js'`.

- [ ] **Step 4: Run unit tests, expect PASS**

Run: `pnpm --filter @conciv/state exec vitest run src/server/extension-tables.test.ts src/uuid.test.ts src/server/depot.test.ts`
Expected: PASS (existing depot tests still green — `prepareDepot` with no `extensionTables` behaves exactly as before).

- [ ] **Step 5: Failing IT — extension table served + explicit uuidv7 id accepted**

`packages/state/src/server/extension-tables.it.test.ts`:

```ts
import {beforeAll, afterAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, recordsClient} from './index.js'
import {uuidv7Base64} from '../uuid.js'

const spec = {extension: 'demo', name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}

let server: {url: string; stop(): Promise<void>}

beforeAll(async () => {
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  server = await startTrailBase({
    binary,
    dataDir: mkdtempSync(join(tmpdir(), 'depot-ext-')),
    port: await getPort(),
    dev: true,
    extensionTables: [spec],
  })
}, 120000)

afterAll(async () => server.stop())

describe('extension tables over the record api', () => {
  it('serves crud on ext_demo_notes and accepts a client-generated uuidv7 id', async () => {
    const records = recordsClient(server.url)
    const id = uuidv7Base64()
    await records.create('ext_demo_notes', {id, session_id: 'conciv_x', body: 'hello'})
    const rows = await records.list('ext_demo_notes')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({id, session_id: 'conciv_x', body: 'hello'})
  })
})
```

Run: `pnpm --filter @conciv/state exec vitest run src/server/extension-tables.it.test.ts`
Expected first run: FAIL only if the implementation is wrong — this step lands after Step 3, so expect PASS. If TrailBase rejects the explicit id (400 in `records-request-failed` details), the IT is the arbiter: adjust `uuidv7Base64` output format (candidates: unpadded base64url, plain UUID string `xxxxxxxx-xxxx-...`) until create succeeds AND the read-back id round-trips; keep the assertion meaning (client-chosen id survives).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @conciv/state run typecheck && pnpm turbo run build --filter=@conciv/state`

```bash
git add packages/state/src
git commit -m 'feat(state): extension tables, uuidv7 ids, table collection factory' -- packages/state/src
```

---

### Task 2: Manifest v2 — `tables`, `composerActions`, `controls` (capability-typed)

**Files:**

- Create: `packages/extension/src/host-types.ts`
- Create: `packages/extension/test/manifest-v2.test-d.ts`
- Modify: `packages/extension/src/define-extension.ts`
- Modify: `packages/extension/src/index.ts`
- Modify: `packages/extension/package.json` (deps: `@conciv/state` workspace:^, `@conciv/errors` workspace:^, `@tanstack/db` exact `0.6.14`)
- Modify: `packages/extension/test/define-extension.test.ts` (extend)

**Interfaces:**

- Consumes: `Collection` type from `@tanstack/db`; `StateClient`, `sessionsCollection` types from `@conciv/state`; `DialogApi`, `PopoverApi` from `@conciv/ui-kit-system`; `GrabApi`, `LocateResult`, `OpenSourceResult` (already imported in v1 types).
- Produces (used by Tasks 3–5 and Plan 3):
  - `HostState`, `HostChat`, `HostUi`, `PageAgent`, `HostApi` (in `host-types.ts`)
  - `ExtensionTableDecl = {name: string; columns: string}`
  - `ComposerActionDecl = {id: string; label: string; icon: Component<{class?: string}>; run(host: HostApi): void}`
  - `ComposerControlDecl = {id: string; Component: Component}`
  - `ExtensionMeta`/`ExtensionBuilder` carry `tables`/`composerActions`/`controls` through; `AnyExtension` unchanged in name.

Capability typing note: the spec's "declaring `views` requires view components; declaring `tables` requires migrations" is enforced STRUCTURALLY — `ExtensionView.Component` is already a required field, and a `tables` declaration IS its migration (`@conciv/state` generates the DDL from `columns`; an extension cannot declare a table without the thing that materializes it). `ComposerActionDecl.run`/`icon` and `ComposerControlDecl.Component` are required fields for the same reason. The test-d file pins all of this at compile time — that is the HarnessAdapter-style guarantee with none of the conditional-union machinery (nothing here is mutually exclusive the way `transcriptHistory`/`history` are).

- [ ] **Step 1: Failing type tests**

`packages/extension/test/manifest-v2.test-d.ts`:

```ts
import {describe, expectTypeOf, it} from 'vitest'
import {defineExtension} from '../src/define-extension.js'
import type {ComposerActionDecl, ExtensionTableDecl, HostApi} from '../src/host-types.js'

describe('manifest v2 capability typing', () => {
  it('tables require columns', () => {
    expectTypeOf<ExtensionTableDecl>().toEqualTypeOf<{name: string; columns: string}>()
    defineExtension({name: 'ok', tables: [{name: 'notes', columns: 'body TEXT'}]})
    // @ts-expect-error a table without columns is not a table
    defineExtension({name: 'bad', tables: [{name: 'notes'}]})
  })

  it('composer actions require icon and run', () => {
    // @ts-expect-error run is required
    const missingRun: ComposerActionDecl = {id: 'a', label: 'A', icon: () => null}
    void missingRun
    const action: ComposerActionDecl = {id: 'a', label: 'A', icon: () => null, run: (host) => host.chat.send('hi')}
    expectTypeOf(action.run).parameter(0).toEqualTypeOf<HostApi>()
  })

  it('controls require a component', () => {
    // @ts-expect-error Component is required
    defineExtension({name: 'bad2', controls: [{id: 'c'}]})
    defineExtension({name: 'ok2', controls: [{id: 'c', Component: () => null}]})
  })

  it('builder carries the declarations', () => {
    const ext = defineExtension({name: 'demo', tables: [{name: 'notes', columns: 'body TEXT'}]})
    expectTypeOf(ext.tables).toEqualTypeOf<readonly ExtensionTableDecl[] | undefined>()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @conciv/extension run typecheck`
Expected: FAIL — `host-types.js` module missing, `tables` not on `ExtensionMeta`.

- [ ] **Step 3: Implement `host-types.ts`**

```ts
import type {Component, ComponentProps} from 'solid-js'
import type {DialogApi, PopoverApi} from '@conciv/ui-kit-system'
import type {GrabApi} from '@conciv/grab'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'
import type {OpenSourceResult} from '@conciv/protocol/page-types'
import type {ExtensionTableCollection, StateClient, sessionsCollection} from '@conciv/state'

export type ExtensionTableDecl = {name: string; columns: string}

export type HostState = {
  client: StateClient
  sessions: ReturnType<typeof sessionsCollection>
  activeSession: () => string | null
  table(name: string): ExtensionTableCollection
}

export type HostChat = {
  send(text: string): void
  insert(text: string): void
  respondApproval(id: string, approved: boolean): void
}

export type HostUi = {
  notify(message: string, tone?: 'info' | 'success' | 'error'): void
  dialog(): DialogApi
  popover(): {
    Root: Component<ComponentProps<PopoverApi['Root']>>
    Positioner: Component<ComponentProps<PopoverApi['Positioner']>>
    Content: Component<ComponentProps<PopoverApi['Content']>>
  }
  surface(): HTMLElement
}

export type PageAgent = {
  elementAt(x: number, y: number): Element | null
  describe(host: Element): {component: string; file: string | null}
  locate(el: Element): Promise<LocateResult | null>
  openSource(loc: LocateResult): Promise<OpenSourceResult>
  grab: GrabApi
}

export type HostApi = {
  state: HostState
  chat: HostChat
  ui: HostUi
  page: PageAgent
}

export type ComposerActionDecl = {
  id: string
  label: string
  icon: Component<{class?: string}>
  run(host: HostApi): void
}

export type ComposerControlDecl = {id: string; Component: Component}
```

TYPING NOTE — `table()` deliberately returns `ExtensionTableCollection` (rows are `{id: string} & Record<string, unknown>`) rather than a per-row generic: a generic doorway cannot be implemented over a shared collection cache without a cast, and the repo rule is zod at every boundary anyway. Extensions parse rows with their own zod schema on read; inserts take structurally-compatible objects. `@tanstack/db`'s `Collection` type therefore never appears in this file.

`define-extension.ts` — extend `ExtensionMeta` and the builder passthrough:

```ts
import type {ComposerActionDecl, ComposerControlDecl, ExtensionTableDecl} from './host-types.js'

export type ExtensionMeta<Name extends string, Schema extends z.ZodType, Tools extends readonly AnyToolBuilder[]> = {
  name: Name
  configSchema?: Schema
  tools?: Tools
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  tables?: readonly ExtensionTableDecl[]
  composerActions?: readonly ComposerActionDecl[]
  controls?: readonly ComposerControlDecl[]
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
}
```

Add the same three optional fields to `ExtensionBuilder` and copy them in the `defineExtension` builder literal (`tables: meta.tables, composerActions: meta.composerActions, controls: meta.controls`).

`index.ts` — add:

```ts
export type {
  ComposerActionDecl,
  ComposerControlDecl,
  ExtensionTableDecl,
  HostApi,
  HostChat,
  HostState,
  HostUi,
  PageAgent,
} from './host-types.js'
```

`package.json` dependencies — add (keep alphabetical):

```json
"@conciv/errors": "workspace:^",
"@conciv/state": "workspace:^",
"@tanstack/db": "0.6.14",
```

Then `pnpm install`.

- [ ] **Step 4: Extend the runtime test**

Append to `packages/extension/test/define-extension.test.ts`:

```ts
it('carries tables, composer actions and controls through the builder', () => {
  const ext = defineExtension({
    name: 'decls',
    tables: [{name: 'notes', columns: 'body TEXT'}],
    composerActions: [{id: 'a', label: 'A', icon: () => null, run: () => {}}],
    controls: [{id: 'c', Component: () => null}],
  })
  expect(ext.tables).toHaveLength(1)
  expect(ext.composerActions?.[0]?.id).toBe('a')
  expect(ext.controls?.[0]?.id).toBe('c')
})
```

(Match the existing file's import style for `defineExtension` and `it`/`expect`.)

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm turbo run build --filter=@conciv/state && pnpm --filter @conciv/extension run typecheck && pnpm --filter @conciv/extension test`

- [ ] **Step 6: Commit**

```bash
git add packages/extension pnpm-lock.yaml
git commit -m 'feat(extension): manifest v2 — tables, composer actions, controls + host types' -- packages/extension pnpm-lock.yaml
```

---

### Task 3: Engine registers extension tables into the state plane

**Files:**

- Modify: `packages/core/src/engine.ts`
- Create: `packages/core/test/api/chat/extension-tables.it.test.ts`

**Interfaces:**

- Consumes: `AnyExtension.tables` (Task 2), `startStatePlane({extensionTables})` (Task 1), `startTestEngine(overrides)` from Plan 1's `test/helpers/state-plane.ts` (accepts `Partial<StartOpts>`, so `{extensions: [...]}` threads through).
- Produces: every table declared by any extension in `StartOpts.extensions` exists in TrailBase and is served at `/api/records/v1/ext_<slug>_<name>` on `engine.statePort`.

- [ ] **Step 1: Failing IT**

`packages/core/test/api/chat/extension-tables.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {startTestEngine} from '../../helpers/state-plane.js'

const demo = defineExtension({
  name: 'demo',
  tables: [
    {name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`},
    {name: 'labels', columns: 'text TEXT NOT NULL'},
  ],
})

describe('engine extension tables', () => {
  it('serves record apis for every declared extension table', async () => {
    const engine = await startTestEngine({extensions: [demo]})
    const notes = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/ext_demo_notes`)
    const labels = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/ext_demo_labels`)
    expect(notes.status).toBe(200)
    expect(labels.status).toBe(200)
    expect(await notes.json()).toEqual({total_count: 0, records: []})
    await engine.stop()
  }, 120000)
})
```

- [ ] **Step 2: Run, expect FAIL** (404 — record api never registered)

Run: `cd packages/core && pnpm exec vitest run test/api/chat/extension-tables.it.test.ts`

- [ ] **Step 3: Implement in `engine.ts`**

Where the plane starts (Plan 1 wiring), collect declarations first:

```ts
const extensionTables = (opts.extensions ?? []).flatMap((extension) =>
  (extension.tables ?? []).map((table) => ({extension: extension.name, name: table.name, columns: table.columns})),
)
const plane = await startStatePlane({dataDir: paths.trailDir, port: await getPort(), extensionTables})
```

(`ExtensionTableSpec` needs no import — the literal is structurally typed. If tsc wants the type, import `type {ExtensionTableSpec} from '@conciv/state/server'`.)

- [ ] **Step 4: Run IT, expect PASS**

- [ ] **Step 5: Run the whole core suite to prove no regression**

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: green except the two known pre-existing environmental failures (`gemini-tanstack.it`, `claude-image.it` — fail identically on main).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine.ts packages/core/test/api/chat/extension-tables.it.test.ts
git commit -m 'feat(core): register extension tables into the state plane at boot' -- packages/core/src/engine.ts packages/core/test/api/chat/extension-tables.it.test.ts
```

---

### Task 4: The doorway — `HostProvider`, `useHost`, `useSlot`

**Files:**

- Create: `packages/extension/src/errors.ts`
- Create: `packages/extension/src/host.ts`
- Create: `packages/extension/test/host.test.ts`
- Modify: `packages/errors/src/user-codes.ts` (add `'extension.missing-host'`)
- Modify: `packages/extension/src/client.ts` (exports)
- Modify: `packages/extension/src/index.ts` (exports)

**Interfaces:**

- Consumes: `HostApi` (Task 2), `ExtensionSlot` (v1 `types.ts`, reused verbatim — `'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget'`), `makeError`/`isConcivError` from `@conciv/errors`.
- Produces (Plan 3's surface and every extension consume exactly this):
  - `HostProvider(props: {host: HostApi; slot: ExtensionSlot; children: JSX.Element}): JSX.Element`
  - `useHost(): HostApi`
  - `useSlot(): () => ExtensionSlot`
  - `extensionError`/`isExtensionError` (code `'missing-host'`, userCode `'extension.missing-host'`)

- [ ] **Step 1: Failing test**

`packages/extension/test/host.test.ts` (node environment — Solid context works without DOM under `createRoot`):

```ts
import {describe, expect, it} from 'vitest'
import {createComponent, createRoot} from 'solid-js'
import {HostProvider, useHost, useSlot} from '../src/host.js'
import type {HostApi} from '../src/host-types.js'

const fakeHost = {chat: {send: () => {}}} as unknown as HostApi

function renderWithHost<Captured>(capture: () => Captured): Captured {
  let captured: Captured | undefined
  createRoot((dispose) => {
    createComponent(HostProvider, {
      host: fakeHost,
      slot: 'composer',
      get children() {
        captured = capture()
        return null
      },
    })
    dispose()
  })
  if (captured === undefined) throw new Error('children never evaluated')
  return captured
}

describe('host doorway', () => {
  it('useHost returns the provided host', () => {
    expect(renderWithHost(() => useHost())).toBe(fakeHost)
  })

  it('useSlot returns the mount slot', () => {
    const slot = renderWithHost(() => useSlot())
    expect(slot()).toBe('composer')
  })

  it('useHost outside a provider throws a typed extension error', () => {
    createRoot((dispose) => {
      expect(() => useHost()).toThrowError(
        expect.objectContaining({code: 'missing-host', userCode: 'extension.missing-host'}),
      )
      dispose()
    })
  })
})
```

NOTE on the `as unknown as HostApi` in the test: test files are exempt from the no-`as` rule only for building partial fakes — mirror the existing repo test style; do not add casts in `src/`.

- [ ] **Step 2: Run, expect FAIL** (`../src/host.js` not found)

Run: `pnpm --filter @conciv/extension exec vitest run test/host.test.ts`

- [ ] **Step 3: Implement**

First add to `packages/errors/src/user-codes.ts`: `'extension.missing-host'` in the `UserCode` union and `'extension.missing-host': 'this extension is not mounted inside a conciv surface'` in `USER_MESSAGES` (rebuild `@conciv/errors` after).

`packages/extension/src/errors.ts`:

```ts
import {isConcivError, makeError, type ConcivError, type UserDetails} from '@conciv/errors'

export type ExtensionErrorCode = 'missing-host'

export type ExtensionError = ConcivError

export function extensionError(code: ExtensionErrorCode, message: string, details: UserDetails = {}): ExtensionError {
  return makeError({message, code, userCode: `extension.${code}`, details})
}

export function isExtensionError(error: unknown): error is ExtensionError {
  return isConcivError(error) && error.userCode.startsWith('extension.')
}
```

`packages/extension/src/host.ts` (plain `.ts`, `createComponent` — no JSX, same constraint as Plan 1's `@conciv/state/solid`):

```ts
import {createComponent, createContext, useContext, type JSX} from 'solid-js'
import type {HostApi} from './host-types.js'
import type {ExtensionSlot} from './types.js'
import {extensionError} from './errors.js'

type HostContextValue = {host: HostApi; slot: ExtensionSlot}

const HostContext = createContext<HostContextValue>()

export function HostProvider(props: {host: HostApi; slot: ExtensionSlot; children: JSX.Element}): JSX.Element {
  return createComponent(HostContext.Provider, {
    get value() {
      return {host: props.host, slot: props.slot}
    },
    get children() {
      return props.children
    },
  })
}

function requireHostContext(): HostContextValue {
  const value = useContext(HostContext)
  if (!value) throw extensionError('missing-host', 'useHost/useSlot called outside a HostProvider')
  return value
}

export function useHost(): HostApi {
  return requireHostContext().host
}

export function useSlot(): () => ExtensionSlot {
  const value = requireHostContext()
  return () => value.slot
}
```

`packages/extension/src/client.ts` — append:

```ts
export {HostProvider, useHost, useSlot} from './host.js'
export {extensionError, isExtensionError, type ExtensionError, type ExtensionErrorCode} from './errors.js'
export type {HostApi, HostChat, HostState, HostUi, PageAgent} from './host-types.js'
```

`packages/extension/src/index.ts` — append the same two export lines (extensions import from `.` on the server, `./client` in the browser; both must see the contract types).

NAME-COLLISION NOTE: v1's `ExtensionBuilder.useSlot` (a method on the builder, reading `ExtensionRuntimeContext`) is untouched. The NEW standalone `useSlot` export reads `HostContext`. They coexist; Plan 4 deletes the v1 method. There is no import ambiguity because v1 never exported a standalone `useSlot`.

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @conciv/extension exec vitest run test/host.test.ts && pnpm --filter @conciv/extension run typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src packages/extension/test
git commit -m 'feat(extension): HostProvider + useHost/useSlot doorway' -- packages/extension/src packages/extension/test
```

---

### Task 5: Testkit fake host implements the hook API (real state plane, browser E2E)

**Files:**

- Modify: `packages/extension-testkit/src/boot-server.ts` (expose `stateBase`)
- Modify: `packages/extension-testkit/src/serve.ts` (replace `__CONCIV_STATE_BASE__`)
- Modify: `packages/extension-testkit/src/get-extension-test-api.ts` (thread `stateBase`)
- Modify: `packages/extension-testkit/src/host/index.html` (add the meta)
- Modify: `packages/extension-testkit/src/host/host-runtime.tsx` (build `HostApi`, wrap in `HostProvider`)
- Modify: `packages/extension/src/mount-extension.ts` (optional `host` in `MountExtensionOptions`)
- Create: `packages/extension-testkit/test/fixtures/host-api/server.ts`
- Create: `packages/extension-testkit/test/fixtures/host-api/client.tsx`
- Create: `packages/extension-testkit/test/host-api.it.test.ts`
- Modify: `packages/extension-testkit/package.json` (dep `@conciv/state` workspace:^ if not already pulled transitively — add explicitly)

**Interfaces:**

- Consumes: `stateClient`, `sessionsCollection`, `makeTableFactory`, `uuidv7Base64` from `@conciv/state` (Task 1); `HostProvider`, `HostApi` (Task 4); `Engine.statePort` via `bootExtensionServer` (Plan 1 + Task 3).
- Produces: any fixture extension client can call `useHost()` in the testkit browser host; `host.state` is the REAL TrailBase plane of the booted engine; `host.chat` records calls into a `role=log` element (assertable via Playwright); `host.ui`/`host.page` are the existing real implementations rearranged.

- [ ] **Step 1: Plumb the state base URL**

`boot-server.ts` — add `stateBase` to `BootedServer` and the return:

```ts
export type BootedServer = {
  apiBase: string
  stateBase: string
  extensionContexts: Record<string, unknown>
  stop: () => Promise<void>
}
```

with `stateBase: \`http://127.0.0.1:${engine.statePort}\`` in the returned object.

`host/index.html` — add next to the existing metas:

```html
<meta name="conciv-state-base" content="__CONCIV_STATE_BASE__" />
```

`serve.ts` — `serveDir` config gains `stateBase: string`; add `.replaceAll('__CONCIV_STATE_BASE__', config.stateBase)` to the html branch.

`get-extension-test-api.ts` — destructure `stateBase` from `bootExtensionServer(...)` and pass `{apiBase, session, stateBase}` to `serveDir`.

(TrailBase runs with `--dev` = permissive CORS — Plan 1 note — so the foreign-origin host page can hit the records API directly.)

- [ ] **Step 2: `mountExtension` accepts a host**

`packages/extension/src/mount-extension.ts` — extend options and wrap when provided:

```ts
import {HostProvider} from './host.js'
import type {HostApi} from './host-types.js'

export type MountExtensionOptions = {
  clientApi: ClientApi
  hostContext: Omit<ExtensionHostContext, 'currentSlot'>
  slot: ExtensionSlot
  root: HTMLElement
  host?: HostApi
}
```

(Only `host` is new — everything else stays exactly as today.) In the `render` callback, wrap:

```ts
const disposeRender = render(() => {
  const mounted = createComponent(MountedExtension, {
    extension,
    hostContext: options.hostContext,
    clientValue,
    slot: options.slot,
  })
  return options.host
    ? createComponent(HostProvider, {
        host: options.host,
        slot: options.slot,
        get children() {
          return mounted
        },
      })
    : mounted
}, options.root)
```

- [ ] **Step 3: Build the fake host in `host-runtime.tsx`**

Add imports and the `HostApi` construction inside `startHost` (keep everything that exists; the v1 `hostContext` stays for v1 fixtures):

```ts
import {stateClient, sessionsCollection, makeTableFactory} from '@conciv/state'
import type {HostApi} from '@conciv/extension'
import {Dialog, Popover} from '@conciv/ui-kit-system'

function chatLog(): (line: string) => void {
  const log = document.createElement('ul')
  log.setAttribute('role', 'log')
  document.body.appendChild(log)
  return (line) => {
    const item = document.createElement('li')
    item.textContent = line
    log.appendChild(item)
  }
}
```

and in `startHost`, before `mountExtension`:

```ts
const stateBase = metaContent('conciv-state-base')
const state = stateClient(stateBase)
const record = chatLog()
const host: HostApi = {
  state: {
    client: state,
    sessions: sessionsCollection(state),
    activeSession: () => (isSessionId(session) ? session : null),
    table: makeTableFactory(state, extension.name),
  },
  chat: {
    send: (text) => record(`send:${text}`),
    insert: (text) => record(`insert:${text}`),
    respondApproval: (id, approved) => record(`approval:${id}:${approved}`),
  },
  ui: {
    notify: showToast,
    dialog: () => Dialog,
    popover: () => Popover,
    surface: () => ensureEffectsSurface(),
  },
  page: {
    ...makeHostPage(document),
    openSource: (loc) => openSource(apiBase, loc),
    grab: makeHostGrab(document),
  },
}
```

then pass it: `mountExtension(extension, {clientApi, hostContext, slot: 'composer', root: mountRoot, host})`.

TYPING NOTE (this is where Task 2's `table` friction surfaces if it exists): `makeTableFactory` returns `(name: string) => Collection<...utils...>` while `HostState.table` is generic per call site. If tsc rejects the direct assignment, adapt `HostState.table`'s declared return type per the Task 2 note — do NOT cast here. `makeHostPage(document)` returns `{elementAt, describe, locate}` (v1 `PageInspect`) — spreading it plus `openSource` + `grab` satisfies `PageAgent` structurally; if `describe`'s return type differs from `PageAgent.describe`, align `PageAgent` in `host-types.ts` to `PageInspect`'s actual shapes (v1 is ground truth for what these functions do).

- [ ] **Step 4: Fixture extension exercising the doorway**

`packages/extension-testkit/test/fixtures/host-api/server.ts`:

```ts
import {defineExtension} from '@conciv/extension'

export default defineExtension({
  name: 'host-api-fixture',
  tables: [{name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}],
})
```

`packages/extension-testkit/test/fixtures/host-api/client.tsx`:

```tsx
import {createSignal, For} from 'solid-js'
import {z} from 'zod'
import {defineExtension, type ExtensionTableDecl} from '@conciv/extension'
import {useHost, useSlot} from '@conciv/extension/client'
import {uuidv7Base64} from '@conciv/state'

const tables: readonly ExtensionTableDecl[] = [
  {name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`},
]

const NoteRowSchema = z.object({id: z.string(), session_id: z.string(), body: z.string()})
type NoteRow = z.infer<typeof NoteRowSchema>

function Fixture() {
  const host = useHost()
  const slot = useSlot()
  const notes = host.state.table('notes')
  const [rows, setRows] = createSignal<NoteRow[]>([])
  const refresh = () => void notes.toArrayWhenReady().then((raw) => setRows(raw.map((row) => NoteRowSchema.parse(row))))
  refresh()
  return (
    <section>
      <output data-slot>{slot()}</output>
      <button
        onClick={() => {
          notes.insert({id: uuidv7Base64(), session_id: host.state.activeSession() ?? 'conciv_none', body: 'from-client'})
        }}
      >
        add note
      </button>
      <button onClick={() => host.chat.send('hello-from-fixture')}>send chat</button>
      <ul data-notes>
        <For each={rows()}>{(row) => <li>{row.body}</li>}</For>
      </ul>
      <button onClick={() => void notes.toArrayWhenReady().then(setRows)}>refresh</button>
    </section>
  )
}

export default defineExtension({name: 'host-api-fixture', tables, Component: Fixture})
```

(`toArrayWhenReady` + manual refresh instead of `useLiveQuery` keeps this fixture dependency-light — the hook path is `@conciv/state/solid`'s covered surface from Plan 1. The signal is refreshed by explicit user action, so no reactive-write-in-render hazard.)

- [ ] **Step 5: Failing IT**

`packages/extension-testkit/test/host-api.it.test.ts` (mirror the import/style of the existing `smoke.it.test.ts` — check it first and copy its `getExtensionTestApi` usage shape):

```ts
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getExtensionTestApi, type ExtensionTestApi} from '../src/get-extension-test-api.js'
import server from './fixtures/host-api/server.js'

let api: ExtensionTestApi

beforeAll(async () => {
  api = await getExtensionTestApi({
    server,
    clientEntry: fileURLToPath(new URL('./fixtures/host-api/client.tsx', import.meta.url)),
  })
}, 240000)

afterAll(async () => api.dispose())

describe('fake host implements the hook api', () => {
  it('mounts with slot and records chat calls', async () => {
    await expect(api.page.getByRole('button', {name: 'send chat'})).toBeVisible()
    expect(await api.page.locator('[data-slot]').textContent()).toBe('composer')
    await api.page.getByRole('button', {name: 'send chat'}).click()
    await expect(api.page.getByRole('log')).toContainText('send:hello-from-fixture')
  })

  it('writes through the extension table collection into the real state plane', async () => {
    await api.page.getByRole('button', {name: 'add note'}).click()
    await api.page.getByRole('button', {name: 'refresh'}).click()
    await expect(api.page.locator('[data-notes] li').first()).toHaveText('from-client')
  })
})
```

ADAPT NOTE: if the existing testkit tests use raw Playwright assertions (`expect(await page.locator(...).isVisible())`) rather than `@playwright/test`-style web-first assertions, mirror THAT idiom — vitest's `expect` has no `toBeVisible`; in that case poll with `page.waitForSelector('[role=log] >> text=send:hello-from-fixture')` and assert text content. Check `test/smoke.it.test.ts` before writing and copy its assertion style exactly.

- [ ] **Step 6: Run, expect FAIL, then make it pass**

Run: `pnpm turbo run build --filter=@conciv/extension --filter=@conciv/state && pnpm --filter @conciv/extension-testkit test -- host-api`
Expected first failure mode: mount works but `useHost` throws `missing-host` if the `host` option never reached `mountExtension`, or table 404 if Task 3's registration missed the fixture — both are wiring bugs, not design changes. Iterate until PASS. Keep the whole testkit suite green: `pnpm turbo run test --filter=@conciv/extension-testkit`.

- [ ] **Step 7: Commit**

```bash
git add packages/extension-testkit packages/extension/src/mount-extension.ts
git commit -m 'feat(extension-testkit): fake host implementing the v2 hook api' -- packages/extension-testkit packages/extension/src/mount-extension.ts
```

---

### Task 6: Gates and changeset

**Files:**

- Create: `.changeset/widget-rewrite-extension-contract.md`

- [ ] **Step 1: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: green except the known pre-existing environmental failures (core: `gemini-tanstack.it`, `claude-image.it`; occasionally `ui-kit-system` storybook) — verify any OTHER failure against main before touching it.

- [ ] **Step 2: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. `@conciv/extension` and `@conciv/state` are `publicPackages`, so the not-yet-consumed v2 exports (`HostProvider`, `useHost`, `ComposerActionDecl`, `makeTableFactory`, …) are public API, not dead code. If duplication flags the two fixture `columns` strings, extract a shared fixture constant rather than suppressing.

- [ ] **Step 3: Changeset**

`.changeset/widget-rewrite-extension-contract.md`:

```markdown
---
'@conciv/extension': patch
'@conciv/state': patch
'@conciv/core': patch
---

Extension contract v2: one doorway (HostProvider + useHost/useSlot) over a four-plane HostApi (state, chat, ui, page); manifest gains tables/composerActions/controls declarations. Extensions can declare ext_<id>_* TrailBase tables — @conciv/state generates their migrations and record APIs, core registers them at boot, and clients get cached TanStack DB collections via table(). extension-testkit now provides a fake host implementing the hook API against the real state plane.
```

- [ ] **Step 4: Commit**

```bash
git add .changeset/widget-rewrite-extension-contract.md
git commit -m 'chore: extension contract v2 changeset' -- .changeset/widget-rewrite-extension-contract.md
```

---

## Deliberate scope cuts (later plans)

- Typed table NAMES per extension (constraining `table(name)` to the manifest's declared names via generics) — YAGNI until Plan 4 rewires real extensions; revisit then.
- Provider extensions (`@conciv/page` as an extension) — the contract's `page` plane is a plain interface precisely so a provider can implement it later; explicitly out of scope (spec).
- The v1 contract (`ExtensionHostContext`, `ClientApi`, `getExtensionApi`, builder `useContext`/`useSlot`) — deleted in Plan 4 together with `packages/widget` and the extension rewires.
- Surface-side real `HostApi` construction (chat plane over `useChat`, ui plane over the dock) — Plan 3.
- Records-API auth hardening — unchanged from Plan 1 (127.0.0.1 + world ACL accepted for now).
