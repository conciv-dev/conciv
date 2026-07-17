# Declarative Attachments — Recorder Consumer Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recorder the first consumer of the attachment framework: sending a recording attaches a replayable player card (composer + transcript) while the agent receives keyframe images + an action-log text.

**Architecture:** A recording is a `document` part with mime `application/x-conciv-recorder` whose value is `base64(JSON{recordingId, poster})` — the single base64 layer comes from the framework's `fileToDataSource`; the File carries **raw JSON** (rev 1 double-encoded and never round-tripped). The recorder persists frozen, size-capped recordings by id on disk. Its Card fetches events by id via oRPC + TanStack Query and lazily mounts the shared rrweb player behind a Play poster, with the full async state matrix. Its Expand (typed ctx, no casts) fetches the same events and returns keyframe `image` parts + a log `text` part.

**Tech Stack:** TypeScript (strict, NodeNext), Solid, rrweb / rrweb-player / playwright-core, oRPC + `@orpc/tanstack-query` + `@tanstack/solid-query`, zod, Vitest (node), `@conciv/extension-testkit` (real-browser ITs), turbo.

**Plan 2 of 3.** Depends on Plan 1 (`defineAttachment<Ctx>`, `collectAttachmentCards`, `createDocumentAttachmentAdapter`, document schema, Expand-at-send). **Do not start until Plan 1 Task 12 is green.** Plan 3 (resource hardening) follows; its per-client ring keying will touch `recordings.save`'s call into `ring.window` — a one-line adaptation noted there.

**Rev 2 changes** (from Fable API review + resource audit + maintainer comments): double-base64 fix (File holds raw JSON; `encodeRecordingRef` dropped), correct turbo filter (`@conciv/extension-recorder` — rev 1's `@conciv/recorder` matched nothing → vacuous green), typed Expand ctx via `defineAttachment<{recorder: RecorderRuntime}>` (kills the banned `as` cast), `server/attachment.ts` as the canonical expand-registration module, Task-4/5 ordering fixed (`recordings` field lands with its construction), Card rebuilt: TanStack Query utils (repo pattern, not `createResource`), lazy Play mount (resource audit M4), full state matrix **loading → empty → error+retry → expired → playing** reusing panel notices (maintainer), pending-composer ref read from `file.text()` (review M1), `sendToAgent` failure toast, `@conciv/ui-kit-chat` added to recorder deps (review M8), size-capped saves + byte/TTL prune (resource audit B3) with timestamp-prefixed ids (mtime-tie flake), ITs grounded on `getExtensionTestApi` (rev 1 cited harnesses that don't exist).

