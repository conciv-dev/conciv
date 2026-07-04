# Canvas AI Drawing v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whiteboard agent iterates on drawings in a hidden draft, sees its own work via server-side and browser rendering, and commits polished editable Excalidraw drawings revealed by the agent cursor.

**Architecture:** Drawing tools write `stage: 'draft'` rows to `canvasPending`; the browser island converts them into a new `canvasDraftElements` table (never the visible scene). `canvas.preview` rasterizes draft elements server-side via takumi for the fast critique loop; `canvas.export png` round-trips through the island's `exportToBlob` for ground truth. `canvas.commit` asks the island to replay the draft into `canvasElements` with the agent cursor performing. A new core turn-end hook auto-commits abandoned drafts. A new core MCP image-result path returns PNGs to the agent.

**Tech Stack:** Jazz tables (`jazz-tools`), Solid island hosting React Excalidraw 0.18, zod tool defs via `@conciv/extension`, `@takumi-rs/core` (new dep, approved), vitest + Playwright ITs via `@conciv/extension-testkit`.

**Spec:** `docs/superpowers/specs/2026-07-04-canvas-ai-drawing-v2-design.md`

## Execution Status

- **Task 1: COMPLETE** — commit `6b776f8` on `worktree-canvas-drawing-v2`. Test + implementation landed exactly as specified below (one deviation: the probe extension is `defineExtension({name: 'turn-probe', tools: []})` — `defineExtension` has no required `configSchema` field). Start at Task 2.
- Tasks 2–11: not started.

## Verified Codebase Facts (read during Task 1 — trust these over guesses)

- **Build before testing core:** `@conciv/core` tests import workspace deps from their built `dist`. Run `pnpm turbo build --filter @conciv/core...` once before the first core test run, or every file fails with `Failed to resolve entry for package "@conciv/harness"`. Same rule for the whiteboard: `pnpm turbo build --filter @conciv/extension-whiteboard...` before its ITs.
- **Committing new files:** `git commit -- <paths>` rejects untracked paths. `git add <new files>` first, then the pathspec commit. Verify author on every commit: `git log -1 --format='%an %ae'` must show the `omridevk` noreply email (public repo).
- **Testkit `callTool` is the MCP path**, not a direct execute call: `packages/extension-testkit/src/call-tool.ts` → `createMCPClient` (`@tanstack/ai-mcp`) → `POST /api/mcp` with the session header. String results get a `JSON.parse` attempt; non-strings return as-is. This matters for every image-returning tool test (Tasks 7–8): after Task 2, the MCP layer converts `ImageResult` markers into MCP content blocks, so `callTool` will NOT return the raw `{__concivImage}` marker.
- **`ExtensionTestApi` fields** (`packages/extension-testkit/src/get-extension-test-api.ts`): `page`, `callTool`, `session` (the session id string — there is no `sessionId` field), `apiBase`, `secondClient()`, `dispose()`. It exposes no server context today; Task 9 adds that.
- **Testkit boot chain** (for Task 9's accessor): `getExtensionTestApi` → `bootExtensionServer` (`boot-server.ts`) → `start()` from `@conciv/core/engine` (`packages/core/src/engine.ts`) → `makeApp` (`packages/core/src/app.ts`). The mounted `ServerResult.context` lives only inside `makeApp`'s `mounted` array; exposing it to tests means threading it through all four layers (see Task 9 Step 1).
- **`packages/extension/src/index.ts`** is the single public export surface (`export {defineTool} from './define-tool.js'` at line 9) — Task 2's new exports go there.
- **`packages/core/src/api/mcp/mcp.ts`**: `registerTool` is lines 11–19 and matches the shape Task 2 expects to replace.
- **Island (`src/canvas/island.tsx`) symbols confirmed:** `ElementRow` (line 18), `PendingRow = {id: string; kind: 'skeletons' | 'mermaid'; payload: JsonValue}` (line 19), `asScene` (33), `stableUuid` (41 — **async**, awaited), `skeletonsOf` (52), `applyRemote` (91), `writeLocal` (117), `drainPending` (139 — seeds ids with `` stableUuid(`${row.id}:${index}`) ``), `sweepAgents` interval (187).
- **Task 1 landed interfaces** (consume these as-is): `ServerResult<Context> = {context; turnEnd?: (sessionId: string) => void | Promise<void>; dispose?}` in `packages/extension/src/types.ts`; `makeApp` fires all `turnEnd` hooks via `Promise.allSettled` after each turn stream closes; `registerChatRoutes` now runs after extension mounting in `app.ts`.

## Global Constraints

- Code style: zero comments, functions only (no classes), no `else`, no non-null assertion (`x!`), no `any`/casts beyond the file's existing `as unknown as` bridge idiom, no barrel files, no abbreviated identifiers.
- Tests: real browser via Playwright/testkit for anything touching the island; plain vitest node (`environment: 'node'` already pinned) for server-only logic. Assert observable behavior (tool results, roles, text) — never CSS/classes/data-attributes. No tests in example apps. No jsdom, no mocks.
- Commits: always pathspec (`git commit -- <paths>`); `--no-verify` acceptable (prek race). This worktree's branch: `worktree-canvas-drawing-v2`.
- Build/typecheck via turbo from repo root: `pnpm turbo typecheck --filter <pkg>`.
- Package test command: `pnpm --filter @conciv/extension-whiteboard test -- <file>`; core: `pnpm --filter @conciv/core test -- <file>`.
- New dependency allowed: `@takumi-rs/core` only. Nothing else without stopping.
- All whiteboard paths below are relative to `packages/extensions/whiteboard`.

---

### Task 1: Core turn-end hook

Extension servers need a real lifecycle signal when a harness turn finishes (spec: auto-commit). No hacks: extend `ServerResult`, thread through `makeApp` → `registerChatRoutes` → `registerTurnRoutes`, fire when the turn stream closes.

**Files:**
- Modify: `packages/extension/src/types.ts` (ServerResult)
- Modify: `packages/core/src/app.ts` (collect hooks)
- Modify: `packages/core/src/api/chat/chat.ts` (thread option)
- Modify: `packages/core/src/api/chat/turn.ts` (fire in withLockRelease)
- Test: `packages/core/test/api/chat/turn-end.it.test.ts`

**Interfaces:**
- Produces: `ServerResult<Context> = {context: Context; turnEnd?: (sessionId: string) => void | Promise<void>; dispose?: () => void | Promise<void>}`; `TurnDeps.onTurnEnd?: (sessionId: string) => Promise<void>`. Task 10 consumes `turnEnd` from the whiteboard extension.

- [x] **Step 1: Write the failing test**

`packages/core/test/api/chat/turn-end.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '@conciv/extension'
import {startTestServer} from '../../helpers/server.js'
import {hasClaude, useFakeHarness} from '../../helpers/harness-mode.js'

describe('extension turn-end hook', () => {
  it.skipIf(!hasClaude() && !useFakeHarness)(
    'fires turnEnd with the session id after the turn stream closes',
    async () => {
      const seen: string[] = []
      const probe = defineExtension({
        name: 'turn-probe',
        tools: [],
        configSchema: z.object({}).optional(),
      }).server(async () => ({context: {}, turnEnd: (sessionId) => void seen.push(sessionId)}))
      const {resolve, postChat, close} = await startTestServer({extensions: [probe]})
      try {
        const sessionId = await resolve()
        await postChat({role: 'user', content: 'say the word ok and nothing more'}, sessionId)
        expect(seen).toEqual([sessionId])
      } finally {
        await close()
      }
    },
    120_000,
  )
})
```

Adjust the `defineExtension` call to the actual minimal signature in `packages/extension/src/define-extension.ts` (read it first; if `configSchema` is not a field, drop it — the probe needs only `name`, empty `tools`, and a `.server()`).

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core test -- test/api/chat/turn-end.it.test.ts`
Expected: FAIL — `seen` is `[]` (no hook exists yet).

- [x] **Step 3: Extend ServerResult in the extension package**

`packages/extension/src/types.ts` — replace the existing `ServerResult` line:

```ts
export type ServerResult<Context> = {
  context: Context
  turnEnd?: (sessionId: string) => void | Promise<void>
  dispose?: () => void | Promise<void>
}
```

- [x] **Step 4: Collect hooks in makeApp and thread to chat routes**

`packages/core/src/app.ts` — in the `mounted` mapping, keep the hook next to `dispose`:

```ts
return {extensionName: extension.name, tools, dispose: result?.dispose, turnEnd: result?.turnEnd}
```

After `const disposers = ...` add:

```ts
const turnEnds = mounted.flatMap((entry) => (entry.turnEnd ? [entry.turnEnd] : []))
const onTurnEnd = async (sessionId: string): Promise<void> => {
  await Promise.allSettled(turnEnds.map((hook) => hook(sessionId)))
}
```

Pass `onTurnEnd` into the existing `registerChatRoutes(app, {...})` options object.

**Ordering note:** `registerChatRoutes` is currently called before the `mounted` block. Move the `registerChatRoutes(...)` call to after the extension mounting block (the `riskyTools` computation stays where it is). Verify nothing between them depends on route registration order by running the core test suite in Step 7.

- [x] **Step 5: Thread through chat.ts and fire in turn.ts**

`packages/core/src/api/chat/chat.ts`: add `onTurnEnd?: (sessionId: string) => Promise<void>` to `ChatRouteOpts` and pass it into the `registerTurnRoutes(app, {...})` call at the existing call site (line ~65).

`packages/core/src/api/chat/turn.ts`: add to `TurnDeps`:

```ts
onTurnEnd?: (sessionId: string) => Promise<void>
```

In the `/api/chat` handler pass `deps.onTurnEnd` through to `withLockRelease` and fire it in the `finally`:

```ts
async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  store: SessionStore,
  stateRoot: string,
  sessionId: string,
  onTurnEnd?: (sessionId: string) => Promise<void>,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage) {
        await store.update(sessionId, {usage: tokenUsageToSnapshot(c.usage)})
      }
      yield c
    }
  } finally {
    releaseLock(stateRoot, sessionId)
    await onTurnEnd?.(sessionId)?.catch(() => {})
  }
}
```

`await onTurnEnd?.(...)` with `.catch` chained on an optional call is invalid syntax — write it as:

```ts
if (onTurnEnd) await onTurnEnd(sessionId).catch(() => {})
```

Update the call site: `withLockRelease(merged, deps.store, deps.stateRoot, sessionId, deps.onTurnEnd)`.

- [x] **Step 6: Run the new test to verify it passes**

Run: `pnpm --filter @conciv/core test -- test/api/chat/turn-end.it.test.ts`
Expected: PASS

- [x] **Step 7: Run core + extension package suites and typecheck**

Run: `pnpm turbo typecheck --filter @conciv/core --filter @conciv/extension && pnpm --filter @conciv/core test`
Expected: green (proves the route-registration reorder broke nothing).

- [x] **Step 8: Commit**

```bash
git commit --no-verify -m "feat(core): extension turn-end lifecycle hook" -- packages/extension/src/types.ts packages/core/src/app.ts packages/core/src/api/chat/chat.ts packages/core/src/api/chat/turn.ts packages/core/test/api/chat/turn-end.it.test.ts
```

---

### Task 2: Core MCP image results

Tools currently always return `content: [{type: 'text', ...}]` (`packages/core/src/api/mcp/mcp.ts:16`). Fix at the core: a tool may return an image marker; the MCP layer emits a proper image content block so the model sees pixels.

**Files:**
- Create: `packages/extension/src/image-result.ts`
- Modify: `packages/extension/src/index.ts` — add `export {imageResult, isImageResult} from './image-result.js'` and `export type {ImageResult} from './image-result.js'` beside the existing `defineTool` export (line 9). (Verified: `index.ts` is the package's single export surface.)
- Modify: `packages/core/src/api/mcp/mcp.ts`
- Test: `packages/core/test/api/mcp/image-result.it.test.ts`

**Interfaces:**
- Produces:

```ts
export type ImageResult = {__concivImage: {mimeType: string; dataBase64: string}; detail?: unknown}
export function imageResult(mimeType: string, dataBase64: string, detail?: unknown): ImageResult
export function isImageResult(value: unknown): value is ImageResult
```

Tasks 8 and 9 return `imageResult('image/png', base64, {...})` from whiteboard tools.

- [ ] **Step 1: Write the failing test**

`packages/core/test/api/mcp/image-result.it.test.ts` — follow the shape of `packages/core/test/api/mcp/extension-tools.it.test.ts` (read it first for the exact way it drives `/api/mcp` with an extension tool; reuse its client helper). The essential assertion:

```ts
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool, imageResult} from '@conciv/extension'

