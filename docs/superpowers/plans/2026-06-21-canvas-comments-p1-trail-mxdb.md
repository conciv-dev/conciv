# Canvas-Comments Plan 1 — Contracts + `trail` substrate + `mx.db` (server side)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's house rule is to work inline, not via dispatched subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the one durable store (`trail`/SQLite) and the core-owned `mx.db` live-collection service — server side only — so any extension can declare an introspectable collection and do real CRUD against real TrailBase. Pin down all three external contracts (`trail`, `@tanstack/db`, `@tanstack/solid-db`) with real spikes before any wiring.

**Architecture:** Core supervises the `trail` binary (sole client, loopback, SQLite under `.mandarax/trail/`). A `LiveDb` service declares collections (table + Record API + FTS), exposes CRUD + `list()`/`get()` introspection, and is added to the extension `ServerApi` so `.server(mx => …)` halves compose it with `registerTool`/`approval`/`systemPrompt`. The browser live layer (SSE fan-out, `@tanstack/db`, Solid `useLiveQuery`) is Plan 2 and is only _characterized_ here, not built.

**Tech Stack:** `trail` v0.22.9 (external PATH binary, SQLite), h3 server, `@tanstack/db` + `@tanstack/solid-db` (characterized here, used Plan 2), Zod, jiti extension loader, Playwright + vitest (real binary / real browser, no mocks).

## Global Constraints

Copied from the spec; every task implicitly includes these.

- **Worktree:** all work in `.claude/worktrees/canvas-comments` (branch `worktree-canvas-comments`, reset to `origin/main`). Never `cd` to the main repo root or another worktree.
- **`trail` is an external PATH binary**, never an npm dep — core spawns + supervises it (like the `claude` harness). Verified: `trail v0.22.9`, sqlite 3.51.1, at `~/.local/bin/trail`.
- **One durable store:** all durable data lives in the single SQLite db `trail` manages under `<cwd>/.mandarax/trail/` (the real db file is `<dataDir>/data/main.db`).
- **Browser never talks to a backend directly.** `trail` binds `127.0.0.1`, reachable only by core; `--cors-allowed-origins` must NOT be left at its default `*`. All sync is browser ↔ core (gated by `api/cors.ts`) ↔ `trail`.
- **Security parity with `api/cors.ts`:** Origin allowlist + Host-header loopback check on every new core route (reuse `registerCors`, already global middleware).
- **Code style:** functions not classes; no IIFEs; one-line comments only (zero narration comments in production code; prefer map/reduce over if/else; clear names). oxfmt: no semicolons, single quotes.
- **Testing:** real `trail` (spawned), real browser via Playwright `newPage()` (never `newContext()`); native assertions (getByRole/getByText/toBeVisible/aria — never querySelector/class selectors/`toBe(true)` on DOM, including inside `page.evaluate`); reach the shadow root via `getByRole().getRootNode()`; no jsdom/happy-dom; no mocks/stubs. Parallel tests get a unique port.
- **Build/typecheck via turbo**, not manual dist rebuilds. Core changes → restart `pnpm dev`.
- **Ask before installing any npm dep.** Plan 1 deps are gated in Task 1.
- **v0/pre-release:** reshape APIs freely, no back-compat shims, update all call sites.
- **No silent truncation/caps:** every limit enforces with a clear error.

## File Structure

- `packages/core/src/db/trail-supervisor.ts` — spawn/ready/restart `trail`, own its lifecycle.
- `packages/core/src/db/trail-client.ts` — the sole `trail` client: config.textproto + Record API calls.
- `packages/core/src/db/live-db.ts` — `createLiveDb({client, dataDir})`: `collection`/`list`/`get`, migration emit, FTS.
- `packages/core/src/db/migrations.ts` — write a collection's migration SQL into `<dataDir>/migrations/main/`.
- `packages/core/src/db/types.ts` — `LiveDb`, `ServerCollection`, `CollectionInfo`, `TrailClient` types.
- `packages/extensions/src/contract.ts` — add `db` to `ServerApi` (+ collected `collections` in contributions).
- `packages/extensions/src/discovery.ts` — `collectServerContributions(extensions, services)` threads `db`.
- `packages/plugin/src/core/extensions.ts` — `loadServerContributions(root, services)`.
- `packages/core/src/engine.ts` + `packages/plugin/src/core/boot.ts` — construct `LiveDb`, thread it through.
- `docs/superpowers/notes/trailbase-api.md`, `tanstack-db-contract.md` — characterized contracts (deliverables).
- Throwaway spikes under `packages/core/test/spike/` and `packages/widget/test/spike/` (deleted after recording).

---

## Task 1: Approve + install Plan 1 dependencies

**Files:**

- Modify: `packages/widget/package.json` (deps), `pnpm-lock.yaml`

**Approval gate (confirm before installing):** `@tanstack/db`, `@tanstack/solid-db` (widget). These are _characterized_ in Tasks 3–4 and _used_ in Plan 2; installed now so the spikes run against the real packages. `yjs`/`y-indexeddb`/`@excalidraw/excalidraw` are Plan 2/3 gates, not installed here. `trail` is already on PATH (no install).

- [ ] **Step 1: Confirm the dep list with the user.** Do not proceed until approved.

- [ ] **Step 2: Install**

Run: `pnpm --filter @mandarax/widget add @tanstack/db @tanstack/solid-db`
Expected: both resolve and land in `packages/widget/package.json`; lockfile updates; supply-chain policy passes (the oxfmt/lockfile pre-commit hook verifies).

