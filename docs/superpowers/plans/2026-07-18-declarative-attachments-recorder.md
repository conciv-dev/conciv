# Declarative Attachments — Recorder Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recorder the first consumer of the attachment framework: sending a recording attaches a replayable player card that renders in the composer and transcript, while the agent receives keyframe images + an action-log text.

**Architecture:** A recording is a `document` part with mime `application/x-conciv-recorder` whose value is `base64(JSON{recordingId, poster})`. The recorder persists frozen recordings by id on disk; its **Card** (client) fetches events by id and mounts the shared rrweb player; its **Expand** (server) fetches the same events and returns keyframe `image` parts + a log `text` part via the existing `recordingParts` helper.

**Tech Stack:** TypeScript (strict, NodeNext), Solid, rrweb / rrweb-player / playwright-core (keyframes), oRPC + `@orpc/tanstack-query`, zod, Vitest (node), Playwright (real-browser IT), turbo.

**This is Plan 2 of 2.** It depends on symbols produced by **Plan 1** (`docs/superpowers/plans/2026-07-18-declarative-attachments-framework.md`): `defineAttachment`, `collectAttachmentCards`, `createDocumentAttachmentAdapter`, the `document` content part schema, and the core Expand-at-send wiring. **Do not start this plan until Plan 1's Task 10 gates are green.**

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments in TS/JS (self-explanatory names).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- TS strict: no `any`/`as`/`@ts-ignore`/non-null `!`; `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- No barrel files; import from source.
- Build/typecheck/test via turbo; never hand-build `dist/`.
- Widget/recorder UI tested in a real browser (Playwright); recorder vitest config pins `test:{environment:'node'}` for node tests. Widget IT loads the prebuilt embed bundle — rebuild `@conciv/embed` before running.
- Never write to the recorder store inside a subscription/effect/render — event handlers only (extension landmine).
- zod validates every HTTP boundary (`recordings.*` inputs).
- v0, no back-compat shims.
- Commit with pathspec. If `prek` aborts on a lock race, `pnpm format` then `git commit --no-verify -- <paths>`.

**Recorder mime:** `application/x-conciv-recorder` (exact, shared constant `RECORDER_MIME`).
**On-disk root:** `join(server.cwd, '.conciv', 'recorder', 'recordings')` — matches whiteboard's `join(server.cwd, '.conciv', 'whiteboard')`. Prune to newest **50**.

---

## File Structure

- `packages/extensions/recorder/src/shared/protocol.ts` — add `RECORDER_MIME`, `RecordingRef` zod schema + `encodeRecordingRef`/`decodeRecordingRef`, `recordingPoster(entries)`.
- `packages/extensions/recorder/src/shared/attachment.ts` — **new**: `recordingAttachment = defineAttachment({mime: RECORDER_MIME})` (shared instance; client sets card, server sets expand).
- `packages/extensions/recorder/src/server/recordings.ts` — **new**: `createRecordingStore(dir)` → `save(events) → id`, `get(id) → events | null`, prune to 50.
- `packages/extensions/recorder/src/server/runtime.ts` — extract `renderRecording(runtime, events, keyframeCount) → Promise<ContentPart[]>` (reused by `pullWindow` + Expand); add `recordings` to `RecorderRuntime`.
- `packages/extensions/recorder/src/server/distill.ts` — drop `id === -1` targets and empty typed `""` entries.
- `packages/extensions/recorder/src/server.ts` — add `recordings.save`/`recordings.get` router handlers; construct the recording store; register `recordingAttachment.server(expand)`; add `attachments:[recordingAttachment]` to the server `defineExtension`.
- `packages/extensions/recorder/src/client/player.ts` — **new**: extract `mountPlayer` + player CSS + skip-idle from `panel-view.tsx`.
- `packages/extensions/recorder/src/client/recording-card.tsx` — **new**: `RecordingCard` (fetch events by id → mount player; loading/expired/error/playing states).
- `packages/extensions/recorder/src/client.tsx` — register `attachments:[recordingAttachment.card(RecordingCard)]`.
- `packages/extensions/recorder/src/client/panel-view.tsx` — `sendToAgent` = save + `host.attach(File[…RECORDER_MIME])`; reuse `client/player.ts`.

---

## Task 1: Recording ref + mime + poster helpers

**Files:**
- Modify: `packages/extensions/recorder/src/shared/protocol.ts`
- Test: `packages/extensions/recorder/test/recording-ref.test.ts`

**Interfaces:**
- Produces:
  - `RECORDER_MIME = 'application/x-conciv-recorder'`.
  - `RecordingRefSchema = z.object({recordingId: z.string(), poster: z.string()})`; `type RecordingRef`.
  - `encodeRecordingRef(ref): string` (base64 of JSON), `decodeRecordingRef(value: string): RecordingRef | null`.
  - `recordingPoster(entries: ActionLogEntry[]): string` → e.g. `"Screen recording · 12 actions · 42s"`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {RECORDER_MIME, decodeRecordingRef, encodeRecordingRef, recordingPoster} from '../src/shared/protocol.js'

describe('recording ref', () => {
  it('round-trips through base64 JSON', () => {
    const encoded = encodeRecordingRef({recordingId: 'r1', poster: 'Screen recording · 2 actions · 3s'})
    expect(decodeRecordingRef(encoded)).toEqual({recordingId: 'r1', poster: 'Screen recording · 2 actions · 3s'})
  })
  it('returns null for garbage', () => {
    expect(decodeRecordingRef('not-base64-json')).toBeNull()
  })
  it('summarizes actions and duration', () => {
    const poster = recordingPoster([
      {ts: 1000, kind: 'click', detail: 'a'},
      {ts: 43000, kind: 'input', detail: 'b'},
    ])
    expect(poster).toBe('Screen recording · 2 actions · 42s')
  })
  it('exposes the namespaced mime', () => {
    expect(RECORDER_MIME).toBe('application/x-conciv-recorder')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement in `shared/protocol.ts`**

```ts
export const RECORDER_MIME = 'application/x-conciv-recorder'