const PNG_RED_4x4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

const snap = defineTool<z.ZodObject<{}>, unknown>({
  name: 'probe.snap',
  description: 'returns a png',
  inputSchema: z.object({}),
}).server(() => imageResult('image/png', PNG_RED_4x4, {width: 4}))
```

Register it via a probe extension on the test server, invoke `tools/call` for `probe.snap` through the same MCP client the existing test uses, then:

```ts
expect(result.content).toEqual([
  {type: 'image', data: PNG_RED_4x4, mimeType: 'image/png'},
  {type: 'text', text: JSON.stringify({width: 4})},
])
```

The tanstack MCP client's `tool.execute()` may unwrap or reshape the raw MCP `content` array — assert on whatever it actually returns as long as the image block (`data` + `mimeType`) and the detail text are both present. **Record the exact observed client-side shape in a comment-free way: note it in this plan file under Task 7 Step 7 before moving on** — Tasks 7 and 8 assert on that same shape through the testkit's `callTool` (which uses this identical client).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core test -- test/api/mcp/image-result.it.test.ts`
Expected: FAIL — content is a single text block containing the raw object.

- [ ] **Step 3: Implement the marker in the extension package**

`packages/extension/src/image-result.ts`:

```ts
export type ImageResult = {__concivImage: {mimeType: string; dataBase64: string}; detail?: unknown}

export function imageResult(mimeType: string, dataBase64: string, detail?: unknown): ImageResult {
  return {__concivImage: {mimeType, dataBase64}, detail}
}

export function isImageResult(value: unknown): value is ImageResult {
  if (typeof value !== 'object' || value === null) return false
  const marker = (value as {__concivImage?: {mimeType?: unknown; dataBase64?: unknown}}).__concivImage
  return typeof marker?.mimeType === 'string' && typeof marker?.dataBase64 === 'string'
}
```

Export both from the package's public entry (same file that exports `defineTool`).

- [ ] **Step 4: Emit image content in the MCP layer**

`packages/core/src/api/mcp/mcp.ts` — replace `registerTool`:

```ts
import {isImageResult} from '@conciv/extension'

function toContent(result: unknown): {type: 'text'; text: string}[] | ({type: 'image'; data: string; mimeType: string} | {type: 'text'; text: string})[] {
  if (isImageResult(result)) {
    const text = result.detail === undefined ? [] : [{type: 'text' as const, text: JSON.stringify(result.detail)}]
    return [{type: 'image' as const, data: result.__concivImage.dataBase64, mimeType: result.__concivImage.mimeType}, ...text]
  }
  return [{type: 'text', text: JSON.stringify(result)}]
}

function registerTool(server: McpServer, tool: RegistrableTool, run: (args: unknown) => Promise<unknown>): void {
  server.registerTool(
    tool.name,
    {description: tool.description, inputSchema: tool.inputSchema.shape},
    async (args) => ({content: toContent(await run(args))}),
  )
}
```

Simplify the return type annotation of `toContent` to whatever the MCP SDK's `CallToolResult['content']` type is if importable — prefer the SDK type over the inline union.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @conciv/core test -- test/api/mcp/image-result.it.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm turbo typecheck --filter @conciv/core --filter @conciv/extension
git commit --no-verify -m "feat(core): mcp image content for tool results" -- packages/extension/src packages/core/src/api/mcp/mcp.ts packages/core/test/api/mcp/image-result.it.test.ts
```

---

### Task 3: Whiteboard schema — stage, draft elements, replies

**Files:**
- Modify: `src/shared/schema.ts`
- Test: existing suite (schema-only change)

**Interfaces:**
- Produces tables consumed by every later task:
  - `canvasPending` gains `stage: col.enum('draft', 'live').default('live')` and kinds `'skeletons' | 'mermaid' | 'svg' | 'export' | 'commit' | 'discard'`
  - `canvasDraftElements`: same shape as `canvasElements`
  - `canvasReplies`: `{room: string, requestId: string, kind: 'export', payload: json}`

- [ ] **Step 1: Extend the schema**

In `src/shared/schema.ts` replace `canvasPending` and add two tables after it:

```ts
  canvasPending: schema.table({
    room: col.string(),
    kind: col.enum('skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard'),
    stage: col.enum('draft', 'live').default('live'),
    payload: col.json(),
  }),
  canvasDraftElements: schema.table({
    room: col.string(),
    elementId: col.string(),
    data: col.json(),
    version: col.int(),
  }),
  canvasReplies: schema.table({
    room: col.string(),
    requestId: col.string(),
    kind: col.enum('export'),
    payload: col.json(),
  }),
