# Recorder Extension (rrweb Session Recording) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `recorder` extension that captures the host page with rrweb into a server-side sliding window, and gives the agent three tools (`recording_start` / `recording_stop` / `recording_pull`) returning a distilled action log plus keyframe screenshots, with a replay panel for the user.

**Architecture:** rrweb capture starts from the extension's always-mounted `Surface` component (the `.client()` factory has no host wiring — `apps/conciv/src/router.ts:34` calls it with no args). Events flush over the extension oRPC router at an adaptive cadence into an in-memory ring on the extension server. A server "hub" broadcasts control messages (`{live}`, `{flush}`) back to the client over an `eventIterator` subscription so tool calls can force a fresh flush before reading the ring. Distillation is pure TS on the server; keyframes come from a pluggable renderer whose v1 impl replays events in headless Chromium (`playwright-core`, lazy) using rrweb's UMD bundle.

**Tech Stack:** rrweb 2.1.0 (+ rrweb-player, @rrweb/rrweb-plugin-console-record, @rrweb/types), playwright-core ^1.61.1, oRPC, zod 4, Solid, Hono-free (router only).

**Spec:** `docs/superpowers/specs/2026-07-17-recorder-extension-design.md`

## Global Constraints

- Style: zero code comments; functions not classes; no IIFE; no `any`/`as`/non-null `!`; no `else` where avoidable; oxfmt (no semicolons, single quotes, printWidth 120).
- Every vitest node project pins `environment: 'node'` (vite-plugin-solid otherwise injects jsdom and the run exits 1).
- Browser tests: real Chromium via `@vitest/browser-playwright` or `@conciv/extension-testkit` — never jsdom. Use `browser.newPage()` semantics (testkit handles this). Never wait for `networkidle`.
- New runtime deps (approved in spec): `rrweb@^2.1.0`, `rrweb-player@^2.1.0`, `@rrweb/rrweb-plugin-console-record@^2.1.0`, `@rrweb/types@^2.1.0`, `playwright-core@^1.61.1` (lazy import only).
- Package is published: name `@conciv/extension-recorder`, `homepage: https://conciv.dev`, `repository.directory: packages/extensions/recorder`, and it MUST be added to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`.
- Build/typecheck via turbo from repo root: `pnpm turbo run build --filter=@conciv/extension-recorder`, tests via `pnpm turbo run test --filter=@conciv/extension-recorder --force` (turbo cache masks regressions — use `--force` for final gates).
- Extension config registry: declare `ExtensionConfigRegistry` augmentation in `src/shared/protocol.ts`.
- Commit after each task with pathspec: `git commit -m "..." -- packages/extensions/recorder <other touched paths>`.

---

### Task 1: Package scaffold + shared protocol

**Files:**

- Create: `packages/extensions/recorder/package.json`
- Create: `packages/extensions/recorder/tsconfig.json`
- Create: `packages/extensions/recorder/tsconfig.build.json`
- Create: `packages/extensions/recorder/tsdown.config.ts`
- Create: `packages/extensions/recorder/vite.config.ts`
- Create: `packages/extensions/recorder/vitest.config.ts`
- Create: `packages/extensions/recorder/src/shared/protocol.ts`
- Create: `packages/extensions/recorder/src/server.ts` (stub)
- Create: `packages/extensions/recorder/src/client.tsx` (stub)

**Interfaces:**

- Produces: `RECORDER_NAME`, `recorderConfig`, `RecorderConfig`, `RrwebEvent`, `ActionLogEntry`, `Keyframe`, `RecorderControl`, `RecorderControlSchema` — every later task imports from `../shared/protocol.js`.

- [ ] **Step 1: Copy the terminal extension's config files, adapted**

`package.json` (mirror `packages/extensions/terminal/package.json` shape exactly — description, keywords, homepage, bugs, license, repository with `"directory": "packages/extensions/recorder"`, files, publishConfig, same scripts):

```json
{
  "name": "@conciv/extension-recorder",
  "version": "0.0.11",
  "description": "Internal to @conciv/it (installed automatically, do not install directly). The recorder built-in extension: rrweb session recording of the host page with a server-side sliding window, agent tools returning a distilled action log plus keyframes, and a replay panel.",
  "keywords": ["conciv", "extension", "recorder", "rrweb", "replay"],
  "homepage": "https://conciv.dev",
  "bugs": "https://github.com/conciv-dev/conciv/issues",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/conciv-dev/conciv.git",
    "directory": "packages/extensions/recorder"
  },
  "files": ["dist"],
  "type": "module",
  "exports": {
    ".": {"types": "./dist/server.d.ts", "import": "./dist/server.js"},
    "./client": {"types": "./dist/client.d.ts", "import": "./dist/client.js"},
    "./package.json": "./package.json"
  },
  "publishConfig": {"access": "public"},
  "scripts": {
    "build": "tsdown && vite build && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run",
    "publint": "publint",
    "attw": "attw --pack . --profile esm-only"
  },
  "dependencies": {
    "@conciv/extension": "workspace:^",
    "@conciv/protocol": "workspace:^",
    "@conciv/ui-kit-system": "workspace:^",
    "@orpc/server": "^1.14.7",
    "@rrweb/rrweb-plugin-console-record": "^2.1.0",
    "@rrweb/types": "^2.1.0",
    "lucide-solid": "^1.18.0",
    "playwright-core": "^1.61.1",
    "rrweb": "^2.1.0",
    "rrweb-player": "^2.1.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@conciv/core": "workspace:^",
    "@conciv/extension-testkit": "workspace:^",
    "@conciv/harness-testkit": "workspace:^",
    "@conciv/uno-preset": "workspace:*",
    "@tanstack/ai-mcp": "^0.2.3",
    "@types/node": "^22.19.21",
    "@vitest/browser-playwright": "4.1.10",
    "solid-js": "^1.9.13",
    "tsdown": "^0.22.4",
    "typescript": "^6.0.3",
    "unocss": "^66.7.2",
    "vite": "^8.0.16",
    "vite-plugin-solid": "^2.11.12",
    "vitest": "^4.1.8"
  },
  "peerDependencies": {"solid-js": "^1.9.13"}
}
```

Copy verbatim from `packages/extensions/terminal/`: `tsconfig.json`, `tsconfig.build.json`, `uno.config.ts` (if the panel ends up using UnoCSS utility classes; harmless to include). `tsdown.config.ts`:

```ts
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: false,
})
```

`vite.config.ts` (rrweb and rrweb-player are BUNDLED into the client — only the shared framework deps are external, matching the terminal config's external list):

```ts
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/client.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: [/^solid-js/, /^zod/, /^@conciv\//, /^lucide-solid/],
    },
    emptyOutDir: false,
    sourcemap: true,
  },
})
```

`vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'recorder',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
```

- [ ] **Step 2: Write `src/shared/protocol.ts`**

```ts
import {z} from 'zod'

export const RECORDER_NAME = 'recorder'

export const recorderConfig = z.object({
  masking: z.enum(['none', 'inputs', 'sensitive']).default('none'),
  windowMinutes: z.number().int().positive().max(60).default(10),
  console: z.boolean().default(true),
})

export type RecorderConfig = z.output<typeof recorderConfig>

export type RrwebEvent = {type: number; data: unknown; timestamp: number}

export const RrwebEventSchema = z.object({type: z.number(), data: z.unknown(), timestamp: z.number()})

export const RecorderControlSchema = z.object({live: z.boolean().optional(), flush: z.boolean().optional()})

export type RecorderControl = z.infer<typeof RecorderControlSchema>

export type ActionLogKind = 'click' | 'input' | 'navigation' | 'scroll' | 'console' | 'reload'

export type ActionLogEntry = {ts: number; kind: ActionLogKind; detail: string}

export type Keyframe = {ts: number; pngBase64: string}

declare module '@conciv/protocol/config-types' {
  interface ExtensionConfigRegistry {
    recorder: z.input<typeof recorderConfig>
  }
}
```

Note: check `packages/protocol/src/config-types.ts` exists with `ExtensionConfigRegistry` (test-runner's IT test augments it the same way — `packages/extensions/test-runner/test/extension.it.test.ts:12`). If the interface lives at a different subpath, match whatever test-runner uses.

- [ ] **Step 3: Stub `src/server.ts` and `src/client.tsx`**

`src/server.ts`:

```ts
import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'

export default defineExtension({name: RECORDER_NAME, configSchema: recorderConfig}).server(() => ({context: {}}))
```

`src/client.tsx`:

```tsx
import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'