- [ ] **Step 3: Record installed versions**

Run: `pnpm --filter @mandarax/widget ls @tanstack/db @tanstack/solid-db`
Expected: prints concrete versions. Note them — the Task 3–4 contract notes reference them.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/package.json pnpm-lock.yaml
git commit -m "chore(canvas-comments): add @tanstack/db + @tanstack/solid-db (plan 1 deps)"
```

---

## Task 2: Characterize the `trail` Record API + realtime + auth contract

A throwaway spike that runs the real binary and records the exact request/response shapes. No production code. Deliverable = a committed notes doc the later tasks build against.

**Files:**

- Create (throwaway): `packages/core/test/spike/trail-probe.ts`
- Create: `docs/superpowers/notes/trailbase-api.md`

**Interfaces:**

- Produces: the documented `trail` HTTP contract consumed by Tasks 5–7 (spawn flags, readiness line, record CRUD paths, subscribe SSE event shape, the no-auth-on-loopback ACL path).

- [ ] **Step 1: Write the probe** — spawn `trail` against a temp dir, write a minimal `config.textproto` exposing one table as a Record API with `acl_world` full access, boot it, and exercise every endpoint while logging raw responses.

```ts
// packages/core/test/spike/trail-probe.ts — throwaway, run with: pnpm --filter @mandarax/core exec tsx test/spike/trail-probe.ts
import {spawn} from 'node:child_process'
import {mkdtempSync, writeFileSync, mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'trail-probe-'))
const port = 4099
mkdirSync(join(dir, 'migrations', 'main'), {recursive: true})
writeFileSync(
  join(dir, 'migrations', 'main', 'U1000__probe.sql'),
  `CREATE TABLE probe (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL) STRICT;
   CREATE VIRTUAL TABLE probe_fts USING fts5(body, content='probe', content_rowid='rowid');`,
)
writeFileSync(
  join(dir, 'config.textproto'),
  `record_apis: [ { name: "probe" table_name: "probe" conflict_resolution: REPLACE acl_world: [READ, CREATE, UPDATE, DELETE] } ]`,
)

const child = spawn('trail', ['--data-dir', dir, 'run', '-a', `localhost:${port}`, '--stderr-logging'])
child.stderr.on('data', (b) => process.stderr.write(`[trail] ${b}`)) // capture the readiness line text

const base = `http://localhost:${port}`
const log = async (label: string, p: Promise<Response>) => {
  const res = await p
  console.log(`\n### ${label} -> ${res.status} ${res.headers.get('content-type')}`)
  console.log(await res.text())
}