```

- [ ] **Step 2: Typecheck and run the existing whiteboard suite**

Run: `pnpm turbo typecheck --filter @conciv/extension-whiteboard && pnpm --filter @conciv/extension-whiteboard test`
Expected: green — `stage` defaults to `'live'` so existing pending flows are untouched. The island's `PendingRow` type union will surface as a type error if `kind` narrowing breaks; fix the local `PendingRow` type in `src/canvas/island.tsx` to `{id: string; kind: 'skeletons' | 'mermaid' | 'svg' | 'export' | 'commit' | 'discard'; stage?: 'draft' | 'live'; payload: JsonValue}` now (behavior unchanged: `skeletonsOf` still only handles skeletons/mermaid; add a guard in the pending subscription that skips kinds it does not know yet: `if (row.kind !== 'skeletons' && row.kind !== 'mermaid') return`).

- [ ] **Step 3: Commit**

```bash
git commit --no-verify -m "feat(whiteboard): schema for draft stage, draft elements, replies" -- packages/extensions/whiteboard/src/shared/schema.ts packages/extensions/whiteboard/src/canvas/island.tsx
```

---

### Task 4: Server draft routing + `canvas.svg` tool + scoped read

**Files:**
- Modify: `src/tool/canvas/def.ts`
- Modify: `src/tool/canvas/server.ts`
- Create: `src/tool/canvas/svg-caps.ts`
- Test: `test/canvas-svg-caps.test.ts` (node, no browser)

**Interfaces:**
- Consumes: schema tables from Task 3.
- Produces:
  - `CanvasSvgInput = {svg: string, x: number, y: number, width?: number, roughness?: number}` → pending row `{kind: 'svg', stage: 'draft', payload: {svg, x, y, width, roughness}}`
  - `canvas.draw`/`canvas.diagram`/`canvas.connect` write `stage: 'draft'`
  - `CanvasReadInput = {scope?: 'live' | 'draft'}` — `draft` reads `canvasDraftElements`
  - `validateSvg(svg: string): void` throws descriptive `Error` on caps violation
  - `canvasSvgTool` added to `canvasTools`

- [ ] **Step 1: Write the failing caps test**

`test/canvas-svg-caps.test.ts`:

```ts
import {expect, test} from 'vitest'
import {validateSvg} from '../src/tool/canvas/svg-caps.js'

const wrap = (inner: string): string => `<svg viewBox='0 0 100 100'>${inner}</svg>`

test('accepts a modest svg', () => {
  expect(() => validateSvg(wrap("<rect x='1' y='1' width='10' height='10'/>"))).not.toThrow()
})

test('rejects payloads over 64kb', () => {
  const fat = wrap(`<path d='${'M 0 0 L 1 1 '.repeat(8000)}'/>`)
  expect(() => validateSvg(fat)).toThrow(/64kb/i)
})

test('rejects more than 400 drawable nodes', () => {
  const nodes = "<circle cx='1' cy='1' r='1'/>".repeat(401)
  expect(() => validateSvg(wrap(nodes))).toThrow(/400/)
})

test('rejects markup without an svg root', () => {
  expect(() => validateSvg("<div>nope</div>")).toThrow(/<svg/i)
})