export default defineExtension({name: RECORDER_NAME, configSchema: recorderConfig})
```

- [ ] **Step 4: Install and build**

Run from repo root: `pnpm install` (workspace picks up the new package; this is the step that pulls the new npm deps).
Then: `pnpm turbo run build --filter=@conciv/extension-recorder`
Expected: build succeeds, `dist/server.js` + `dist/client.js` exist.

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-recorder`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/recorder pnpm-lock.yaml
git commit -m "feat(recorder): scaffold @conciv/extension-recorder package" -- packages/extensions/recorder pnpm-lock.yaml
```

---

### Task 2: Server ring buffer

**Files:**

- Create: `packages/extensions/recorder/src/server/ring.ts`
- Test: `packages/extensions/recorder/test/ring.test.ts`

**Interfaces:**

- Produces:
  ```ts
  type EventRing = {
    append(clientId: string, events: RrwebEvent[]): void
    window(opts?: {fromTs?: number; toTs?: number}): RrwebEvent[]
    lastTs(): number
    onAppend(listener: (lastTs: number) => void): () => void
  }
  function createEventRing(opts: {windowMs: number; maxBytes?: number}): EventRing
  ```
- `window({fromTs})` extends backward to the nearest full-snapshot event (`type === 2`) at or before `fromTs` — a trimmed rrweb stream is unreplayable without its base snapshot. If no snapshot precedes `fromTs`, it returns from the earliest retained snapshot.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const snapshot = (ts: number): RrwebEvent => ({type: 2, data: {}, timestamp: ts})
const incremental = (ts: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp: ts})

describe('createEventRing', () => {
  it('returns appended events in timestamp order across clients', () => {
    const ring = createEventRing({windowMs: 60_000})
    ring.append('a', [snapshot(1000), incremental(3000)])
    ring.append('b', [incremental(2000)])
    expect(ring.window().map((e) => e.timestamp)).toEqual([1000, 2000, 3000])
    expect(ring.lastTs()).toBe(3000)
  })

  it('evicts events older than windowMs relative to the newest event', () => {
    const ring = createEventRing({windowMs: 5000})
    ring.append('a', [snapshot(1000), incremental(2000)])
    ring.append('a', [snapshot(7500), incremental(8000)])
    expect(ring.window().map((e) => e.timestamp)).toEqual([7500, 8000])
  })

  it('window({fromTs}) extends back to the nearest full snapshot before fromTs', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000), incremental(2000), snapshot(5000), incremental(6000), incremental(9000)])
    expect(ring.window({fromTs: 8000}).map((e) => e.timestamp)).toEqual([5000, 6000, 9000])
  })

  it('window({fromTs, toTs}) clips the tail', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000), incremental(2000), incremental(3000)])
    expect(ring.window({fromTs: 1500, toTs: 2500}).map((e) => e.timestamp)).toEqual([1000, 2000])
  })

  it('evicts oldest events beyond maxBytes', () => {
    const ring = createEventRing({windowMs: 600_000, maxBytes: 200})
    const fat = (ts: number): RrwebEvent => ({type: 3, data: {blob: 'x'.repeat(120)}, timestamp: ts})
    ring.append('a', [fat(1000), fat(2000), fat(3000)])
    const kept = ring.window().map((e) => e.timestamp)
    expect(kept.length).toBeLessThan(3)
    expect(kept.at(-1)).toBe(3000)
  })

  it('notifies onAppend listeners with the new lastTs', () => {
    const ring = createEventRing({windowMs: 60_000})
    const seen: number[] = []
    const off = ring.onAppend((ts) => seen.push(ts))
    ring.append('a', [snapshot(1000)])
    off()
    ring.append('a', [incremental(2000)])
    expect(seen).toEqual([1000])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/extensions/recorder`: `pnpm vitest run test/ring.test.ts`
Expected: FAIL — cannot resolve `../src/server/ring.js`

- [ ] **Step 3: Implement `src/server/ring.ts`**

```ts
import type {RrwebEvent} from '../shared/protocol.js'

export type EventRing = {
  append(clientId: string, events: RrwebEvent[]): void
  window(opts?: {fromTs?: number; toTs?: number}): RrwebEvent[]
  lastTs(): number
  onAppend(listener: (lastTs: number) => void): () => void
}

type Stored = {event: RrwebEvent; bytes: number}

export function createEventRing(opts: {windowMs: number; maxBytes?: number}): EventRing {
  const maxBytes = opts.maxBytes ?? 64 * 1024 * 1024
  let stored: Stored[] = []
  let totalBytes = 0
  const listeners = new Set<(lastTs: number) => void>()

  const evict = (): void => {
    const newest = stored.at(-1)?.event.timestamp ?? 0
    let dropTo = 0
    let bytes = totalBytes
    while (dropTo < stored.length - 1) {
      const head = stored[dropTo]
      if (!head) break
      const tooOld = newest - head.event.timestamp > opts.windowMs
      if (!tooOld && bytes <= maxBytes) break
      bytes -= head.bytes
      dropTo += 1
    }
    if (dropTo === 0) return
    stored = stored.slice(dropTo)
    totalBytes = bytes
  }

  return {
    append(_clientId, events) {
      if (!events.length) return
      const incoming = events.map((event) => ({event, bytes: JSON.stringify(event).length}))
      stored = [...stored, ...incoming].sort((a, b) => a.event.timestamp - b.event.timestamp)
      totalBytes += incoming.reduce((sum, item) => sum + item.bytes, 0)
      evict()
      const last = stored.at(-1)?.event.timestamp ?? 0
      for (const listener of listeners) listener(last)
    },
    window(range = {}) {
      const toTs = range.toTs ?? Number.POSITIVE_INFINITY
      const inTail = stored.filter((item) => item.event.timestamp <= toTs)
      const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY
      const snapshotIndex = inTail.reduce(
        (found, item, index) => (item.event.type === 2 && item.event.timestamp <= fromTs ? index : found),
        0,
      )
      return inTail
        .slice(snapshotIndex)
        .filter((item, index) => index === 0 || item.event.timestamp >= fromTs || item.event.type === 2)
        .map((item) => item.event)
    },
    lastTs: () => stored.at(-1)?.event.timestamp ?? 0,
    onAppend(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

Adjust the `window` filter until all four window tests pass — the contract is the tests, exactly: base snapshot kept, events between snapshot and `fromTs` kept (the replayer needs the mutations that happened between snapshot and window start to reconstruct state), tail clipped at `toTs`.

Note the simplest correct implementation of `window({fromTs})` is: find base snapshot index, return `inTail.slice(snapshotIndex)` unfiltered — everything from the base snapshot forward. Prefer that if the filter above fights the tests; update the third test's expectation accordingly (`[5000, 6000, 9000]` already matches slice-from-snapshot semantics).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/ring.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): server event ring with snapshot-aware windows" -- packages/extensions/recorder
```

---

### Task 3: Distiller (node index + action log)

**Files:**

- Create: `packages/extensions/recorder/src/server/node-index.ts`
- Create: `packages/extensions/recorder/src/server/distill.ts`
- Test: `packages/extensions/recorder/test/distill.test.ts`

**Interfaces:**

- Produces:
  ```ts
  function distill(events: RrwebEvent[]): ActionLogEntry[]
  type NodeIndex = {
    applyFullSnapshot(root: unknown): void
    applyMutation(data: unknown): void
    describe(id: number): string
  }
  function createNodeIndex(): NodeIndex
  ```

**rrweb event model reference (v2, from @rrweb/types):** EventType: `2` FullSnapshot (`data.node` = serialized tree), `3` IncrementalSnapshot (`data.source`: `0` Mutation, `2` MouseInteraction — `data.type === 2` is Click, `data.id` = target node id, `3` Scroll, `5` Input — `{id, text, isChecked}`), `4` Meta (`data.href`), `6` Plugin (`data.plugin === 'rrweb/console@1'`, `data.payload = {level, payload: string[]}`). Serialized element nodes: `{id, type: 2, tagName, attributes, childNodes}`; text nodes: `{id, type: 3, textContent}`. Mutation data: `{adds: [{node, parentId}], removes: [{id}], attributes: [{id, attributes}], texts: [{id, value}]}`.

- [ ] **Step 1: Write the failing test with a hand-built fixture stream**

```ts
import {describe, expect, it} from 'vitest'
import {distill} from '../src/server/distill.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const page = {
  id: 1,
  type: 0,
  childNodes: [
    {
      id: 2,
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          id: 3,
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {id: 4, type: 2, tagName: 'button', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Save'}]},
            {id: 6, type: 2, tagName: 'input', attributes: {id: 'email', type: 'text'}, childNodes: []},
          ],
        },
      ],
    },
  ],
}

const stream: RrwebEvent[] = [
  {type: 4, data: {href: 'http://localhost:3000/checkout', width: 800, height: 600}, timestamp: 1000},
  {type: 2, data: {node: page}, timestamp: 1001},
  {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
  {type: 3, data: {source: 5, id: 6, text: 'a@b.co', isChecked: false}, timestamp: 3000},
  {type: 3, data: {source: 3, id: 1, x: 0, y: 400}, timestamp: 4000},
  {type: 3, data: {source: 3, id: 1, x: 0, y: 800}, timestamp: 4300},
  {type: 6, data: {plugin: 'rrweb/console@1', payload: {level: 'error', payload: ['"boom"']}}, timestamp: 5000},
  {type: 4, data: {href: 'http://localhost:3000/done', width: 800, height: 600}, timestamp: 6000},
  {type: 2, data: {node: page}, timestamp: 6001},
]

describe('distill', () => {
  it('produces a semantic action log from an rrweb stream', () => {
    const log = distill(stream)
    expect(log.map((entry) => entry.kind)).toEqual([
      'navigation',
      'click',
      'input',
      'scroll',
      'console',
      'navigation',
      'reload',
    ])
  })

  it('describes click targets by tag and text', () => {
    const click = distill(stream).find((entry) => entry.kind === 'click')
    expect(click?.detail).toContain('button')
    expect(click?.detail).toContain('Save')
  })

  it('includes typed text and identifies the field', () => {
    const input = distill(stream).find((entry) => entry.kind === 'input')
    expect(input?.detail).toContain('a@b.co')
    expect(input?.detail).toContain('email')
  })

  it('coalesces consecutive scrolls on the same node into one entry', () => {
    const scrolls = distill(stream).filter((entry) => entry.kind === 'scroll')
    expect(scrolls).toHaveLength(1)
  })

  it('resolves targets added later by mutation', () => {
    const withMutation: RrwebEvent[] = [
      {type: 2, data: {node: page}, timestamp: 1000},
      {
        type: 3,
        data: {
          source: 0,
          adds: [
            {
              parentId: 3,
              node: {
                id: 9,
                type: 2,
                tagName: 'a',
                attributes: {href: '/x'},
                childNodes: [{id: 10, type: 3, textContent: 'Details'}],
              },
            },
          ],
          removes: [],
          attributes: [],
          texts: [],
        },
        timestamp: 1500,
      },
      {type: 3, data: {source: 2, type: 2, id: 9}, timestamp: 2000},
    ]
    const click = distill(withMutation).find((entry) => entry.kind === 'click')
    expect(click?.detail).toContain('Details')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/distill.test.ts`
