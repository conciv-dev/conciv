# Recorder Resource Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound every growth path in the always-on recorder — client queue, server ring, capture lifecycle, renderer — so no tab, session, or dead server can bloat the user's machine.

**Architecture:** Cap and chunk the client flush pipeline (the audit's scariest path: today a dead dev server accumulates ~100–250MB/hour of tab heap in an unbounded queue, then fires it as one giant POST). Key server rings per client so tabs stop mixing into one timeline and evicting each other. Shrink and de-quadratic the ring itself. Pause capture on hidden tabs, expire orphaned live captures, and bound console payloads.

**Tech Stack:** TypeScript (strict), rrweb, oRPC, zod, Vitest (node), `@conciv/extension-testkit`, turbo.

**Plan 3 of 3.** Independent of Plans 1–2 except one touchpoint: Task 3 changes `ring.window` call sites, which includes Plan 2's `recordings.save` handler (one-line adaptation, called out in Task 3). Findings referenced as (B1..M4) come from the resource audit.

**Rev 2 changes** (deviation-proofing review against the live tree, 2026-07-18): Task 3's interface no longer lists `activeClientId` (the draft declared it, the implementation omitted it, nothing consumes it — dropped); `createCaptureControl`'s parameter is pinned to the structural `{onAppend, lastTs}` subset both `EventRing` and `ClientRings` satisfy; Task 7's renderer memo is extracted to `src/server/renderer-cache.ts` with an **injected** create factory — the rev-1 test said "stub `createChromiumRenderer`", but the memo lived inside `server.ts`'s `.server()` closure where no test can reach it, and module-stubbing is banned; the extraction makes it real-DI-testable. Verified against the tree: current `flusher.ts` surface (`push/setLive/flushNow/dispose`) and its four existing tests survive the interval→self-rescheduling-timeout rewrite unchanged (the retry test's 1000ms advance matches `BACKOFF_START_MS`); `boot.ts` has the exact integration points Task 5 cites (`stopRecord`/`flusher`/`rpc.config`/`startCapture`/`store.setStatus('failed')`/`offListeners`), and the existing `visibilitychange` flush listener stays alongside the new pauser; `capture-control.ts` already takes an injectable `now()` — Task 6's TTL must use it so fake-timer tests hold; `ring.ts` matches Task 4's description exactly (`snapshotIndex` reduce falling back to 0, full re-sort append, 64MB default).

## Global Constraints

- Functions, not classes. No IIFEs. Zero comments. Strict TS, no casts/non-null. oxfmt defaults.
- Build/typecheck/test via turbo; filter is `@conciv/extension-recorder`.
- Real-browser coverage via `@conciv/extension-testkit` `getExtensionTestApi` only; unit tests node vitest.
- v0, no shims. Commit with pathspec; `prek` lock race → `pnpm format` + `--no-verify`.

**New bounds (constants, exact values):** client queue cap `MAX_QUEUE_BYTES = 8MB` (drop-oldest, always keep the newest full snapshot); drain chunk `MAX_POST_BYTES = 1MB`; send backoff `1s → 2s → 4s → … max 30s`; server flush input cap `MAX_FLUSH_EVENTS = 5000` events and `MAX_FLUSH_BYTES = 8MB` serialized; ring default `maxBytes 16MB` (was 64MB); per-client rings, idle-evicted after `CLIENT_RING_IDLE_MS = 30min`; live-capture TTL `CAPTURE_TTL_MS = 10min`; console `stringLengthLimit: 5000`; hidden-tab pause grace `HIDDEN_PAUSE_MS = 30s`.

---

## File Structure

- `src/client/flusher.ts` — byte-capped queue, chunked drain, backoff (B1).
- `src/client/boot.ts` — visibility pause/resume wiring (M2).
- `src/client/capture.ts` — console `stringLengthLimit` (minor).
- `src/server/ring.ts` — 16MB default, append without full re-sort, `window()` no-anchor fix (M1).
- `src/server/rings.ts` — **new**: per-client ring registry with idle eviction + most-recent-active default (B2).
- `src/server/capture-control.ts` — capture TTL (M3).
- `src/server/renderer-cache.ts` — **new**: injectable-factory renderer memo with idle-dispose + crash-relaunch (minor).
- `src/server.ts` — flush input caps (B1), rings wiring, `turnEnd` clears live (M3), consumes `createRendererCache`.
- `src/server/runtime.ts` — `RecorderRuntime.rings` replaces bare `ring`.

---

## Task 1: Flusher — cap, chunk, back off (audit B1, the scariest path)

**Files:**

- Modify: `src/client/flusher.ts`
- Test: `test/flusher.test.ts` (extend)

**Interfaces:**

- Produces: same `Flusher` surface (`push/setLive/flushNow/dispose`) with new behavior:
  - queue capped at `MAX_QUEUE_BYTES` (8MB, `JSON.stringify(event).length` accounting); overflow drops oldest events but never the newest type-2 snapshot or anything after it;
  - `drain` sends ≤ `MAX_POST_BYTES` (1MB) per POST, looping until empty;
  - a failed send re-queues (still under the cap) and starts exponential backoff (1s doubling to 30s) instead of the fixed interval; a successful send resets cadence.

- [ ] **Step 1: Write the failing tests**

```ts
import {describe, expect, it, vi} from 'vitest'
import {createFlusher} from '../src/client/flusher.js'

const bigEvent = (timestamp: number, bytes: number, type = 3) => ({
  type,
  data: {blob: 'x'.repeat(bytes)},
  timestamp,
})

describe('flusher bounds', () => {
  it('drops oldest events past the byte cap but keeps the newest snapshot onward', async () => {
    const sent: unknown[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events)})
    flusher.push(bigEvent(1, 5 * 1024 * 1024))
    flusher.push(bigEvent(2, 1024, 2))
    flusher.push(bigEvent(3, 5 * 1024 * 1024))
    await flusher.flushNow()
    const flat = sent.flat()
    expect(flat.some((event) => (event as {timestamp: number}).timestamp === 1)).toBe(false)
    expect(flat.some((event) => (event as {timestamp: number}).timestamp === 2)).toBe(true)
    expect(flat.some((event) => (event as {timestamp: number}).timestamp === 3)).toBe(true)
  })

  it('chunks a large queue into multiple sends', async () => {
    const sizes: number[] = []
    const flusher = createFlusher({send: async (events) => void sizes.push(events.length)})
    for (let index = 0; index < 6; index += 1) flusher.push(bigEvent(index, 400 * 1024))
    await flusher.flushNow()
    expect(sizes.length).toBeGreaterThan(1)
  })

  it('backs off after a failed send and recovers', async () => {
    vi.useFakeTimers()
    const outcomes = [Promise.reject(new Error('down')), Promise.resolve()]
    const attempts: number[] = []
    const flusher = createFlusher({
      send: (events) => {
        attempts.push(events.length)
        return outcomes.shift() ?? Promise.resolve()
      },
    })
    flusher.push(bigEvent(1, 10))
    await flusher.flushNow().catch(() => {})
    expect(attempts.length).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts.length).toBe(2)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/extension-recorder`).

- [ ] **Step 3: Implement**

```ts
import type {RrwebEvent} from '../shared/protocol.js'

export type Flusher = {
  push(event: RrwebEvent): void
  setLive(live: boolean): void
  flushNow(): Promise<void>
  dispose(): void
}

const MAX_QUEUE_BYTES = 8 * 1024 * 1024
const MAX_POST_BYTES = 1024 * 1024
const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 30_000

type Queued = {event: RrwebEvent; bytes: number}

export function createFlusher(opts: {
  send: (events: RrwebEvent[]) => Promise<void>
  idleMs?: number
  liveMs?: number
}): Flusher {
  const idleMs = opts.idleMs ?? 5000
  const liveMs = opts.liveMs ?? 200
  let queue: Queued[] = []
  let queueBytes = 0
  let cadenceMs = idleMs
  let backoffMs = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let draining = false

  const enqueue = (event: RrwebEvent): void => {
    const bytes = JSON.stringify(event).length
    queue.push({event, bytes})
    queueBytes += bytes
    if (queueBytes <= MAX_QUEUE_BYTES) return
    const lastSnapshot = queue.findLastIndex((item) => item.event.type === 2)
    let dropTo = 0
    while (queueBytes > MAX_QUEUE_BYTES && dropTo < queue.length - 1 && dropTo < lastSnapshot) {
      const head = queue[dropTo]
      if (!head) break
      queueBytes -= head.bytes
      dropTo += 1
    }
    while (queueBytes > MAX_QUEUE_BYTES && dropTo < queue.length - 1 && lastSnapshot === -1) {
      const head = queue[dropTo]
      if (!head) break
      queueBytes -= head.bytes
      dropTo += 1
    }
    if (dropTo > 0) queue = queue.slice(dropTo)
  }

  const takeChunk = (): Queued[] => {
    const chunk: Queued[] = []
    let chunkBytes = 0
    while (queue.length > 0) {
      const head = queue[0]
      if (!head) break
      if (chunk.length > 0 && chunkBytes + head.bytes > MAX_POST_BYTES) break
      chunk.push(head)
      chunkBytes += head.bytes
      queue = queue.slice(1)
      queueBytes -= head.bytes
    }
    return chunk
  }

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (queue.length > 0) {
        const chunk = takeChunk()
        try {
          await opts.send(chunk.map((item) => item.event))
          backoffMs = 0
        } catch {
          queue = [...chunk, ...queue]
          for (const item of chunk) queueBytes += item.bytes
          backoffMs = backoffMs === 0 ? BACKOFF_START_MS : Math.min(backoffMs * 2, BACKOFF_MAX_MS)
          return
        }
      }
    } finally {
      draining = false
      schedule()
    }
  }

  const schedule = (): void => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void drain(), backoffMs > 0 ? backoffMs : cadenceMs)
  }

  schedule()

  return {
    push(event) {
      if (!disposed) enqueue(event)
    },
    setLive(live) {
      cadenceMs = live ? liveMs : idleMs
      schedule()
    },
    flushNow: drain,
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      void drain()
    },
  }
}
```

(Note the interval→self-rescheduling-timeout change: backoff needs a variable delay. `dispose` fires one last best-effort drain, as today. The re-queue on failure re-enters through `enqueue`'s cap indirectly — bytes are re-added and the next `push` re-trims; that keeps failure paths capped.)

- [ ] **Step 4: Run — Expected: PASS** (existing flusher tests may need the interval→timeout timing updated — adjust them to `advanceTimersByTimeAsync`, don't loosen assertions).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): cap, chunk, and back off the client flush queue" -- packages/extensions/recorder/src/client/flusher.ts packages/extensions/recorder/test/flusher.test.ts
```

---

## Task 2: Server flush input caps (audit B1, server leg)

**Files:**

- Modify: `src/server.ts` (`flush` handler input)
- Test: `test/recordings-router.test.ts` or new `test/flush-caps.test.ts`

**Interfaces:**

- Produces: `flush` input rejects `> MAX_FLUSH_EVENTS` (5000) events or `> MAX_FLUSH_BYTES` (8MB) serialized payload with a zod error — a misbehaving/legacy client can no longer land a giant `JSON.parse` on the server.

- [ ] **Step 1: Write the failing test** — call the `flush` handler (same `call` pattern as Plan 2 Task 5) with 5001 tiny events → expect a thrown validation error; with 10 events → ok.

- [ ] **Step 2: Run — Expected: FAIL** (currently accepted).

- [ ] **Step 3: Implement**

```ts
const MAX_FLUSH_EVENTS = 5000
const MAX_FLUSH_BYTES = 8 * 1024 * 1024

const FlushInput = z
  .object({clientId: z.string().min(1).max(128), events: z.array(RrwebEventSchema).max(MAX_FLUSH_EVENTS)})
  .refine((input) => JSON.stringify(input.events).length <= MAX_FLUSH_BYTES)
```

Use `FlushInput` in the `flush` route.

- [ ] **Step 4: Run — Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): cap flush payloads server-side" -- packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/flush-caps.test.ts
```

---

## Task 3: Per-client rings (audit B2 — tabs stop mixing)

**Files:**

- Create: `src/server/rings.ts`
- Modify: `src/server/runtime.ts` (`RecorderRuntime.rings` replaces `ring`), `src/server.ts` (all `runtime.ring.*` call sites incl. Plan 2's `recordings.save`), `src/server/capture-control.ts` (constructor takes rings), `src/tool/server.ts` (`pullWindow` call sites)
- Test: `test/rings.test.ts`

**Interfaces:**

- Produces:
  - `createClientRings(opts: {windowMs: number; maxBytes?: number}): ClientRings` with
    `append(clientId, events)`, `window(range?, clientId?)`, `lastTs()`, `clear()`, `onAppend(listener)`. (No `activeClientId` accessor — nothing consumes it; the most-recent-active default is internal. Rev note: an earlier draft listed it while the implementation omitted it — resolved by dropping it.)
  - `createCaptureControl`'s first parameter retypes to the structural subset it actually uses — `{onAppend(listener: (lastTs: number) => void): () => void; lastTs(): number}` — satisfied by both `EventRing` and `ClientRings`, so the control needs no other change.
  - One `EventRing` per clientId, created on first append, evicted after `CLIENT_RING_IDLE_MS` (30min) without appends (sweep piggybacks on `append`).
  - `window`/`lastTs` with no explicit clientId read the **most-recently-active** client — panel, tools, and `recordings.save` keep their current call shapes (`window(input)` just works, now single-tab-clean).
  - `onAppend` aggregates across rings (capture-control's `awaitNextAppend` keeps working).
  - Total-memory note: per-ring `maxBytes` becomes 16MB (Task 4), and idle eviction bounds ring count; worst case N active tabs × 16MB, down from all tabs sharing-and-thrashing one 64MB ring.

- [ ] **Step 1: Write the failing tests**

```ts
import {describe, expect, it} from 'vitest'
import {createClientRings} from '../src/server/rings.js'

const event = (timestamp: number) => ({type: 3, data: {}, timestamp})

describe('per-client rings', () => {
  it('separates clients and defaults to the most recently active', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('tab-a', [event(1)])
    rings.append('tab-b', [event(2)])
    expect(rings.window()).toEqual([event(2)])
    expect(rings.window({}, 'tab-a')).toEqual([event(1)])
    rings.append('tab-a', [event(3)])
    expect(rings.window()).toEqual([event(1), event(3)])
  })

  it('aggregates onAppend across clients', () => {
    const rings = createClientRings({windowMs: 60_000})
    const seen: number[] = []
    rings.onAppend((lastTs) => seen.push(lastTs))
    rings.append('a', [event(5)])
    rings.append('b', [event(9)])
    expect(seen).toEqual([5, 9])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement**

```ts
import {createEventRing, type EventRing} from './ring.js'
import type {RrwebEvent} from '../shared/protocol.js'

const CLIENT_RING_IDLE_MS = 30 * 60 * 1000

export type ClientRings = {
  append(clientId: string, events: RrwebEvent[]): void
  window(range?: {fromTs?: number; toTs?: number}, clientId?: string): RrwebEvent[]
  lastTs(): number
  clear(): void
  onAppend(listener: (lastTs: number) => void): () => void
}

type Entry = {ring: EventRing; touchedAt: number; unsubscribe: () => void}

export function createClientRings(opts: {windowMs: number; maxBytes?: number}): ClientRings {
  const entries = new Map<string, Entry>()
  const listeners = new Set<(lastTs: number) => void>()
  let active: string | null = null

  const sweep = (): void => {
    const cutoff = Date.now() - CLIENT_RING_IDLE_MS
    for (const [clientId, entry] of entries) {
      if (entry.touchedAt >= cutoff || clientId === active) continue
      entry.unsubscribe()
      entries.delete(clientId)
    }
  }

  const entryFor = (clientId: string): Entry => {
    const existing = entries.get(clientId)
    if (existing) return existing
    const ring = createEventRing(opts)
    const unsubscribe = ring.onAppend((lastTs) => {
      for (const listener of listeners) listener(lastTs)
    })
    const created = {ring, touchedAt: Date.now(), unsubscribe}
    entries.set(clientId, created)
    return created
  }

  const resolve = (clientId?: string): EventRing | null => {
    const key = clientId ?? active
    return key ? (entries.get(key)?.ring ?? null) : null
  }

  return {
    append(clientId, events) {
      const entry = entryFor(clientId)
      entry.touchedAt = Date.now()
      active = clientId
      entry.ring.append(clientId, events)
      sweep()
    },
    window: (range = {}, clientId) => resolve(clientId)?.window(range) ?? [],
    lastTs: () => resolve()?.lastTs() ?? 0,
    clear() {
      for (const entry of entries.values()) entry.unsubscribe()
      entries.clear()
      active = null
    },
    onAppend(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

- [ ] **Step 4: Re-point call sites** — `RecorderRuntime.rings: ClientRings` (rename field from `ring`); `server.ts` construct via `createClientRings({windowMs: server.config.windowMinutes * 60_000})`; `flush` → `runtime.rings.append`; `window`/`log`/`recordings.save` → `runtime.rings.window(input)`; `reset` → `runtime.rings.clear()`; `createCaptureControl(rings)` — its `awaitNextAppend` uses `onAppend`, unchanged shape (check `capture-control.ts` constructor param type). `pullWindow` (`runtime.ts` + `tool/server.ts`) reads `runtime.rings.window({fromTs, toTs})`.

- [ ] **Step 5: Run — Expected: PASS** across the package (`pnpm turbo run test --filter=@conciv/extension-recorder`) + typecheck.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix(recorder): per-client event rings with idle eviction" -- packages/extensions/recorder/src/server/rings.ts packages/extensions/recorder/src/server/runtime.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/src/server/capture-control.ts packages/extensions/recorder/src/tool/server.ts packages/extensions/recorder/test/rings.test.ts
```

---

## Task 4: Ring internals — smaller, linear, anchored (audit M1)

**Files:**

- Modify: `src/server/ring.ts`
- Test: `test/ring.test.ts` (extend)

**Interfaces:**

- Produces: `DEFAULT_MAX_BYTES = 16MB` (was 64MB); `append` inserts near-sorted input without re-sorting the whole array; `window({fromTs})` with **no snapshot at-or-before `fromTs`** anchors at the **first snapshot after** it (returns `[]` if none) instead of silently returning the entire ring.

- [ ] **Step 1: Write the failing tests**

```ts
it('anchors at the next snapshot when none precedes fromTs, instead of returning everything', () => {
  const ring = createEventRing({windowMs: 600_000})
  ring.append('c', [incremental(1), incremental(2), snapshot(5), incremental(6)])
  expect(ring.window({fromTs: 3})).toEqual([snapshot(5), incremental(6)])
})

it('returns empty when no snapshot exists at all for a bounded window', () => {
  const ring = createEventRing({windowMs: 600_000})
  ring.append('c', [incremental(1), incremental(2)])
  expect(ring.window({fromTs: 3})).toEqual([])
})
```

(Reuse the test file's existing `snapshot`/`incremental` fixtures; add them if absent: `snapshot = (ts) => ({type: 2, data: {node: {}}, timestamp: ts})`.)

- [ ] **Step 2: Run — Expected: FAIL** — current `snapshotIndex` reduce falls back to 0.

- [ ] **Step 3: Implement** — in `window()`:

```ts
const anchored = inTail.findLastIndex((item) => item.event.type === 2 && item.event.timestamp <= fromTs)
if (anchored >= 0) return inTail.slice(anchored).map((item) => item.event)
if (fromTs === Number.NEGATIVE_INFINITY) return inTail.map((item) => item.event)
const next = inTail.findIndex((item) => item.event.type === 2 && item.event.timestamp > fromTs)
return next >= 0 ? inTail.slice(next).map((item) => item.event) : []
```

In `append`, replace `[...stored, ...incoming].toSorted(...)` with: sort only `incoming`, then merge — if `incoming[0].timestamp >= stored.at(-1).timestamp` it's a pure tail append (`stored = [...stored, ...incoming]`, the common case), else fall back to the full sort (rare out-of-order delivery). Change `DEFAULT_MAX_BYTES` to `16 * 1024 * 1024`.

- [ ] **Step 4: Run — Expected: PASS** (existing ring tests must stay green — eviction logic untouched).
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): smaller ring default, linear append, snapshot-anchored windows" -- packages/extensions/recorder/src/server/ring.ts packages/extensions/recorder/test/ring.test.ts
```

---

## Task 5: Pause capture on hidden tabs (audit M2)

**Files:**

- Modify: `src/client/boot.ts`
- Test: `test/hidden-pause.it.test.ts` (testkit — drive `page.evaluate` visibility emulation) or extend `capture.it.test.ts`

**Interfaces:**

- Produces: after `HIDDEN_PAUSE_MS` (30s) hidden, `stopRecord()` runs and the flusher drains once; on visibility regained, capture restarts with `takeFreshSnapshot()` semantics (a fresh `startCapture` emits a new full snapshot). The existing `visibilitychange` flush listener stays.

- [ ] **Step 1: Write the failing test** — in the testkit page, override `document.visibilityState`/dispatch `visibilitychange` (CDP `Page.setWebLifecycleState` or a property-defineProperty shim), advance 30s, assert no further `flush` rpc traffic while hidden and that events resume (new snapshot arrives) after visibility returns. If CDP emulation proves flaky in the harness, downgrade to a unit test by extracting the pause logic into a pure `createVisibilityPauser(callbacks)` helper and browser-test only the resume snapshot.

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement** — in `bootRecorder`:

```ts
const HIDDEN_PAUSE_MS = 30_000
let hiddenTimer: ReturnType<typeof setTimeout> | undefined
let paused = false

const pauseWhenHidden = (): void => {
  if (document.visibilityState === 'hidden') {
    hiddenTimer = setTimeout(() => {
      paused = true
      stopRecord?.()
      stopRecord = undefined
      void flusher?.flushNow()
    }, HIDDEN_PAUSE_MS)
    return
  }
  if (hiddenTimer) clearTimeout(hiddenTimer)
  if (!paused) return
  paused = false
  void rpc
    .config(undefined)
    .then((config) => {
      stopRecord = startCapture(config, (event) => flusher?.push(event))
    })
    .catch(() => store.setStatus('failed'))
}

document.addEventListener('visibilitychange', pauseWhenHidden)
offListeners.push(() => {
  if (hiddenTimer) clearTimeout(hiddenTimer)
  document.removeEventListener('visibilitychange', pauseWhenHidden)
})
```

- [ ] **Step 4: Run — Expected: PASS** (plus existing capture ITs stay green — they run visible).
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): pause capture on hidden tabs, resume with fresh snapshot" -- packages/extensions/recorder/src/client/boot.ts packages/extensions/recorder/test/hidden-pause.it.test.ts
```

---

## Task 6: Live-capture TTL + turnEnd release (audit M3)

**Files:**

- Modify: `src/server/capture-control.ts`, `src/server.ts` (`turnEnd`)
- Test: `test/capture-control.test.ts` (extend)

**Interfaces:**

- Produces: a capture started by `recording_start` auto-expires after `CAPTURE_TTL_MS` (10min): it is removed from the active set and, when it was the last live capture, `{live:false}` is broadcast; `stopCapture` after expiry returns null (existing "no active capture" tool error covers messaging). The extension's `ServerResult` gains `turnEnd: () => releaseAllCaptures()` — a crashed agent turn stops 5Hz flushing at turn end, not at dev-server restart. Timer is `unref`'d and cleared in `dispose`.

- [ ] **Step 1: Write the failing test** (fake timers): `startCapture()` → advance 10min → `stopCapture(captureId)` returns null and a `{live:false}` control message was emitted; also `releaseAllCaptures()` empties actives and emits `{live:false}` once.

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement** — in `createCaptureControl`: store `expiresAt = Date.now() + CAPTURE_TTL_MS` per capture; a single `setInterval` sweep (30s, `unref()`), on expiry delete + emit `{live:false}` when actives is empty; expose `releaseAllCaptures()`; clear the interval in a `dispose()` composed into the extension's dispose. In `server.ts` return `turnEnd: () => control.releaseAllCaptures()` alongside the existing router/context.

- [ ] **Step 4: Run — Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): TTL live captures + release on turn end" -- packages/extensions/recorder/src/server/capture-control.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/test/capture-control.test.ts
```

---

## Task 7: Console payload bound + renderer lifecycle (audit minors)

**Files:**

- Modify: `src/client/capture.ts` (console plugin options)
- Create: `src/server/renderer-cache.ts` (extracted so the relaunch logic is unit-testable via injected factory — the memo currently lives inside `server.ts`'s `.server()` closure where no test can reach it; injection is DI through the real seam, NOT module stubbing)
- Modify: `src/server.ts` (consume `createRendererCache`)
- Test: `test/renderer-cache.test.ts` (new)

**Interfaces:**

- Produces:
  - console plugin gains `stringifyOptions: {stringLengthLimit: 5000}` (one looping `console.error(hugeString)` can no longer produce 200 × unbounded events).
  - renderer: after `RENDERER_IDLE_MS = 5min` without a render, the cached browser is disposed and the cache slot cleared (next pull relaunches); a renderer whose launch resolved `null` (crash/missing playwright) is retried on next use instead of caching the dead result forever.

- [ ] **Step 1: Write the failing test** — `test/renderer-cache.test.ts`, fake timers, **injected** factory (no module stubbing):

```ts
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRendererCache} from '../src/server/renderer-cache.js'
import type {KeyframeRenderer} from '../src/server/render.js'

const fakeRenderer = (): KeyframeRenderer => ({render: async () => [], dispose: async () => {}})

describe('renderer cache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries after a null (crashed/missing) launch instead of caching it forever', async () => {
    const launches: (KeyframeRenderer | null)[] = [null, fakeRenderer()]
    const cache = createRendererCache(async () => launches.shift() ?? null)
    expect(await cache.get()).toBeNull()
    expect(await cache.get()).not.toBeNull()
  })

  it('reuses a live renderer, disposes it after idle, relaunches on next use', async () => {
    let launched = 0
    const cache = createRendererCache(async () => {
      launched += 1
      return fakeRenderer()
    })
    await cache.get()
    await cache.get()
    expect(launched).toBe(1)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)
    await cache.get()
    expect(launched).toBe(2)
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (module missing; today `rendererState.value ??=` in `server.ts` caches the null-resolving promise permanently).

- [ ] **Step 3: Implement** — `src/server/renderer-cache.ts`:

```ts
import type {KeyframeRenderer} from './render.js'

const RENDERER_IDLE_MS = 5 * 60 * 1000

export type RendererCache = {get(): Promise<KeyframeRenderer | null>; dispose(): Promise<void>}

export function createRendererCache(create: () => Promise<KeyframeRenderer | null>): RendererCache {
  const state: {value?: Promise<KeyframeRenderer | null>; idleTimer?: ReturnType<typeof setTimeout>} = {}

  const dispose = async (): Promise<void> => {
    if (state.idleTimer) clearTimeout(state.idleTimer)
    const active = await state.value?.catch(() => null)
    state.value = undefined
    await active?.dispose()
  }

  return {
    get() {
      if (state.idleTimer) clearTimeout(state.idleTimer)
      state.idleTimer = setTimeout(() => void dispose(), RENDERER_IDLE_MS)
      state.idleTimer.unref?.()
      state.value ??= create().then((created) => {
        if (!created) state.value = undefined
        return created
      })
      return state.value
    },
    dispose,
  }
}
```

In `server.ts`: `const rendererCache = createRendererCache(createChromiumRenderer)`; `renderer: () => rendererCache.get()` on the runtime; extension `dispose` awaits `rendererCache.dispose()` (replacing the inline `rendererState` block). In `capture.ts` add `stringifyOptions: {stringLengthLimit: 5000}` to `getRecordConsolePlugin`.

- [ ] **Step 4: Run — Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "fix(recorder): bound console payloads, renderer idle-dispose + relaunch" -- packages/extensions/recorder/src/client/capture.ts packages/extensions/recorder/src/server.ts packages/extensions/recorder/src/server/renderer-cache.ts packages/extensions/recorder/test/renderer-cache.test.ts
```

---

## Task 8: Gates

- [ ] **Step 1:** `pnpm typecheck`; `pnpm turbo run test --force` — all green.
- [ ] **Step 2:** `pnpm exec fallow audit --changed-since main --format json` — fix INTRODUCED (confirm no orphaned `ring` exports after the rings rename).
- [ ] **Step 3:** Testkit smoke: `pnpm turbo run test --filter=@conciv/extension-recorder` full IT suite green (capture, extension, render, plus new hidden-pause).
- [ ] **Step 4: Commit** residual fixes.

---

## Self-Review

**Audit coverage:** B1 client+server legs → T1, T2. B2 → T3. B3 → handled in Plan 2 T3 (store caps/TTL). M1 → T4. M2 → T5. M3 → T6. M4 → Plan 2 T8 (lazy Play). Minors: console bound + renderer idle/relaunch → T7; prune stat race + mtime ties → Plan 2 T3; transcript PNG weight → accepted (3 keyframes, capped by `keyframes: max 8` input).

**Placeholder scan:** T5's test names a concrete fallback (extract a pure pauser) if CDP visibility emulation is flaky — a decision rule, not a TBD. All product code complete.

**Type consistency:** `ClientRings` surface (T3) mirrors `EventRing` plus `clientId?`/`activeClientId`, keeping every existing call shape; `RecorderRuntime.rings` rename is propagated in T3's file list including Plan 2's `recordings.save` call site; flusher public surface unchanged (T1) so `boot.ts` needs no edits beyond T5's additions.
