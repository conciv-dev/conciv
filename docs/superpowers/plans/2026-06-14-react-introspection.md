# React Introspection (locate / tree / inspect / find) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the agent four React-aware page verbs — `locate` (DOM element → component + source `file:line` + ancestor stack), `tree` (component hierarchy for a subtree), `inspect` (props/state/hooks for an element), and `find` (component name → live element refs).

**Architecture:** The widget (browser) extracts **raw** React fiber data via `bippy` — masquerading as React DevTools, reading the fiber straight off the DOM node's internal key (no early hook install needed). For `locate`, the browser returns raw stack frames (chunk URL + line/col); the **core engine** (server-side, has filesystem + http access) symbolicates them via `@jridgewell/trace-mapping` — reading source maps off disk (`file://`, Next RSC server chunks) or over http (`http://`, Vite/client chunks). The split is deliberate: frame extraction is pure-React and framework-agnostic; symbolication is one resolver with two fetch branches keyed on URL scheme. `tree`/`inspect`/`find` return browser fiber data directly (no symbolication).

**Tech Stack:** TypeScript, `bippy@0.5.41` (widget dep, fiber access), `@jridgewell/trace-mapping@0.3.31` (core dep, source-map resolution), Solid widget, h3 engine, vitest (core unit + widget browser-IT) + Playwright (example e2e).