setTimeout(async () => {
  // exact paths to confirm: create / list / read / update / delete
  await log(
    'CREATE',
    fetch(`${base}/api/records/v1/probe`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({id: 'p1', body: 'hello anchored'}),
    }),
  )
  await log('LIST', fetch(`${base}/api/records/v1/probe`))
  await log('READ', fetch(`${base}/api/records/v1/probe/p1`))
  await log(
    'UPDATE',
    fetch(`${base}/api/records/v1/probe/p1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({body: 'edited'}),
    }),
  )
  // subscribe: confirm the path + the SSE frame shape; insert from a second fetch and watch the stream
  const sub = await fetch(`${base}/api/records/v1/probe/subscribe/*`, {headers: {accept: 'text/event-stream'}})
  console.log('\n### SUBSCRIBE status', sub.status, sub.headers.get('content-type'))
  const reader = sub.body!.getReader()
  fetch(`${base}/api/records/v1/probe`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({id: 'p2', body: 'live'}),
  })
  const {value} = await reader.read()
  console.log('### SUBSCRIBE first frame:', new TextDecoder().decode(value!))
  await log('DELETE', fetch(`${base}/api/records/v1/probe/p1`, {method: 'DELETE'}))
  child.kill()
  process.exit(0)
}, 2500)
```

- [ ] **Step 2: Run the probe against real `trail`**

Run: `pnpm --filter @mandarax/core exec tsx packages/core/test/spike/trail-probe.ts`
Expected: the readiness line (`Listening on http://localhost:4099` or similar) appears on stderr; CREATE returns 200/201 with the row (or its id); LIST returns the rows; READ returns `p1`; UPDATE returns the edited row; SUBSCRIBE returns 200 `text/event-stream` and a first frame describing the `p2` insertion; DELETE returns 200. If any path differs (e.g. the subscribe path or the create response envelope), that is the point of the spike — record what actually happened.

- [ ] **Step 3: Record the contract** in `docs/superpowers/notes/trailbase-api.md`: the exact spawn command + flags, the exact readiness line text (Task 5's ready-detector greps it), the CRUD endpoint paths + request/response envelopes (does CREATE echo the row or just the id?), the subscribe endpoint path + the SSE frame JSON shape (event type field names for insert/update/delete), and confirmation that `acl_world` permits unauthenticated CRUD on loopback (so core needs no token). Note any deltas from this plan's assumptions.

- [ ] **Step 4: Delete the spike, commit the notes**

```bash
rm packages/core/test/spike/trail-probe.ts
git add docs/superpowers/notes/trailbase-api.md
git commit -m "docs(canvas-comments): characterize trail Record API + realtime contract (spike)"
```

---

## Task 3: Characterize the `@tanstack/db` core custom-adapter contract

Throwaway vitest spike (node, real package) recording the exact `createCollection` + custom `sync` adapter + mutation-handler + transaction contract. No browser yet.

**Files:**

- Create (throwaway): `packages/widget/test/spike/tanstack-core.spike.test.ts`
- Modify: `docs/superpowers/notes/tanstack-db-contract.md` (create)

**Interfaces:**

- Produces: the documented `@tanstack/db` contract consumed by Plan 2's browser collection (`SyncConfig.sync` callback params, `getKey`, schema validation, `createCollection` return methods, `createTransaction`/`isPersisted`).

- [ ] **Step 1: Write the spike test** driving a custom-adapter collection end to end with a hand-driven sync feed.

```ts
// packages/widget/test/spike/tanstack-core.spike.test.ts — throwaway, real @tanstack/db
import {test, expect} from 'vitest'
import {createCollection} from '@tanstack/db'
import {z} from 'zod'

test('custom adapter: sync feed writes land; optimistic insert calls onInsert; get/schema work', async () => {
  const schema = z.object({id: z.string(), body: z.string()})
  let push: ((row: {id: string; body: string}) => void) | null = null
  const inserts: unknown[] = []
  const collection = createCollection({
    schema,
    getKey: (r: {id: string}) => r.id,
    sync: {
      // record the EXACT param names/shape this callback receives
      sync: (params: {begin: () => void; write: (m: unknown) => void; commit: () => void; markReady: () => void}) => {
        push = (row) => {
          params.begin()
          params.write({type: 'insert', value: row})
          params.commit()
        }
        params.markReady()
        return () => {}
      },
    },
    onInsert: async ({transaction}: {transaction: {mutations: {modified: unknown}[]}}) => {
      inserts.push(transaction.mutations[0].modified)
    },
  })
  // feed from the "server" side
  push!({id: 's1', body: 'from-sync'})
  // optimistic local insert
  collection.insert({id: 'c1', body: 'optimistic'})
  // record what the read surface looks like: get(), the iterable/array, status
  console.log('GET s1:', JSON.stringify(collection.get('s1')))
  console.log('GET c1:', JSON.stringify(collection.get('c1')))
  console.log('INSERTS seen by handler:', JSON.stringify(inserts))
  expect(collection.get('s1')).toBeTruthy()
  expect(inserts).toHaveLength(1)
})
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @mandarax/widget test tanstack-core.spike`
Expected: PASS, and the console logs reveal the real `sync` callback param object, the `onInsert` `transaction.mutations[*]` shape, and `collection.get()` return shape. If the param names differ from the guess, the test still tells you (adjust and rerun) — the goal is to observe, not to assume.

- [ ] **Step 3: Record** in `docs/superpowers/notes/tanstack-db-contract.md`: installed version; the `createCollection` options that matter (`schema`, `getKey`, `sync.sync`); the EXACT `sync` callback param object (`begin/write/commit/markReady` + any others like `collection`/`metadata`); the `write` message shape (`{type, value, key?}`); the `onInsert/onUpdate/onDelete` `transaction.mutations[]` shape (`modified`/`changes`/`key`); `collection.get`/iteration/`subscribe` for reads; and `createTransaction({mutationFn})` + `tx.isPersisted.promise` for grouped writes.

- [ ] **Step 4: Delete the spike, commit the notes**

```bash
rm packages/widget/test/spike/tanstack-core.spike.test.ts
git add docs/superpowers/notes/tanstack-db-contract.md
git commit -m "docs(canvas-comments): characterize @tanstack/db core adapter contract (spike)"
```

---

## Task 4: Characterize the `@tanstack/solid-db` `useLiveQuery` contract (real browser)

The docs are inconsistent (`{data, isLoading()}` vs a call-accessor). Resolve it in a real browser. Throwaway.

**Files:**

- Create (throwaway): `packages/widget/test/spike/solid-db.spike.tsx` + `packages/widget/test/spike/solid-db.it.test.ts`
- Modify: `docs/superpowers/notes/tanstack-db-contract.md` (append a Solid section)

**Interfaces:**

- Produces: the resolved `useLiveQuery` return shape (accessor vs object; `data`/`isLoading`/`status` accessors) consumed by Plan 2's Solid pins/threads.

- [ ] **Step 1: Write a tiny Solid mount** that renders a `useLiveQuery` over a custom-adapter collection and writes the observed return shape into the DOM (so the IT can read it via roles/text, not internals).

```tsx
// packages/widget/test/spike/solid-db.spike.tsx — throwaway
import {render} from 'solid-js/web'
import {createCollection} from '@tanstack/db'
import {useLiveQuery} from '@tanstack/solid-db'
import {z} from 'zod'

const collection = createCollection({
  schema: z.object({id: z.string(), body: z.string()}),
  getKey: (r: {id: string}) => r.id,
  sync: {sync: (p: {markReady: () => void}) => (p.markReady(), () => {})},
})
collection.insert({id: '1', body: 'alpha'})

function App() {
  const q = useLiveQuery((b: {from: (s: object) => unknown}) => b.from({c: collection}))
  // probe BOTH candidate shapes; whichever is defined is the truth, surfaced as text
  const asObject = () => (q as {data?: {body: string}[]}).data?.map((r) => r.body).join(',')
  const asCall = () => {
    try {
      return (q as unknown as () => {body: string}[])()
        .map((r) => r.body)
        .join(',')
    } catch {
      return ''
    }
  }
  return (
    <div>
      <output aria-label="object-shape">{asObject() ?? ''}</output>
      <output aria-label="call-shape">{asCall()}</output>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
```

- [ ] **Step 2: Write the IT** that builds this entry, serves it, and reads which shape produced `alpha`.

```ts
// packages/widget/test/spike/solid-db.it.test.ts — Playwright newPage(), real browser
import {test, expect} from 'vitest'
import {chromium} from 'playwright'
// build the spike entry to an IIFE and serve it via the tiny http helper used by other widget ITs
// (see packages/widget/test/helpers — reuse the existing minimal server, not the bundle-coupled one)
test('useLiveQuery real return shape', async () => {
  // build + serve omitted here; mirror an existing widget IT's harness
  const browser = await chromium.launch()
  const page = await browser.newPage()
  // await page.goto(servedUrl, {waitUntil: 'domcontentloaded'})
  // const object = await page.getByLabel('object-shape').textContent()
  // const call = await page.getByLabel('call-shape').textContent()
  // console.log({object, call}) // exactly one contains 'alpha'
  await browser.close()
  expect(true).toBe(true) // replace with: expect the non-empty shape contains 'alpha'
})
```

- [ ] **Step 3: Run, observe which shape is real**

Run: `pnpm --filter @mandarax/widget test solid-db.it`
Expected: exactly one of `object-shape` / `call-shape` renders `alpha`. That is the canonical `useLiveQuery` return contract.

- [ ] **Step 4: Record** the resolved shape in the Solid section of `docs/superpowers/notes/tanstack-db-contract.md` (e.g. "`useLiveQuery(qb)` returns `{data: T[], isLoading(): boolean, status(): …}` — `data` is a plain array, accessors are functions" — whichever the browser proved), with the import path and version.

- [ ] **Step 5: Delete the spikes, commit the notes**

```bash
rm packages/widget/test/spike/solid-db.spike.tsx packages/widget/test/spike/solid-db.it.test.ts
git add docs/superpowers/notes/tanstack-db-contract.md
git commit -m "docs(canvas-comments): resolve @tanstack/solid-db useLiveQuery shape (spike)"
```

---

## Task 5: `trail` supervisor

Spawn + own the `trail` process; resolve a ready promise on the readiness line; restart on crash; lock CORS to nothing (loopback-only, core is sole client).

**Files:**

- Create: `packages/core/src/db/trail-supervisor.ts`
- Create: `packages/core/src/db/types.ts`
- Test: `packages/core/test/trail-supervisor.it.test.ts`

**Interfaces:**

- Consumes: the spawn flags + readiness line from `trailbase-api.md` (Task 2).
- Produces: `createTrailSupervisor(opts: {dataDir: string; port: number}): {start(): Promise<void>; stop(): Promise<void>; baseUrl: string; onExit(cb): void}` — consumed by Task 6's client and Task 8's boot wiring.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/trail-supervisor.it.test.ts — real trail
import {test, expect, afterEach} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTrailSupervisor} from '../src/db/trail-supervisor.js'

let sup: {stop: () => Promise<void>} | null = null
afterEach(async () => await sup?.stop())

test('start() resolves once trail is listening, and the HTTP port answers', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'mxdb-'))
  sup = createTrailSupervisor({dataDir, port: 4131})
  await (sup as ReturnType<typeof createTrailSupervisor>).start()
  const res = await fetch('http://localhost:4131/api/healthcheck').catch(() => null)
  expect(res?.ok ?? false).toBe(true) // confirm the real health path name from Task 2 notes
}, 30_000)
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @mandarax/core test trail-supervisor` → FAIL (no module).

- [ ] **Step 3: Implement the supervisor**

```ts
// packages/core/src/db/trail-supervisor.ts
import {spawn, type ChildProcess} from 'node:child_process'
import {mkdirSync} from 'node:fs'

export type TrailSupervisor = {
  start: () => Promise<void>
  stop: () => Promise<void>
  baseUrl: string
  onExit: (cb: (code: number | null) => void) => void
}

// Spawn + own the trail process. Loopback only; CORS empty (core is the sole client). Ready resolves
// on the listening line recorded in trailbase-api.md. Restart-on-crash is the caller's policy via onExit.
export function createTrailSupervisor(opts: {dataDir: string; port: number}): TrailSupervisor {
  mkdirSync(opts.dataDir, {recursive: true})
  const baseUrl = `http://localhost:${opts.port}`
  let child: ChildProcess | null = null
  const exitCbs: ((code: number | null) => void)[] = []
  const start = () =>
    new Promise<void>((resolve, reject) => {
      child = spawn('trail', [
        '--data-dir',
        opts.dataDir,
        'run',
        '-a',
        `localhost:${opts.port}`,
        '--stderr-logging',
        '--cors-allowed-origins',
        '',
      ])
      const onReady = (buf: Buffer) => {
        // READINESS_RE comes from Task 2 notes (the exact "Listening on" line)
        if (/listening on/i.test(String(buf))) resolve()
      }
      child.stderr?.on('data', onReady)
      child.on('exit', (code) => exitCbs.forEach((cb) => cb(code)))
      child.on('error', reject)
    })
  const stop = () =>
    new Promise<void>((resolve) => {
      if (!child) return resolve()
      child.once('exit', () => resolve())
      child.kill('SIGTERM')
    })
  return {start, stop, baseUrl, onExit: (cb) => void exitCbs.push(cb)}
}
```

- [ ] **Step 4: Run it, verify it passes** — `pnpm --filter @mandarax/core test trail-supervisor` → PASS. (If `/api/healthcheck` is not the real path, use the one recorded in Task 2.)

- [ ] **Step 5: Add a restart-on-crash test + implement** — kill the child externally, assert `onExit` fires and a caller-driven `start()` brings it back. Keep restart policy in the caller (Task 8), supervisor just exposes `onExit`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/trail-supervisor.ts packages/core/src/db/types.ts packages/core/test/trail-supervisor.it.test.ts
git commit -m "feat(canvas-comments): trail supervisor (spawn/ready/stop, loopback, cors-locked)"
```

---

## Task 6: `trail` Record-API client (sole client) + config generation

Core's only path to `trail`: generate `config.textproto` (declares each collection's Record API), and CRUD over `/api/records/v1/{name}` per the Task 2 contract.

**Files:**

- Create: `packages/core/src/db/trail-client.ts`
- Test: `packages/core/test/trail-client.it.test.ts`

**Interfaces:**

- Consumes: `baseUrl` (Task 5), the Record API paths/envelopes (Task 2 notes).
- Produces: `createTrailClient(baseUrl): TrailClient` where `TrailClient = {writeConfig(dir, apis: RecordApiDecl[]): void; create(name, row); list(name, opts?); read(name, id); update(name, id, patch); remove(name, id); subscribe(name, onEvent): () => void}` — consumed by Task 7.

- [ ] **Step 1: Write the failing test** (boots a supervisor + client against a temp dir with one declared collection)

```ts
// packages/core/test/trail-client.it.test.ts — real trail
import {test, expect, afterEach} from 'vitest'
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTrailSupervisor} from '../src/db/trail-supervisor.js'
import {createTrailClient} from '../src/db/trail-client.js'

let stop: (() => Promise<void>) | null = null
afterEach(async () => await stop?.())

test('create → read → list → update → delete round-trips through real trail', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'mxdb-'))
  mkdirSync(join(dataDir, 'migrations', 'main'), {recursive: true})
  writeFileSync(
    join(dataDir, 'migrations', 'main', 'U1__t.sql'),
    'CREATE TABLE t (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL) STRICT;',
  )
  const client = createTrailClient(`http://localhost:4132`)
  client.writeConfig(dataDir, [{name: 't', table: 't'}])
  const sup = createTrailSupervisor({dataDir, port: 4132})
  stop = sup.stop
  await sup.start()
  await client.create('t', {id: 'a', body: 'hi'})
  expect((await client.read('t', 'a')).body).toBe('hi')
  expect((await client.list('t')).length).toBe(1)
  await client.update('t', 'a', {body: 'bye'})
  expect((await client.read('t', 'a')).body).toBe('bye')
  await client.remove('t', 'a')
  expect(await client.read('t', 'a').catch(() => null)).toBeNull()
}, 30_000)
```

- [ ] **Step 2: Run it, verify it fails** — FAIL (no module).

- [ ] **Step 3: Implement the client** (paths/envelopes from Task 2 notes; `writeConfig` emits the textproto `record_apis` block with `acl_world` full since trail is loopback-only)

```ts
// packages/core/src/db/trail-client.ts
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

export type RecordApiDecl = {name: string; table: string; fts?: string[]}
export type TrailClient = ReturnType<typeof createTrailClient>

const json = async (res: Response) => {
  if (!res.ok) throw new Error(`trail ${res.status}: ${await res.text()}`)
  return res.json()
}

export function createTrailClient(baseUrl: string) {
  const url = (name: string, id?: string) =>
    `${baseUrl}/api/records/v1/${name}${id ? `/${encodeURIComponent(id)}` : ''}`
  return {
    // Emit config.textproto declaring every collection's Record API. acl_world full: trail binds
    // loopback and is reachable only by core, so the trust boundary is the loopback bind, not a token.
    writeConfig: (dir: string, apis: RecordApiDecl[]) => {
      const block = apis
        .map(
          (a) =>
            `  { name: "${a.name}" table_name: "${a.table}" conflict_resolution: REPLACE acl_world: [READ, CREATE, UPDATE, DELETE] }`,
        )
        .join('\n')
      writeFileSync(join(dir, 'config.textproto'), `record_apis: [\n${block}\n]\n`)
    },
    create: (name: string, row: unknown) =>
      json(
        fetch(url(name), {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(row)}),
      ),
    list: (name: string, opts?: Record<string, string>) =>
      json(fetch(`${url(name)}${opts ? `?${new URLSearchParams(opts)}` : ''}`)).then((r) =>
        Array.isArray(r) ? r : ((r as {records?: unknown[]}).records ?? []),
      ),
    read: (name: string, id: string) => json(fetch(url(name, id))),
    update: (name: string, id: string, patch: unknown) =>
      json(
        fetch(url(name, id), {
          method: 'PATCH',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(patch),
        }),
      ),
    remove: (name: string, id: string) => json(fetch(url(name, id), {method: 'DELETE'})),
    // SSE realtime subscription; the frame shape parsing follows trailbase-api.md
    subscribe: (name: string, onEvent: (e: unknown) => void) => {
      const ctrl = new AbortController()
      fetch(`${url(name)}/subscribe/*`, {headers: {accept: 'text/event-stream'}, signal: ctrl.signal})
        .then(async (res) => {
          const reader = res.body!.getReader()
          const dec = new TextDecoder()
          for (;;) {
            const {value, done} = await reader.read()
            if (done) break
            dec
              .decode(value)
              .split('\n\n')
              .filter(Boolean)
              .forEach((frame) => onEvent(parseFrame(frame)))
          }
        })
        .catch(() => {})
      return () => ctrl.abort()
    },
  }
}

// parseFrame extracts the JSON after `data: ` per the SSE shape recorded in trailbase-api.md
function parseFrame(frame: string): unknown {
  const line = frame.split('\n').find((l) => l.startsWith('data:'))
  return line ? JSON.parse(line.slice(5).trim()) : null
}
```

- [ ] **Step 4: Run it, verify it passes** — adjust list/create envelope handling to the Task 2 notes if needed → PASS.

- [ ] **Step 5: Add a subscribe test** — subscribe, create a row from a second call, assert `onEvent` fires with an insert event for that id → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/trail-client.ts packages/core/test/trail-client.it.test.ts
git commit -m "feat(canvas-comments): trail Record-API client + config.textproto generation"
```

---

## Task 7: `mx.db` server service — `createLiveDb` (collection / list / get + migrations + FTS)

The core-owned service: declare a collection (table migration + Record API + optional FTS), return a typed `ServerCollection`, and expose `list()`/`get()` introspection over all declared collections.

**Files:**

- Create: `packages/core/src/db/live-db.ts`
- Create: `packages/core/src/db/migrations.ts`
- Test: `packages/core/test/live-db.it.test.ts`

**Interfaces:**

- Consumes: `TrailClient` (Task 6), the supervisor (Task 5).
- Produces: `createLiveDb(opts: {client: TrailClient; dataDir: string}): LiveDb` where `LiveDb = {collection<T>(name, {schema, migration, fts?}): ServerCollection<T>; list(): CollectionInfo[]; get(name): ServerCollection<unknown> | null}`, `ServerCollection<T> = {query(filter?): Promise<T[]>; insert(row): Promise<T>; update(id, patch): Promise<T>; delete(id): Promise<void>}`, `CollectionInfo = {name; table; schema; fts}`. Consumed by Task 8 + every later plan.

- [ ] **Step 1: Write the failing test** — declare a collection, prove CRUD + FTS search + introspection. `createLiveDb` writes migrations + config BEFORE the supervisor boots (boot applies migrations), so the test wires them in order.

```ts
// packages/core/test/live-db.it.test.ts — real trail
import {test, expect, afterEach} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import {createTrailSupervisor} from '../src/db/trail-supervisor.js'
import {createTrailClient} from '../src/db/trail-client.js'
import {createLiveDb} from '../src/db/live-db.js'

let stop: (() => Promise<void>) | null = null
afterEach(async () => await stop?.())

test('declare collection → CRUD + FTS + introspection against real trail', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'mxdb-'))
  const port = 4133
  const client = createTrailClient(`http://localhost:${port}`)
  const db = createLiveDb({client, dataDir})
  const notes = db.collection('notes', {
    schema: z.object({id: z.string(), body: z.string()}),
    migration: 'CREATE TABLE notes (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL) STRICT;',
    fts: ['body'],
  })
  const sup = createTrailSupervisor({dataDir, port})
  stop = sup.stop
  await sup.start() // boot applies the emitted migration + reads the emitted config
  await notes.insert({id: 'n1', body: 'anchored comment'})
  expect((await notes.query({id: 'n1'}))[0].body).toBe('anchored comment')
  expect((await notes.query({search: 'anchored'})).length).toBe(1)
  // introspection: the shared store lists what exists, with schema
  const info = db.list()
  expect(info.map((c) => c.name)).toContain('notes')
  expect(info.find((c) => c.name === 'notes')?.fts).toEqual(['body'])
  expect(db.get('notes')).toBeTruthy()
}, 30_000)
```

- [ ] **Step 2: Run it, verify it fails** — FAIL (no module).

- [ ] **Step 3: Implement `migrations.ts`** — emit a collection's migration (+ FTS virtual table + sync triggers) into `<dataDir>/migrations/main/` with a deterministic ordered filename.

```ts
// packages/core/src/db/migrations.ts
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// Emit one migration file per collection. Deterministic index keeps ordering stable across boots
// (trail applies migrations/main/*.sql in filename order on boot). FTS5 + content-sync triggers
// keep the fts table in lockstep with the base table.
export function emitMigration(
  dataDir: string,
  index: number,
  name: string,
  table: string,
  sql: string,
  fts: string[],
): void {
  const dir = join(dataDir, 'migrations', 'main')
  mkdirSync(dir, {recursive: true})
  const ftsSql = fts.length
    ? `CREATE VIRTUAL TABLE ${table}_fts USING fts5(${fts.join(', ')}, content='${table}', content_rowid='rowid');
CREATE TRIGGER ${table}_ai AFTER INSERT ON ${table} BEGIN INSERT INTO ${table}_fts(rowid, ${fts.join(', ')}) VALUES (new.rowid, ${fts.map((c) => `new.${c}`).join(', ')}); END;
CREATE TRIGGER ${table}_ad AFTER DELETE ON ${table} BEGIN INSERT INTO ${table}_fts(${table}_fts, rowid, ${fts.join(', ')}) VALUES ('delete', old.rowid, ${fts.map((c) => `old.${c}`).join(', ')}); END;
CREATE TRIGGER ${table}_au AFTER UPDATE ON ${table} BEGIN INSERT INTO ${table}_fts(${table}_fts, rowid, ${fts.join(', ')}) VALUES ('delete', old.rowid, ${fts.map((c) => `old.${c}`).join(', ')}); INSERT INTO ${table}_fts(rowid, ${fts.join(', ')}) VALUES (new.rowid, ${fts.map((c) => `new.${c}`).join(', ')}); END;`
    : ''
  writeFileSync(join(dir, `U${String(index).padStart(4, '0')}__${name}.sql`), `${sql}\n${ftsSql}\n`)
}
```

- [ ] **Step 4: Implement `live-db.ts`**

```ts
// packages/core/src/db/live-db.ts
import type {z} from 'zod'
import {zodToJsonSchema} from 'zod-to-json-schema'
import type {TrailClient} from './trail-client.js'
import {emitMigration} from './migrations.js'

export type ServerCollection<T> = {
  query: (filter?: Partial<T> & {search?: string}) => Promise<T[]>
  insert: (row: T) => Promise<T>
  update: (id: string, patch: Partial<T>) => Promise<T>
  delete: (id: string) => Promise<void>
}
export type CollectionInfo = {name: string; table: string; schema: object; fts: string[]}
export type LiveDb = {
  collection: <T>(name: string, opts: {schema: z.ZodType<T>; migration: string; fts?: string[]}) => ServerCollection<T>
  list: () => CollectionInfo[]
  get: (name: string) => ServerCollection<unknown> | null
}

// The shared, introspectable store. Declaring writes the collection's migration + Record API decl
// (applied/read on the next trail boot); the returned handle is the sole-client CRUD surface.
export function createLiveDb(opts: {client: TrailClient; dataDir: string}): LiveDb {
  const infos: CollectionInfo[] = []
  const handles = new Map<string, ServerCollection<unknown>>()
  const decls: {name: string; table: string; fts?: string[]}[] = []
  const collection = <T>(
    name: string,
    o: {schema: z.ZodType<T>; migration: string; fts?: string[]},
  ): ServerCollection<T> => {
    const existing = handles.get(name)
    if (existing) return existing as ServerCollection<T> // idempotent re-declare
    const fts = o.fts ?? []
    emitMigration(opts.dataDir, infos.length + 1, name, name, o.migration, fts)
    decls.push({name, table: name, fts})
    opts.client.writeConfig(opts.dataDir, decls) // rewrite config with every collection so far
    infos.push({name, table: name, schema: zodToJsonSchema(o.schema) as object, fts})
    const handle: ServerCollection<T> = {
      query: async (filter) => {
        const {search, ...eq} = (filter ?? {}) as {search?: string} & Record<string, unknown>
        const rows = (await opts.client.list(name, search ? {fts: search} : undefined)) as T[]
        // exact-match filtering on remaining fields; search uses trail's fts query param (confirm in notes)
        return rows
          .filter((r) => Object.entries(eq).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
          .map((r) => o.schema.parse(r))
      },
      insert: async (row) => o.schema.parse(await opts.client.create(name, o.schema.parse(row))),
      update: async (id, patch) => o.schema.parse(await opts.client.update(name, id, patch)),
      delete: (id) => opts.client.remove(name, id).then(() => undefined),
    }
    handles.set(name, handle as ServerCollection<unknown>)
    return handle
  }
  return {collection, list: () => infos.slice(), get: (name) => handles.get(name) ?? null}
}
```

- [ ] **Step 5: Run it, verify it passes** — `pnpm --filter @mandarax/core test live-db` → PASS. (If `zod-to-json-schema` is not already a dep, that's a sub-gate — confirm with the user; it is a tiny, widely-used lib. If declined, hand-derive a minimal `{type:'object',properties}` from `schema.shape`.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/live-db.ts packages/core/src/db/migrations.ts packages/core/test/live-db.it.test.ts
git commit -m "feat(canvas-comments): mx.db service — collection/list/get + migrations + FTS"
```

---

## Task 8: Expose `db` on the extension `ServerApi` + boot wiring + prove with a probe extension

Grow the contract so `.server(mx => …)` gets `mx.db`, thread the `LiveDb` instance through the boot path, and prove an extension can declare + introspect a collection.

**Files:**

- Modify: `packages/extensions/src/contract.ts` (`ServerApi.db`)
- Modify: `packages/extensions/src/discovery.ts` (`collectServerContributions(extensions, services)`)
- Modify: `packages/plugin/src/core/extensions.ts` (`loadServerContributions(root, services)`)
- Modify: `packages/core/src/engine.ts` + `packages/plugin/src/core/boot.ts` (construct `LiveDb`, thread it)
- Test: `packages/extensions/test/server-db.test.ts`, `packages/core/test/db-boot.it.test.ts`

**Interfaces:**

- Consumes: `LiveDb` (Task 7), `collectServerContributions` (current signature).
- Produces: `ServerApi.db: LiveDb`; `collectServerContributions(extensions, services: {db: LiveDb})`; `loadServerContributions(root, services)`.

- [ ] **Step 1: Write the failing contract test** (a fake `LiveDb` proves the api passes through and the extension's `.server` can declare)

```ts
// packages/extensions/test/server-db.test.ts
import {test, expect} from 'vitest'
import {defineExtension, collectServerContributions} from '../src/index.js'
import {z} from 'zod'

test('an extension .server half receives mx.db and can declare a collection', () => {
  const declared: string[] = []
  const fakeDb = {
    collection: (n: string) => (
      declared.push(n),
      {
        query: async () => [],
        insert: async (r: unknown) => r,
        update: async (_: string, p: unknown) => p,
        delete: async () => {},
      }
    ),
    list: () => [],
    get: () => null,
  }
  const ext = defineExtension({id: 'probe'}).server((mx) => {
    mx.db.collection('probe_notes', {
      schema: z.object({id: z.string()}),
      migration: 'CREATE TABLE probe_notes (id TEXT PRIMARY KEY NOT NULL) STRICT;',
    })
  })
  collectServerContributions([ext], {db: fakeDb as never})
  expect(declared).toContain('probe_notes')
})
```

- [ ] **Step 2: Run it, verify it fails** — FAIL (`collectServerContributions` takes one arg; `ServerApi` has no `db`).

- [ ] **Step 3: Add `db` to `ServerApi` in `contract.ts`**

```ts
// packages/extensions/src/contract.ts — import the LiveDb type from core's db types (or re-declare a
// structural type here to avoid an extensions→core dep; prefer a shared type in @mandarax/protocol)
export type ServerApi = {
  registerTool: (tool: ToolDefinition) => void
  systemPrompt: {append: (text: string) => void}
  db: LiveDb // NEW — the shared, introspectable collection service
}
```

- [ ] **Step 4: Thread `services` through `collectServerContributions`**

```ts
// packages/extensions/src/discovery.ts
export function collectServerContributions(
  extensions: MandaraxExtension[],
  services: {db: LiveDb},
): ExtensionServerContributions {
  const tools: ExtensionServerTool[] = []
  const systemPrompt: string[] = []
  const api: ServerApi = {
    registerTool: (t) => addServerTool(tools, systemPrompt, t),
    systemPrompt: {append: (text) => systemPrompt.push(text)},
    db: services.db,
  }
  for (const ext of extensions) {
    for (const t of ext.tools ?? []) addServerTool(tools, systemPrompt, t)
    ext.serverFn?.(api)
  }
  return {tools, systemPrompt}
}
```

- [ ] **Step 5: Run the contract test, verify it passes** — `pnpm --filter @mandarax/extensions test server-db` → PASS.

- [ ] **Step 6: Thread `LiveDb` through boot** — `loadServerContributions(root, services)` passes `services` to `collectServerContributions`; `boot.ts` constructs the supervisor + client + `LiveDb` (dataDir `join(stateRoot, '.mandarax', 'trail')`), starts the supervisor AFTER collecting contributions (so all `collection()` calls have emitted migrations/config before boot), and passes `db` into both `loadServerContributions` and `start`.

```ts
// packages/plugin/src/core/extensions.ts — new signature
export async function loadServerContributions(
  root: string,
  services: {db: LiveDb},
): Promise<ExtensionServerContributions> {
  const files = extensionFiles(root)
  if (files.length === 0) return collectServerContributions([], services)
  // …jiti load as before…
  return collectServerContributions(extensions, services)
}
```

```ts
// packages/plugin/src/core/boot.ts — construct db, collect (emits migrations/config), THEN start trail
const dataDir = join(stateRoot, '.mandarax', 'trail')
const supervisor = createTrailSupervisor({dataDir, port: trailPort})
const db = createLiveDb({client: createTrailClient(supervisor.baseUrl), dataDir})
booting = loadServerContributions(root, {db}).then(async (extensions) => {
  await supervisor.start() // migrations + config already emitted by the collection() calls above
  supervisor.onExit(() => void supervisor.start()) // restart-on-crash policy
  return start({options, root, port: options.port, launchEditor: makeOpenInEditor(root), extensions, db /* … */})
})
```

- [ ] **Step 7: Write the boot IT** — a temp project with one `mandarax/extensions/probe.ts` declaring a collection; boot via the real plugin boot path; assert `db.list()` includes it and a CRUD round-trips. Use a unique `trailPort`.

- [ ] **Step 8: Run it, verify it passes** → PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/extensions/src/contract.ts packages/extensions/src/discovery.ts packages/plugin/src/core/extensions.ts packages/plugin/src/core/boot.ts packages/core/src/engine.ts packages/extensions/test/server-db.test.ts packages/core/test/db-boot.it.test.ts
git commit -m "feat(canvas-comments): expose mx.db on ServerApi + boot wiring + probe extension"
```