test('rejects script and foreignObject', () => {
  expect(() => validateSvg(wrap('<script>1</script>'))).toThrow(/script/i)
  expect(() => validateSvg(wrap('<foreignObject/>'))).toThrow(/foreignObject/i)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-svg-caps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/tool/canvas/svg-caps.ts`**

```ts
const MAX_BYTES = 64 * 1024
const MAX_NODES = 400
const DRAWABLE = /<(path|rect|circle|ellipse|line|polyline|polygon|text)\b/g

export function validateSvg(svg: string): void {
  if (new TextEncoder().encode(svg).byteLength > MAX_BYTES) throw new Error('svg exceeds 64kb')
  if (!/<svg\b/i.test(svg)) throw new Error('markup must have an <svg> root')
  if (/<script\b/i.test(svg)) throw new Error('script elements are not allowed')
  if (/<foreignObject\b/i.test(svg)) throw new Error('foreignObject elements are not allowed')
  const nodes = svg.match(DRAWABLE)?.length ?? 0
  if (nodes > MAX_NODES) throw new Error(`svg has ${nodes} drawable nodes, limit is 400`)
}
```

- [ ] **Step 4: Run caps test to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-svg-caps.test.ts`
Expected: PASS

- [ ] **Step 5: Add defs**

`src/tool/canvas/def.ts` — extend:

```ts
export const CanvasReadInput = z.object({scope: z.enum(['live', 'draft']).default('live')})
export const CanvasSvgInput = z.object({
  svg: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  roughness: z.number().min(0).max(2).default(1),
})

export const canvasSvgDef = {
  name: 'canvas.svg',
  description:
    'Draw by writing SVG markup (paths, shapes, text, fills). Converted in the browser into editable Excalidraw elements. Drawings land in the hidden draft; commit publishes them.',
  inputSchema: CanvasSvgInput,
  streamTitle: 'Drawing on the canvas',
  promptSnippet:
    'Use canvas.svg for anything organic or illustrated: write SVG paths with layered fills, then iterate with canvas.preview before canvas.commit.',
}
```

Update `canvasReadDef.description` to mention the `scope` option. Update `canvasDrawDef`/`canvasDiagramDef` descriptions to say drawings go to the hidden draft until commit (full prompt-pack rewrite happens in Task 11 — only factual accuracy here).

- [ ] **Step 6: Route drawing tools to draft + add svg tool + scoped read**

`src/tool/canvas/server.ts`:

- In `canvasDrawTool`, `canvasDiagramTool`, `canvasConnectTool` inserts, add `stage: 'draft'` beside `kind`.
- `canvasReadTool` / `canvasExportTool` (json path) select the table by scope:

```ts
export const canvasReadTool = defineTool<typeof CanvasReadInput, WhiteboardToolContext>(canvasReadDef).server(
  async (input, ctx, request) => {
    const table = input.scope === 'draft' ? app.canvasDraftElements : app.canvasElements
    const rows = await ctx.db.all(table.where({room: ctx.room(request)}), {tier: 'global'})
    return {elements: rows.map((row) => row.data), scope: input.scope}
  },
)
```

- New tool:

```ts
export const canvasSvgTool = defineTool<typeof CanvasSvgInput, WhiteboardToolContext>(canvasSvgDef).server(
  async (input, ctx, request) => {
    validateSvg(input.svg)
    const write = ctx.db.insert(app.canvasPending, {
      room: ctx.room(request),
      kind: 'svg',
      stage: 'draft',
      payload: {svg: input.svg, x: input.x, y: input.y, width: input.width ?? 400, roughness: input.roughness} as JsonValue,
    })
    await write.wait({tier: 'edge'})
    return {pending: write.value.id}
  },
)
```

- Add `canvasSvgTool` to the `canvasTools` array. Import `validateSvg` from `./svg-caps.js` and the new defs.

- [ ] **Step 7: Typecheck + full whiteboard suite**

Run: `pnpm turbo typecheck --filter @conciv/extension-whiteboard && pnpm --filter @conciv/extension-whiteboard test`
Expected: green. Existing canvas ITs still pass because the island drains draft rows in the next task — verify `canvas-drag.it.test.ts` (which draws via UI, not tools) is unaffected; any IT that calls `canvas.draw` and expects live visibility must be updated in Task 5, not here — if one fails here, mark it `test.todo` with a pointer to Task 5 and list it in that task's Step 1.

- [ ] **Step 8: Commit**

```bash
git commit --no-verify -m "feat(whiteboard): canvas.svg tool, draft staging, scoped read" -- packages/extensions/whiteboard/src/tool/canvas packages/extensions/whiteboard/test/canvas-svg-caps.test.ts
```

---

### Task 5: Island draft drain + SVG conversion + invisibility IT

**Files:**
- Create: `src/canvas/svg-convert.ts`
- Modify: `src/canvas/island.tsx`
- Test: `test/canvas-draft.it.test.ts`

**Interfaces:**
- Consumes: pending rows `{kind: 'svg' | 'skeletons' | 'mermaid', stage}` from Task 4.
- Produces: `svgToSkeletons(svgMarkup: string, options: {x: number; y: number; width: number; roughness: number}): ExcalidrawElementSkeleton[]` (browser-only, DOM APIs); draft rows drain into `canvasDraftElements`, live rows into `canvasElements`.

- [ ] **Step 1: Write the failing IT**

`test/canvas-draft.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const CAT_EAR = "<svg viewBox='0 0 100 100'><path d='M 10 90 L 50 10 L 90 90 Z' fill='#f0a860' stroke='#7a4a1e'/><rect x='20' y='20' width='10' height='10' fill='#1e1e1e'/></svg>"

const readElements = async (api: {callTool: (name: string, input: unknown) => Promise<unknown>}, scope: string) => {
  const result = (await api.callTool('canvas.read', {scope})) as {elements: unknown[]}
  return result.elements
}

test('svg drawing lands in the draft, invisible until committed', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: CAT_EAR, x: 100, y: 100, width: 300})
    await expect.poll(() => readElements(api, 'draft'), {timeout: 15_000}).not.toHaveLength(0)
    expect(await readElements(api, 'live')).toHaveLength(0)
    const draft = await readElements(api, 'draft')
    const types = draft.map((element) => (element as {type: string}).type)
    expect(types).toContain('line')
    expect(types).toContain('rectangle')
  } finally {
    await api.dispose()
  }
})

test('rejected svg never reaches the canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await expect(api.callTool('canvas.svg', {svg: '<div/>', x: 0, y: 0})).rejects.toThrow(/<svg/i)
    expect(await readElements(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})
```

`callTool` (`packages/extension-testkit/src/call-tool.ts`) goes over MCP: the MCP server wraps a tool throw into an `isError` text result rather than a transport error, and the tanstack client may surface that as a resolved error payload instead of a rejection. Run the test once and look at what actually comes back for the `<div/>` input; if it resolves, assert the payload contains the `<svg` message text instead of using `rejects`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-draft.it.test.ts`
Expected: FAIL — draft read returns `[]` forever (island skips `svg` kind), poll times out.

- [ ] **Step 3: Implement `src/canvas/svg-convert.ts`**

Port the spike converter (`scratchpad canvas-spike/entry.js`, reproduced here in full — this file is the reference, the spike is gone). Browser-only module: document/DOM APIs allowed, no React/Solid imports.

```ts
import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'

type ConvertOptions = {x: number; y: number; width: number; roughness: number}
type Origin = {x: number; y: number}
type Style = {fill: string | null; stroke: string | null; strokeWidth: number}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

function resolvedStyle(node: Element): Style {
  const style = getComputedStyle(node)
  const fill = style.fill === 'none' ? null : style.fill
  const stroke = style.stroke === 'none' ? null : style.stroke
  return {fill, stroke, strokeWidth: parseFloat(style.strokeWidth) || 1}
}

function applyMatrix(matrix: DOMMatrix, x: number, y: number): Origin {
  return {x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f}
}

function styleFields(node: Element, scale: number, roughness: number): Record<string, unknown> {
  const {fill, stroke, strokeWidth} = resolvedStyle(node)
  return {
    strokeColor: stroke ?? (fill ? 'transparent' : '#1e1e1e'),
    backgroundColor: fill ?? 'transparent',
    fillStyle: 'solid',
    strokeWidth: Math.max(0.5, strokeWidth * scale),
    roughness,
  }
}

function samplePoints(pathNode: SVGPathElement, matrix: DOMMatrix, scale: number, origin: Origin): number[][] | null {
  const total = pathNode.getTotalLength()
  if (!total) return null
  const count = Math.min(220, Math.max(16, Math.round((total * scale) / 4)))
  const points: number[][] = []
  for (let index = 0; index <= count; index += 1) {
    const raw = pathNode.getPointAtLength((total * index) / count)
    const mapped = applyMatrix(matrix, raw.x, raw.y)
    points.push([mapped.x * scale - origin.x, mapped.y * scale - origin.y])
  }
  return points
}

function lineFromPoints(points: number[][], node: Element, scale: number, roughness: number): ExcalidrawElementSkeleton {
  const [first] = points
  const firstX = first?.[0] ?? 0
  const firstY = first?.[1] ?? 0
  const shifted = points.map(([x = 0, y = 0]) => [x - firstX, y - firstY])
  return {type: 'line', x: firstX, y: firstY, points: shifted, ...styleFields(node, scale, roughness)} as ExcalidrawElementSkeleton
}

function splitSubpaths(data: string): string[] {
  const chunks = data.match(/M[^M]*/g)
  return chunks && chunks.length > 1 ? chunks : [data]
}

function convertNode(
  node: Element,
  matrix: DOMMatrix,
  scale: number,
  origin: Origin,
  roughness: number,
  sink: ExcalidrawElementSkeleton[],
): void {
  const tag = node.tagName
  if (tag === 'g' || tag === 'svg') {
    Array.from(node.children).forEach((child) => convertNode(child, matrix, scale, origin, roughness, sink))
    return
  }
  const own = (node as SVGGraphicsElement).transform?.baseVal?.consolidate()?.matrix
  const current = own ? matrix.multiply(own) : matrix
  const attr = (name: string, fallback = '0'): number => parseFloat(node.getAttribute(name) ?? fallback)
  if (tag === 'rect') {
    const at = applyMatrix(current, attr('x'), attr('y'))
    sink.push({
      type: 'rectangle',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y,
      width: attr('width') * current.a * scale,
      height: attr('height') * current.d * scale,
      ...styleFields(node, scale, roughness),
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = attr(tag === 'circle' ? 'r' : 'rx')
    const ry = attr(tag === 'circle' ? 'r' : 'ry')
    const at = applyMatrix(current, attr('cx') - rx, attr('cy') - ry)
    sink.push({
      type: 'ellipse',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y,
      width: rx * 2 * current.a * scale,
      height: ry * 2 * current.d * scale,
      ...styleFields(node, scale, roughness),
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'text') {
    const at = applyMatrix(current, attr('x'), attr('y'))
    const fontSize = (parseFloat(getComputedStyle(node).fontSize) || 16) * scale
    sink.push({
      type: 'text',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y - fontSize,
      text: node.textContent ?? '',
      fontSize,
      strokeColor: resolvedStyle(node).fill ?? '#1e1e1e',
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'line') {
    const from = applyMatrix(current, attr('x1'), attr('y1'))
    const to = applyMatrix(current, attr('x2'), attr('y2'))
    sink.push(
      lineFromPoints(
        [
          [from.x * scale - origin.x, from.y * scale - origin.y],
          [to.x * scale - origin.x, to.y * scale - origin.y],
        ],
        node,
        scale,
        roughness,
      ),
    )
    return
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const numbers = (node.getAttribute('points') ?? '').match(NUMBER)?.map(Number) ?? []
    const pairs: number[][] = []
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      const at = applyMatrix(current, numbers[index] ?? 0, numbers[index + 1] ?? 0)
      pairs.push([at.x * scale - origin.x, at.y * scale - origin.y])
    }
    if (tag === 'polygon' && pairs.length) pairs.push([pairs[0]?.[0] ?? 0, pairs[0]?.[1] ?? 0])
    if (pairs.length > 1) sink.push(lineFromPoints(pairs, node, scale, roughness))
    return
  }
  if (tag === 'path') {
    const parent = node.parentNode
    if (!parent) return
    splitSubpaths(node.getAttribute('d') ?? '').forEach((subpath) => {
      const probe = document.createElementNS(SVG_NAMESPACE, 'path')
      probe.setAttribute('d', subpath)
      parent.appendChild(probe)
      const points = samplePoints(probe, current, scale, origin)
      probe.remove()
      if (points) sink.push(lineFromPoints(points, node, scale, roughness))
    })
  }
}

export function svgToSkeletons(svgMarkup: string, options: ConvertOptions): ExcalidrawElementSkeleton[] {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;'
  host.innerHTML = svgMarkup
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('no <svg> root found')
  document.body.appendChild(host)
  const viewBox = svg.viewBox?.baseVal
  const sourceWidth = viewBox?.width || parseFloat(svg.getAttribute('width') ?? '400')
  const scale = options.width / sourceWidth
  const origin = {x: (viewBox?.x ?? 0) * scale - options.x, y: (viewBox?.y ?? 0) * scale - options.y}
  const sink: ExcalidrawElementSkeleton[] = []
  convertNode(svg, svg.createSVGMatrix() as DOMMatrix, scale, origin, options.roughness, sink)
  host.remove()
  return sink
}
```

The `as ExcalidrawElementSkeleton` casts bridge skeleton unions the same way `island.tsx` already bridges with `as unknown as`; if the skeleton type accepts the literals directly, drop the casts.

- [ ] **Step 4: Wire draft drain in the island**

`src/canvas/island.tsx`:

- Extend `skeletonsOf` for svg rows:

```ts
async function skeletonsOf(row: PendingRow): Promise<ExcalidrawElementSkeleton[]> {
  if (row.kind === 'mermaid') {
    const {parseMermaidToExcalidraw} = await import('@excalidraw/mermaid-to-excalidraw')
    const {source} = row.payload as unknown as {source: string}
    return withStableIds((await parseMermaidToExcalidraw(source, {maxEdges: 500})).elements, row.id)
  }
  if (row.kind === 'svg') {
    const {svgToSkeletons} = await import('./svg-convert.js')
    const {svg, x, y, width, roughness} = row.payload as unknown as {svg: string; x: number; y: number; width: number; roughness: number}
    return withStableIds(svgToSkeletons(svg, {x, y, width, roughness}), row.id)
  }
  return withStableIds((row.payload as unknown as {elements: ExcalidrawElementSkeleton[]}).elements, row.id)
}
```

- In `drainPending`, pick the target table by stage:

```ts
const targetTable = row.stage === 'draft' ? app.canvasDraftElements : app.canvasElements
```

and upsert into `targetTable`. Drawable kinds are `'skeletons' | 'mermaid' | 'svg'`; keep the subscription guard from Task 3 skipping `'export' | 'commit' | 'discard'` (Tasks 7–9 handle those).

- [ ] **Step 5: Run the IT to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-draft.it.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Fix any IT deferred from Task 4, run full suite**

Run: `pnpm --filter @conciv/extension-whiteboard test`
Expected: green. Any test that called `canvas.draw` and asserted live visibility now asserts draft + commit behavior (commit arrives Task 7 — until then update such tests to read `scope: 'draft'`).

- [ ] **Step 7: Commit**

```bash
git commit --no-verify -m "feat(whiteboard): island svg conversion and draft drain" -- packages/extensions/whiteboard/src/canvas packages/extensions/whiteboard/test
```

---

### Task 6: `canvas.commit` / `canvas.discard` + cursor replay

**Files:**
- Modify: `src/tool/canvas/def.ts` (two defs)
- Modify: `src/tool/canvas/server.ts` (two tools)
- Create: `src/canvas/replay.ts`
- Modify: `src/canvas/island.tsx` (handle commit/discard rows, agent cursor performance)
- Test: `test/canvas-commit.it.test.ts`

**Interfaces:**
- Consumes: `canvasDraftElements`, pending kinds `'commit' | 'discard'`.
- Produces:
  - `canvas.commit` input `{}` → inserts `{kind: 'commit', stage: 'live', payload: {}}`; returns `{committed: true}` after the island finishes (server polls `canvasDraftElements` until empty, 15s timeout) or `{committed: false, reason: 'no draft'}` when the draft is empty.
  - `canvas.discard` input `{}` → server deletes draft rows + draft pendings directly (no browser needed), returns `{discarded: <count>}`.
  - `replayDraft(steps, api, writeElement, onDone)` in `replay.ts`: reveals elements over max 3s total, min 60ms per element, one `requestAnimationFrame` chain; moves the agent cursor row to each element's origin as it lands.

- [ ] **Step 1: Write the failing IT**

`test/canvas-commit.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const HOUSE =
  "<svg viewBox='0 0 100 100'><rect x='20' y='50' width='60' height='40' fill='#e8d9b0'/><path d='M 10 50 L 50 15 L 90 50 Z' fill='#c0533f'/></svg>"

const read = async (api: {callTool: (name: string, input: unknown) => Promise<unknown>}, scope: string) =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements

test('commit moves the whole draft to the live canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(2)
    const result = (await api.callTool('canvas.commit', {})) as {committed: boolean}
    expect(result.committed).toBe(true)
    expect(await read(api, 'live')).toHaveLength(2)
    expect(await read(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('discard clears the draft and never touches live', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(2)
    const result = (await api.callTool('canvas.discard', {})) as {discarded: number}
    expect(result.discarded).toBe(2)
    expect(await read(api, 'draft')).toHaveLength(0)
    expect(await read(api, 'live')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('commit with empty draft is a clean no-op', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const result = (await api.callTool('canvas.commit', {})) as {committed: boolean; reason?: string}
    expect(result.committed).toBe(false)
    expect(result.reason).toMatch(/no draft/i)
  } finally {
    await api.dispose()
  }
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-commit.it.test.ts`
Expected: FAIL — unknown tool `canvas.commit`.

- [ ] **Step 3: Defs**

`src/tool/canvas/def.ts`:

```ts
export const CanvasCommitInput = z.object({})
export const CanvasDiscardInput = z.object({})

export const canvasCommitDef = {
  name: 'canvas.commit',
  description: 'Publish the hidden draft to the shared canvas. The agent cursor performs the drawing for the user.',
  inputSchema: CanvasCommitInput,
  streamTitle: 'Publishing the drawing',
  promptSnippet: 'Always finish a drawing with canvas.commit; until then the user sees nothing.',
}

export const canvasDiscardDef = {
  name: 'canvas.discard',
  description: 'Throw away the hidden draft without publishing anything.',
  inputSchema: CanvasDiscardInput,
  promptSnippet: 'Use canvas.discard to abandon a draft and start over.',
}
```

- [ ] **Step 4: Server tools**

`src/tool/canvas/server.ts`:

```ts
const draftRows = async (ctx: WhiteboardToolContext, room: string) =>
  ctx.db.all(app.canvasDraftElements.where({room}), {tier: 'global'})

export const canvasCommitTool = defineTool<typeof CanvasCommitInput, WhiteboardToolContext>(canvasCommitDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await draftRows(ctx, room)
    if (!drafts.length) return {committed: false, reason: 'no draft to commit'}
    await ctx.db.insert(app.canvasPending, {room, kind: 'commit', stage: 'live', payload: {} as JsonValue}).wait({tier: 'edge'})
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const remaining = await draftRows(ctx, room)
      if (!remaining.length) return {committed: true, elements: drafts.length}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('commit timed out: no canvas tab is connected to perform it')
  },
)

export const canvasDiscardTool = defineTool<typeof CanvasDiscardInput, WhiteboardToolContext>(canvasDiscardDef).server(
  async (_input, ctx, request) => {
    const room = ctx.room(request)
    const drafts = await draftRows(ctx, room)
    const pendings = await ctx.db.all(app.canvasPending.where({room, stage: 'draft'}), {tier: 'global'})
    await Promise.all([
      ...drafts.map((row) => ctx.db.delete(app.canvasDraftElements, row.id).wait({tier: 'edge'})),
      ...pendings.map((row) => ctx.db.delete(app.canvasPending, row.id).wait({tier: 'edge'})),
    ])
    return {discarded: drafts.length}
  },
)
```

Add both to `canvasTools`. Also update `canvasUpdateTool`/`canvasDeleteTool` to check `canvasDraftElements` first and fall back to `canvasElements` (same `where({room, elementId})` query against each table in order).

- [ ] **Step 5: Implement `src/canvas/replay.ts`**

```ts
export type ReplayStep = {elementId: string; x: number; y: number; write: () => void}

export type ReplayHandle = {skip: () => void; done: Promise<void>}

export function replayDraft(steps: ReplayStep[], moveCursor: (x: number, y: number) => void): ReplayHandle {
  const perStep = Math.max(60, Math.min(3000 / Math.max(steps.length, 1), 400))
  let skipped = false
  const done = new Promise<void>((resolve) => {
    const run = (index: number): void => {
      if (skipped || index >= steps.length) {
        steps.slice(index).forEach((step) => step.write())
        resolve()
        return
      }
      const step = steps[index]
      if (!step) {
        resolve()
        return
      }
      moveCursor(step.x, step.y)
      step.write()
      setTimeout(() => run(index + 1), perStep)
    }
    run(0)
  })
  return {skip: () => (skipped = true), done}
}
```

- [ ] **Step 6: Island handles commit and discard rows**

`src/canvas/island.tsx` — in the pending subscription, route new kinds to a `performCommit` function instead of the skip-guard:

```ts
const performCommit = async (row: PendingRow): Promise<void> => {
  const drafts = await db().all(app.canvasDraftElements.where({room: props.room}), {tier: 'global'})
  const ordered = drafts.map((draft) => draft as unknown as ElementRow)
  const steps = ordered.map((draft) => {
    const data = draft.data as unknown as {x?: number; y?: number}
    return {
      elementId: draft.elementId,
      x: data.x ?? 0,
      y: data.y ?? 0,
      write: () =>
        void db().upsert(
          app.canvasElements,
          {room: props.room, elementId: draft.elementId, data: draft.data, version: draft.version},
          {id: draft.id},
        ),
    }
  })
  const cursorId = await ensureAgentCursor()
  const {done} = replayDraft(steps, (x, y) => moveAgentCursor(cursorId, x, y))
  await done
  await Promise.all(ordered.map((draft) => db().delete(app.canvasDraftElements, draft.id).wait({tier: 'edge'})))
  await db().delete(app.canvasPending, row.id).wait({tier: 'edge'})
}
```

`ensureAgentCursor` upserts a `cursors` row `{room, peerId: 'agent:' + props.room, kind: 'agent', name: 'drawing…', color: '#8a86e8', x, y, lastSeen: new Date()}` and returns its row id; `moveAgentCursor` updates `x`, `y`, `lastSeen` on it. Look at how `writeLocal` performs updates for the exact `db().update` idiom. The upsert `{id}` reuse in `performCommit` preserves the same stable row ids the draft drain created, so `applyRemote` versioning stays coherent.

The draft-row id equals the id used at drain time (`stableUuid`), and `upsert` into `canvasElements` with `{id: draft.id}` is safe because ids are unique per table row, not global — verified: `drainPending` uses `` await stableUuid(`${row.id}:${index}`) `` per element (`stableUuid` is async). Reuse the same helper.

Skippability: register a one-shot pointerdown listener on the island container during replay that calls `handle.skip()`.

While any draft rows exist (subscribe to `canvasDraftElements`), keep the agent cursor row alive near the draft bounding box (upsert every few seconds with fresh `lastSeen` — the existing `sweepAgents` interval already garbage-collects it once drafts are gone and updates stop).

Discard rows need no island work (server deletes directly) — keep skipping `'discard'` in the subscription, and delete the pending row server-side in the discard tool (already done in Step 4: discard never inserts a pending row; remove `'discard'` from the schema enum in Task 3? No — leave it; canvas.clear reuse may want it later. It stays unused by the island.)

- [ ] **Step 7: Run the IT to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-commit.it.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 8: Full suite + commit**

```bash
pnpm --filter @conciv/extension-whiteboard test
git commit --no-verify -m "feat(whiteboard): commit/discard with cursor replay" -- packages/extensions/whiteboard/src packages/extensions/whiteboard/test/canvas-commit.it.test.ts
```

---

### Task 7: `canvas.preview` — takumi inner loop

**Files:**
- Modify: `package.json` (dependency)
- Create: `src/tool/canvas/draft-svg.ts` (element → SVG serializer)
- Create: `src/tool/canvas/preview.ts` (compose + rasterize)
- Modify: `src/tool/canvas/def.ts`, `src/tool/canvas/server.ts`
- Test: `test/canvas-draft-svg.test.ts` (node), `test/canvas-preview.it.test.ts`

**Interfaces:**
- Consumes: `canvasDraftElements` rows; `imageResult` from Task 2.
- Produces:
  - `draftToSvg(elements: DraftElement[]): string` where `DraftElement = {type: string; x: number; y: number; width?: number; height?: number; points?: number[][]; text?: string; fontSize?: number; strokeColor?: string; backgroundColor?: string; strokeWidth?: number}`
  - `renderDraftPng(svg: string): Promise<string>` (base64) using `@takumi-rs/core`
  - `canvas.preview` tool input `{}` returning `imageResult('image/png', base64, {elements: n})`

- [ ] **Step 1: Add the dependency**

Run from `packages/extensions/whiteboard`: `pnpm add @takumi-rs/core @takumi-rs/helpers`
Then: `git commit --no-verify -m "chore(whiteboard): add takumi renderer" -- packages/extensions/whiteboard/package.json ../../pnpm-lock.yaml` (adjust lockfile path to repo root: `pnpm-lock.yaml`).

- [ ] **Step 2: Write the failing serializer test**

`test/canvas-draft-svg.test.ts`:

```ts
import {expect, test} from 'vitest'
import {draftToSvg} from '../src/tool/canvas/draft-svg.js'

test('serializes rectangle, ellipse, line points and text', () => {
  const {svg} = draftToSvg([
    {type: 'rectangle', x: 10, y: 10, width: 40, height: 20, strokeColor: '#111', backgroundColor: '#eee', strokeWidth: 2},
    {type: 'ellipse', x: 60, y: 10, width: 30, height: 30, strokeColor: '#222', backgroundColor: 'transparent'},
    {type: 'line', x: 5, y: 5, points: [[0, 0], [10, 10], [20, 0]], strokeColor: '#333'},
    {type: 'text', x: 12, y: 40, text: 'hi', fontSize: 16, strokeColor: '#444'},
  ])
  expect(svg).toContain('<svg')
  expect(svg).toContain("<rect x='10' y='10' width='40' height='20'")
  expect(svg).toContain("<ellipse cx='75' cy='25'")
  expect(svg).toContain("<polyline points='5,5 15,15 25,5'")
  expect(svg).toContain('>hi</text>')
})

test('freedraw serializes like line', () => {
  const {svg} = draftToSvg([{type: 'freedraw', x: 0, y: 0, points: [[0, 0], [5, 5]], strokeColor: '#000'}])
  expect(svg).toContain("<polyline points='0,0 5,5'")
})

test('empty draft yields an empty svg canvas with base size', () => {
  const {svg, width, height} = draftToSvg([])
  expect(svg).toContain('<svg')
  expect(width).toBe(440)
  expect(height).toBe(340)
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-draft-svg.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/tool/canvas/draft-svg.ts`**

```ts
export type DraftElement = {
  type: string
  x: number
  y: number
  width?: number
  height?: number
  points?: number[][]
  text?: string
  fontSize?: number
  strokeColor?: string
  backgroundColor?: string
  strokeWidth?: number
}

const escape = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&apos;')

const styleOf = (element: DraftElement): string =>
  `fill='${element.backgroundColor ?? 'transparent'}' stroke='${element.strokeColor ?? '#1e1e1e'}' stroke-width='${element.strokeWidth ?? 1}'`

function nodeOf(element: DraftElement): string {
  if (element.type === 'rectangle' || element.type === 'diamond') {
    return `<rect x='${element.x}' y='${element.y}' width='${element.width ?? 0}' height='${element.height ?? 0}' ${styleOf(element)}/>`
  }
  if (element.type === 'ellipse') {
    const rx = (element.width ?? 0) / 2
    const ry = (element.height ?? 0) / 2
    return `<ellipse cx='${element.x + rx}' cy='${element.y + ry}' rx='${rx}' ry='${ry}' ${styleOf(element)}/>`
  }
  if (element.type === 'text') {
    return `<text x='${element.x}' y='${element.y + (element.fontSize ?? 16)}' font-size='${element.fontSize ?? 16}' fill='${element.strokeColor ?? '#1e1e1e'}'>${escape(element.text ?? '')}</text>`
  }
  const points = (element.points ?? []).map(([px = 0, py = 0]) => `${element.x + px},${element.y + py}`).join(' ')
  if (!points) return ''
  return `<polyline points='${points}' fill='${element.backgroundColor ?? 'none'}' stroke='${element.strokeColor ?? '#1e1e1e'}' stroke-width='${element.strokeWidth ?? 1}'/>`
}

export function draftToSvg(elements: DraftElement[]): {svg: string; width: number; height: number} {
  const xs = elements.flatMap((element) => [element.x, element.x + (element.width ?? 0), ...(element.points ?? []).map(([px = 0]) => element.x + px)])
  const ys = elements.flatMap((element) => [element.y, element.y + (element.height ?? 0), ...(element.points ?? []).map(([, py = 0]) => element.y + py)])
  const width = Math.round(Math.max(400, ...xs) + 40)
  const height = Math.round(Math.max(300, ...ys) + 40)
  const body = elements.map(nodeOf).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' width='${width}' height='${height}'><rect x='0' y='0' width='${width}' height='${height}' fill='#ffffff'/>${body}</svg>`
  return {svg, width, height}
}
```

Mermaid draft rows arrive already converted to elements by the island, so no placeholder branch is needed for drained drafts. Pending-but-undrained rows are simply absent from the preview; the tool reports the drained element count so the agent knows what it is looking at.

- [ ] **Step 5: Run serializer test to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-draft-svg.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `src/tool/canvas/preview.ts` and the tool**

```ts
import {Renderer} from '@takumi-rs/core'
import {container, image, percentage} from '@takumi-rs/helpers'

const renderer = new Renderer()

export async function renderDraftPng(svg: string, width: number, height: number): Promise<string> {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const node = container({
    style: {width: percentage(100), height: percentage(100), backgroundColor: '#ffffff'},
    children: [image({src: dataUri, width, height})],
  })
  const buffer = await renderer.render(node, {width, height, format: 'png'})
  return buffer.toString('base64')
}
```

Def in `def.ts`:

```ts
export const CanvasPreviewInput = z.object({})

export const canvasPreviewDef = {
  name: 'canvas.preview',
  description:
    'Fast server-side PNG of the current hidden draft (approximate: plain shapes, no hand-drawn strokes). Use between refinements; canvas.export png is the ground truth.',
  inputSchema: CanvasPreviewInput,
  streamTitle: 'Checking the draft',
  promptSnippet: 'After drawing into the draft, call canvas.preview, critique the image, refine, repeat.',
}
```

Tool in `server.ts`:

```ts
export const canvasPreviewTool = defineTool<typeof CanvasPreviewInput, WhiteboardToolContext>(canvasPreviewDef).server(
  async (_input, ctx, request) => {
    const rows = await ctx.db.all(app.canvasDraftElements.where({room: ctx.room(request)}), {tier: 'global'})
    if (!rows.length) return {empty: true, reason: 'draft has no elements yet'}
    const elements = rows.map((row) => row.data as unknown as DraftElement)
    const {svg, width, height} = draftToSvg(elements)
    return imageResult('image/png', await renderDraftPng(svg, width, height), {elements: rows.length})
  },
)
```

Add `canvasPreviewTool` to `canvasTools`.

- [ ] **Step 7: Write and run the preview IT**

`test/canvas-preview.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

test('preview returns a real png of the draft without any browser round-trip', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 100 100'><rect x='10' y='10' width='80' height='80' fill='#f0a860'/></svg>",
      x: 50,
      y: 50,
      width: 200,
    })
    await expect
      .poll(async () => ((await api.callTool('canvas.read', {scope: 'draft'})) as {elements: unknown[]}).elements, {timeout: 15_000})
      .toHaveLength(1)
    const result = (await api.callTool('canvas.preview', {})) as {__concivImage?: {mimeType: string; dataBase64: string}}
    expect(result.__concivImage?.mimeType).toBe('image/png')
    const header = Buffer.from(result.__concivImage?.dataBase64 ?? '', 'base64').subarray(0, 8)
    expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  } finally {
    await api.dispose()
  }
})

test('preview on an empty draft names the cause', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const result = (await api.callTool('canvas.preview', {})) as {empty: boolean; reason: string}
    expect(result.empty).toBe(true)
    expect(result.reason).toMatch(/no elements/i)
  } finally {
    await api.dispose()
  }
})
```

**Correction (verified):** the testkit `callTool` DOES go through MCP (`call-tool.ts` → `createMCPClient` → `/api/mcp`), so after Task 2 the raw `{__concivImage}` marker never reaches the test — the MCP layer converts it to an image content block first. Rewrite the first test's assertions against the client-side shape recorded in Task 2 Step 1: locate the image block in the result, assert `mimeType === 'image/png'`, base64-decode its `data`, and check the PNG magic bytes. The empty-draft test is unaffected (plain JSON result, parsed back to an object by `callTool`).

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-preview.it.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git commit --no-verify -m "feat(whiteboard): canvas.preview server-side draft rendering" -- packages/extensions/whiteboard/src/tool/canvas packages/extensions/whiteboard/test/canvas-draft-svg.test.ts packages/extensions/whiteboard/test/canvas-preview.it.test.ts
```

---

### Task 8: `canvas.export` PNG round-trip

**Files:**
- Modify: `src/tool/canvas/def.ts` (export input)
- Modify: `src/tool/canvas/server.ts` (export tool)
- Modify: `src/canvas/island.tsx` (export handler)
- Test: `test/canvas-export-png.it.test.ts`

**Interfaces:**
- Consumes: pending kind `'export'`, `canvasReplies`, `imageResult`.
- Produces: `CanvasExportInput = {format: 'json' | 'png', scope: 'live' | 'draft' | 'both'}` (defaults `json`/`live`). PNG path: server inserts `{kind: 'export', stage: 'live', payload: {requestId, scope}}`, polls `canvasReplies.where({room, requestId})` every 250ms for 10s, returns `imageResult('image/png', payload.dataBase64, {scope})`, deletes the reply row. Timeout error message: `'export timed out: no canvas tab is connected (canvas.preview works without one)'`.

- [ ] **Step 1: Write the failing IT**

`test/canvas-export-png.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('png export round-trips through the island with excalidraw rendering', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='#f0a860'/></svg>",
      x: 100,
      y: 100,
      width: 200,
    })
    await expect
      .poll(async () => ((await api.callTool('canvas.read', {scope: 'draft'})) as {elements: unknown[]}).elements, {timeout: 15_000})
      .toHaveLength(1)
    const result = (await api.callTool('canvas.export', {format: 'png', scope: 'draft'})) as {
      __concivImage?: {mimeType: string; dataBase64: string}
    }
    expect(result.__concivImage?.mimeType).toBe('image/png')
    const header = Buffer.from(result.__concivImage?.dataBase64 ?? '', 'base64').subarray(0, 8)
    expect([...header]).toEqual(PNG_MAGIC)
  } finally {
    await api.dispose()
  }
})

test('json export still returns elements', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const result = (await api.callTool('canvas.export', {})) as {elements: unknown[]}
    expect(Array.isArray(result.elements)).toBe(true)
  } finally {
    await api.dispose()
  }
})
```

**Same MCP-shape correction as Task 7:** `callTool` returns the MCP-converted image content, not the raw `{__concivImage}` marker — write the PNG assertions against the client-side shape recorded in Task 2 Step 1 (image block's `mimeType` + PNG magic on decoded `data`).

A timeout-path test (no tab connected) requires a testkit session without the client page; check whether `getExtensionTestApi` can start server-only — if it always opens the page, cover the timeout branch in a node test by calling the exported tool execute with a stub context whose `db.all` returns `[]` forever is a mock — skip it instead: the timeout branch is 5 lines and the error message is asserted by reading the code in review. Do not write a mocked test.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-export-png.it.test.ts`
Expected: first test FAILs (export ignores `format`), second passes.

- [ ] **Step 3: Def + server**

`def.ts`:

```ts
export const CanvasExportInput = z.object({
  format: z.enum(['json', 'png']).default('json'),
  scope: z.enum(['live', 'draft', 'both']).default('live'),
})
```

Update `canvasExportDef.description`: `'Export the canvas: json returns elements; png returns a real Excalidraw rendering (requires an open canvas tab).'`

`server.ts` — replace `canvasExportTool`:

```ts
export const canvasExportTool = defineTool<typeof CanvasExportInput, WhiteboardToolContext>(canvasExportDef).server(
  async (input, ctx, request) => {
    const room = ctx.room(request)
    if (input.format === 'json') {
      const table = input.scope === 'draft' ? app.canvasDraftElements : app.canvasElements
      const rows = await ctx.db.all(table.where({room}), {tier: 'global'})
      return {elements: rows.map((row) => row.data)}
    }
    const requestId = crypto.randomUUID()
    await ctx.db
      .insert(app.canvasPending, {room, kind: 'export', stage: 'live', payload: {requestId, scope: input.scope} as JsonValue})
      .wait({tier: 'edge'})
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const replies = await ctx.db.all(app.canvasReplies.where({room, requestId}), {tier: 'global'})
      const reply = replies[0]
      if (reply) {
        const {dataBase64} = reply.payload as unknown as {dataBase64: string}
        await ctx.db.delete(app.canvasReplies, reply.id).wait({tier: 'edge'})
        return imageResult('image/png', dataBase64, {scope: input.scope})
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('export timed out: no canvas tab is connected (canvas.preview works without one)')
  },
)
```

- [ ] **Step 4: Island export handler**

`src/canvas/island.tsx` — route `kind === 'export'` rows:

```ts
const performExport = async (row: PendingRow): Promise<void> => {
  const {requestId, scope} = row.payload as unknown as {requestId: string; scope: 'live' | 'draft' | 'both'}
  const live = scope === 'draft' ? [] : (api?.getSceneElements() ?? [])
  const draftRows =
    scope === 'live' ? [] : await db().all(app.canvasDraftElements.where({room: props.room}), {tier: 'global'})
  const drafts = draftRows.map((draft) => asScene((draft as unknown as ElementRow).data))
  const {exportToBlob} = await import('@excalidraw/excalidraw')
  const blob = await exportToBlob({
    elements: [...live, ...drafts],
    files: api?.getFiles() ?? {},
    appState: {exportBackground: true, viewBackgroundColor: '#ffffff'},
  })
  const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))
  await db()
    .insert(app.canvasReplies, {room: props.room, requestId, kind: 'export', payload: {dataBase64} as JsonValue})
    .wait({tier: 'edge'})
  await db().delete(app.canvasPending, row.id).wait({tier: 'edge'})
}
```

`String.fromCharCode(...bytes)` overflows the stack on large arrays — chunk it:

```ts
const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}
```

- [ ] **Step 5: Run the IT to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-export-png.it.test.ts`
Expected: PASS (both).

- [ ] **Step 6: Full suite + commit**

```bash
pnpm --filter @conciv/extension-whiteboard test
git commit --no-verify -m "feat(whiteboard): canvas.export png via island round-trip" -- packages/extensions/whiteboard/src packages/extensions/whiteboard/test/canvas-export-png.it.test.ts
```

---

### Task 9: Auto-commit on turn end

**Files:**
- Create: `src/server/auto-commit.ts`
- Modify: `src/server.ts`
- Test: `test/canvas-autocommit.it.test.ts` (the testkit drives tools directly, not harness turns, so the test exercises `autoCommitDraft` itself; Task 1's core IT already proves the hook fires)

**Interfaces:**
- Consumes: `ServerResult.turnEnd` (Task 1), commit insert semantics (Task 6).
- Produces: `autoCommitDraft(db: Db, room: string): Promise<boolean>` — inserts a commit pending row iff draft elements exist; returns whether it did.

- [ ] **Step 1: Write the failing IT**

`test/canvas-autocommit.it.test.ts`:

```ts
import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {autoCommitDraft} from '../src/server/auto-commit.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const read = async (api: {callTool: (name: string, input: unknown) => Promise<unknown>}, scope: string) =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements
```

The test needs the same `db` and room the tools use. **Verified: the testkit exposes no server context today** — the mounted `ServerResult.context` lives only inside `makeApp`'s `mounted` array. Thread it out additively through the whole chain (the testkit shares real plumbing by design; no shortcuts):

1. `packages/core/src/app.ts`: `MadeApp` gains `extensionContexts: Record<string, unknown>` built from `mounted` (`{[entry.extensionName]: context}`).
2. `packages/core/src/engine.ts`: `start()` destructures it from `makeApp` and exposes it on the returned `Engine`.
3. `packages/extension-testkit/src/boot-server.ts`: `BootedServer` gains `extensionContexts`, passed from `engine`.
4. `packages/extension-testkit/src/get-extension-test-api.ts`: `ExtensionTestApi` gains `serverContext: unknown` — `extensionContexts[extension.server.name]`.

Typecheck `@conciv/core` + `@conciv/extension-testkit` after; the Task 9 commit already includes `packages/extension-testkit/src` — add `packages/core/src/app.ts packages/core/src/engine.ts` to its pathspec. Then:

```ts
test('turn end commits an abandoned draft', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 10 10'><rect x='1' y='1' width='8' height='8' fill='#ccc'/></svg>",
      x: 0,
      y: 0,
      width: 100,
    })
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(1)
    const context = api.serverContext as {db: unknown; room: (request: {sessionId: string}) => string}
    const committed = await autoCommitDraft(context.db as never, api.session)
    expect(committed).toBe(true)
    await expect.poll(() => read(api, 'live'), {timeout: 15_000}).toHaveLength(1)
    expect(await read(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})
```

Verified: the session id string is `api.session` (there is no `sessionId` field on `ExtensionTestApi`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-autocommit.it.test.ts`
Expected: FAIL — `auto-commit.js` missing.

- [ ] **Step 3: Implement `src/server/auto-commit.ts`**

```ts
import type {Db} from 'jazz-tools/backend'
import type {JsonValue} from 'jazz-tools'
import {app} from '../shared/schema.js'

export async function autoCommitDraft(db: Db, room: string): Promise<boolean> {
  const drafts = await db.all(app.canvasDraftElements.where({room}), {tier: 'global'})
  if (!drafts.length) return false
  const pendingCommits = await db.all(app.canvasPending.where({room, kind: 'commit'}), {tier: 'global'})
  if (pendingCommits.length) return false
  await db.insert(app.canvasPending, {room, kind: 'commit', stage: 'live', payload: {} as JsonValue}).wait({tier: 'edge'})
  return true
}
```

- [ ] **Step 4: Wire into the extension server**

`src/server.ts` — the `.server()` return gains the hook (room == sessionId):

```ts
return {
  context: {...},
  turnEnd: (turnSessionId) => void autoCommitDraft(backend.db, turnSessionId).catch(() => {}),
  dispose: async () => {...},
}
```

- [ ] **Step 5: Run IT, full suite, commit**

```bash
pnpm --filter @conciv/extension-whiteboard test -- test/canvas-autocommit.it.test.ts
pnpm --filter @conciv/extension-whiteboard test
git commit --no-verify -m "feat(whiteboard): auto-commit abandoned drafts on turn end" -- packages/extensions/whiteboard/src packages/extensions/whiteboard/test/canvas-autocommit.it.test.ts packages/extension-testkit/src
```

---

### Task 10: Prompt pack

**Files:**
- Modify: `src/shared/meta.ts` (WHITEBOARD_PROMPT)
- Modify: `src/tool/canvas/def.ts` (final snippet pass)
- Test: `test/canvas-prompt.test.ts` (node)

**Interfaces:**
- Consumes: every tool from prior tasks (names must match exactly: `canvas.svg`, `canvas.preview`, `canvas.export`, `canvas.commit`, `canvas.discard`).

- [ ] **Step 1: Write the failing test**

`test/canvas-prompt.test.ts`:

```ts
import {expect, test} from 'vitest'
import {WHITEBOARD_PROMPT} from '../src/shared/meta.js'
import {canvasTools} from '../src/tool/canvas/server.js'

test('prompt teaches the draft loop in order', () => {
  const loop = ['canvas.svg', 'canvas.preview', 'canvas.export', 'canvas.commit']
  const positions = loop.map((name) => WHITEBOARD_PROMPT.indexOf(name))
  positions.forEach((position) => expect(position).toBeGreaterThan(-1))
  expect([...positions]).toEqual([...positions].sort((left, right) => left - right))
})

test('prompt routes styles', () => {
  expect(WHITEBOARD_PROMPT).toMatch(/hatch/i)
  expect(WHITEBOARD_PROMPT).toMatch(/flat fills?/i)
  expect(WHITEBOARD_PROMPT).toMatch(/reference/i)
})

test('every canvas tool ships a prompt snippet', () => {
  canvasTools.forEach((tool) => expect(tool.promptSnippet, tool.name).toBeTruthy())
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-prompt.test.ts`
Expected: FAIL on the loop-order assertions.

- [ ] **Step 3: Write the prompt**

Append to `WHITEBOARD_PROMPT` in `src/shared/meta.ts` (keep the existing text; add a drawing section):

```ts
export const WHITEBOARD_DRAWING_PROMPT = `
## Drawing on the canvas

Draw in a hidden draft; the user only sees committed work.

Routing: canvas.svg for anything organic, illustrated, or styled (write real SVG paths); canvas.draw for boxes and simple layout; canvas.diagram for structured graphs (mermaid).

The loop: draw into the draft with canvas.svg, then canvas.preview to see it (fast, approximate), critique honestly (proportions, overlaps, floating parts, palette), refine with more canvas.svg / canvas.update / canvas.delete, repeat. Before publishing run canvas.export with format png and scope draft for a ground-truth render, then canvas.commit. Never leave a good draft uncommitted; use canvas.discard to abandon a bad one.

Style: default to sketch technique for drawings - varied stroke weight, hatched shading, contour strokes, minimal flat fills, roughness 1. Use flat fills with clean outlines for icons, clipart asks, and diagram shapes (roughness 0). Compose big shapes first, then layer detail; keep a limited palette (3-5 colors).

Reference: when a reference image is available (dropped on the canvas or present in the conversation), study it and redraw it as fresh semantic SVG - match palette, pose, and structure. Never trace pixel data into paths.
`
```

Concatenate into `WHITEBOARD_PROMPT`. Final pass over every `promptSnippet` in `def.ts` so each names the draft/commit reality (draw/diagram/connect say drawings are hidden until commit; delete/clear unchanged).

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @conciv/extension-whiteboard test -- test/canvas-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite, typecheck, build, commit**

```bash
pnpm turbo typecheck build --filter @conciv/extension-whiteboard
pnpm --filter @conciv/extension-whiteboard test
git commit --no-verify -m "feat(whiteboard): drawing prompt pack" -- packages/extensions/whiteboard/src/shared/meta.ts packages/extensions/whiteboard/src/tool/canvas/def.ts packages/extensions/whiteboard/test/canvas-prompt.test.ts
```

---

### Task 11: End-to-end verification in the example app

Per repo rules: no tests in example apps, but the change must be seen working in the real app (`/verify` skill).

- [ ] **Step 1: Build everything**

Run: `pnpm turbo build --filter @conciv/extension-whiteboard --filter @conciv/core --filter @conciv/extension`

- [ ] **Step 2: Launch the whiteboard example app and drive one real drawing**

Start the example app that mounts the whiteboard extension (find it under `apps/examples/`; widget reload vs server restart rule applies — core/extension changes need a fresh `pnpm dev`). Ask the agent in the chat to "draw a cat on the canvas". Observe: no intermediate scribbles appear; agent cursor shows "drawing…"; on commit the drawing replays in; elements are selectable and editable.

- [ ] **Step 3: Confirm the loop in the transcript**

The turn should show `canvas.svg` → `canvas.preview` → (refine) → `canvas.export` → `canvas.commit`. If the agent skips preview or commit, tune the prompt pack wording (Task 10) — tool grounding, not user coaching.

- [ ] **Step 4: Final commit + PR**

```bash
git log --oneline main..HEAD
```

Open a PR from `worktree-canvas-drawing-v2` (public repo — verify authorship is the omridevk noreply identity on every commit before pushing).

---

## Self-Review Notes

- Spec coverage: draft buffer (Tasks 3–6), canvas.svg (4–5), export png (8), preview/takumi (7), cursor performer (6), prompt pack (10), auto-commit (1 + 9), error handling folded into each tool's implementation and asserted in ITs (rejected svg, empty draft, empty commit, export timeout message), draft GC rides the existing cursor sweep (6).
- Deviation from spec, deliberate: draft elements persist in a `canvasDraftElements` table (not island memory) so preview/commit/discard/update work server-side and survive tab reloads; export replies ride a `canvasReplies` json row (base64) instead of a Jazz FileStream — simpler, size-bounded by export dimensions, and the FileStream API is unproven in this codebase. Both noted for the spec to absorb.
- Type consistency: `imageResult`/`isImageResult` (Tasks 2, 7, 8); `DraftElement` (7); `stage: 'draft' | 'live'` (3–9); tool names match def names everywhere.