**Rev 3 changes** (disk-safety risk closure, 2026-07-18 — maintainer directive: never bloat the user's disk, gates + error handling everywhere): store `get` no longer lets `JSON.parse` throw on a corrupt/truncated file (guarded → `null` → renders as expired); `save` prunes **before** writing with the incoming payload reserved in the byte/count budget, so the 200MB/50-file caps are never exceeded even transiently; writes are **atomic** (`.tmp` + `rename`) so a crash mid-write can never leave a corrupt `.json`; `sweep` deletes stray `*.tmp` files at boot; every filesystem failure in `save` (mkdir/write/rename/prune) returns `{ok:false, reason:'io-error'}` instead of throwing — the router maps it to an error result and the panel toast covers it. Schema-drifted files are handled by design: `safeParse` failure → `null` → expired card, and TTL deletes them within 7 days.

**Rev 4 changes** (deviation-proofing review against the live tree + test harnesses, 2026-07-18): the two harness-capability assumptions that would have forced mid-execution deviations are fixed at the plan level:

1. **The extension-testkit host page has NO composer, thread, or send pipeline** (`packages/extension-testkit/src/host/host-runtime.tsx` — `attach` is `showAttachment`, which renders the File's text into a `role="note"` div labeled `Attachment <name>`; it mounts only composer-slot/Surface/views). Rev 3's Task 9/10 assertions ("card in composer", "send the message", "card in transcript", "reload survives") were unrunnable there. Rev 4: Task 8b (new) teaches the testkit host to render **real** attachment chips through ui-kit-chat's real `AttachmentProvider`/`AttachmentByMime`/`createDocumentAttachmentAdapter`/`collectAttachmentCards` (testkit consumes real widget plumbing — never forks; adds `@conciv/ui-kit-chat` to extension-testkit deps). Task 9 asserts against the real attach seam; Task 10 moves the full widget loop to the **embed IT harness** (`packages/embed/test` — real widget composer+thread over a real core via `makeApp`, fake harness with `__turnMessages` capture, `kit.rpc.navigation.set` deep-linking; recorder client added to the test fixture `global-entry.ts` and `@conciv/extension-recorder` to embed devDeps).
2. **Same-millisecond id collision flake**: `${Date.now()}-${randomUUID()}` ids tie on the timestamp under fast saves, so "newest by name order" pruning became uuid-lottery order. Ids gain a per-store monotonic sequence: `${Date.now()}-${sequence.toString(36).padStart(6, '0')}-${randomUUID()}` — lexicographic order == save order even within one millisecond; `timestampOf` (TTL) still reads the first `-` segment.

Also verified (no plan change needed): `HostApiProvider` **merges** parent context (`hooks.tsx:9`), so the Card's `useApiBase`/rpc survive under the chat pane's nested provider; recorder tool ctx is `{recorder: RecorderRuntime}` matching the attachment ctx so `RequiredContext` intersects cleanly; `getRecordConsolePlugin` accepts `stringifyOptions`; fake-harness `imageInput: false` only gates the image adapter, never document adapters; distill's existing tests use no `id: -1` fixtures so Task 2 stays red-first-clean.

**Sign-off note (workspace deps added by this plan):** `@conciv/ui-kit-chat` → recorder (Task 8, was already in rev 2) and → extension-testkit (Task 8b); `@conciv/extension-recorder` → embed devDeps (Task 10). All workspace-internal, no new third-party packages.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments. No `any`/`as`/`@ts-ignore`/non-null `!`; `noUncheckedIndexedAccess`. Plan snippets must compile under strict — no casts.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- No barrel files. Build/typecheck/test via turbo.
- Recorder vitest is node-only (`test/**/*.test.ts`); real-browser coverage goes through `@conciv/extension-testkit`'s `getExtensionTestApi({server, clientEntry})` (see `packages/extensions/recorder/test/capture.it.test.ts:10-14`) — there is no other browser harness in this package.
- Never write to the recorder store inside a subscription/effect/render — handlers only.
- zod validates every HTTP boundary. v0, no shims.
- Commit with pathspec; on `prek` lock race: `pnpm format` then `git commit --no-verify -- <paths>`.

**Turbo filter (verified):** the package is `@conciv/extension-recorder` (`packages/extensions/recorder/package.json:2`). Every gate below uses it.

**Constants:** mime `application/x-conciv-recorder` (`RECORDER_MIME`); disk root `join(server.cwd, '.conciv', 'recorder', 'recordings')` (matches whiteboard's `join(server.cwd, '.conciv', 'whiteboard')` — `packages/extensions/whiteboard/src/server.ts:18`); `MAX_RECORDINGS = 50`; `MAX_RECORDING_BYTES = 16MB` per file; `MAX_TOTAL_RECORDING_BYTES = 200MB`; `RECORDING_TTL_MS = 7 days`.

---

## File Structure

- `shared/protocol.ts` — `RECORDER_MIME`, `RecordingRefSchema`, `decodeRecordingRef`, `recordingRefJson`, `recordingPoster`.
- `shared/attachment.ts` — **new**: `recordingAttachment = defineAttachment<{recorder: RecorderRuntime}>({mime: RECORDER_MIME})` (shared def; each dist bundles its own copy — the client copy gets `.card`, the server copy gets `.server`; that is how tools split too).
- `server/recordings.ts` — **new**: size-capped, TTL-pruned on-disk store.
- `server/runtime.ts` — `RecorderRuntime.recordings` + `renderRecording` (typed `ContentPart[]`).
- `server/format.ts` — `recordingParts` return type tightened to `ContentPart[]`.
- `server/distill.ts` — drop `id === -1` targets and empty typed `""`.
- `server/attachment.ts` — **new, canonical**: registers `recordingAttachment.server(expand)`.
- `server.ts` — `recordings.save`/`get` router, store construction, `attachments` on the extension, TTL sweep at boot.
- `client/player.ts` — **new**: extracted `mountPlayer` + CSS + skip-idle.
- `client/notices.tsx` — **new**: `RecorderNotice`/`RecorderErrorNotice` extracted from `panel-view.tsx` for reuse by panel + card.
- `client/recording-card.tsx` — **new**: `RecordingCard`.
- `client.tsx` — registers `.card(RecordingCard)` + `attachments` on the client extension.
- `client/panel-view.tsx` — `sendToAgent` saves + attaches; imports player/notices from the new modules.
- `package.json` — add workspace dep `@conciv/ui-kit-chat` (Card imports `useAttachment`; embed externalizes it so no bundle-split risk — `packages/embed/vite.config.ts:5-10`).

---

## Task 1: Recording ref + mime + poster helpers (single-encode)

**Files:**

- Modify: `packages/extensions/recorder/src/shared/protocol.ts`
- Test: `packages/extensions/recorder/test/recording-ref.test.ts`

**Interfaces:**

- Produces:
  - `RECORDER_MIME = 'application/x-conciv-recorder'`.
  - `RecordingRefSchema = z.object({recordingId: z.string().min(1), poster: z.string()})`; `type RecordingRef`.
  - `recordingRefJson(ref): string` — plain `JSON.stringify` (goes into the File; **no base64 here** — `fileToDataSource` adds the only base64 layer at send).
  - `decodeRecordingRef(value: string): RecordingRef | null` — decodes a **document part's** base64 value (`atob` → JSON → schema), null on garbage.
  - `parseRecordingRefJson(json: string): RecordingRef | null` — parses the **raw File text** (composer-pending path).
  - `recordingPoster(entries: ActionLogEntry[]): string`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {
  RECORDER_MIME,
  decodeRecordingRef,
  parseRecordingRefJson,
  recordingPoster,
  recordingRefJson,
} from '../src/shared/protocol.js'

const ref = {recordingId: 'r1', poster: 'Screen recording · 2 actions · 42s'}

describe('recording ref', () => {
  it('round-trips through the framework encoding (File JSON -> base64 document value)', () => {
    const fileText = recordingRefJson(ref)
    const documentValue = btoa(fileText)
    expect(decodeRecordingRef(documentValue)).toEqual(ref)
  })
  it('parses raw file text for the pending-composer path', () => {
    expect(parseRecordingRefJson(recordingRefJson(ref))).toEqual(ref)
  })
  it('returns null for garbage in both decoders', () => {
    expect(decodeRecordingRef('not-base64-json')).toBeNull()
    expect(parseRecordingRefJson('{nope')).toBeNull()
  })
  it('summarizes actions and duration', () => {
    expect(
      recordingPoster([
        {ts: 1000, kind: 'click', detail: 'a'},
        {ts: 43000, kind: 'input', detail: 'b'},
      ]),
    ).toBe('Screen recording · 2 actions · 42s')
  })
  it('exposes the namespaced mime', () => {
    expect(RECORDER_MIME).toBe('application/x-conciv-recorder')
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** — `pnpm turbo run test --filter=@conciv/extension-recorder` — exports missing.

- [ ] **Step 3: Implement**

```ts
export const RECORDER_MIME = 'application/x-conciv-recorder'

export const RecordingRefSchema = z.object({recordingId: z.string().min(1), poster: z.string()})
export type RecordingRef = z.infer<typeof RecordingRefSchema>

export function recordingRefJson(ref: RecordingRef): string {
  return JSON.stringify(ref)
}

export function parseRecordingRefJson(json: string): RecordingRef | null {
  try {
    const parsed = RecordingRefSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function decodeRecordingRef(value: string): RecordingRef | null {
  try {
    return parseRecordingRefJson(atob(value))
  } catch {
    return null
  }
}

export function recordingPoster(entries: ActionLogEntry[]): string {
  const first = entries[0]?.ts ?? 0
  const last = entries.at(-1)?.ts ?? first
  const seconds = Math.max(0, Math.round((last - first) / 1000))
  return `Screen recording · ${entries.length} action${entries.length === 1 ? '' : 's'} · ${seconds}s`
}
```

(`atob` exists in Node ≥ 16 and browsers; the server decode path runs in Node 22.)

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recording ref/mime/poster helpers (single-encode)" -- packages/extensions/recorder/src/shared/protocol.ts packages/extensions/recorder/test/recording-ref.test.ts
```

---

## Task 2: Distill cleanup — drop blocked targets + empty inputs

**Files:**

- Modify: `packages/extensions/recorder/src/server/distill.ts` (`incrementalEntry`)
- Test: `packages/extensions/recorder/test/distill.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {distill} from '../src/server/distill.js'

const incremental = (data: object) => ({type: 3, data, timestamp: 1000})

describe('distill cleanup', () => {
  it('drops blocked-target (id -1) clicks, inputs, scrolls', () => {
    expect(distill([incremental({source: 2, type: 2, id: -1})])).toEqual([])
    expect(distill([incremental({source: 5, id: -1, text: 'hi'})])).toEqual([])
    expect(distill([incremental({source: 3, id: -1})])).toEqual([])
  })
  it('drops empty typed inputs', () => {
    expect(distill([incremental({source: 5, id: 4, text: ''})])).toEqual([])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** — entries emitted.

- [ ] **Step 3: Implement** — in `incrementalEntry`, after each successful `safeParse`:

```ts
const clicked = click.safeParse(event.data)
if (clicked.success) {
  if (clicked.data.id === -1) return undefined
  return {ts, kind: 'click', detail: `clicked ${state.index.describe(clicked.data.id)}`}
}
const typed = input.safeParse(event.data)
if (typed.success) {
  if (typed.data.id === -1 || typed.data.text === '') return undefined
  return {ts, kind: 'input', detail: `typed "${typed.data.text}" into ${state.index.describe(typed.data.id)}`}
}
const scrolled = scroll.safeParse(event.data)
if (scrolled.success) {
  if (scrolled.data.id === -1) return undefined
  return {ts, kind: 'scroll', detail: `scrolled ${state.index.describe(scrolled.data.id)}`}
}
```

- [ ] **Step 4: Run — Expected: PASS** (existing distill tests stay green).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): drop blocked targets and empty inputs from action log" -- packages/extensions/recorder/src/server/distill.ts packages/extensions/recorder/test/distill.test.ts
```

---

## Task 3: Recording store — size-capped, byte/count/TTL-pruned

**Files:**

- Create: `packages/extensions/recorder/src/server/recordings.ts`
- Test: `packages/extensions/recorder/test/recordings.test.ts`

**Interfaces:**

- Produces:
  - `type SaveResult = {ok: true; recordingId: string} | {ok: false; reason: 'too-large' | 'empty' | 'io-error'}`.
  - `createRecordingStore(dir: string): RecordingStore` with
    `save(events: RrwebEvent[]): Promise<SaveResult>`, `get(id): Promise<RrwebEvent[] | null>`, `sweep(): Promise<void>`.
  - `save` trims from the front to the **latest type-2 snapshot** that keeps the serialized payload ≤ `MAX_RECORDING_BYTES` (16MB); if even the tail from the last snapshot exceeds the cap → `{ok:false, reason:'too-large'}`; `< 2` events → `{ok:false, reason:'empty'}`.
  - `save` prunes **BEFORE** writing, with the incoming payload reserved in the budget (`{bytes: payload.length, count: 1}`) — the on-disk total can never exceed `MAX_TOTAL_RECORDING_BYTES` / `MAX_RECORDINGS`, not even transiently.
  - Writes are **atomic**: write `<id>.json.tmp`, then `rename` to `<id>.json` — a crash mid-write never leaves a corrupt `.json` behind.
  - **Every** filesystem failure inside `save` (mkdir, prune stat, write, rename) is caught and returned as `{ok:false, reason:'io-error'}` — `save` never throws.
  - `get` never throws: read failure → `null`; **corrupt/unparseable JSON → `null`** (`JSON.parse` wrapped, then `safeParse`); schema drift → `null`. Callers already render `null` as expired.
  - Ids are `` `${Date.now()}-${sequence.toString(36).padStart(6, '0')}-${randomUUID()}` `` with a per-store monotonic `sequence` counter — lexicographic name order == save order even when many saves land in the same millisecond (a bare timestamp+uuid id makes prune order a uuid lottery under fast saves — the 55-save prune test would flake). `timestampOf` (TTL) reads the segment before the first `-`, unaffected. `sweep`/prune sort by name.
  - Prune: keep newest `MAX_RECORDINGS` (50) AND total bytes ≤ `MAX_TOTAL_RECORDING_BYTES` (200MB), honoring the reserve. `sweep()` (called at server boot) additionally deletes files older than `RECORDING_TTL_MS` (7 days, from the id's timestamp prefix) **and deletes stray `*.tmp` files** (crash leftovers). All `stat`/`unlink` are `.catch`-guarded (concurrent-delete race).

- [ ] **Step 1: Write the failing test**

```ts
import {chmodSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {createRecordingStore} from '../src/server/recordings.js'

const snapshot = (timestamp: number) => ({type: 2, data: {node: {}}, timestamp})
const event = (timestamp: number) => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp})

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'rec-'))
}

function freshStore() {
  return createRecordingStore(freshDir())
}

describe('recording store', () => {
  it('saves and gets by id', async () => {
    const store = freshStore()
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    expect(await store.get(saved.recordingId)).toEqual([snapshot(1), event(2)])
  })

  it('returns null for a missing id', async () => {
    expect(await freshStore().get('nope')).toBeNull()
  })

  it('rejects an empty recording', async () => {
    expect(await freshStore().save([snapshot(1)])).toEqual({ok: false, reason: 'empty'})
  })

  it('trims to the latest snapshot under the size cap', async () => {
    const store = freshStore()
    const bloated = {type: 3, data: {source: 0, blob: 'x'.repeat(15 * 1024 * 1024)}, timestamp: 2}
    const saved = await store.save([snapshot(1), bloated, snapshot(3), event(4)])
    if (!saved.ok) throw new Error('expected ok')
    expect(await store.get(saved.recordingId)).toEqual([snapshot(3), event(4)])
  })

  it('rejects when even the newest snapshot tail exceeds the cap', async () => {
    const store = freshStore()
    const huge = {type: 3, data: {source: 0, blob: 'x'.repeat(17 * 1024 * 1024)}, timestamp: 2}
    expect(await store.save([snapshot(1), huge])).toEqual({ok: false, reason: 'too-large'})
  })

  it('prunes to the newest 50 by id order', async () => {
    const store = freshStore()
    const ids: string[] = []
    for (let index = 0; index < 55; index += 1) {
      const saved = await store.save([snapshot(index), event(index + 1)])
      if (saved.ok) ids.push(saved.recordingId)
    }
    const oldest = ids[0]
    const newest = ids.at(-1)
    if (oldest === undefined || newest === undefined) throw new Error('expected ids')
    expect(await store.get(oldest)).toBeNull()
    expect(await store.get(newest)).not.toBeNull()
  })

  it('returns null for a corrupt recording file instead of throwing', async () => {
    const dir = freshDir()
    const store = createRecordingStore(dir)
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    writeFileSync(join(dir, `${saved.recordingId}.json`), '{corrupt', 'utf8')
    expect(await store.get(saved.recordingId)).toBeNull()
  })

  it('reports io-error when the directory is not writable, never throws', async () => {
    const dir = freshDir()
    chmodSync(dir, 0o500)
    const store = createRecordingStore(dir)
    expect(await store.save([snapshot(1), event(2)])).toEqual({ok: false, reason: 'io-error'})
    chmodSync(dir, 0o700)
  })

  it('sweep removes stray tmp files', async () => {
    const dir = freshDir()
    const store = createRecordingStore(dir)
    const saved = await store.save([snapshot(1), event(2)])
    if (!saved.ok) throw new Error('expected ok')
    writeFileSync(join(dir, '123-dead.json.tmp'), 'partial', 'utf8')
    await store.sweep()
    expect(await store.get(saved.recordingId)).not.toBeNull()
    expect(await store.get('123-dead')).toBeNull()
  })
})
```

(The io-error test relies on the process not running as root — true for dev machines and CI here. The tmp-stray assertion checks the survivor stays AND the stray is gone; `get('123-dead')` is null both before and after, so also assert the file itself: `expect(existsSync(join(dir, '123-dead.json.tmp'))).toBe(false)` — import `existsSync`.)

- [ ] **Step 2: Run — Expected: FAIL** — module missing.

- [ ] **Step 3: Implement**

```ts
import {randomUUID} from 'node:crypto'
import {mkdir, readFile, readdir, rename, stat, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {RrwebEventSchema, type RrwebEvent} from '../shared/protocol.js'

const StoredRecording = z.object({events: z.array(RrwebEventSchema)})
const MAX_RECORDINGS = 50
const MAX_RECORDING_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_RECORDING_BYTES = 200 * 1024 * 1024
const RECORDING_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SaveResult = {ok: true; recordingId: string} | {ok: false; reason: 'too-large' | 'empty' | 'io-error'}

export type RecordingStore = {
  save: (events: RrwebEvent[]) => Promise<SaveResult>
  get: (id: string) => Promise<RrwebEvent[] | null>
  sweep: () => Promise<void>
}

function trimToCap(events: RrwebEvent[]): RrwebEvent[] | null {
  const snapshotIndexes = events.flatMap((event, index) => (event.type === 2 ? [index] : []))
  const starts = [0, ...snapshotIndexes]
  for (let cursor = starts.length - 1; cursor >= 0; cursor -= 1) {
    const start = starts[cursor]
    if (start === undefined) continue
    const slice = events.slice(start)
    if (JSON.stringify({events: slice}).length <= MAX_RECORDING_BYTES) return slice
    if (cursor === starts.length - 1) return null
  }
  return null
}

function timestampOf(name: string): number {
  const prefix = name.split('-')[0]
  const parsed = Number(prefix)
  return Number.isFinite(parsed) ? parsed : 0
}

async function listByRecency(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])
  return names.filter((name) => name.endsWith('.json')).toSorted((a, b) => b.localeCompare(a))
}

async function prune(dir: string, reserved: {bytes: number; count: number}): Promise<void> {
  const names = await listByRecency(dir)
  const sized = await Promise.all(
    names.map(async (name) => ({name, bytes: (await stat(join(dir, name)).catch(() => null))?.size ?? 0})),
  )
  let total = reserved.bytes
  const doomed = sized.filter((entry, index) => {
    total += entry.bytes
    return index + reserved.count >= MAX_RECORDINGS || total > MAX_TOTAL_RECORDING_BYTES
  })
  await Promise.all(doomed.map((entry) => unlink(join(dir, entry.name)).catch(() => {})))
}

async function clearStrayTmp(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => [])
  const strays = names.filter((name) => name.endsWith('.tmp'))
  await Promise.all(strays.map((name) => unlink(join(dir, name)).catch(() => {})))
}

export function createRecordingStore(dir: string): RecordingStore {
  let sequence = 0
  return {
    async save(events) {
      if (events.length < 2) return {ok: false, reason: 'empty'}
      const trimmed = trimToCap(events)
      if (!trimmed || trimmed.length < 2) return {ok: false, reason: 'too-large'}
      const payload = JSON.stringify({events: trimmed})
      try {
        await mkdir(dir, {recursive: true})
        await prune(dir, {bytes: payload.length, count: 1})
        sequence += 1
        const recordingId = `${Date.now()}-${sequence.toString(36).padStart(6, '0')}-${randomUUID()}`
        const target = join(dir, `${recordingId}.json`)
        await writeFile(`${target}.tmp`, payload, 'utf8')
        await rename(`${target}.tmp`, target)
        return {ok: true, recordingId}
      } catch {
        return {ok: false, reason: 'io-error'}
      }
    },
    async get(id) {
      if (!/^[A-Za-z0-9-]+$/.test(id)) return null
      const raw = await readFile(join(dir, `${id}.json`), 'utf8').catch(() => null)
      if (raw === null) return null
      try {
        const parsed = StoredRecording.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data.events : null
      } catch {
        return null
      }
    },
    async sweep() {
      await clearStrayTmp(dir)
      const names = await listByRecency(dir)
      const cutoff = Date.now() - RECORDING_TTL_MS
      const expired = names.filter((name) => timestampOf(name) < cutoff)
      await Promise.all(expired.map((name) => unlink(join(dir, name)).catch(() => {})))
      await prune(dir, {bytes: 0, count: 0})
    },
  }
}
```

(`listByRecency` already filters to `.json`, so `.tmp` files never count toward the byte/count budget and never survive a boot sweep. `save` never throws — every fs failure maps to `io-error`, which Task 5's router returns as `{error}` and Task 9's toast surfaces.)

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): size-capped recording store with byte/count/TTL prune" -- packages/extensions/recorder/src/server/recordings.ts packages/extensions/recorder/test/recordings.test.ts
```

---

## Task 4: Runtime — `recordings` + typed `renderRecording`

**Files:**

- Modify: `packages/extensions/recorder/src/server/runtime.ts`
- Modify: `packages/extensions/recorder/src/server/format.ts` (`recordingParts` return type)
- Modify: `packages/extensions/recorder/src/server.ts` (construct the store — same commit so typecheck stays green)
- Test: `packages/extensions/recorder/test/runtime.test.ts` (extend)

**Interfaces:**

- Consumes: `RecordingStore` (Task 3).
- Produces:
  - `RecorderRuntime.recordings: RecordingStore` (constructed in `server.ts` with `createRecordingStore(join(server.cwd, '.conciv', 'recorder', 'recordings'))`; `void runtime.recordings.sweep()` fired at mount).
  - `recordingParts(log, frames, keyframesRequested): ContentPart[]` (was `unknown` — `imageResult` already returns `ContentPart[]`, so this is only a signature tightening; `pullWindow` return type unchanged for the tools).
  - `renderRecording(runtime: RecorderRuntime, events: RrwebEvent[], keyframeCount: number): Promise<ContentPart[]>` — `distill` → `renderFrames` → `recordingParts`. `pullWindow` keeps its own `fromTs` log filter and is NOT re-pointed (shared units are `renderFrames` + `recordingParts`).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import {createRecordingStore} from '../src/server/recordings.js'
import {renderRecording, type RecorderRuntime} from '../src/server/runtime.js'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

function runtimeFixture(): RecorderRuntime {
  const ring = createEventRing({windowMs: 60_000})
  return {
    ring,
    control: createCaptureControl(ring),
    config: {masking: 'none', windowMinutes: 10, console: true},
    renderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}

describe('renderRecording', () => {
  it('returns a text log part when no renderer is available', async () => {
    const parts = await renderRecording(runtimeFixture(), [{type: 4, data: {href: 'https://x'}, timestamp: 1}], 0)
    expect(parts.some((part) => part.type === 'text')).toBe(true)
    expect(parts.some((part) => part.type === 'image')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** — `renderRecording` / `recordings` field missing.

- [ ] **Step 3: Implement**

`format.ts`: change `recordingParts` signature to `): ContentPart[]` (import `type {ContentPart} from '@conciv/extension'`); body unchanged.

`runtime.ts`:

```ts
import type {ContentPart} from '@conciv/extension'
import type {RecordingStore} from './recordings.js'

export type RecorderRuntime = {
  ring: EventRing
  control: CaptureControl
  config: RecorderConfig
  renderer: () => Promise<KeyframeRenderer | null>
  recordings: RecordingStore
}

export async function renderRecording(
  runtime: RecorderRuntime,
  events: RrwebEvent[],
  keyframeCount: number,
): Promise<ContentPart[]> {
  const log = distill(events)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
}
```

`server.ts` (same commit — the required field otherwise breaks `tsc` between tasks):

```ts
const recordings = createRecordingStore(join(server.cwd, '.conciv', 'recorder', 'recordings'))
void recordings.sweep()
const runtime: RecorderRuntime = {ring, control, config: server.config, renderer, recordings}
```

- [ ] **Step 4: Run — Expected: PASS**, plus `pnpm turbo run typecheck --filter=@conciv/extension-recorder`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recordings store on runtime + typed renderRecording" -- packages/extensions/recorder/src/server/runtime.ts packages/extensions/recorder/src/server/format.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/runtime.test.ts
```

---

## Task 5: Router — `recordings.save` / `recordings.get`

**Files:**

- Modify: `packages/extensions/recorder/src/server.ts` (`makeRecorderRouter`)
- Test: `packages/extensions/recorder/test/recordings-router.test.ts` (new — note: `render.it.test.ts` tests the Chromium renderer directly, NOT the router; do not model on it. Call the handlers via `@orpc/server`'s `call` helper, or through the testkit engine in Task 9.)

**Interfaces:**

- Produces:
  - `recordings.save` (input `RangeInput`) → `{recordingId: string} | {error: 'too-large' | 'empty' | 'io-error'}` — freezes `runtime.ring.window(input)`; every store failure (including disk errors) comes back as a typed `{error}`, never a thrown 500.
  - `recordings.get` (input `{recordingId: z.string()}`) → `{events: RrwebEvent[]} | {expired: true}`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
```

Build a runtime exactly as Task 4's `runtimeFixture` (real ring + real store over a tmp dir), append a snapshot + one incremental to the ring, then:

```ts
const router = makeRecorderRouter(runtime)
const saved = await call(router.recordings.save, {}, {context: {request: new Request('http://local')}})
// assert {recordingId}; then recordings.get round-trips the events; get('missing…') → {expired:true}
```

(If `call`'s exact context shape differs, mirror how any existing oRPC handler test in the repo invokes handlers — `rg "from '@orpc/server'" packages -g '*test*'` — the point is: invoke the real handlers, no HTTP needed.)

- [ ] **Step 2: Run — Expected: FAIL** — `recordings` router missing.

- [ ] **Step 3: Implement** — add to `makeRecorderRouter`:

```ts
recordings: recorderOs.router({
  save: recorderOs
    .input(RangeInput)
    .output(z.union([z.object({recordingId: z.string()}), z.object({error: z.enum(['too-large', 'empty', 'io-error'])})]))
    .handler(async ({input}) => {
      const saved = await runtime.recordings.save(runtime.ring.window(input))
      return saved.ok ? {recordingId: saved.recordingId} : {error: saved.reason}
    }),
  get: recorderOs
    .input(z.object({recordingId: z.string()}))
    .handler(async ({input}) => {
      const events = await runtime.recordings.get(input.recordingId)
      return events ? {events} : {expired: true as const}
    }),
}),
```

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recordings.save/get router" -- packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/recordings-router.test.ts
```

---

## Task 6: Recording attachment — shared def + typed server Expand

**Files:**

- Create: `packages/extensions/recorder/src/shared/attachment.ts`
- Create: `packages/extensions/recorder/src/server/attachment.ts` (canonical expand registration — importable by tests without pulling the whole server module)
- Modify: `packages/extensions/recorder/src/server.ts` (import `./server/attachment.js`; add `attachments` to the extension)
- Test: `packages/extensions/recorder/test/expand.test.ts`

**Interfaces:**

- Consumes: `defineAttachment<Ctx>` (Plan 1 Task 3), `decodeRecordingRef` (Task 1), `renderRecording` + `RecorderRuntime` (Task 4).
- Produces:
  - `shared/attachment.ts`: `recordingAttachment = defineAttachment<{recorder: RecorderRuntime}>({mime: RECORDER_MIME})` — ctx typed, so the expand needs **no cast**, and Plan 1 Task 4's `RequiredContext` constraint compile-checks that the recorder's `.server()` actually provides `{recorder}` (it does — `server.ts` context, verified).
  - `server/attachment.ts`: side-effectful registration module:

```ts
import {recordingAttachment} from '../shared/attachment.js'
import {decodeRecordingRef} from '../shared/protocol.js'
import {renderRecording} from './runtime.js'

recordingAttachment.server(async (part, ctx) => {
  const ref = decodeRecordingRef(part.source.value)
  const events = ref ? await ctx.recorder.recordings.get(ref.recordingId) : null
  if (!events) return [{type: 'text', content: '[recording expired]'}]
  return renderRecording(ctx.recorder, events, 3)
})

export {recordingAttachment}
```

- `server.ts` imports `{recordingAttachment} from './server/attachment.js'` and adds `attachments: [recordingAttachment]` to its `defineExtension`.
- Bundle note: `shared/attachment.ts` compiles into BOTH dists (relative import). Each dist holds its own instance — the client copy carries only `.card`, the server copy only `.server`. Same split as `tool/client.ts` vs `tool/server.ts`; no server code reaches the client bundle because the client never imports `server/attachment.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {recordingAttachment} from '../src/server/attachment.js'
import {createRecordingStore} from '../src/server/recordings.js'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import type {RecorderRuntime} from '../src/server/runtime.js'

function runtimeFixture(): RecorderRuntime {
  const ring = createEventRing({windowMs: 60_000})
  return {
    ring,
    control: createCaptureControl(ring),
    config: {masking: 'none', windowMinutes: 10, console: true},
    renderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}

const documentPart = (recordingId: string) => ({
  type: 'document' as const,
  source: {
    type: 'data' as const,
    mimeType: 'application/x-conciv-recorder',
    value: btoa(JSON.stringify({recordingId, poster: 'p'})),
  },
})

describe('recording expand', () => {
  it('returns log text for a saved recording', async () => {
    const runtime = runtimeFixture()
    const saved = await runtime.recordings.save([
      {type: 2, data: {node: {}}, timestamp: 1},
      {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
    ])
    if (!saved.ok) throw new Error('expected ok')
    const expand = recordingAttachment.__expand
    if (!expand) throw new Error('expand not registered')
    const parts = await expand(documentPart(saved.recordingId), {recorder: runtime})
    expect(parts.some((part) => part.type === 'text')).toBe(true)
  })

  it('returns an expired text part when the recording is gone', async () => {
    const expand = recordingAttachment.__expand
    if (!expand) throw new Error('expand not registered')
    const parts = await expand(documentPart('gone'), {recorder: runtimeFixture()})
    expect(parts).toEqual([{type: 'text', content: '[recording expired]'}])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** — modules missing.
- [ ] **Step 3: Implement** the two files per Interfaces; wire `server.ts`.
- [ ] **Step 4: Run — Expected: PASS**, plus typecheck (the `RequiredContext` constraint must accept the existing `{recorder: runtime}` context — if it errors, the constraint threading in Plan 1 Task 4 is wrong; fix THERE, not with a cast here).
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recording attachment expand (typed ctx, expired fallback)" -- packages/extensions/recorder/src/shared/attachment.ts packages/extensions/recorder/src/server/attachment.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/expand.test.ts
```

---

## Task 7: Extract player + notices into shared client modules

**Files:**

- Create: `packages/extensions/recorder/src/client/player.ts`
- Create: `packages/extensions/recorder/src/client/notices.tsx`
- Modify: `packages/extensions/recorder/src/client/panel-view.tsx`

**Interfaces:**

- Produces:
  - `player.ts`: `mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void` — moved verbatim from `panel-view.tsx:74-104` with its helpers (`playerSize`, `recordedAspect`, `skipIdlePlayback`, `styleScope`, `demoteInjectedStyles`, the zod guards, the three CSS `?inline` imports, the `Player` import).
  - `notices.tsx`: `RecorderNotice(props: {text: string})` and `RecorderErrorNotice(props: {retry: () => void; text?: string})` — moved from `panel-view.tsx:193-206`, `text` defaulting to the current copy.
  - `panel-view.tsx` imports both; behavior unchanged.

- [ ] **Step 1:** Move the code; update panel-view imports; delete the moved definitions.
- [ ] **Step 2: Run** `pnpm turbo run test --filter=@conciv/extension-recorder` — Expected: PASS (pure extraction; the existing extension/capture ITs exercise the panel).
- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(recorder): extract shared player + notice modules" -- packages/extensions/recorder/src/client/player.ts packages/extensions/recorder/src/client/notices.tsx packages/extensions/recorder/src/client/panel-view.tsx
```

---

## Task 8: `RecordingCard` — lazy player, full state matrix, TanStack Query

**Files:**

- Create: `packages/extensions/recorder/src/client/recording-card.tsx`
- Modify: `packages/extensions/recorder/src/client.tsx` (register card + attachments)
- Modify: `packages/extensions/recorder/package.json` (add workspace dep `@conciv/ui-kit-chat` — the card imports `useAttachment`; runtime-safe because embed + recorder vite externalize `@conciv/*`, but typecheck needs the dep)

**Interfaces:**

- Consumes: `useAttachment` (`@conciv/ui-kit-chat`), `parseRecordingRefJson`/`decodeRecordingRef` (Task 1), `recordings.get` (Task 5), `mountPlayer` (Task 7), notices (Task 7), `getHostApi`/`makeExtRpcClient`/`createTanstackQueryUtils` (existing pattern — `panel-view.tsx:115-135`).
- Produces: `RecordingCard()` with states — **poster+Play (idle) → loading → empty → error+retry → expired → playing**. The recording query is `enabled` only after Play (lazy mount: a transcript of N cards mounts zero players until clicked — resource audit M4). Pending-composer attachments (no `content` yet) resolve their ref from `attachment.file.text()`.

State/date sources:

- ref: complete → document part value via `decodeRecordingRef`; pending → `file.text()` via `parseRecordingRefJson`.
- loading: query `isPending` (after Play).
- empty: `events.length < 2` → `RecorderNotice('Nothing to replay in this recording.')`.
- error: query `isError` → `RecorderErrorNotice({retry: refetch, text: 'Could not load the recording.'})`.
- expired: `{expired:true}` → `RecorderNotice('Recording expired.')`.
- playing: `mountPlayer(container, events, () => true)` with `onCleanup`.

- [ ] **Step 1: Write the implementation** (tested end-to-end in Tasks 9–10 through the testkit browser; there is no component-level browser harness in this package):

```tsx
import {Match, Show, Switch, createResource, createSignal, onCleanup, type JSX} from 'solid-js'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {useAttachment} from '@conciv/ui-kit-chat'
import {Button} from '@conciv/ui-kit-system'
import {
  RECORDER_NAME,
  decodeRecordingRef,
  parseRecordingRefJson,
  type RecordingRef,
  type RrwebEvent,
} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountPlayer} from './player.js'
import {RecorderErrorNotice, RecorderNotice} from './notices.js'

type AttachmentState = ReturnType<typeof useAttachment>

async function resolveRef(attachment: AttachmentState): Promise<RecordingRef | null> {
  if ('content' in attachment)
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') return decodeRecordingRef(part.source.value)
  if (attachment.file) return parseRecordingRefJson(await attachment.file.text())
  return null
}

export function RecordingCard(): JSX.Element {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <CardBody />
    </QueryClientProvider>
  )
}

function CardBody(): JSX.Element {
  const attachment = useAttachment()
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const utils = createTanstackQueryUtils(makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME))
  const [ref] = createResource(() => resolveRef(attachment))
  const [wantsPlay, setWantsPlay] = createSignal(false)
  const recording = useQuery(() => ({
    ...utils.recordings.get.queryOptions({input: {recordingId: ref()?.recordingId ?? ''}}),
    enabled: wantsPlay() && Boolean(ref()),
  }))
  const events = (): RrwebEvent[] | null => {
    const data = recording.data
    return data && 'events' in data ? data.events : null
  }
  const expired = (): boolean => Boolean(recording.data && 'expired' in recording.data)
  const play = (playable: RrwebEvent[]) => (container: HTMLDivElement) => {
    onCleanup(mountPlayer(container, playable, () => true))
  }
  return (
    <div class="rounded-pw-md border border-pw-line bg-pw-fill overflow-hidden min-w-55 p-2 flex flex-col gap-2">
      <Switch fallback={<RecorderNotice text={ref()?.poster ?? 'Screen recording'} />}>
        <Match when={!wantsPlay()}>
          <div class="flex gap-2 items-center">
            <RecorderNotice text={ref()?.poster ?? 'Screen recording'} />
            <Button size="sm" disabled={!ref()} onClick={() => setWantsPlay(true)}>
              Play
            </Button>
          </div>
        </Match>
        <Match when={recording.isPending}>
          <RecorderNotice text="Loading recording…" />
        </Match>
        <Match when={recording.isError}>
          <RecorderErrorNotice text="Could not load the recording." retry={() => void recording.refetch()} />
        </Match>
        <Match when={expired()}>
          <RecorderNotice text="Recording expired." />
        </Match>
        <Match when={events()} keyed>
          {(playable) => (
            <Show when={playable.length >= 2} fallback={<RecorderNotice text="Nothing to replay in this recording." />}>
              <div ref={play(playable)} class="w-full min-h-30" />
            </Show>
          )}
        </Match>
      </Switch>
    </div>
  )
}
```

(`createResource` here only awaits `file.text()` — the network fetch is TanStack Query per the repo pattern. Panel-view's own `QueryClientProvider` wrapper is the precedent for the local client.)

- [ ] **Step 2: Register in `client.tsx`**

```ts
import {recordingAttachment} from './shared/attachment.js'
import {RecordingCard} from './client/recording-card.js'

recordingAttachment.card(RecordingCard)

export const recorder = defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startToolClient, stopToolClient, pullToolClient],
  attachments: [recordingAttachment],
  views: [{id: 'recorder', label: 'Recorder', icon: Clapperboard, Component: RecorderPanelView}],
  Surface,
}).client(() => ({value: {store: createRecorderStore()}}))
```

Add `"@conciv/ui-kit-chat": "workspace:*"` to recorder `package.json` dependencies.

- [ ] **Step 3: Run** `pnpm turbo run typecheck --filter=@conciv/extension-recorder` — Expected: clean.
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(recorder): RecordingCard with lazy play + full async state matrix" -- packages/extensions/recorder/src/client/recording-card.tsx packages/extensions/recorder/src/client.tsx packages/extensions/recorder/package.json
```

---

## Task 8b: Testkit host renders real attachment chips (harness gap closure)

**Files:**

- Modify: `packages/extension-testkit/src/host/host-runtime.tsx`
- Modify: `packages/extension-testkit/package.json` (add `"@conciv/ui-kit-chat": "workspace:^"` — testkit consumes the widget's REAL chip plumbing, never a fork)
- Test: `packages/extensions/recorder/test/recording-card.it.test.ts` (drives the new host capability — doubles as the Card state-matrix IT)

**Why:** the host page's `attach` is `showAttachment` (text into a `role="note"` div) — no card can ever render there, so Card behavior was untestable (the rev 3 plan would have deviated exactly like Plan 1's Task 8/10). This closes the gap with real components.

**Interfaces:**

- Produces: in `startHost`, when the extension-under-test registers attachment cards (`collectAttachmentCards([extension])` non-empty) and an attached File's `type` matches a card mime, `attach` renders — inside the existing `HostApiProvider` (real rpc/apiBase) — the REAL pending-chip pipeline instead of `showAttachment`:

```tsx
const cards = collectAttachmentCards([extension])
const showCardAttachment = (file: File): void => {
  const adapter = createDocumentAttachmentAdapter(file.type)
  void Promise.resolve(adapter.add({file})).then((pending) => {
    if (Symbol.asyncIterator in pending) return
    const el = document.createElement('div')
    el.setAttribute('data-testkit-attachment', file.name)
    document.body.appendChild(el)
    render(
      () => (
        <HostApiProvider rpc={rpc} apiBase={apiBase} toast={showToast}>
          <AttachmentProvider value={pending}>
            <AttachmentByMime cards={cards} />
          </AttachmentProvider>
        </HostApiProvider>
      ),
      el,
    )
  })
}
const attachFile = (file: File): void =>
  cards.some((entry) => entry.mime === file.type) ? showCardAttachment(file) : showAttachment(file)
```

Pass `attach={attachFile}` in the provider. Unmatched mimes keep today's `role="note"` behavior (existing testkit users unaffected).

- [ ] **Step 1: Write the failing test** — `recording-card.it.test.ts` via `getExtensionTestApi` (recorder server + client): interact with the page to produce ring events, save via the router (`api().callTool` or rpc `recordings.save` — or drive Task 9's button once it lands), then in the page call the host attach with a File of `RECORDER_MIME` containing `recordingRefJson({recordingId, poster})`. Assert with `api().page`:
  - poster text + a `Play` button visible (idle state);
  - click Play → the rrweb player mounts (`.rr-player` or the player container) — **playing** state over a real `recordings.get` fetch;
  - attach a second File with a bogus `recordingId` → Play → `Recording expired.` visible (**expired** state, real `{expired:true}` from the real store).
    (Loading is transient; the `empty` branch is unreachable via real saves — the store rejects `< 2` events — so those two stay code-only. Network-error state reuses `RecorderErrorNotice`, which the panel already renders; not separately IT'd.)
- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/extension-recorder`) — host renders the note div, no card.
- [ ] **Step 3: Implement** the host change per Interfaces (imports: `collectAttachmentCards` from `@conciv/extension`, `AttachmentProvider`, `AttachmentByMime`, `createDocumentAttachmentAdapter` from `@conciv/ui-kit-chat`).
- [ ] **Step 4: Run — Expected: PASS**, plus `pnpm turbo run test --filter=@conciv/extension-testkit --filter=@conciv/extension-terminal --filter=@conciv/extension-whiteboard` (other testkit consumers stay green — unmatched mimes unchanged).
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(extension-testkit): host renders real attachment chips by mime" -- packages/extension-testkit/src/host/host-runtime.tsx packages/extension-testkit/package.json packages/extensions/recorder/test/recording-card.it.test.ts
```

---

## Task 9: `sendToAgent` — save + attach, with failure toast

**Files:**

- Modify: `packages/extensions/recorder/src/client/panel-view.tsx`
- Test: `packages/extensions/recorder/test/send-to-agent.it.test.ts` (via `getExtensionTestApi` — the ONLY browser harness here; `extension.it.test.ts` is a node rpc test and cannot click UI)

**Interfaces:**

- Consumes: `recordings.save` (Task 5), `recordingRefJson`/`recordingPoster`/`RECORDER_MIME` (Task 1), `host.attach(file)` + `toast` (existing, unchanged).
- Produces: "Send to agent" saves the window and attaches `new File([recordingRefJson(ref)], 'Screen recording', {type: RECORDER_MIME})`; save failure (`error` result or thrown) toasts and does NOT leave the view; `.txt` path deleted.

- [ ] **Step 1: Write the failing test** — boot `getExtensionTestApi({server, clientEntry})` as `capture.it.test.ts:10-14` does; interact with the page to produce events; open the recorder view (host `role="tab"` named `Recorder`) and click "Send to agent" via `api().page`. With Task 8b's host in place, assert:
  - the REAL recording chip renders (poster text `Screen recording · N action…` + Play button) — because the attached File's type is `RECORDER_MIME`, which matches the registered card;
  - no element labeled `Attachment recording.txt` exists (the old `.txt` path is gone);
  - (payload sanity) the attached File carried raw ref JSON: the card resolved its ref from `file.text()`, which the poster text proves.
    The failure-toast branch is NOT separately IT'd (forcing a real save failure from the page is race-prone): the typed `{error}` union is covered by Task 3's store tests + Task 5's router test, and the toast branch is four lines driven by that union — documented here per the tests-must-fail rule, not silently skipped.

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/extension-recorder`).

- [ ] **Step 3: Implement**

```ts
const save = useMutation(() => utils.recordings.save.mutationOptions())

const sendToAgent = async (): Promise<void> => {
  const entries = log.data?.entries ?? []
  const saved = await save.mutateAsync({}).catch(() => null)
  if (!saved || 'error' in saved) {
    toast('Could not save the recording — try again.')
    return
  }
  const ref = recordingRefJson({recordingId: saved.recordingId, poster: recordingPoster(entries)})
  attach(new File([ref], 'Screen recording', {type: RECORDER_MIME}))
  leaveView()
}
```

Button: `onClick={() => void sendToAgent()}`.

- [ ] **Step 4: Run — Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): send-to-agent saves + attaches the recording, toasts on failure" -- packages/extensions/recorder/src/client/panel-view.tsx packages/extensions/recorder/test/send-to-agent.it.test.ts
```

---

## Task 10: End-to-end IT (embed harness — the ONLY place the real widget loop exists) + gates

**Files:**

- Modify: `packages/embed/test/fixtures/global-entry.ts` (add recorder client — test fixture, not product)
- Modify: `packages/embed/package.json` (devDep `"@conciv/extension-recorder": "workspace:^"`)
- Modify: `packages/embed/test/helpers/boot.ts` (`bootEmbedKit` gains `extensions?: AnyExtension[]` passed into `makeApp`)
- Test: `packages/embed/test/recording-attachment.it.test.ts`

**Why here:** the extension-testkit host has no composer/thread; the embed IT harness is the real widget (composer + transcript) over a real core (`makeApp`) with a fake harness whose `__turnMessages` captures exactly what the model receives, plus `kit.rpc.navigation.set` deep-linking (`embed.it.test.ts` precedent). The prebuilt global bundle is a self-contained iife (terminal client is bundled the same way — one module graph, no context-split risk), and turbo's `test` → `dependsOn: build` rebuilds it before ITs.

- [ ] **Step 1: Write the failing test** — fixture entry becomes `mountConciv([terminal, recorder])` (recorder client import mirroring how `@conciv/it` imports it); boot `bootEmbedKit({extensions: [recorderServer]})`. With `browser.newPage()` (never `newContext()`; wait on `domcontentloaded`/UI signals, never `networkidle`):
  - interact with the host page body to produce rrweb events;
  - `kit.rpc.navigation.set` → `/panel/<session>/recorder`, open the widget, click **Send to agent**;
  - composer chip shows the recording card (poster text visible), no `recording.txt` chip;
  - send a message; wait for the fake-harness turn; assert `kit.harness.__turnMessages`: user content contains the action-log text and NO document part (keyframe images asserted **tolerantly** — present only when the Chromium renderer is available, `(keyframes skipped…)` note otherwise);
  - transcript shows the card (poster + Play); the log text is NOT visible as user text; no `<img>` from modelOnly keyframes;
  - reload the page → card still in the transcript (durable fold → attach merge).
- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/embed`), fix gaps in the owning task's files, re-run to PASS. Existing embed ITs must stay green with recorder now in the bundle.
- [ ] **Step 3: Gates:** `pnpm typecheck`; `pnpm turbo run test --force`; `pnpm exec fallow audit --changed-since main --format json` — confirm the old `.txt` sendToAgent path, `encodeRecordingRef` (never created — verify no strays), and moved panel helpers have no dead remnants.
- [ ] **Step 4: Commit**

```bash
git commit -m "test(embed): end-to-end recording attachment in the real widget (compose/send/reload)" -- packages/embed/test/fixtures/global-entry.ts packages/embed/package.json packages/embed/test/helpers/boot.ts packages/embed/test/recording-attachment.it.test.ts
```

---

## Self-Review

**Spec + review coverage:** single-encode ref (review B2) → T1; filter names (B3) → global; distill cleanup → T2; capped store + TTL + stat-race guard + id-ordered prune (resource B3 + minors) → T3; typed `recordingParts`/`renderRecording`, recordings-with-construction (M11) → T4; router → T5; typed ctx expand, canonical `server/attachment.ts` (M9/M10 + minor) → T6; player/notices extraction → T7; Card: lazy Play (resource M4), loading/empty/error+retry/expired/playing (maintainer), TanStack Query utils (maintainer), pending ref from file (M1) → T8; sendToAgent failure toast (minor) → T9 (typed union covered in T3/T5; toast branch documented untested); testkit host chip gap + Card state matrix on real server → T8b; full widget loop (compose/send/model projection/reload) on the embed harness → T10.

**Placeholder scan:** T9/T10 Step 1 reference `capture.it.test.ts`'s real harness by file:line; T5's test names the `@orpc/server` `call` helper with a fallback discovery command. All product code is complete.

**Type consistency:** `SaveResult`/`RecordingStore` (T3) consumed in T4/T5/T6; `renderRecording(runtime, events, keyframeCount): Promise<ContentPart[]>` (T4) consumed in T6; `RecordingRef{recordingId, poster}` + `recordingRefJson`/`parseRecordingRefJson`/`decodeRecordingRef` (T1) consumed in T6/T8/T9; `recordingAttachment` single shared def — `.server` in `server/attachment.ts` (T6), `.card` in `client.tsx` (T8) — matches Plan 1's `__expand`/`__card` collector surfaces; `defineAttachment<{recorder: RecorderRuntime}>` matches the server context `{recorder: runtime}` in `server.ts`.