Expected: FAIL — cannot resolve `../src/server/distill.js`

- [ ] **Step 3: Implement `src/server/node-index.ts`**

```ts
import {z} from 'zod'

const serializedNode: z.ZodType<SerializedNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    type: z.number(),
    tagName: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    textContent: z.string().optional(),
    childNodes: z.array(serializedNode).optional(),
  }),
)

export type SerializedNode = {
  id: number
  type: number
  tagName?: string
  attributes?: Record<string, unknown>
  textContent?: string
  childNodes?: SerializedNode[]
}

const mutationData = z.object({
  adds: z.array(z.object({node: serializedNode})).default([]),
  removes: z.array(z.object({id: z.number()})).default([]),
  attributes: z.array(z.object({id: z.number(), attributes: z.record(z.string(), z.unknown())})).default([]),
})

export type NodeIndex = {
  applyFullSnapshot(root: unknown): void
  applyMutation(data: unknown): void
  describe(id: number): string
}

function ownText(node: SerializedNode): string {
  const direct = node.textContent ?? ''
  const children = (node.childNodes ?? []).map(ownText).join(' ')
  return `${direct} ${children}`.replace(/\s+/g, ' ').trim()
}

function label(node: SerializedNode): string {
  const attributes = node.attributes ?? {}
  const aria = attributes['aria-label']
  if (typeof aria === 'string' && aria) return aria
  const text = ownText(node)
  if (text) return text.slice(0, 60)
  const placeholder = attributes['placeholder']
  if (typeof placeholder === 'string' && placeholder) return placeholder
  return ''
}

function selectorish(node: SerializedNode): string {
  const attributes = node.attributes ?? {}
  const id = attributes['id']
  const idPart = typeof id === 'string' && id ? `#${id}` : ''
  return `${node.tagName ?? 'node'}${idPart}`
}

export function createNodeIndex(): NodeIndex {
  const byId = new Map<number, SerializedNode>()

  const walk = (node: SerializedNode): void => {
    byId.set(node.id, node)
    for (const child of node.childNodes ?? []) walk(child)
  }

  return {
    applyFullSnapshot(root) {
      byId.clear()
      const parsed = serializedNode.safeParse(root)
      if (parsed.success) walk(parsed.data)
    },
    applyMutation(data) {
      const parsed = mutationData.safeParse(data)
      if (!parsed.success) return
      for (const add of parsed.data.adds) walk(add.node)
      for (const change of parsed.data.attributes) {
        const node = byId.get(change.id)
        if (node) node.attributes = {...node.attributes, ...change.attributes}
      }
      for (const removal of parsed.data.removes) byId.delete(removal.id)
    },
    describe(id) {
      const node = byId.get(id)
      if (!node) return `node ${id}`
      const name = label(node)
      return name ? `${selectorish(node)} "${name}"` : selectorish(node)
    },
  }
}
```

- [ ] **Step 4: Implement `src/server/distill.ts`**

```ts
import {z} from 'zod'
import type {ActionLogEntry, RrwebEvent} from '../shared/protocol.js'
import {createNodeIndex} from './node-index.js'

const meta = z.object({href: z.string()})
const fullSnapshot = z.object({node: z.unknown()})
const incremental = z.object({source: z.number()}).loose()
const click = z.object({source: z.literal(2), type: z.literal(2), id: z.number()})
const input = z.object({source: z.literal(5), id: z.number(), text: z.string()})
const scroll = z.object({source: z.literal(3), id: z.number()})
const consoleEvent = z.object({
  plugin: z.literal('rrweb/console@1'),
  payload: z.object({level: z.string(), payload: z.array(z.string())}),
})

const SCROLL_COALESCE_MS = 1500

export function distill(events: RrwebEvent[]): ActionLogEntry[] {
  const index = createNodeIndex()
  const log: ActionLogEntry[] = []
  let snapshots = 0

  const push = (entry: ActionLogEntry): void => {
    const last = log.at(-1)
    const coalesce =
      entry.kind === 'scroll' &&
      last?.kind === 'scroll' &&
      last.detail === entry.detail &&
      entry.ts - last.ts < SCROLL_COALESCE_MS
    if (coalesce) {
      last.ts = entry.ts
      return
    }
    log.push(entry)
  }

  for (const event of events) {
    if (event.type === 4) {
      const parsed = meta.safeParse(event.data)
      if (parsed.success) push({ts: event.timestamp, kind: 'navigation', detail: parsed.data.href})
    }
    if (event.type === 2) {
      const parsed = fullSnapshot.safeParse(event.data)
      if (parsed.success) index.applyFullSnapshot(parsed.data.node)
      snapshots += 1
      if (snapshots > 1) push({ts: event.timestamp, kind: 'reload', detail: 'page reloaded (new snapshot)'})
    }
    if (event.type === 3) {
      const base = incremental.safeParse(event.data)
      if (!base.success) continue
      if (base.data.source === 0) index.applyMutation(event.data)
      const clicked = click.safeParse(event.data)
      if (clicked.success)
        push({ts: event.timestamp, kind: 'click', detail: `clicked ${index.describe(clicked.data.id)}`})
      const typed = input.safeParse(event.data)
      if (typed.success)
        push({
          ts: event.timestamp,
          kind: 'input',
          detail: `typed "${typed.data.text}" into ${index.describe(typed.data.id)}`,
        })
      const scrolled = scroll.safeParse(event.data)
      if (scrolled.success)
        push({ts: event.timestamp, kind: 'scroll', detail: `scrolled ${index.describe(scrolled.data.id)}`})
    }
    if (event.type === 6) {
      const parsed = consoleEvent.safeParse(event.data)
      if (parsed.success && parsed.data.payload.level === 'error')
        push({
          ts: event.timestamp,
          kind: 'console',
          detail: `console.error ${parsed.data.payload.payload.join(' ').slice(0, 200)}`,
        })
    }
  }
  return log
}
```

Caveat on the reload marker: rrweb `checkoutEveryNms` also emits periodic full snapshots (Task 4 enables it). A checkout snapshot is NOT a reload. Distinguish: a real reload is a full snapshot immediately preceded (within ~2s) by a Meta event (type 4) — page loads emit Meta then FullSnapshot. Refine `snapshots > 1` to: previous event in the stream is a Meta event. Update the fixture test accordingly (it already places `{type: 4}` right before the second snapshot, and checkout snapshots in real streams arrive without a Meta). Implement it as: track `lastWasMeta` boolean while iterating; `reload` entry only when `snapshots > 1 && lastWasMeta`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/distill.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): distill rrweb streams into semantic action logs" -- packages/extensions/recorder
```

---

### Task 4: Client capture + flusher

**Files:**

- Create: `packages/extensions/recorder/src/client/capture.ts`
- Create: `packages/extensions/recorder/src/client/flusher.ts`
- Test: `packages/extensions/recorder/test/flusher.test.ts`

**Interfaces:**

- Produces:

  ```ts
  function startCapture(config: RecorderConfig, emit: (event: RrwebEvent) => void): () => void
  type Flusher = {
    push(event: RrwebEvent): void
    setLive(live: boolean): void
    flushNow(): Promise<void>
    dispose(): void
  }
  function createFlusher(opts: {
    send: (events: RrwebEvent[]) => Promise<void>
    idleMs?: number
    liveMs?: number
  }): Flusher
  ```

- [ ] **Step 1: Write the failing flusher test (fake timers, pure node)**