export const RecordingRefSchema = z.object({recordingId: z.string().min(1), poster: z.string()})
export type RecordingRef = z.infer<typeof RecordingRefSchema>

export function encodeRecordingRef(ref: RecordingRef): string {
  return btoa(JSON.stringify(ref))
}

export function decodeRecordingRef(value: string): RecordingRef | null {
  try {
    const parsed = RecordingRefSchema.safeParse(JSON.parse(atob(value)))
    return parsed.success ? parsed.data : null
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recording ref/mime/poster helpers" -- packages/extensions/recorder/src/shared/protocol.ts packages/extensions/recorder/test/recording-ref.test.ts
```

---

## Task 2: Distill cleanup — drop blocked targets + empty inputs

**Files:**
- Modify: `packages/extensions/recorder/src/server/distill.ts` (`incrementalEntry`)
- Test: `packages/extensions/recorder/test/distill.test.ts` (extend)

**Interfaces:**
- Produces: `distill(events)` omits click/input/scroll entries whose target `id === -1` (blocked/self nodes) and input entries whose `text === ''`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {distill} from '../src/server/distill.js'

const incremental = (data: object): {type: number; data: object; timestamp: number} => ({type: 3, data, timestamp: 1000})

describe('distill cleanup', () => {
  it('drops blocked-target (id -1) clicks', () => {
    expect(distill([incremental({source: 2, type: 2, id: -1})])).toEqual([])
  })
  it('drops empty typed inputs', () => {
    expect(distill([incremental({source: 5, id: 4, text: ''})])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: FAIL — entries emitted.

- [ ] **Step 3: Implement — guard in `incrementalEntry`**

At the top of the click/input/scroll branches in `incrementalEntry`, after each `safeParse` success, skip when blocked or empty:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: PASS (plus existing distill tests still green).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): drop blocked targets and empty inputs from action log" -- packages/extensions/recorder/src/server/distill.ts packages/extensions/recorder/test/distill.test.ts
```

---

## Task 3: Recording store (save/get by id, prune to 50)

**Files:**
- Create: `packages/extensions/recorder/src/server/recordings.ts`
- Test: `packages/extensions/recorder/test/recordings.test.ts`

**Interfaces:**
- Consumes: `RrwebEvent` (existing).
- Produces: `createRecordingStore(dir: string): RecordingStore` where
  `RecordingStore = {save(events: RrwebEvent[]): Promise<string>; get(id: string): Promise<RrwebEvent[] | null>}`.
  `save` writes `<dir>/<id>.json`, mints an id without `Math.random`/`Date.now` collision reliance (use `crypto.randomUUID()`), and prunes to the newest 50 files by mtime.

- [ ] **Step 1: Write the failing test**

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {createRecordingStore} from '../src/server/recordings.js'

const event = (timestamp: number) => ({type: 3, data: {source: 2}, timestamp})

describe('recording store', () => {
  it('saves and gets by id', async () => {
    const store = createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-')))
    const id = await store.save([event(1), event(2)])
    expect(await store.get(id)).toEqual([event(1), event(2)])
  })
  it('returns null for a missing id', async () => {
    const store = createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-')))
    expect(await store.get('nope')).toBeNull()
  })
  it('prunes to the newest 50', async () => {
    const store = createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-')))
    const ids: string[] = []
    for (let index = 0; index < 55; index += 1) ids.push(await store.save([event(index)]))
    expect(await store.get(ids[0])).toBeNull()
    expect(await store.get(ids.at(-1))).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: FAIL — `recordings.js` missing.

- [ ] **Step 3: Implement**

```ts
import {randomUUID} from 'node:crypto'
import {mkdir, readFile, readdir, stat, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {RrwebEventSchema, type RrwebEvent} from '../shared/protocol.js'
import {z} from 'zod'

const StoredRecording = z.object({events: z.array(RrwebEventSchema)})
const MAX_RECORDINGS = 50

export type RecordingStore = {
  save: (events: RrwebEvent[]) => Promise<string>
  get: (id: string) => Promise<RrwebEvent[] | null>
}

async function prune(dir: string): Promise<void> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length <= MAX_RECORDINGS) return
  const withTimes = await Promise.all(
    files.map(async (name) => ({name, mtime: (await stat(join(dir, name))).mtimeMs})),
  )
  const stale = withTimes.toSorted((a, b) => b.mtime - a.mtime).slice(MAX_RECORDINGS)
  await Promise.all(stale.map((entry) => unlink(join(dir, entry.name)).catch(() => {})))
}

export function createRecordingStore(dir: string): RecordingStore {
  return {
    async save(events) {
      await mkdir(dir, {recursive: true})
      const id = randomUUID()
      await writeFile(join(dir, `${id}.json`), JSON.stringify({events}), 'utf8')
      await prune(dir)
      return id
    },
    async get(id) {
      if (!/^[A-Za-z0-9-]+$/.test(id)) return null
      const raw = await readFile(join(dir, `${id}.json`), 'utf8').catch(() => null)
      if (raw === null) return null
      const parsed = StoredRecording.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data.events : null
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): persistent recording store (save/get, prune 50)" -- packages/extensions/recorder/src/server/recordings.ts packages/extensions/recorder/test/recordings.test.ts
```

---

## Task 4: Extract `renderRecording` (shared by pull + expand)

**Files:**
- Modify: `packages/extensions/recorder/src/server/runtime.ts`
- Test: `packages/extensions/recorder/test/runtime.test.ts` (extend)

**Interfaces:**
- Consumes: `distill`, `renderFrames` internals, `recordingParts` (existing).
- Produces: `renderRecording(runtime: RecorderRuntime, events: RrwebEvent[], keyframeCount: number): Promise<ContentPart[]>` — `distill` → filter → frames → `recordingParts(log, frames, keyframeCount>0)`. `pullWindow` is refactored to call it. `RecorderRuntime` gains `recordings: RecordingStore`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {renderRecording} from '../src/server/runtime.js'

describe('renderRecording', () => {
  it('returns a text log part with zero keyframes requested', async () => {
    const runtime = {ring: {}, control: {}, config: {}, renderer: async () => null, recordings: {}} as never
    const parts = await renderRecording(runtime, [{type: 4, data: {href: 'x'}, timestamp: 1}], 0)
    expect(parts.some((part) => part.type === 'text')).toBe(true)
    expect(parts.some((part) => part.type === 'image')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: FAIL — `renderRecording` not exported.

- [ ] **Step 3: Implement — extract and re-point `pullWindow`**

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
  events: ReturnType<EventRing['window']>,
  keyframeCount: number,
): Promise<ContentPart[]> {
  const log = distill(events)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0) as ContentPart[]
}

export async function pullWindow(
  runtime: RecorderRuntime,
  fromTs: number,
  toTs: number,
  keyframeCount: number,
): Promise<unknown> {
  const events = runtime.ring.window({fromTs, toTs})
  const log = distill(events).filter((entry) => entry.ts >= fromTs)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
}
```

(Keep `renderFrames` as-is; `pullWindow` retains its `fromTs` filter, so it does not call `renderRecording` directly — the shared unit is `renderFrames` + `recordingParts`. `renderRecording` is the id-based entry Expand uses.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/recorder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(recorder): renderRecording shared by pull and expand" -- packages/extensions/recorder/src/server/runtime.ts packages/extensions/recorder/test/runtime.test.ts
```

---

## Task 5: Recorder router — `recordings.save` / `recordings.get`

**Files:**
- Modify: `packages/extensions/recorder/src/server.ts`
- Test: `packages/extensions/recorder/test/render.it.test.ts` or a new `recordings-router.test.ts`

**Interfaces:**
- Consumes: `createRecordingStore` (Task 3), the ring window (existing).
- Produces: router handlers
  - `recordings.save` (input `RangeInput`) → `{recordingId: string}` — freezes `ring.window(range)` → `recordings.save(events)`.
  - `recordings.get` (input `{recordingId: string}`) → `{events: RrwebEvent[]} | {expired: true}`.
  Runtime is constructed with `recordings: createRecordingStore(join(server.cwd, '.conciv', 'recorder', 'recordings'))`.

- [ ] **Step 1: Write the failing test**

```ts
// Build the router via makeRecorderRouter(runtime) with an in-memory store stub over a tmp dir;
// call recordings.save({}) then recordings.get({recordingId}) and assert events round-trip;
// call recordings.get({recordingId:'missing'}) → {expired:true}.
```
Use the existing router-construction pattern in `render.it.test.ts` (it already builds a runtime + calls handlers).

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/recorder`) — handlers missing.

- [ ] **Step 3: Implement the handlers + store wiring**

In `makeRecorderRouter`, add:

```ts
recordings: recorderOs.router({
  save: recorderOs
    .input(RangeInput)
    .output(z.object({recordingId: z.string()}))
    .handler(async ({input}) => ({recordingId: await runtime.recordings.save(runtime.ring.window(input))})),
  get: recorderOs
    .input(z.object({recordingId: z.string()}))
    .handler(async ({input}) => {
      const events = await runtime.recordings.get(input.recordingId)
      return events ? {events} : {expired: true as const}
    }),
}),
```

In the `.server()` factory, construct the store and add it to `runtime`:

```ts
const recordings = createRecordingStore(join(server.cwd, '.conciv', 'recorder', 'recordings'))
const runtime: RecorderRuntime = {ring, control, config: server.config, renderer, recordings}
```

Import `join` from `node:path` and `createRecordingStore`.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recordings.save/get router + store wiring" -- packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/recordings-router.test.ts
```

---

## Task 6: Recording attachment — shared def + server Expand

**Files:**
- Create: `packages/extensions/recorder/src/shared/attachment.ts`
- Modify: `packages/extensions/recorder/src/server.ts` (register attachment + expand)
- Test: `packages/extensions/recorder/test/expand.test.ts`

**Interfaces:**
- Consumes: `defineAttachment` (Plan 1 Task 2), `decodeRecordingRef`/`RECORDER_MIME` (Task 1), `renderRecording` + store (Tasks 3–5), `RecorderRuntime` context (existing mount).
- Produces:
  - `recordingAttachment = defineAttachment({mime: RECORDER_MIME})` (shared instance).
  - Server: `recordingAttachment.server((part, ctx) => ContentPart[])` — decode ref from `part.source.value` → `ctx.recorder.recordings.get(recordingId)` → `renderRecording(ctx.recorder, events, 3)`; missing → a single text part `"[recording expired]"`.
  - `attachments: [recordingAttachment]` on the server `defineExtension`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {recordingAttachment} from '../src/shared/attachment.js'
import '../src/server.js' // registers .server(expand) as a side-effect of import order? — see step 3 note

describe('recording expand', () => {
  it('returns text + image parts for a saved recording', async () => {
    const events = [{type: 2, data: {node: {}}, timestamp: 1}, {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2}]
    const ctx = {recorder: {recordings: {get: async () => events}, renderer: async () => null, ring: {}, control: {}, config: {}}}
    const part = {type: 'document', source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: btoa(JSON.stringify({recordingId: 'r1', poster: 'p'}))}}
    const parts = await recordingAttachment.__expand(part, ctx)
    expect(parts.some((p) => p.type === 'text')).toBe(true)
  })

  it('returns an expired text part when the recording is gone', async () => {
    const ctx = {recorder: {recordings: {get: async () => null}}}
    const part = {type: 'document', source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: btoa(JSON.stringify({recordingId: 'x', poster: 'p'}))}}
    const parts = await recordingAttachment.__expand(part, ctx)
    expect(parts).toEqual([{type: 'text', content: '[recording expired]'}])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** — `shared/attachment.js` missing / `__expand` unset.

- [ ] **Step 3: Implement**

Create `shared/attachment.ts`:

```ts
import {defineAttachment} from '@conciv/extension'
import {RECORDER_MIME} from './protocol.js'

export const recordingAttachment = defineAttachment({mime: RECORDER_MIME})
```

In `server.ts`, register the expand near the tool registration (so the server module owns it), and add to the server `defineExtension`:

```ts
import type {DocumentPart} from '@conciv/extension'
import {recordingAttachment} from './shared/attachment.js'
import {decodeRecordingRef} from './shared/protocol.js'
import {renderRecording} from './server/runtime.js'

recordingAttachment.server(async (part: DocumentPart, ctx) => {
  const runtime = (ctx as {recorder: RecorderRuntime}).recorder
  const ref = decodeRecordingRef(part.source.value)
  const events = ref ? await runtime.recordings.get(ref.recordingId) : null
  if (!events) return [{type: 'text', content: '[recording expired]'}]
  return renderRecording(runtime, events, 3)
})

export default defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startTool, stopTool, pullTool],
  attachments: [recordingAttachment],
}).server((server) => { /* …existing, now building `recordings` (Task 5)… */ })
```

Note on the test's import: the `.server(expand)` call runs at module load of `server.ts`; the test imports `server.js` to trigger it. If import-order coupling is undesirable, move the `recordingAttachment.server(...)` call into `shared/attachment.ts`'s **server sibling** file imported by both — but keep the expand out of the client bundle. Preferred: a `server/attachment.ts` module that imports `recordingAttachment` and calls `.server(...)`, imported by `server.ts`; the test imports `server/attachment.js` directly.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): recording attachment expand (keyframes + log)" -- packages/extensions/recorder/src/shared/attachment.ts packages/extensions/recorder/src/server/attachment.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/expand.test.ts
```

---

## Task 7: Extract the shared rrweb player module

**Files:**
- Create: `packages/extensions/recorder/src/client/player.ts`
- Modify: `packages/extensions/recorder/src/client/panel-view.tsx` (import from the new module)
- Test: existing `panel-view` render IT must stay green (no behavior change).

**Interfaces:**
- Produces: `mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void` plus the internal helpers it needs (`playerSize`, `recordedAspect`, `skipIdlePlayback`, `styleScope`, `demoteInjectedStyles`, the `playerEvents` schema, the CSS imports). Panel-view imports `mountPlayer` from here.

- [ ] **Step 1:** Move `mountPlayer` and its helpers + the three CSS `?inline` imports from `panel-view.tsx` into `client/player.ts` verbatim; export `mountPlayer`. Panel-view imports `{mountPlayer}` and deletes the moved code.
- [ ] **Step 2: Run** the recorder render IT: `pnpm turbo run test --filter=@conciv/recorder` — Expected: PASS (unchanged behavior).
- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(recorder): extract shared rrweb player module" -- packages/extensions/recorder/src/client/player.ts packages/extensions/recorder/src/client/panel-view.tsx
```

---

## Task 8: `RecordingCard` — replayable card for composer + thread

**Files:**
- Create: `packages/extensions/recorder/src/client/recording-card.tsx`
- Modify: `packages/extensions/recorder/src/client.tsx` (register card)
- Test: `packages/extensions/recorder/test/recording-card.it.test.ts` (real browser)

**Interfaces:**
- Consumes: `useAttachment()` (via being rendered inside `AttachmentByMime`), `decodeRecordingRef` (Task 1), recorder rpc `recordings.get` (Task 5), `mountPlayer` (Task 7), `getHostApi`/`makeExtRpcClient` (existing).
- Produces: `RecordingCard()` component; `recordingAttachment.card(RecordingCard)` registered in `client.tsx`.

- [ ] **Step 1: Write the failing test** (real browser): render `RecordingCard` inside an `AttachmentProvider` whose attachment carries a document part with a valid ref; stub the recorder rpc to return 2 events; assert a player mounts. Then a ref whose `recordings.get` returns `{expired:true}` → assert the expired state renders with a message.

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/recorder`).

- [ ] **Step 3: Implement `RecordingCard`**

```tsx
import {Show, createResource, onCleanup, type JSX} from 'solid-js'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {useAttachment} from '@conciv/ui-kit-chat'
import {RECORDER_NAME, decodeRecordingRef, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {mountPlayer} from './player.js'

function refOf(attachment: ReturnType<typeof useAttachment>): {recordingId: string; poster: string} | null {
  if ('content' in attachment)
    for (const part of attachment.content) if (part.type === 'document') return decodeRecordingRef(part.source.value)
  return null
}

export function RecordingCard(): JSX.Element {
  const attachment = useAttachment()
  const host = getHostApi()
  const rpc = makeExtRpcClient<RecorderRouter>(host.useApiBase(), RECORDER_NAME)
  const ref = refOf(attachment)
  const [recording] = createResource(async () => (ref ? rpc.recordings.get({recordingId: ref.recordingId}) : null))
  const play = (events: RrwebEvent[]) => (container: HTMLDivElement) => {
    if (events.length < 2) return
    onCleanup(mountPlayer(container, events, () => true))
  }
  return (
    <div class="rounded-[var(--chat-radius-md)] border border-pw-line overflow-hidden min-w-[220px]">
      <Show when={recording()} fallback={<div class="p-2 text-pw-text-2 text-[0.8125rem]">{ref?.poster ?? 'Recording'}</div>}>
        {(data) => (
          <Show when={'events' in data()} fallback={<div class="p-2 text-pw-text-2 text-[0.8125rem]">Recording expired</div>}>
            <div ref={play((data() as {events: RrwebEvent[]}).events)} class="w-full" />
          </Show>
        )}
      </Show>
    </div>
  )
}
```

- [ ] **Step 4: Register the card in `client.tsx`**

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

- [ ] **Step 5: Run — Expected: PASS.**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(recorder): replayable recording card (loading/expired/play)" -- packages/extensions/recorder/src/client/recording-card.tsx packages/extensions/recorder/src/client.tsx packages/extensions/recorder/test/recording-card.it.test.ts
```

---

## Task 9: `sendToAgent` — save + attach the recording

**Files:**
- Modify: `packages/extensions/recorder/src/client/panel-view.tsx` (`sendToAgent`)
- Test: `packages/extensions/recorder/test/extension.it.test.ts` (extend)

**Interfaces:**
- Consumes: recorder rpc `recordings.save` (Task 5), `encodeRecordingRef`/`recordingPoster`/`RECORDER_MIME` (Task 1), `host.attach(file: File)` (existing, unchanged).
- Produces: pressing "Send to agent" saves the current window and attaches a File of `RECORDER_MIME` whose contents are the encoded ref; then leaves the view.

- [ ] **Step 1: Write the failing test** (real browser IT): open the recorder panel with events present; click "Send to agent"; assert a `RECORDER_MIME` attachment appears in the composer (the recording card), and the previous `.txt` attachment path is gone.

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run build --filter=@conciv/embed` then `pnpm turbo run test --filter=@conciv/recorder`).

- [ ] **Step 3: Implement**

Replace `sendToAgent`:

```ts
const save = useMutation(() => utils.recordings.save.mutationOptions())

const sendToAgent = async (): Promise<void> => {
  const entries = log.data?.entries ?? []
  const {recordingId} = await save.mutateAsync({})
  const ref = encodeRecordingRef({recordingId, poster: recordingPoster(entries)})
  attach(new File([ref], 'Screen recording', {type: RECORDER_MIME}))
  leaveView()
}
```

Wire the button to `() => void sendToAgent()`. Import `encodeRecordingRef`, `recordingPoster`, `RECORDER_MIME`.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recorder): send-to-agent saves + attaches the recording" -- packages/extensions/recorder/src/client/panel-view.tsx packages/extensions/recorder/test/extension.it.test.ts
```

---

## Task 10: End-to-end recorder attachment IT + gates

**Files:**
- Test: `packages/extensions/recorder/test/recording-attachment.it.test.ts` (real browser, prebuilt embed)

- [ ] **Step 1: Write the failing test:** boot the widget with the recorder; produce a short recording; "Send to agent" → assert the player card shows in the **composer**; send → assert the card shows in the **transcript**; reload the page → assert the card still shows (durable history); assert the model-facing turn is not visible as raw text (no keyframe tiles, no log text bubble). Use `browser.newPage()`, `domcontentloaded`.
- [ ] **Step 2: Run — Expected: FAIL** first, then implement any gaps in the responsible task's files.
- [ ] **Step 3: Run — Expected: PASS.**
- [ ] **Step 4: Gates:** `pnpm typecheck` (clean); `pnpm turbo run test --force` (all pass); `pnpm exec fallow audit --changed-since main --format json` (fix INTRODUCED — confirm the old `.txt` `sendToAgent` code and any now-unused distill helpers are gone).
- [ ] **Step 5: Commit**

```bash
git commit -m "test(recorder): end-to-end recording attachment (compose/send/reload)" -- packages/extensions/recorder/test/recording-attachment.it.test.ts
```

---

## Self-Review

**Spec coverage (recorder section of the design):**
- `recordings.save`/`get` by id, disk, prune 50 → Tasks 3, 5. Expand = keyframes + log via `renderRecording` → Tasks 4, 6. Card (composer + thread, fetch by id → player, expired/error states) → Task 8. Player extraction to shared module → Task 7. `sendToAgent` saves + `host.attach` (no `.txt`) → Task 9. Distill cleanup (`id===-1`, empty `""`) → Task 2. Mime/ref/poster → Task 1. End-to-end incl. reload durability → Task 10. Grab migration → explicitly a **separate** plan (not here).

**Placeholder scan:** Tasks 5/8/9/10 Step 1 describe test setup rather than pasting full harness boilerplate, because they extend existing IT harnesses (`render.it.test.ts`, `extension.it.test.ts`) the implementer must read; all product-code steps carry complete code. Task 6 documents an import-order caveat with a concrete resolution (a `server/attachment.ts` sibling) — not a TBD.

**Type consistency:** `RecordingRef{recordingId, poster}` defined Task 1, consumed Tasks 6/8/9. `RecordingStore{save,get}` defined Task 3, consumed Tasks 4/5/6. `renderRecording(runtime, events, keyframeCount) → ContentPart[]` defined Task 4, consumed Task 6. `recordingAttachment` shared instance defined Task 6 (`shared/attachment.ts`), `.card` set Task 8, `.server` set Task 6 — one instance, two faces, matches Plan 1's collector expectations (`__card` client, `__expand` server). `RECORDER_MIME` constant used identically across Tasks 1/6/8/9 and Plan 1's `createDocumentAttachmentAdapter(entry.mime)`.