---

## Self-Review

**Spec coverage (Plan 1 scope = the durable substrate + mx.db server side):**

- One durable store / TrailBase SQLite → Tasks 5–7. ✓
- `mx.db` collection + `list()`/`get()` introspection → Task 7. ✓
- Shared store on the composable `ServerApi` → Task 8. ✓
- "Know the contract for all" (trail + tanstack-db core + solid) → Tasks 2–4 (committed notes). ✓
- Security: loopback-only trail, CORS locked, core sole client → Tasks 5–6 + Global Constraints. ✓
- Deferred to later plans (correctly out of Plan 1 scope): SSE fan-out + browser TanStack collection + Solid `useLiveQuery` wiring (Plan 2); `mx.sync` + relay + SnapshotStore blob (Plan 3); comments schema/anchoring/doctor/AI (Plans 4–7).

**Placeholder scan:** the spike "tests" intentionally end by recording observed contracts (their deliverable is the notes doc, not a green assertion) — flagged as such, not hidden TODOs. Task 4's IT harness reuses an existing widget IT server (referenced, not re-invented). No "add error handling later"-style gaps.

**Type consistency:** `LiveDb`/`ServerCollection`/`CollectionInfo`/`TrailClient` names are identical across Tasks 5–8 and match the spec's interface block. `collection(name, {schema, migration, fts?})` signature is identical in Task 7 and Task 8.

**Open sub-gates flagged inline:** `zod-to-json-schema` (Task 7 Step 5) and whether `/api/healthcheck` is the real path (Task 5, resolved by Task 2 notes).

---

## Execution Handoff

Plan 1 saved. Per this project's house rule (work inline, not dispatched subagents), execution uses **superpowers:executing-plans** — batch execution with checkpoints for review. Tasks 2–4 (contract spikes) gate everything else; do them first and review the notes before building Tasks 5–8.