**Proven by spike (2026-06-14):** Next App Router RSC server `<h1>` → `app/page.tsx:17` (file:// + Turbopack **sectioned** map → must use `AnyMap`, not `TraceMap`); TanStack Start Vite client `<h1>` → `index.tsx` (http + inline `data:` map). Same ~30-line resolver, both frameworks.

**Known requirements carried from the spike:**

1. Turbopack maps are **sectioned** → resolver must use `AnyMap`/`FlattenMap`, never `TraceMap`.
2. Vite maps are **inline `data:`** in the served module → read `//# sourceMappingURL=` comment, decode base64.
3. URL normalize: strip `about://React/Server/` prefix, strip `?query`, handle `file://` + `http` + bare path.
4. **Hydration timing:** fibers attach to DOM nodes only after hydration. The bridge must **retry-until-fiber** (rAF loop), not read immediately. TanStack's streamed SSR had zero `__reactFiber` keys pre-hydration.
5. Line precision: Next resolves exactly; Vite resolves to the right **file** but coarse line (the `?tsr-split=component` virtual module). v1 asserts exact line for Next, file-match for Vite.

**Dev-only safety:** The aidx widget is injected only by the dev plugin and only activates when its probe to the dev engine succeeds, so `bippy` (private React internals) never runs in production. No extra gating task; noted here intentionally.

**Shippable milestone:** Tasks 0–5 + 8 deliver `locate` end-to-end (the headline). Tasks 6–7 + 9 add `tree`/`inspect`/`find`. Task 10 is the cross-framework e2e.

---

### Task 0: Add dependencies

**Files:**

- Modify: `packages/widget/package.json` (add `bippy` to `dependencies`)
- Modify: `packages/core/package.json` (add `@jridgewell/trace-mapping` to `dependencies`, `@jridgewell/gen-mapping` to `devDependencies`)

- [ ] **Step 1: Add bippy to the widget**

Run:

```bash
pnpm --filter @aidx/widget add bippy@0.5.41
```

Expected: `dependencies` gains `"bippy": "0.5.41"`.

- [ ] **Step 2: Add trace-mapping (runtime) + gen-mapping (test fixture builder) to core**

Run:

```bash
pnpm --filter @aidx/core add @jridgewell/trace-mapping@0.3.31
pnpm --filter @aidx/core add -D @jridgewell/gen-mapping
```

Expected: core `dependencies` gains `@jridgewell/trace-mapping`, `devDependencies` gains `@jridgewell/gen-mapping`.

- [ ] **Step 3: Verify install + typecheck still green**

Run: `pnpm turbo run typecheck`
Expected: PASS (no usage yet, just confirms install didn't break resolution).

- [ ] **Step 4: Commit**

```bash
git add packages/widget/package.json packages/core/package.json pnpm-lock.yaml
git commit -m "build: add bippy (widget) and trace-mapping (core) for React introspection"
```

---

### Task 1: Protocol — register the four React verbs

**Files:**

- Modify: `packages/protocol/src/page-types.ts:6-37` (add kinds), `:41-62` (leave MUTATING_KINDS unchanged — these are reads)
- Test: `packages/protocol/test/react-verbs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/protocol/test/react-verbs.test.ts
import {describe, expect, it} from 'vitest'
import {PAGE_QUERY_KINDS, MUTATING_KINDS, PageQuerySchema} from '../src/page-types.js'

describe('react verbs', () => {
  it('registers locate/tree/inspect/find as known kinds', () => {
    for (const k of ['locate', 'tree', 'inspect', 'find'] as const) {
      expect(PAGE_QUERY_KINDS).toContain(k)
    }
  })

  it('treats them as non-mutating reads', () => {
    for (const k of ['locate', 'tree', 'inspect', 'find']) {
      expect(MUTATING_KINDS).not.toContain(k)
    }
  })

  it('accepts find with a component name in `name`', () => {
    const parsed = PageQuerySchema.safeParse({kind: 'find', name: 'LoginForm'})
    expect(parsed.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/protocol exec vitest run test/react-verbs.test.ts`
Expected: FAIL — `PAGE_QUERY_KINDS` does not contain `'locate'`.

- [ ] **Step 3: Add the four kinds**

In `packages/protocol/src/page-types.ts`, add to the `PAGE_QUERY_KINDS` array (after `'snapshot'`, grouped with reads):

```ts
  'snapshot',
  'locate',
  'tree',
  'inspect',
  'find',
  'wait',
```

Leave `MUTATING_KINDS` unchanged (the four verbs are reads). The existing `name` and `selector`/`ref` fields in `PageQuerySchema` cover their params — no new field needed (`find` reuses `name` for the component name; `locate`/`inspect`/`tree` use `selector`/`ref`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/protocol exec vitest run test/react-verbs.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (proves the Record types now demand handlers + CLI rows — expected to fail in widget/cli until Tasks 4 & 7)**

Run: `pnpm --filter @aidx/protocol run typecheck`
Expected: PASS for protocol itself. (Workspace-wide typecheck will fail until `DOM_HANDLERS` and `PAGE_VERBS` cover the new kinds — that is the compile-time drift guard working as intended.)

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/page-types.ts packages/protocol/test/react-verbs.test.ts
git commit -m "feat(protocol): register react verbs locate/tree/inspect/find"
```

---

### Task 2: Core symbolicator

**Files:**

- Create: `packages/core/src/page/symbolicate.ts`
- Test: `packages/core/test/page/symbolicate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/page/symbolicate.test.ts
import {afterEach, describe, expect, it} from 'vitest'
import {writeFile, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {symbolicateFrame, symbolicateFrames} from '../../src/page/symbolicate.js'

const written: string[] = []
afterEach(async () => {
  for (const f of written.splice(0)) await rm(f, {force: true})
})

// Build a chunk whose generated (line 2, col 0) maps to source:line:col, with an inline data map.
async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const map = toEncodedMap(gen)
  const b64 = Buffer.from(JSON.stringify(map)).toString('base64')
  const path = join(tmpdir(), `aidx-chunk-${Math.random().toString(36).slice(2)}.js`)
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  written.push(path)
  return path
}

describe('symbolicateFrame', () => {
  it('resolves a file:// frame via an inline data map', async () => {
    const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrame({fileName: `file://${path}`, line: 2, column: 1})
    expect(loc).toEqual({file: 'app/page.tsx', line: 17, column: 4})
  })

  it('strips the about://React/Server/ prefix and ?query', async () => {
    const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrame({fileName: `about://React/Server/file://${path}?42`, line: 2, column: 1})
    expect(loc?.file).toBe('app/page.tsx')
  })

  it('resolves a sectioned (Turbopack-style) source map via AnyMap', async () => {
    const gen = new GenMapping()
    addMapping(gen, {generated: {line: 1, column: 0}, source: 'src/routes/index.tsx', original: {line: 5, column: 2}})
    const sectioned = {version: 3 as const, sections: [{offset: {line: 0, column: 0}, map: toEncodedMap(gen)}]}
    const b64 = Buffer.from(JSON.stringify(sectioned)).toString('base64')
    const path = join(tmpdir(), `aidx-sect-${Math.random().toString(36).slice(2)}.js`)
    await writeFile(path, `void 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
    written.push(path)
    const loc = await symbolicateFrame({fileName: `file://${path}`, line: 1, column: 1})
    expect(loc?.file).toBe('src/routes/index.tsx')
  })

  it('resolves an http frame via the injected fetch', async () => {
    const gen = new GenMapping()
    addMapping(gen, {generated: {line: 2, column: 0}, source: 'src/App.tsx', original: {line: 9, column: 0}})
    const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
    const body = `void 0;\nvoid 1;\n//# sourceMappingURL=data:application/json;base64,${b64}`
    const fakeFetch = (async () => new Response(body)) as unknown as typeof fetch
    const loc = await symbolicateFrame(
      {fileName: 'http://localhost:3000/src/App.tsx?x=1', line: 2, column: 1},
      fakeFetch,
    )
    expect(loc?.file).toBe('src/App.tsx')
  })

  it('skips node_modules frames in symbolicateFrames', async () => {
    const nm = await chunkWithInlineMap('node_modules/next/dist/x.js', 1, 0)
    const app = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrames([
      {fileName: `file://${nm}`, line: 2, column: 1},
      {fileName: `file://${app}`, line: 2, column: 1},
    ])
    expect(loc?.file).toBe('app/page.tsx')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/core exec vitest run test/page/symbolicate.test.ts`
Expected: FAIL — cannot find module `../../src/page/symbolicate.js`.

- [ ] **Step 3: Implement the symbolicator**

```ts
// packages/core/src/page/symbolicate.ts
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {AnyMap, originalPositionFor} from '@jridgewell/trace-mapping'

// A raw stack frame from the browser: chunk URL plus 1-based line/column.
export type RawFrame = {fileName: string; line: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}

const SERVER_PREFIX = /^about:\/\/React\/Server\//

// Strip React's synthetic server-chunk prefix and any ?query so the URL is fetchable.
function normalizeUrl(url: string): string {
  return url.replace(SERVER_PREFIX, '').split('?')[0]
}

// Read a chunk or map by URL scheme: file:// off disk, http over fetch, bare path off disk.
async function readUrl(url: string, fetchImpl: typeof fetch): Promise<string> {
  const clean = normalizeUrl(url)
  if (clean.startsWith('file://')) return readFile(fileURLToPath(clean), 'utf8')
  if (clean.startsWith('http')) return (await fetchImpl(clean)).text()
  return readFile(clean, 'utf8')
}

// Discover and load the source map for a chunk: inline data: map, sourceMappingURL comment, or sibling .map.
async function loadSourceMap(chunkUrl: string, fetchImpl: typeof fetch): Promise<unknown> {
  const clean = normalizeUrl(chunkUrl)
  const js = await readUrl(chunkUrl, fetchImpl)
  const m = js.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m)
  if (m) {
    const u = m[1].trim()
    if (u.startsWith('data:'))
      return JSON.parse(Buffer.from(u.slice(u.indexOf('base64,') + 7), 'base64').toString('utf8'))
    return JSON.parse(await readUrl(new URL(u, clean).href, fetchImpl))
  }
  return JSON.parse(await readUrl(clean + '.map', fetchImpl))
}

// Resolve one raw frame to original source. AnyMap handles both flat and sectioned maps.
export async function symbolicateFrame(frame: RawFrame, fetchImpl: typeof fetch = fetch): Promise<SourceLoc | null> {
  try {
    const map = await loadSourceMap(frame.fileName, fetchImpl)
    const tm = new AnyMap(map as never)
    for (const col of [(frame.column ?? 1) - 1, frame.column ?? 0, 0]) {
      const pos = originalPositionFor(tm, {line: frame.line, column: Math.max(0, col)})
      if (pos.source) return {file: pos.source, line: pos.line ?? frame.line, column: pos.column ?? 0}
    }
  } catch {
    return null
  }
  return null
}

// First frame that resolves to non-dependency source wins (skips framework internals).
export async function symbolicateFrames(
  frames: RawFrame[],
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  for (const frame of frames) {
    const loc = await symbolicateFrame(frame, fetchImpl)
    if (loc && !loc.file.includes('node_modules')) return loc
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/core exec vitest run test/page/symbolicate.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/page/symbolicate.ts packages/core/test/page/symbolicate.test.ts
git commit -m "feat(core): source-map symbolicator (file:// disk + http fetch, AnyMap)"
```

---

### Task 3: Widget React bridge — raw fiber extraction

**Files:**

- Create: `packages/widget/src/react-bridge.ts`
- Modify: `packages/widget/src/page-snapshot.ts` (export `addRef` helper)

- [ ] **Step 1: Add the `addRef` helper to page-snapshot**

In `packages/widget/src/page-snapshot.ts`, after `buildSnapshot`, add:

```ts
// Register a single element in the ref registry without resetting it (used by react verbs,
// which coexist with the last DOM snapshot's refs).
export function addRef(el: Element, refs: Refs): string {
  refs.n += 1
  const ref = `v${refs.n}`
  refs.map.set(ref, new WeakRef(el))
  return ref
}
```

- [ ] **Step 2: Implement the bridge**

```ts
// packages/widget/src/react-bridge.ts
import {
  getFiberFromHostInstance,
  getFiberStack,
  getDisplayName,
  isCompositeFiber,
  getNearestHostFiber,
  traverseFiber,
} from 'bippy'
import {parseStack, hasDebugStack, getFallbackOwnerStack, formatOwnerStack} from 'bippy/source'
import {getFiberHooks} from 'bippy/source'
import {addRef, type Refs} from './page-snapshot.js'

export type RawFrame = {fileName?: string; line?: number; column?: number; fn?: string}
export type LocateResult = {component: string | null; stack: string[]; frames: RawFrame[]}
export type TreeNode = {component: string; ref: string; children: TreeNode[]}
export type InspectResult = {component: string | null; props: unknown; hooks: unknown}

const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

// Fibers attach to DOM nodes only after hydration — retry across frames before giving up.
async function fiberForEl(el: Element, tries = 20): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    const f = getFiberFromHostInstance(el)
    if (f) return f
    await raf()
  }
  return null
}

function compositeNames(fiber: any): string[] {
  return getFiberStack(fiber)
    .filter((f: any) => isCompositeFiber(f))
    .map((f: any) => getDisplayName(f) || '?')
}

// Raw owner-stack frames (chunk URL + line/col) for the engine to symbolicate. No in-browser resolution.
function rawFrames(fiber: any): RawFrame[] {
  const stack = hasDebugStack(fiber) ? fiber._debugStack.stack : getFallbackOwnerStack(fiber)
  return parseStack(formatOwnerStack(stack)).map((fr) => ({
    fileName: fr.fileName,
    line: fr.lineNumber,
    column: fr.columnNumber,
    fn: fr.functionName,
  }))
}

export async function locate(el: Element): Promise<LocateResult | null> {
  const fiber = await fiberForEl(el)
  if (!fiber) return null
  const names = compositeNames(fiber)
  return {component: names[0] ?? null, stack: names, frames: rawFrames(fiber)}
}

export async function inspect(el: Element): Promise<InspectResult | null> {
  const fiber = await fiberForEl(el)
  if (!fiber) return null
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: any) => isCompositeFiber(f))
  if (!composite) return null
  return {component: getDisplayName(composite) || null, props: composite.memoizedProps, hooks: getFiberHooks(composite)}
}

// Build a component tree from the root host element's fiber subtree, assigning a ref per component
// (mapped to its nearest host element so the agent can target it with other verbs).
export async function tree(root: Element, refs: Refs): Promise<TreeNode[]> {
  const rootFiber = await fiberForEl(root)
  if (!rootFiber) return []
  const out: TreeNode[] = []
  const byFiber = new Map<any, TreeNode>()
  traverseFiber(rootFiber, (node: any) => {
    if (!isCompositeFiber(node)) return false
    const host = getNearestHostFiber(node)
    const el = host?.stateNode instanceof Element ? host.stateNode : null
    const tn: TreeNode = {component: getDisplayName(node) || '?', ref: el ? addRef(el, refs) : '', children: []}
    byFiber.set(node, tn)
    let parent = node.return
    while (parent && !byFiber.has(parent)) parent = parent.return
    if (parent) byFiber.get(parent)!.children.push(tn)
    else out.push(tn)
    return false
  })
  return out
}

export function find(name: string, refs: Refs): {ref: string; component: string}[] {
  const anchor = document.querySelector('#__next, #root, body')
  const start = anchor ? getFiberFromHostInstance(anchor) : null
  if (!start) return []
  const stack = getFiberStack(start)
  const rootFiber = stack[stack.length - 1] ?? start
  const matches: {ref: string; component: string}[] = []
  traverseFiber(rootFiber, (node: any) => {
    if (isCompositeFiber(node) && getDisplayName(node) === name) {
      const host = getNearestHostFiber(node)
      if (host?.stateNode instanceof Element) matches.push({ref: addRef(host.stateNode, refs), component: name})
    }
    return false
  })
  return matches
}
```

- [ ] **Step 3: Typecheck the widget package**

Run: `pnpm --filter @aidx/widget run typecheck`
Expected: PASS (bridge compiles; bippy types resolve). Handlers not yet wired — that is Task 4.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/react-bridge.ts packages/widget/src/page-snapshot.ts
git commit -m "feat(widget): bippy react bridge (locate/tree/inspect/find raw extraction)"
```

---

### Task 4: Widget handlers — wire the four verbs into the driver

**Files:**

- Modify: `packages/widget/src/page-handlers.ts` (add 4 handlers to `DOM_HANDLERS`, add `locate`/`inspect` to `ELEMENT_KINDS`)

- [ ] **Step 1: Import the bridge and the serializer**

At the top of `packages/widget/src/page-handlers.ts`, add to the imports:

```ts
import * as react from './react-bridge.js'
```

- [ ] **Step 2: Add `locate` and `inspect` to ELEMENT_KINDS**

In the `ELEMENT_KINDS` set, add `'locate'` and `'inspect'` (they resolve a target element; `tree` and `find` do not — `tree` resolves its own root like `snapshot`, `find` uses `name`):

```ts
export const ELEMENT_KINDS = new Set<PageQueryKind>([
  'text',
  'value',
  'attr',
  'locate',
  'inspect',
  'click',
  // …rest unchanged
])
```

- [ ] **Step 3: Add the four handlers to DOM_HANDLERS**

In the `DOM_HANDLERS` object, add (next to the other reads, after `snapshot`):

```ts
  locate: async ({el}) => {
    const result = el ? await react.locate(el) : null
    return result ?? err('no React fiber — element may be outside a React tree or not hydrated yet')
  },
  inspect: async ({el}) => {
    const result = el ? await react.inspect(el) : null
    if (!result) return err('no React fiber for element')
    return {component: result.component, props: serialize(result.props), hooks: serialize(result.hooks)}
  },
  tree: async ({query, refs}) => {
    const root = query.selector ? document.querySelector(query.selector) : document.body
    return root ? {nodes: await react.tree(root, refs)} : err('no root element')
  },
  find: ({query, refs}) =>
    query.name ? {matches: react.find(query.name, refs)} : err('find requires a component name (--name)'),
```

Note: `locate`/`inspect` receive a guaranteed-non-null `el` only because they are in `ELEMENT_KINDS` (the driver short-circuits null) — but they are written defensively (`el ?`) because they are `async` and not wrapped by the sync `onEl` helper.

- [ ] **Step 4: Typecheck — the `Record<PageQueryKind, PageHandler>` type now passes**

Run: `pnpm --filter @aidx/widget run typecheck`
Expected: PASS (all kinds have handlers).

- [ ] **Step 5: Build the widget global bundle (needed by the widget browser-IT and example e2e)**

Run: `pnpm turbo run build --filter=@aidx/widget`
Expected: PASS — produces `packages/widget/dist/aidx-widget.global.js` containing bippy.

- [ ] **Step 6: Commit**

```bash
git add packages/widget/src/page-handlers.ts
git commit -m "feat(widget): locate/tree/inspect/find page handlers"
```

---

### Task 5: Core — symbolicate `locate` replies

**Files:**

- Modify: `packages/core/src/api/page/page.ts` (enrich the `locate` reply in `handleVerb`)
- Test: `packages/core/test/api/page/page.it.test.ts` (add a locate enrichment case)

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/api/page/page.it.test.ts` a case that drives the bus with a scripted widget reply carrying raw frames and asserts the engine attaches a symbolicated `source`. Follow the existing harness in that file for connecting a fake widget (subscribe to `/api/page/stream`, POST `/api/page/reply`). The reply payload for `locate` is `{component, stack, frames}`; the frame points at a temp chunk with an inline map (reuse the `chunkWithInlineMap` pattern from `test/page/symbolicate.test.ts` — extract it to `test/page/fixtures.ts` and import from both):

```ts
it('enriches a locate reply with symbolicated source', async () => {
  const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4) // shared fixture helper
  const reply = {component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]}
  const data = await driveVerb('locate', {selector: 'h1'}, reply) // harness: ask + auto-reply
  expect(data.component).toBe('Home')
  expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
})
```

If the existing IT file has no reusable `driveVerb` helper, add one mirroring the file's existing connect/ask/reply flow. Expected initial state: FAIL — `data.source` is `undefined`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/core exec vitest run test/api/page/page.it.test.ts -t "enriches a locate"`
Expected: FAIL — `data.source` is undefined.

- [ ] **Step 3: Enrich locate in handleVerb**

In `packages/core/src/api/page/page.ts`, import the symbolicator and enrich after `bus.ask`:

```ts
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'
```

Inside `handleVerb`, replace `return data` with:

```ts
if (verb === 'locate' && Array.isArray(data.frames)) {
  const source = await symbolicateFrames(data.frames as RawFrame[])
  return {...data, source}
}
return data
```

(Place the journal-append block as-is before this; `locate` is non-mutating so it is not journaled.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/core exec vitest run test/api/page/page.it.test.ts -t "enriches a locate"`
Expected: PASS.

- [ ] **Step 5: Full core test run**

Run: `pnpm --filter @aidx/core exec vitest run`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/page/page.ts packages/core/test/api/page/page.it.test.ts packages/core/test/page/fixtures.ts
git commit -m "feat(core): symbolicate locate replies to source file:line"
```

---

### Task 6: CLI — generate the four agent commands

**Files:**

- Modify: `packages/cli/src/page.ts:18-50` (add 4 rows to `PAGE_VERBS`)
- Test: `packages/cli/test/cli.it.test.ts` (assert request shape for the new verbs)

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/test/cli.it.test.ts`:

```ts
import {pageRequest} from '../src/page.js'

it('builds GET requests for react verbs', () => {
  expect(pageRequest('locate', {selector: 'h1'})).toEqual({method: 'GET', path: '/api/page/locate?selector=h1'})
  expect(pageRequest('inspect', {ref: 'v3'})).toEqual({method: 'GET', path: '/api/page/inspect?ref=v3'})
  expect(pageRequest('tree', {selector: 'main'})).toEqual({method: 'GET', path: '/api/page/tree?selector=main'})
  expect(pageRequest('find', {name: 'LoginForm'})).toEqual({method: 'GET', path: '/api/page/find?name=LoginForm'})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/cli exec vitest run test/cli.it.test.ts -t "react verbs"`
Expected: FAIL — `PAGE_VERBS` missing `locate` (TS error) or wrong path.

- [ ] **Step 3: Add the four rows to PAGE_VERBS**

In `packages/cli/src/page.ts`, add to the `PAGE_VERBS` table (after `snapshot`):

```ts
  locate: {method: 'GET', targetsElement: true, flags: []},
  inspect: {method: 'GET', targetsElement: true, flags: []},
  tree: {method: 'GET', targetsElement: true, flags: []},
  find: {method: 'GET', targetsElement: false, flags: ['name']},
```

(`tree` lists `targetsElement: true` so it accepts the optional `--ref`/positional selector for the root; the handler defaults to `document.body` when absent. `find` is targetless and carries `--name`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/cli exec vitest run test/cli.it.test.ts -t "react verbs"`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole workspace (drift guard now fully satisfied)**

Run: `pnpm turbo run typecheck`
Expected: PASS across all packages.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/page.ts packages/cli/test/cli.it.test.ts
git commit -m "feat(cli): page locate/tree/inspect/find commands"
```

---

### Task 7: Widget browser-IT — driver dispatches react verbs

**Files:**

- Modify: `packages/widget/test/widget.it.test.ts` (add a React fixture page + assert the driver returns fiber data in a real browser)

- [ ] **Step 1: Add a minimal React fixture to the harness**

The existing harness serves a static probe `<div>`. Add a second fixture page that mounts a tiny React app from a CDN (esm.sh) so real fibers exist, embedding the built widget bundle. Add near `pageHtml()`:

```ts
function reactFixtureHtml(): string {
  return `<!doctype html><html><head><meta name="pw-api-base" content=""></head><body>
    <div id="root"></div>
    <script type="module">
      import {createElement as h} from 'https://esm.sh/react@19.2.4'
      import {createRoot} from 'https://esm.sh/react-dom@19.2.4/client'
      function Widget(){ return h('button', {id:'btn'}, 'hi') }
      createRoot(document.getElementById('root')).render(h(Widget))
      window.__READY__ = true
    </script>
    <script>${widgetBundle}</script>
  </body></html>`
}
```

- [ ] **Step 2: Write the failing test**

Add a test that loads the React fixture, waits for hydration, and drives the page driver directly in the browser (the bundle exposes the driver via the page bus; reuse the harness's existing page-bus push/reply flow with `{kind:'locate', selector:'#btn'}` and assert the reply has `component: 'Widget'` and a non-empty `frames` array):

```ts
it('locate returns the React component for a host element', async () => {
  // serve reactFixtureHtml(); page.goto; waitForFunction(() => window.__READY__)
  // wait for fibers: waitForFunction(() => Object.keys(document.getElementById('btn')).some(k=>k.startsWith('__reactFiber')))
  // push {requestId:'r1', kind:'locate', selector:'#btn'} over the scripted stream; capture the /api/page/reply body
  expect(reply.data.component).toBe('Widget')
  expect(Array.isArray(reply.data.frames)).toBe(true)
})
```

Wire it using the file's existing scripted page-bus server (the one that already handles `PAGE_QUERY`). Expected initial state: FAIL until the bundle from Task 4 is built.

- [ ] **Step 3: Ensure the bundle is current**

Run: `pnpm turbo run build --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/widget exec vitest run test/widget.it.test.ts -t "locate returns"`
Expected: PASS (real Chromium, real React, real bippy in the bundle).

- [ ] **Step 5: Commit**

```bash
git add packages/widget/test/widget.it.test.ts
git commit -m "test(widget): browser-IT for locate against a real React fixture"
```

---

### Task 8: E2E — `locate` to source in the Next.js example

**Files:**

- Create: `apps/examples/nextjs-app/tests/react-locate.e2e.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import {test, expect} from '@playwright/test'

// The widget + engine are live (instrumentation boots the engine on :41700; widget probes it).
// Driving `aidx tools page locate` through the engine HTTP API proves the full chain:
// browser fiber extraction → engine symbolication → source file:line.
test('locate resolves the <h1> to app/page.tsx via the engine', async ({page, request}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
  // Engine runs on the pinned dev port; call its page API directly.
  const res = await request.get('http://localhost:41700/api/page/locate?selector=h1', {timeout: 15_000})
  const body = await res.json()
  expect(body.component).toBe('Home')
  expect(body.source.file).toContain('app/page.tsx')
  expect(body.source.line).toBe(17)
})
```

(If CORS/credentials block a cross-origin `request.get`, drive it from within the page via `page.evaluate(() => fetch('http://localhost:41700/api/page/locate?selector=h1', {credentials:'include'}).then(r=>r.json()))` — the widget's CORS already allows the page origin.)

- [ ] **Step 2: Run the e2e**

Run: `pnpm -C apps/examples/nextjs-app exec playwright test tests/react-locate.e2e.spec.ts`
Expected: PASS — `Home`, `app/page.tsx`, line `17`.

- [ ] **Step 3: Commit**

```bash
git add apps/examples/nextjs-app/tests/react-locate.e2e.spec.ts
git commit -m "test(e2e): locate resolves Next.js <h1> to app/page.tsx"
```

---

### Task 9: E2E — `tree` / `inspect` / `find` in the Next.js example

**Files:**

- Create: `apps/examples/nextjs-app/tests/react-verbs.e2e.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import {test, expect} from '@playwright/test'

const api = (path: string) => `http://localhost:41700/api/page/${path}`

test('tree returns a component hierarchy', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
  const tree = await page.evaluate(
    (u) => fetch(u, {credentials: 'include'}).then((r) => r.json()),
    api('tree?selector=main'),
  )
  expect(Array.isArray(tree.nodes)).toBe(true)
  expect(tree.nodes.length).toBeGreaterThan(0)
  expect(typeof tree.nodes[0].component).toBe('string')
})

test('inspect returns props for a component element', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
  const out = await page.evaluate(
    (u) => fetch(u, {credentials: 'include'}).then((r) => r.json()),
    api('inspect?selector=h1'),
  )
  expect(out).toHaveProperty('component')
  expect(out).toHaveProperty('props')
})

test('find returns refs by component name', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Open aidx chat'})).toBeVisible({timeout: 30_000})
  const out = await page.evaluate(
    (u) => fetch(u, {credentials: 'include'}).then((r) => r.json()),
    api('find?name=Home'),
  )
  expect(Array.isArray(out.matches)).toBe(true)
  expect(out.matches.some((m: {component: string}) => m.component === 'Home')).toBe(true)
})
```

- [ ] **Step 2: Run the e2e**

Run: `pnpm -C apps/examples/nextjs-app exec playwright test tests/react-verbs.e2e.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/examples/nextjs-app/tests/react-verbs.e2e.spec.ts
git commit -m "test(e2e): tree/inspect/find verbs in the Next.js example"
```

---

### Task 10: E2E — cross-framework `locate` in TanStack Start

**Files:**

- Create: `apps/examples/tanstack-start/e2e/react-locate.spec.ts`

- [ ] **Step 1: Write the e2e test (with hydration wait — gotcha #4)**

```ts
import {test, expect} from '@playwright/test'

// Cross-framework proof: same browser bridge + same engine symbolicator, Vite http source maps.
// Vite resolves to the correct file; line is coarse (the ?tsr-split=component virtual module),
// so assert the file, not the exact line (gotcha #5).
test('locate resolves the TanStack <h1> to src/routes/index.tsx', async ({page}) => {
  await page.goto('/')
  // Fibers attach only after hydration (gotcha #4).
  await page.waitForFunction(
    () => {
      for (const el of document.querySelectorAll('*'))
        if (Object.keys(el).some((k) => k.startsWith('__reactFiber'))) return true
      return false
    },
    null,
    {timeout: 15_000},
  )
  const body = await page.evaluate(
    (u) => fetch(u, {credentials: 'include'}).then((r) => r.json()),
    'http://localhost:41700/api/page/locate?selector=h1',
  )
  expect(body.component).toBe('App')
  expect(body.source.file).toContain('index.tsx')
})
```

(Confirm the TanStack example's engine port. If it differs from `41700`, read it from the example's `instrumentation`/config and substitute. If no engine is wired into the TanStack example yet, that wiring is a prerequisite — verify `@aidx/plugin` is registered in its `vite.config.ts` the same way the Next example wires it; if absent, add a Task 10a to wire it before this test.)

- [ ] **Step 2: Run the e2e**

Run: `pnpm -C apps/examples/tanstack-start exec playwright test e2e/react-locate.spec.ts`
Expected: PASS — `App`, file contains `index.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/examples/tanstack-start/e2e/react-locate.spec.ts
git commit -m "test(e2e): cross-framework locate resolves TanStack <h1> to index.tsx"
```

---

## Self-Review notes

- **Spec coverage:** all four verbs have a protocol entry (T1), widget bridge fn (T3), handler (T4), CLI command (T6), and e2e (T8/T9/T10). `locate` symbolication is T2+T5. Cross-framework requirement is T10.
- **Type consistency:** `RawFrame` is defined in both `react-bridge.ts` (widget, browser shape) and `symbolicate.ts` (core) — intentional, they are different packages with no shared import; fields (`fileName`, `line`, `column`, `fn`) match by name so the JSON crosses the bus cleanly. `SourceLoc` (`{file, line, column}`) is core-only and is what `locate.source` carries. Handler return keys (`component`, `stack`, `frames`, `nodes`, `matches`, `props`, `hooks`) are referenced identically in handlers (T4), core enrichment (T5), and e2e assertions (T8–T10).
- **Open prerequisite flagged:** T10 assumes the TanStack example has the aidx engine wired (port + plugin). Verify before T10; add wiring as T10a if missing.
- **Known imprecision accepted for v1:** Vite `locate` line is coarse (asserted at file level in T10). Follow-up: pick the most-specific frame / column-base tuning.