```ts
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createFlusher} from '../src/client/flusher.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const event = (ts: number): RrwebEvent => ({type: 3, data: {}, timestamp: ts})

describe('createFlusher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('batches pushes and sends on the idle cadence', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events), idleMs: 5000, liveMs: 200})
    flusher.push(event(1))
    flusher.push(event(2))
    expect(sent).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(sent).toEqual([[event(1), event(2)]])
    flusher.dispose()
  })

  it('switches to the live cadence on setLive(true)', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events), idleMs: 5000, liveMs: 200})
    flusher.setLive(true)
    flusher.push(event(1))
    await vi.advanceTimersByTimeAsync(200)
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })

  it('flushNow drains immediately and skips empty sends', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events)})
    await flusher.flushNow()
    expect(sent).toHaveLength(0)
    flusher.push(event(1))
    await flusher.flushNow()
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })

  it('requeues the batch when send rejects and retries on the next tick', async () => {
    let fail = true
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({
      send: async (events) => {
        if (fail) throw new Error('offline')
        sent.push(events)
      },
      idleMs: 1000,
      liveMs: 200,
    })
    flusher.push(event(1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toHaveLength(0)
    fail = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/flusher.test.ts`
Expected: FAIL — cannot resolve `../src/client/flusher.js`

- [ ] **Step 3: Implement `src/client/flusher.ts`**

```ts
import type {RrwebEvent} from '../shared/protocol.js'

export type Flusher = {
  push(event: RrwebEvent): void
  setLive(live: boolean): void
  flushNow(): Promise<void>
  dispose(): void
}

export function createFlusher(opts: {
  send: (events: RrwebEvent[]) => Promise<void>
  idleMs?: number
  liveMs?: number
}): Flusher {
  const idleMs = opts.idleMs ?? 5000
  const liveMs = opts.liveMs ?? 200
  let queue: RrwebEvent[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const drain = async (): Promise<void> => {
    if (!queue.length) return
    const batch = queue
    queue = []
    try {
      await opts.send(batch)
    } catch {
      queue = [...batch, ...queue]
    }
  }

  const schedule = (ms: number): void => {
    if (timer) clearInterval(timer)
    timer = setInterval(() => void drain(), ms)
  }

  schedule(idleMs)

  return {
    push(event) {
      if (!disposed) queue.push(event)
    },
    setLive(live) {
      schedule(live ? liveMs : idleMs)
    },
    flushNow: drain,
    dispose() {
      disposed = true
      if (timer) clearInterval(timer)
      void drain()
    },
  }
}
```

- [ ] **Step 4: Implement `src/client/capture.ts`** (no unit test — exercised end-to-end in Task 7; it is a thin adapter over `rrweb.record`)

```ts
import {record} from 'rrweb'
import {getRecordConsolePlugin} from '@rrweb/rrweb-plugin-console-record'
import type {RecorderConfig, RrwebEvent} from '../shared/protocol.js'

const CHECKOUT_MS = 60_000

function maskingOptions(masking: RecorderConfig['masking']): {
  maskAllInputs: boolean
  maskInputOptions: Record<string, boolean>
} {
  if (masking === 'inputs') return {maskAllInputs: true, maskInputOptions: {password: true}}
  if (masking === 'sensitive') return {maskAllInputs: false, maskInputOptions: {password: true, email: true, tel: true}}
  return {maskAllInputs: false, maskInputOptions: {password: true}}
}

export function startCapture(config: RecorderConfig, emit: (event: RrwebEvent) => void): () => void {
  const stop = record({
    emit: (event) => emit(event),
    checkoutEveryNms: CHECKOUT_MS,
    ...maskingOptions(config.masking),
    plugins: config.console ? [getRecordConsolePlugin({level: ['error'], lengthThreshold: 200})] : [],
  })
  return () => stop?.()
}
```

Type note: `record`'s emit callback delivers `eventWithTime` from `@rrweb/types` — structurally compatible with `RrwebEvent`. If tsc complains about the passthrough, type the emit parameter as `eventWithTime` (imported `type {eventWithTime} from '@rrweb/types'`) and pass it straight through — no cast. Verify `getRecordConsolePlugin`'s option names against the installed package's `.d.ts` before finalizing (they may be `{level, lengthThreshold}` or nested; read `node_modules/@rrweb/rrweb-plugin-console-record/dist/*.d.ts`).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run test/flusher.test.ts` — Expected: PASS (4 tests)
Run: `pnpm turbo run typecheck --filter=@conciv/extension-recorder` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): rrweb capture adapter and adaptive flusher" -- packages/extensions/recorder
```

---

### Task 5: Extension server — hub, router, tools

**Files:**

- Create: `packages/extensions/recorder/src/server/hub.ts`
- Create: `packages/extensions/recorder/src/server/format.ts`
- Create: `packages/extensions/recorder/src/tool/def.ts`
- Create: `packages/extensions/recorder/src/tool/server.ts`
- Create: `packages/extensions/recorder/src/tool/client.ts`
- Modify: `packages/extensions/recorder/src/server.ts` (replace stub)
- Test: `packages/extensions/recorder/test/hub.test.ts`
- Test: `packages/extensions/recorder/test/extension.it.test.ts`

**Interfaces:**

- Consumes: `createEventRing` (Task 2), `distill` (Task 3), `KeyframeRenderer` (Task 6 — reference the type now, wire `null` renderer until Task 6 lands).
- Produces:
  ```ts
  type CaptureHub = {
    subscribe(emit: (control: RecorderControl) => void): () => void
    emit(control: RecorderControl): void
    startCapture(): {captureId: string; startTs: number}
    stopCapture(captureId: string): {startTs: number; stopTs: number} | null
    awaitCoverage(ts: number, timeoutMs: number): Promise<boolean>
  }
  function createCaptureHub(ring: EventRing, now?: () => number): CaptureHub
  type RecorderRuntime = {
    ring: EventRing
    hub: CaptureHub
    config: RecorderConfig
    renderer: () => Promise<KeyframeRenderer | null>
  }
  function makeRecorderRouter(runtime: RecorderRuntime): RecorderRouter
  function pullWindow(runtime: RecorderRuntime, fromTs: number, toTs: number, keyframeCount: number): Promise<unknown>
  ```
- Router routes: `config` (→ `RecorderConfig`), `flush` (`{clientId, events}` → `{ok: true}`), `window` (`{fromTs?, toTs?}` → `{events}`), `control` (→ `eventIterator(RecorderControlSchema)`), `log` (`{fromTs?, toTs?}` → `{entries: ActionLogEntry[]}`).
- Tool names/inputs (in `tool/def.ts`, shared by client and server exactly like `packages/extensions/test-runner/src/tool/def.ts`):
  - `recording_start` — input `{}` → `{captureId, startedAt}`
  - `recording_stop` — input `{captureId: string, keyframes: number (default 3, max 8)}` → ContentPart[] (log text + keyframe images)
  - `recording_pull` — input `{secondsBack: number (default 60, max 600), keyframes: number (default 3, max 8)}` → ContentPart[]

- [ ] **Step 1: Write the failing hub test**

```ts
import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureHub} from '../src/server/hub.js'
import type {RecorderControl} from '../src/shared/protocol.js'

describe('createCaptureHub', () => {
  it('broadcasts live=true on capture start and live=false on stop', () => {
    const ring = createEventRing({windowMs: 60_000})
    const hub = createCaptureHub(ring, () => 5000)
    const seen: RecorderControl[] = []
    hub.subscribe((control) => seen.push(control))
    const {captureId} = hub.startCapture()
    const range = hub.stopCapture(captureId)
    expect(seen).toEqual([{live: true}, {flush: true, live: false}])
    expect(range).toEqual({startTs: 5000, stopTs: 5000})
  })

  it('stopCapture with an unknown id returns null', () => {
    const hub = createCaptureHub(createEventRing({windowMs: 60_000}), () => 0)
    expect(hub.stopCapture('nope')).toBeNull()
  })

  it('awaitCoverage resolves once the ring covers the timestamp', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const hub = createCaptureHub(ring, () => 0)
    const pending = hub.awaitCoverage(2000, 1000)
    ring.append('a', [{type: 2, data: {}, timestamp: 2500}])
    await expect(pending).resolves.toBe(true)
  })

  it('awaitCoverage resolves false on timeout', async () => {
    const hub = createCaptureHub(createEventRing({windowMs: 60_000}), () => 0)
    await expect(hub.awaitCoverage(99_999, 30)).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement `src/server/hub.ts`**

Run: `pnpm vitest run test/hub.test.ts` — Expected: FAIL (module not found)

```ts
import {randomUUID} from 'node:crypto'
import type {RecorderControl} from '../shared/protocol.js'
import type {EventRing} from './ring.js'

export type CaptureHub = {
  subscribe(emit: (control: RecorderControl) => void): () => void
  emit(control: RecorderControl): void
  startCapture(): {captureId: string; startTs: number}
  stopCapture(captureId: string): {startTs: number; stopTs: number} | null
  awaitCoverage(ts: number, timeoutMs: number): Promise<boolean>
}

export function createCaptureHub(ring: EventRing, now: () => number = Date.now): CaptureHub {
  const listeners = new Set<(control: RecorderControl) => void>()
  const captures = new Map<string, number>()

  const emit = (control: RecorderControl): void => {
    for (const listener of listeners) listener(control)
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    startCapture() {
      const captureId = randomUUID()
      const startTs = now()
      captures.set(captureId, startTs)
      emit({live: true})
      return {captureId, startTs}
    },
    stopCapture(captureId) {
      const startTs = captures.get(captureId)
      if (startTs === undefined) return null
      captures.delete(captureId)
      emit({flush: true, live: captures.size > 0})
      return {startTs, stopTs: now()}
    },
    awaitCoverage(ts, timeoutMs) {
      if (ring.lastTs() >= ts) return Promise.resolve(true)
      return new Promise((resolve) => {
        const finish = (covered: boolean): void => {
          off()
          clearTimeout(timer)
          resolve(covered)
        }
        const off = ring.onAppend((lastTs) => {
          if (lastTs >= ts) finish(true)
        })
        const timer = setTimeout(() => finish(false), timeoutMs)
      })
    },
  }
}
```

Run: `pnpm vitest run test/hub.test.ts` — Expected: PASS (4 tests)

- [ ] **Step 3: Implement `src/server/format.ts`**

```ts
import type {ActionLogEntry, Keyframe} from '../shared/protocol.js'

const SIGNIFICANT: ReadonlySet<string> = new Set(['click', 'navigation', 'console', 'reload'])

export function pickKeyframeTimestamps(log: ActionLogEntry[], lastTs: number, count: number): number[] {
  const significant = log.filter((entry) => SIGNIFICANT.has(entry.kind)).map((entry) => entry.ts)
  const picked = [...significant.slice(-Math.max(count - 1, 0)), lastTs]
  return [...new Set(picked)].sort((a, b) => a - b).slice(-count)
}

export function formatLog(log: ActionLogEntry[], opts: {keyframesSkipped: boolean}): string {
  if (!log.length) return 'No recorded activity in this window.'
  const start = log[0]?.ts ?? 0
  const lines = log.map((entry) => `+${((entry.ts - start) / 1000).toFixed(1)}s [${entry.kind}] ${entry.detail}`)
  const note = opts.keyframesSkipped ? '\n(keyframes skipped: no renderer available)' : ''
  return `${lines.join('\n')}${note}`
}

export function recordingParts(log: ActionLogEntry[], frames: Keyframe[]): unknown {
  const text = {type: 'text', content: formatLog(log, {keyframesSkipped: frames.length === 0})}
  const images = frames.map((frame) => ({
    type: 'image',
    source: {type: 'data', value: frame.pngBase64, mimeType: 'image/png'},
  }))
  return [...images, text]
}
```

(`recordingParts` mirrors the ContentPart shape produced by `packages/extension/src/image-result.ts` — reuse `imageResult` from `@conciv/extension` if it exports cleanly for multiple images; otherwise this local builder matches the wire shape. Check `@conciv/extension`'s public exports first: if `imageResult` is exported, build `frames.flatMap((f) => imageResult('image/png', f.pngBase64))` plus one text part instead of hand-rolling.)

- [ ] **Step 4: Write `src/tool/def.ts`, `src/tool/server.ts`, `src/tool/client.ts`**

`src/tool/def.ts`:

```ts
import {z} from 'zod'

export const StartInput = z.object({})
export const StopInput = z.object({captureId: z.string(), keyframes: z.number().int().min(0).max(8).default(3)})
export const PullInput = z.object({
  secondsBack: z.number().int().positive().max(600).default(60),
  keyframes: z.number().int().min(0).max(8).default(3),
})

export const startToolDef = {
  name: 'recording_start',
  description:
    "Start a marked recording of the user's app page. Returns a captureId. Use before performing page actions you want to review, then call recording_stop.",
  inputSchema: StartInput,
} as const

export const stopToolDef = {
  name: 'recording_stop',
  description:
    'Stop a marked recording and get back what happened: a semantic action log (clicks, inputs, navigations, errors) plus keyframe screenshots.',
  inputSchema: StopInput,
} as const

export const pullToolDef = {
  name: 'recording_pull',
  description:
    'Pull the last N seconds of the always-on page recording (flight recorder). Returns a semantic action log plus keyframe screenshots. Use when the user refers to something that just happened in their app, or after an error.',
  inputSchema: PullInput,
} as const
```

`src/tool/server.ts`:

```ts
import {defineTool} from '@conciv/extension'
import type {RecorderRuntime} from '../server/runtime.js'
import {pullWindow} from '../server/runtime.js'
import {startToolDef, stopToolDef, pullToolDef, StartInput, StopInput, PullInput} from './def.js'

type Ctx = {recorder: RecorderRuntime}

export const startTool = defineTool<typeof StartInput, Ctx>(startToolDef).server((_input, ctx) => {
  const {captureId, startTs} = ctx.recorder.hub.startCapture()
  return {captureId, startedAt: startTs}
})

export const stopTool = defineTool<typeof StopInput, Ctx>(stopToolDef).server(async ({captureId, keyframes}, ctx) => {
  const range = ctx.recorder.hub.stopCapture(captureId)
  if (!range) return {error: `no active capture ${captureId}`}
  await ctx.recorder.hub.awaitCoverage(range.stopTs - 750, 2000)
  return pullWindow(ctx.recorder, range.startTs, range.stopTs, keyframes)
})

export const pullTool = defineTool<typeof PullInput, Ctx>(pullToolDef).server(async ({secondsBack, keyframes}, ctx) => {
  const toTs = Date.now()
  ctx.recorder.hub.emit({flush: true})
  await ctx.recorder.hub.awaitCoverage(toTs - 750, 1500)
  return pullWindow(ctx.recorder, toTs - secondsBack * 1000, toTs, keyframes)
})
```

`src/tool/client.ts`:

```ts
import {defineTool} from '@conciv/extension'
import {startToolDef, stopToolDef, pullToolDef} from './def.js'

export const startToolClient = defineTool(startToolDef)
export const stopToolClient = defineTool(stopToolDef)
export const pullToolClient = defineTool(pullToolDef)
```

- [ ] **Step 5: Write `src/server/runtime.ts` and replace `src/server.ts`**

`src/server/runtime.ts`:

```ts
import type {Keyframe, RecorderConfig} from '../shared/protocol.js'
import type {EventRing} from './ring.js'
import type {CaptureHub} from './hub.js'
import type {KeyframeRenderer} from './render.js'
import {distill} from './distill.js'
import {pickKeyframeTimestamps, recordingParts} from './format.js'

export type RecorderRuntime = {
  ring: EventRing
  hub: CaptureHub
  config: RecorderConfig
  renderer: () => Promise<KeyframeRenderer | null>
}

export async function pullWindow(
  runtime: RecorderRuntime,
  fromTs: number,
  toTs: number,
  keyframeCount: number,
): Promise<unknown> {
  const events = runtime.ring.window({fromTs, toTs})
  const log = distill(events)
  const frames = await renderFrames(runtime, events, log, toTs, keyframeCount)
  return recordingParts(log, frames)
}

async function renderFrames(
  runtime: RecorderRuntime,
  events: ReturnType<EventRing['window']>,
  log: ReturnType<typeof distill>,
  toTs: number,
  keyframeCount: number,
): Promise<Keyframe[]> {
  if (!keyframeCount || events.length < 2) return []
  const renderer = await runtime.renderer().catch(() => null)
  if (!renderer) return []
  const lastTs = events.at(-1)?.timestamp ?? toTs
  return renderer.render(events, pickKeyframeTimestamps(log, lastTs, keyframeCount)).catch(() => [])
}
```

Until Task 6 lands, create `src/server/render.ts` with only the type (Task 6 fills the implementation):

```ts
import type {Keyframe, RrwebEvent} from '../shared/protocol.js'

export type KeyframeRenderer = {
  render(events: RrwebEvent[], timestamps: number[]): Promise<Keyframe[]>
  dispose(): Promise<void>
}

export async function createChromiumRenderer(): Promise<KeyframeRenderer | null> {
  return null
}
```

`src/server.ts` (replace the stub):

```ts
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {
  RECORDER_NAME,
  RecorderControlSchema,
  RrwebEventSchema,
  recorderConfig,
  type RrwebEvent,
} from './shared/protocol.js'
import {createEventRing} from './server/ring.js'
import {createCaptureHub} from './server/hub.js'
import {createChromiumRenderer, type KeyframeRenderer} from './server/render.js'
import {distill} from './server/distill.js'
import type {RecorderRuntime} from './server/runtime.js'
import {startTool, stopTool, pullTool} from './tool/server.js'

const recorderOs = os.$context<{request: Request}>()

const RangeInput = z.object({fromTs: z.number().optional(), toTs: z.number().optional()})

export function makeRecorderRouter(runtime: RecorderRuntime) {
  return recorderOs.router({
    config: recorderOs.handler(() => runtime.config),
    flush: recorderOs
      .input(z.object({clientId: z.string(), events: z.array(RrwebEventSchema)}))
      .output(z.object({ok: z.literal(true)}))
      .handler(({input}) => {
        runtime.ring.append(
          input.clientId,
          input.events.map((event): RrwebEvent => event),
        )
        return {ok: true}
      }),
    window: recorderOs.input(RangeInput).handler(({input}) => ({events: runtime.ring.window(input)})),
    log: recorderOs.input(RangeInput).handler(({input}) => ({entries: distill(runtime.ring.window(input))})),
    control: recorderOs.output(eventIterator(RecorderControlSchema)).handler(async function* ({signal}) {
      yield* subscriptionIterator((emit) => runtime.hub.subscribe(emit), signal)
    }),
  })
}

export type RecorderRouter = ReturnType<typeof makeRecorderRouter>

export default defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startTool, stopTool, pullTool],
}).server((server) => {
  const ring = createEventRing({windowMs: server.config.windowMinutes * 60_000})
  const hub = createCaptureHub(ring)
  const rendererState: {value?: Promise<KeyframeRenderer | null>} = {}
  const renderer = (): Promise<KeyframeRenderer | null> => {
    rendererState.value ??= createChromiumRenderer()
    return rendererState.value
  }
  const runtime: RecorderRuntime = {ring, hub, config: server.config, renderer}
  return {
    context: {recorder: runtime},
    router: makeRecorderRouter(runtime),
    dispose: async () => {
      const active = await rendererState.value?.catch(() => null)
      await active?.dispose()
    },
  }
})
```

If the zod-parsed flush events don't structurally satisfy `RrwebEvent` (the `data: z.unknown()` field parses to `unknown` — it does match), drop the redundant `.map` and pass `input.events` directly.

- [ ] **Step 6: Write the failing engine IT (mirrors `packages/extensions/test-runner/test/extension.it.test.ts`)**

`test/extension.it.test.ts`:

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {start, type Engine} from '@conciv/core'
import {makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import recorderExtension, {type RecorderRouter} from '../src/server.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const extensions: AnyExtension[] = [recorderExtension]

function recorderClient(base: string) {
  return makeExtRpcClient<RecorderRouter>(base, 'recorder')
}

async function boot(): Promise<{base: string; engine: Engine}> {
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-recorder-it-'))
  const engine = await start({
    options: {systemPrompt: false, stateRoot},
    root: mkdtempSync(join(tmpdir(), 'conciv-recorder-root-')),
    launchEditor: () => {},
    extensions,
  })
  return {base: `http://127.0.0.1:${engine.port}`, engine}
}

const page = {
  id: 1,
  type: 0,
  childNodes: [
    {
      id: 2,
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          id: 3,
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {id: 4, type: 2, tagName: 'button', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Buy'}]},
          ],
        },
      ],
    },
  ],
}

function fixtureStream(base: number): RrwebEvent[] {
  return [
    {type: 4, data: {href: 'http://localhost/app', width: 800, height: 600}, timestamp: base},
    {type: 2, data: {node: page}, timestamp: base + 1},
    {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: base + 500},
  ]
}

describe('recorder extension booted in the real engine (IT)', () => {
  it('round-trips flush -> window -> log over the extension rpc', async () => {
    const {base, engine} = await boot()
    try {
      const rpc = recorderClient(base)
      await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
      const {events} = await rpc.window({})
      expect(events.length).toBe(3)
      const {entries} = await rpc.log({})
      expect(entries.map((entry) => entry.kind)).toEqual(['navigation', 'click'])
      expect(entries[1]?.detail).toContain('Buy')
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('serves parsed config defaults on the config route', async () => {
    const {base, engine} = await boot()
    try {
      const config = await recorderClient(base).config(undefined)
      expect(config).toEqual({masking: 'none', windowMinutes: 10, console: true})
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('registers the three tools on /api/mcp and recording_pull returns the action log', async () => {
    const {base, engine} = await boot()
    try {
      await recorderClient(base).flush({clientId: 'c1', events: fixtureStream(Date.now() - 2000)})
      const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
      const tools = await mcp.tools()
      const names = tools.map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining(['recording_start', 'recording_stop', 'recording_pull']))
      const pull = tools.find((tool) => tool.name === 'recording_pull')
      if (!pull?.execute) throw new Error('recording_pull not registered')
      const raw = String(await pull.execute({secondsBack: 60, keyframes: 0}))
      expect(raw).toContain('click')
      expect(raw).toContain('Buy')
      await mcp.close()
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('start/stop capture emits control events to subscribers and returns the marked window', async () => {
    const {base, engine} = await boot()
    try {
      const rpc = recorderClient(base)
      const abort = new AbortController()
      const control = await rpc.control(undefined, {signal: abort.signal})
      const seen: unknown[] = []
      const pump = (async () => {
        for await (const message of control) seen.push(message)
      })()
      const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
      const tools = await mcp.tools()
      const startTool = tools.find((tool) => tool.name === 'recording_start')
      const stopTool = tools.find((tool) => tool.name === 'recording_stop')
      if (!startTool?.execute || !stopTool?.execute) throw new Error('tools missing')
      const started = JSON.parse(String(await startTool.execute({}))) as {captureId: string}
      await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
      const stopped = String(await stopTool.execute({captureId: started.captureId, keyframes: 0}))
      expect(stopped).toContain('click')
      expect(seen).toContainEqual({live: true})
      abort.abort()
      await pump.catch(() => {})
      await mcp.close()
    } finally {
      await engine.stop()
    }
  }, 30_000)
})
```

Note on the MCP tool result shape: extension tool results returning ContentPart arrays may serialize differently through `/api/mcp` (test-runner's returns JSON). If `String(await pull.execute(...))` yields JSON of the parts array, assert with `expect(raw).toContain('click')` still holds (the text part contains the log). Adjust parsing, not behavior.

- [ ] **Step 7: Run the IT**

Run from `packages/extensions/recorder`: `pnpm vitest run test/extension.it.test.ts`
(Requires `@conciv/core` built: `pnpm turbo run build --filter=@conciv/core` first if dist is stale.)
Expected: PASS (4 tests)

- [ ] **Step 8: Full package gate + commit**

Run: `pnpm turbo run build typecheck --filter=@conciv/extension-recorder && pnpm vitest run`
Expected: all green.

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): extension server with ring, capture hub, oRPC router, and recording tools" -- packages/extensions/recorder
```

---

### Task 6: Chromium keyframe renderer

**Files:**

- Modify: `packages/extensions/recorder/src/server/render.ts` (replace the null stub)
- Test: `packages/extensions/recorder/test/render.it.test.ts`

**Interfaces:**

- Consumes: `RrwebEvent`, `Keyframe` from shared protocol.
- Produces: working `createChromiumRenderer(): Promise<KeyframeRenderer | null>` — resolves `null` when Chromium can't launch; `render` resolves `[]` for unreplayable input.

- [ ] **Step 1: Write the failing IT**

```ts
import {afterAll, describe, expect, it} from 'vitest'
import {createChromiumRenderer, type KeyframeRenderer} from '../src/server/render.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const page = {
  id: 1,
  type: 0,
  childNodes: [
    {
      id: 2,
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          id: 3,
          type: 2,
          tagName: 'body',
          attributes: {style: 'background: rgb(200, 30, 30)'},
          childNodes: [
            {id: 4, type: 2, tagName: 'h1', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Recorded'}]},
          ],
        },
      ],
    },
  ],
}

const events: RrwebEvent[] = [
  {type: 4, data: {href: 'http://localhost/app', width: 640, height: 480}, timestamp: 1000},
  {type: 2, data: {node: page, initialOffset: {left: 0, top: 0}}, timestamp: 1001},
  {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
]

const state: {renderer?: KeyframeRenderer | null} = {}

afterAll(async () => state.renderer?.dispose())

describe('chromium keyframe renderer (IT)', () => {
  it('renders a non-empty PNG at a requested timestamp', async () => {
    state.renderer = await createChromiumRenderer()
    if (!state.renderer) throw new Error('chromium unavailable on this machine — install playwright browsers')
    const frames = await state.renderer.render(events, [2000])
    expect(frames).toHaveLength(1)
    expect(frames[0]?.ts).toBe(2000)
    const png = Buffer.from(frames[0]?.pngBase64 ?? '', 'base64')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.length).toBeGreaterThan(2000)
  }, 60_000)

  it('returns [] for a stream with no full snapshot', async () => {
    if (!state.renderer) throw new Error('renderer missing')
    const frames = await state.renderer.render([events[2] ?? {type: 3, data: {}, timestamp: 1}], [2000])
    expect(frames).toEqual([])
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify it fails** (the stub returns null → first test throws)

Run: `pnpm vitest run test/render.it.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the renderer**

```ts
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import type {Keyframe, RrwebEvent} from '../shared/protocol.js'

export type KeyframeRenderer = {
  render(events: RrwebEvent[], timestamps: number[]): Promise<Keyframe[]>
  dispose(): Promise<void>
}

const require = createRequire(import.meta.url)

function rrwebAssets(): {script: string; style: string} {
  const packageRoot = dirname(require.resolve('rrweb/package.json'))
  return {script: join(packageRoot, 'dist', 'rrweb.umd.cjs'), style: join(packageRoot, 'dist', 'style.css')}
}

export async function createChromiumRenderer(): Promise<KeyframeRenderer | null> {
  const launched = await launchChromium()
  if (!launched) return null
  const browser = launched
  return {
    async render(events, timestamps) {
      if (!events.some((event) => event.type === 2)) return []
      const assets = rrwebAssets()
      const page = await browser.newPage({viewport: viewportOf(events)})
      try {
        await page.setContent('<!doctype html><html><body><div id="replay"></div></body></html>')
        await page.addStyleTag({path: assets.style})
        await page.addScriptTag({path: assets.script})
        const frames: Keyframe[] = []
        for (const ts of timestamps) {
          await page.evaluate(seekScript, {events, ts})
          const shot = await page.screenshot({type: 'png'})
          frames.push({ts, pngBase64: shot.toString('base64')})
        }
        return frames
      } finally {
        await page.close()
      }
    },
    dispose: () => browser.close(),
  }
}

async function launchChromium() {
  try {
    const {chromium} = await import('playwright-core')
    return await chromium.launch()
  } catch {
    return null
  }
}

function viewportOf(events: RrwebEvent[]): {width: number; height: number} {
  const meta = events.find((event) => event.type === 4)
  const data = meta?.data
  const size = typeof data === 'object' && data !== null ? (data as {width?: number; height?: number}) : {}
  return {width: size.width ?? 1024, height: size.height ?? 768}
}

const seekScript = `({events, ts}) => {
  const mount = document.querySelector('#replay')
  mount.innerHTML = ''
  const replayer = new window.rrweb.Replayer(events, {root: mount})
  replayer.pause(ts - events[0].timestamp)
}`
```

Two details to verify against the installed packages while implementing (read `node_modules/rrweb/dist/` directly, don't guess):

1. The UMD global name — `window.rrweb.Replayer` is the rrweb v2 UMD surface; confirm by grepping the UMD file for the export assignment. If v2 splits it (e.g. `window.rrwebReplay`), adjust `seekScript`.
2. `page.evaluate` with a string function: Playwright accepts a string body; if typing fights, write `seekScript` as a real function `(arg: {events: unknown[]; ts: number}) => void` declared inside `page.evaluate((arg) => {...}, {events, ts})` — the function is serialized, so it must not close over module scope. The `as` cast in `viewportOf` is forbidden by style rules — replace with a zod `safeParse` of `{width, height}` (same pattern as `distill.ts`'s `meta` schema).

Also note the `viewportOf` snippet above violates the no-`as` rule as written — implement it with zod:

```ts
const metaSize = z.object({width: z.number().optional(), height: z.number().optional()})

function viewportOf(events: RrwebEvent[]): {width: number; height: number} {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  const size = parsed.success ? parsed.data : {}
  return {width: size.width ?? 1024, height: size.height ?? 768}
}
```

- [ ] **Step 4: Run the IT to verify it passes**

Run: `pnpm vitest run test/render.it.test.ts`
Expected: PASS (2 tests). If Chromium is genuinely unavailable the first test throws with the install hint — install via `pnpm exec playwright install chromium` (repo already depends on Playwright).

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): headless-chromium keyframe renderer over the rrweb UMD replayer" -- packages/extensions/recorder
```

---

### Task 7: Client wiring — boot driver, store, client.tsx + testkit e2e

**Files:**

- Create: `packages/extensions/recorder/src/client/recorder-store.ts`
- Create: `packages/extensions/recorder/src/client/boot.ts`
- Create: `packages/extensions/recorder/src/client/capture-driver.tsx`
- Modify: `packages/extensions/recorder/src/client.tsx` (replace stub)
- Test: `packages/extensions/recorder/test/e2e.it.test.ts`

**Interfaces:**

- Consumes: `startCapture`, `createFlusher` (Task 4), `RecorderRouter` (Task 5), host API (`getHostApi().useApiBase()`).
- Produces: client extension default export used by Task 8's panel and Task 9's registration.

- [ ] **Step 1: Implement `src/client/recorder-store.ts`**

```ts
import {createSignal} from 'solid-js'

export type RecorderStatus = 'starting' | 'recording' | 'failed'

export type RecorderStore = {
  status: () => RecorderStatus
  setStatus: (status: RecorderStatus) => void
  live: () => boolean
  setLive: (live: boolean) => void
}

export function createRecorderStore(): RecorderStore {
  const [status, setStatus] = createSignal<RecorderStatus>('starting')
  const [live, setLive] = createSignal(false)
  return {status, setStatus, live, setLive}
}
```

- [ ] **Step 2: Implement `src/client/boot.ts`**

```ts
import {makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type RrwebEvent} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import {startCapture} from './capture.js'
import {createFlusher} from './flusher.js'
import type {RecorderStore} from './recorder-store.js'

const RECONNECT_MS = 1000

export function bootRecorder(apiBase: string, store: RecorderStore): () => void {
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const clientId = crypto.randomUUID()
  const abort = new AbortController()
  let stopRecord: (() => void) | undefined
  let flusher: ReturnType<typeof createFlusher> | undefined

  const flushListeners: [string, () => void][] = []
  const listenFlush = (target: Window | Document, name: string): void => {
    const handler = (): void => void flusher?.flushNow()
    target.addEventListener(name, handler)
    flushListeners.push([name, () => target.removeEventListener(name, handler)])
  }

  const controlLoop = async (): Promise<void> => {
    while (!abort.signal.aborted) {
      try {
        const control = await rpc.control(undefined, {signal: abort.signal})
        for await (const message of control) {
          if (message.flush) await flusher?.flushNow()
          if (message.live !== undefined) {
            flusher?.setLive(message.live)
            store.setLive(message.live)
          }
        }
      } catch {
        if (abort.signal.aborted) return
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS))
      }
    }
  }

  const begin = async (): Promise<void> => {
    try {
      const config = await rpc.config(undefined)
      flusher = createFlusher({send: (events: RrwebEvent[]) => rpc.flush({clientId, events}).then(() => undefined)})
      stopRecord = startCapture(config, (event) => flusher?.push(event))
      listenFlush(window, 'error')
      listenFlush(window, 'unhandledrejection')
      listenFlush(window, 'beforeunload')
      listenFlush(document, 'visibilitychange')
      store.setStatus('recording')
      void controlLoop()
    } catch {
      store.setStatus('failed')
    }
  }

  void begin()

  return () => {
    abort.abort()
    stopRecord?.()
    for (const [, off] of flushListeners) off()
    flusher?.dispose()
  }
}
```

- [ ] **Step 3: Implement `src/client/capture-driver.tsx` and replace `src/client.tsx`**

`src/client/capture-driver.tsx`:

```tsx
import {onCleanup, onMount, type JSX} from 'solid-js'
import {getHostApi} from '@conciv/extension'
import {bootRecorder} from './boot.js'
import type {RecorderStore} from './recorder-store.js'

export function CaptureDriver(props: {store: RecorderStore}): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  onMount(() => {
    const dispose = bootRecorder(apiBase, props.store)
    onCleanup(dispose)
  })
  return <></>
}
```

`src/client.tsx` (panel view arrives in Task 8; wire `views: []` for now):

```tsx
import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'
import {createRecorderStore} from './client/recorder-store.js'
import {CaptureDriver} from './client/capture-driver.js'
import {startToolClient, stopToolClient, pullToolClient} from './tool/client.js'

const store = createRecorderStore()

function Surface() {
  return <CaptureDriver store={store} />
}

export const recorder = defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startToolClient, stopToolClient, pullToolClient],
  Surface,
}).client(() => ({value: {store}}))

export default recorder
```

Verify during implementation that `Surface` is mounted unconditionally at widget boot (`packages/extension/src/mount-extension.tsx:31` mounts a `HostApiProvider slot="surface"` — confirm the widget app renders extension Surfaces on boot the way whiteboard's overlay Surface is). If Surface mounts lazily, move `bootRecorder` into the `views` panel's mount AND file that as a spec deviation to raise with the user — flight recording must not depend on the panel.

Note the module-scope `store` — mirror how terminal does it (`createTerminalStore()` inside `.client()`); if a shared instance between `Surface` and `.client()` value is awkward, create the store inside `.client()` and pass it to `Surface` via `recorder.useContext()` from within the component, exactly like whiteboard's `Surface` reads `whiteboard.useContext((context) => context)` (`packages/extensions/whiteboard/src/client.tsx:36-39`). Prefer the useContext pattern — no module-scope mutable state.

- [ ] **Step 4: Write the failing testkit e2e**

`test/e2e.it.test.ts`:

```ts
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import recorderServer from '../src/server.js'

const clientEntry = fileURLToPath(new URL('../src/client.tsx', import.meta.url))

const ctx: {api?: ExtensionTestApi} = {}

beforeAll(async () => {
  ctx.api = await getExtensionTestApi({server: recorderServer, clientEntry})
}, 120_000)

afterAll(async () => ctx.api?.dispose())

describe('recorder end to end (real browser, real engine)', () => {
  it('records real page interaction and recording_pull returns a matching action log', async () => {
    const api = ctx.api
    if (!api) throw new Error('testkit not booted')
    await api.page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Order pizza'
      button.id = 'order'
      document.body.appendChild(button)
    })
    await api.page.click('#order')
    const result = await api.callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    const text = JSON.stringify(result)
    expect(text).toContain('click')
    expect(text).toContain('Order pizza')
  }, 120_000)

  it('marked capture start/stop brackets only the actions in between', async () => {
    const api = ctx.api
    if (!api) throw new Error('testkit not booted')
    const started = await api.callTool('recording_start', {})
    const captureId = JSON.parse(JSON.stringify(started)).captureId ?? extractCaptureId(started)
    await api.page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'During capture'
      button.id = 'during'
      document.body.appendChild(button)
    })
    await api.page.click('#during')
    const stopped = await api.callTool('recording_stop', {captureId, keyframes: 0})
    expect(JSON.stringify(stopped)).toContain('During capture')
  }, 120_000)
})

function extractCaptureId(result: unknown): string {
  const match = JSON.stringify(result).match(/"captureId"\s*:\s*"([^"]+)"/)
  if (!match?.[1]) throw new Error(`no captureId in ${JSON.stringify(result)}`)
  return match[1]
}
```

Check `makeCallTool`'s exact call/return shape in `packages/harness-testkit` before finalizing (`api.callTool` signature: `(name, input) => Promise<unknown>` presumed — read `packages/harness-testkit/src` and match existing usage in terminal/whiteboard tests). Simplify `extractCaptureId` to whatever the real return shape allows; the regex fallback is the worst case.

- [ ] **Step 5: Build, run, iterate**

The testkit builds the client entry itself; the extension server import runs from `src/`. Run:
`pnpm turbo run build --filter=@conciv/extension-recorder` then `pnpm vitest run test/e2e.it.test.ts`
Expected: PASS (2 tests). Typical failures to expect and fix here: Surface not mounted (see Step 3 note), rrweb bundling issues in the testkit host build, control-channel timing (pull happens before first flush — the `{flush: true}` control + `awaitCoverage` path is exactly what makes this pass).

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): client capture driver with adaptive flush and control channel, e2e-tested" -- packages/extensions/recorder
```

---

### Task 8: Replay panel view

**Files:**

- Create: `packages/extensions/recorder/src/client/panel-view.tsx`
- Modify: `packages/extensions/recorder/src/client.tsx` (add `views`)

**Interfaces:**

- Consumes: `RecorderRouter.window`, `rrweb-player`, `getHostApi().useComposerInsert()`, `recorder.useContext()` store.

- [ ] **Step 1: Implement `src/client/panel-view.tsx`**

```tsx
import {createResource, onCleanup, Show, type JSX} from 'solid-js'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import {RECORDER_NAME, type ActionLogEntry} from '../shared/protocol.js'
import type {RecorderRouter} from '../server.js'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'

export function RecorderPanelView(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const insert = host.useComposerInsert()
  const rpc = makeExtRpcClient<RecorderRouter>(apiBase, RECORDER_NAME)
  const [window] = createResource(() => rpc.window({}))
  const [log] = createResource(() => rpc.log({}))

  const mountPlayer = async (container: HTMLDivElement): Promise<void> => {
    const events = (await rpc.window({})).events
    if (events.length < 2) return
    const {default: Player} = await import('rrweb-player')
    const style = document.createElement('style')
    style.textContent = `${rrwebCss}\n${playerCss}`
    container.appendChild(style)
    const player = new Player({
      target: container,
      props: {events, width: container.clientWidth || 640, autoPlay: false},
    })
    onCleanup(() => player.$destroy())
  }

  const sendToAgent = (): void => {
    const entries = log()?.entries ?? []
    const text = entries.map((entry: ActionLogEntry) => `[${entry.kind}] ${entry.detail}`).join('\n')
    insert(`Here is what just happened in my app (recorded):\n${text}`)
  }

  return (
    <div class="flex flex-col gap-2 p-2 min-h-0">
      <Show
        when={(window()?.events.length ?? 0) >= 2}
        fallback={<div class="text-sm opacity-70">No recording yet — interact with the page first.</div>}
      >
        <div ref={(el) => void mountPlayer(el)} class="min-h-0 overflow-auto" />
        <button type="button" class="self-start" onClick={sendToAgent}>
          Send to agent
        </button>
      </Show>
    </div>
  )
}
```

Adaptation notes for the implementer (verify each against the installed code, not memory):

- `rrweb-player` v2 export shape: check `node_modules/rrweb-player/package.json` `exports` and the `.d.ts` — it is Svelte-compiled; the constructor/props API (`new Player({target, props})`, `$destroy()`) is the documented surface. If v2 renamed `$destroy` to `destroy`, follow the types.
- rrweb-player styles must reach the widget's SHADOW ROOT — the `<style>` injected inside the panel container is inside the shadow DOM, which is the working pattern (whiteboard inlines excalidraw CSS the same way — `packages/extensions/whiteboard/src/client/overlay.tsx:146`).
- `useComposerInsert` returns the insert function — check its exact call signature in `packages/extension/src/hooks.tsx:32` usage sites (grep `useComposerInsert` in `apps/conciv`).
- Styled controls: if a plain `<button>` looks off in the widget theme, use the ui-kit-system button primitives; icon-only buttons MUST be `TooltipIconButton`.
- The panel is user-facing UI: loading state (`createResource` pending), empty state, and the failed-capture state (`store.status() === 'failed'` → show a degraded notice) are all required — wire the store via `recorder.useContext()`.

- [ ] **Step 2: Register the view in `src/client.tsx`**

```tsx
import {Clapperboard} from 'lucide-solid'
import {RecorderPanelView} from './client/panel-view.js'
```

Add to the meta:

```tsx
views: [{id: 'recorder', label: 'Recorder', icon: Clapperboard, Component: RecorderPanelView}],
```

- [ ] **Step 3: Verify in the e2e**

Extend `test/e2e.it.test.ts` with a panel smoke test only if the testkit host exposes view navigation (check `packages/extension-testkit/src/host/` for how views open; terminal's `terminal-view.it.test.ts` is the reference — mirror its open-view mechanism). Assert: after interactions, opening the recorder view shows the rrweb-player root (`.rr-player` element) — locate via `api.page.locator('.rr-player')` piercing shadow DOM (Playwright locators pierce open shadow roots automatically).

```ts
it('panel shows a scrubbable replay after activity', async () => {
  const api = ctx.api
  if (!api) throw new Error('testkit not booted')
  await openView(api.page, 'Recorder')
  await expect.poll(() => api.page.locator('.rr-player').count()).toBeGreaterThan(0)
}, 120_000)
```

(`openView` = whatever helper the terminal view IT uses; copy that mechanism, do not invent one.)

- [ ] **Step 4: Build + run all package tests**

Run: `pnpm turbo run build --filter=@conciv/extension-recorder && pnpm vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/recorder
git commit -m "feat(recorder): replay panel with rrweb-player and send-to-agent" -- packages/extensions/recorder
```

---

### Task 9: Registration, publish guards, changeset

**Files:**

- Modify: `packages/it/src/plugin-instance.ts`
- Modify: `packages/it/package.json` (add dependency)
- Modify: `packages/publish/src/guards.ts` (add to `PUBLIC_PACKAGES`)
- Create: `.changeset/recorder-extension.md`

- [ ] **Step 1: Register in `packages/it/src/plugin-instance.ts`**

```ts
import {fileURLToPath} from 'node:url'
import {createConcivUnplugin} from '@conciv/plugin'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import recorder from '@conciv/extension-recorder'

export const unplugin = createConcivUnplugin({
  serverExtensions: [terminal, testRunner, whiteboard, recorder],
  clientEntries: [
    fileURLToPath(import.meta.resolve('@conciv/extension-terminal/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-test-runner/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-whiteboard/client')),
    fileURLToPath(import.meta.resolve('@conciv/extension-recorder/client')),
  ],
  embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
})
```

Add `"@conciv/extension-recorder": "workspace:^"` to `packages/it/package.json` dependencies (match how the other three extensions are declared there), then `pnpm install`.

- [ ] **Step 2: Add to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`**

Open the file, find the `PUBLIC_PACKAGES` list, add `'@conciv/extension-recorder'` in the same position/order convention as the other extension packages.

- [ ] **Step 3: Write the changeset**

`.changeset/recorder-extension.md`:

```md
---
'@conciv/extension-recorder': patch
---

New recorder extension: always-on rrweb session recording of the host page with agent tools (recording_start/stop/pull) that return a distilled action log plus keyframe screenshots, and a replay panel.
```

(All `@conciv/*` are version-fixed — one entry bumps the whole set.)

- [ ] **Step 4: Verify the whole repo still gates**

Run from root:

```bash
pnpm typecheck && pnpm build && pnpm turbo run test --filter=@conciv/extension-recorder --filter=@conciv/it --filter=@conciv/publish --force
```

Expected: all green. (Full `pnpm test` is the Task 10 gate.)

- [ ] **Step 5: Commit**

```bash
git add packages/it packages/publish .changeset pnpm-lock.yaml
git commit -m "feat(recorder): register recorder extension in @conciv/it and publish guards" -- packages/it packages/publish .changeset pnpm-lock.yaml
```

---

### Task 10: Final gates

- [ ] **Step 1: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Fix every INTRODUCED finding (dead code, unused exports/deps, duplication, complexity, circular deps). Before deleting any "unused" export, verify with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.

- [ ] **Step 2: Full repo gates, uncached**

```bash
pnpm typecheck && pnpm build && pnpm turbo run test --force
```

Expected: all green. Also run `pnpm lint` and `pnpm format:check`.

- [ ] **Step 3: Live verification**

Boot a real dev loop (`pnpm dev` example app that serves the widget), interact with the host page, and in the widget chat ask the agent to "pull the last minute of recording" — confirm the tool returns a log + keyframes and the Recorder panel replays. This is the spec's acceptance: user/agent interaction recorded and delivered to the agent.

- [ ] **Step 4: Commit any fixes; do NOT push**

Commit remaining fixes with pathspec. Pushing waits for the user's own verification (repo rule).
