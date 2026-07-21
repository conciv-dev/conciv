# Extension Browser-Verb Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any `@conciv` extension a first-class, fully-typed, declarative way to expose browser-side "verbs" (live reads/actions in the page) that its own server-side tools invoke over the existing page channel — so a framework-inspection adapter (or recorder, whiteboard, or a third-party extension) reads live app state from the browser without any framework-specific code in core.

**Architecture:** An extension declares `pageVerbs` in its `.client(...)` — a map of verb → `{args: ZodSchema, handler}`. The extension host registers them into a browser-side registry under the extension's name. Core gains exactly one generic page-query kind, `ext` (`{extension, verb, argsJson}`), zod-validated at the boundary and carrying opaque payloads. The extension's `.server(...)` receives a typed, scoped `server.page.call(verb, args)` whose verb names, argument types, and return types are all derived from that same `pageVerbs` map via a verb-map generic threaded through `ExtensionBuilder`. `call` rejects with a typed `PageVerbError` (discriminated `code`) on every failure path. The transport is the existing `PageBus` (`packages/core/src/page-bus.ts`); no new channel.

**Tech Stack:** `@conciv/extension` (builder + `defineTool`), `@conciv/protocol` (`page-types`), `@conciv/page` (page handlers, `dehydrate`), core `PageBus`, zod 4.x, Playwright/Chromium + vitest.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (autofix DELETES them). `PageVerbError` is a factory-augmented `Error`, never a class.
- TypeScript strict: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext. No `any`/`as`/`@ts-ignore`/non-null `!`. Generic inference over casts.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- zod validates every boundary: the `ext` envelope in core, AND each verb's `args` browser-side before its handler runs.
- Browser behavior tested in REAL Chromium (Playwright), never jsdom.
- Every async surface has explicit error + loading handling (production-grade bar). No silent success, no green-on-failure.
- v0: reshape internal APIs freely; update all call sites; no back-compat shims.

## File Structure

- `packages/protocol/src/page-types.ts` (modify) — add the `ext` page-query kind + its `extension`/`verb`/`argsJson` fields.
- `packages/extension/src/page-verbs.ts` (create) — `PageVerbDef`, `PageVerbMap`, `definePageVerbs`, `PageCaller`, `PageVerbError` + `isPageVerbError` + `pageVerbError`. The public, typed authoring surface.
- `packages/page/src/page-verb-registry.ts` (create) — browser registry: register/get verb defs scoped by extension; single responsibility.
- `packages/page/src/page-handlers.ts` (modify) — the `ext` dispatch branch: lookup → zod-validate args → run handler → structured reply.
- `packages/extension/src/define-extension.ts` + `src/types.ts` (modify) — `ClientFactoryResult` gains `pageVerbs?` (sibling of `value`/`dispose`, so it never enters the UI `useContext`); thread the `Verbs` generic; `.client` captures `pageVerbs`; `ServerApi.page: PageCaller<Verbs>`. Handlers are closures over the client factory scope — no injected handler context.
- `packages/extension/src/mount-extension.tsx` (modify) — on client mount, register the extension's `pageVerbs` under its name; on `dispose` (and dev hot-reload re-mount), unregister so handlers never leak or double-fire.
- `packages/core/src/app.ts` + `packages/core/src/chat/runtime.ts` (modify) — provide a `PageBus`-backed `callPageVerb(extension, verb, argsJson)` to the extension server host so `server.page.call` works end to end.
- Tests as listed per task.

---

### Task 1: The `ext` page-query wire (protocol)

**Files:**

- Modify: `packages/protocol/src/page-types.ts`
- Test: `packages/protocol/test/page-types.test.ts` (extend if present, else create)

**Interfaces:**

- Produces: page verb `{kind: 'ext', extension: string, verb: string, argsJson?: string}` on `PageQuerySchema`; reply is the existing `PageReply` (`{requestId, data}`). Consumed by every task below.

- [ ] **Step 1: Write the failing schema test**

```ts
import {describe, it, expect} from 'vitest'
import {PageQuerySchema, PAGE_QUERY_KINDS} from '../src/page-types.js'

describe('ext page-query kind', () => {
  it('includes ext in the kind set', () => {
    expect(PAGE_QUERY_KINDS).toContain('ext')
  })
  it('parses an ext query with extension/verb/argsJson', () => {
    const parsed = PageQuerySchema.parse({kind: 'ext', extension: 'tanstack', verb: 'routerState', argsJson: '{}'})
    expect(parsed).toMatchObject({kind: 'ext', extension: 'tanstack', verb: 'routerState'})
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `pnpm --filter @conciv/protocol test -- page-types`. Expected: FAIL (`ext` not in enum).

- [ ] **Step 3: Add the kind + fields**

In `packages/protocol/src/page-types.ts`: append `'ext'` to `PAGE_QUERY_KINDS`. Add to `PageQuerySchema`:

```ts
  extension: z.string().optional().describe('extension name owning the verb (ext kind)'),
  verb: z.string().optional().describe('extension page verb name (ext kind)'),
  argsJson: z.string().optional().describe('JSON-encoded args for the ext verb'),
```

Do NOT add `ext` to `MUTATING_KINDS` or `MIRROR_KINDS` (verbs self-classify; the extension owns semantics).

- [ ] **Step 4: Run tests + typecheck** → PASS. Run: `pnpm --filter @conciv/protocol test -- page-types && pnpm --filter @conciv/protocol typecheck`.

- [ ] **Step 5: Commit** — `git add packages/protocol/src/page-types.ts packages/protocol/test/page-types.test.ts && git commit -m "feat(protocol): generic ext page-query kind for extension browser verbs"`

---

### Task 2: Typed authoring surface — `definePageVerbs`, `PageCaller`, `PageVerbError`

The public API extension authors touch. Pure types + tiny runtime helpers; no wiring yet.

**Files:**

- Create: `packages/extension/src/page-verbs.ts`
- Modify: `packages/extension/src/index.ts` (export the surface)
- Test: `packages/extension/test/page-verbs.test-d.ts` (type-level) + `packages/extension/test/page-verbs.test.ts` (runtime helpers)

**Interfaces:**

- Produces:
  - `PageVerbDef<Schema extends z.ZodType, Result>` = `{args: Schema; handler: (args: z.output<Schema>) => Result | Promise<Result>}`
  - `PageVerbMap = Record<string, PageVerbDef<z.ZodType, unknown>>`
  - `definePageVerbs<M extends PageVerbMap>(verbs: M): M`
  - `PageCaller<M extends PageVerbMap>` = `{call<K extends keyof M & string>(verb: K, args: z.input<M[K]['args']>): Promise<Awaited<ReturnType<M[K]['handler']>>>}`
  - `PageVerbErrorCode = 'no-widget' | 'unknown-verb' | 'invalid-args' | 'handler-error' | 'timeout'`
  - `PageVerbError = Error & {readonly isPageVerbError: true; code: PageVerbErrorCode; extension: string; verb: string}`
  - `pageVerbError(code, extension, verb, message): PageVerbError`; `isPageVerbError(value): value is PageVerbError`

- [ ] **Step 1: Write the failing type test**

```ts
import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {definePageVerbs, type PageCaller} from '../src/page-verbs.js'

const verbs = definePageVerbs({
  routerState: {args: z.object({}), handler: () => ({path: '/'})},
  navigate: {args: z.object({to: z.string()}), handler: (a) => ({ok: true as const, to: a.to})},
})
type Caller = PageCaller<typeof verbs>

test('call return type is inferred from the handler', () => {
  expectTypeOf<Caller['call']>().toBeCallableWith('routerState', {})
  expectTypeOf<ReturnType<Caller['call']<'navigate'>>>().resolves.toMatchTypeOf<{ok: true; to: string}>()
})
test('unknown verb and wrong args are type errors', () => {
  const call = null as unknown as Caller['call']
  // @ts-expect-error unknown verb
  call('nope', {})
  // @ts-expect-error missing required arg `to`
  call('navigate', {})
})
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `pnpm --filter @conciv/extension typecheck`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `page-verbs.ts`**

```ts
import type {z} from 'zod'

export type PageVerbDef<Schema extends z.ZodType, Result> = {
  args: Schema
  handler: (args: z.output<Schema>) => Result | Promise<Result>
}

export type AnyPageVerbDef = PageVerbDef<z.ZodType, unknown>
export type PageVerbMap = Record<string, AnyPageVerbDef>

export function definePageVerbs<M extends PageVerbMap>(verbs: M): M {
  return verbs
}

export type PageCaller<M extends PageVerbMap> = {
  call<K extends keyof M & string>(verb: K, args: z.input<M[K]['args']>): Promise<Awaited<ReturnType<M[K]['handler']>>>
}

export type PageVerbErrorCode = 'no-widget' | 'unknown-verb' | 'invalid-args' | 'handler-error' | 'timeout'

export type PageVerbError = Error & {
  readonly isPageVerbError: true
  code: PageVerbErrorCode
  extension: string
  verb: string
}

export function pageVerbError(
  code: PageVerbErrorCode,
  extension: string,
  verb: string,
  message: string,
): PageVerbError {
  const error = new Error(message) as PageVerbError
  return Object.assign(error, {isPageVerbError: true as const, code, extension, verb})
}

export function isPageVerbError(value: unknown): value is PageVerbError {
  return value instanceof Error && (value as Partial<PageVerbError>).isPageVerbError === true
}
```

- [ ] **Step 4: Runtime test for the error helpers**

```ts
import {describe, it, expect} from 'vitest'
import {pageVerbError, isPageVerbError} from '../src/page-verbs.js'

describe('pageVerbError', () => {
  it('builds a typed, guardable error', () => {
    const error = pageVerbError('no-widget', 'tanstack', 'routerState', 'no widget connected')
    expect(isPageVerbError(error)).toBe(true)
    expect(error.code).toBe('no-widget')
    expect(isPageVerbError(new Error('plain'))).toBe(false)
  })
})
```

- [ ] **Step 5: Export + run** — export the surface from `packages/extension/src/index.ts`. Run: `pnpm --filter @conciv/extension typecheck && pnpm --filter @conciv/extension test -- page-verbs` → PASS.

- [ ] **Step 6: Commit** — `feat(extension): typed declarative page-verb authoring surface (definePageVerbs, PageCaller, PageVerbError)`

---

### Task 3: Browser registry + `ext` dispatch (page side)

**Files:**

- Create: `packages/page/src/page-verb-registry.ts`
- Modify: `packages/page/src/page-handlers.ts`, `packages/page/src/index.ts` (export register/clear)
- Test: `packages/page/test/page-verb-dispatch.test.ts`

**Interfaces:**

- Consumes: `PageVerbMap` (Task 2).
- Produces: `registerExtensionPageVerbs(extension: string, verbs: PageVerbMap): void` (replaces the extension's prior entry, so a dev hot-reload re-mount never double-registers), `unregisterExtensionPageVerbs(extension: string): void` (called on client `dispose`), `clearExtensionPageVerbs(): void`, and an internal `dispatchExtVerb(extension, verb, argsJson): Promise<{result: unknown} | {error: {code, message}}>` used by the `ext` handler.

- [ ] **Step 1: Write the failing dispatch test**

```ts
import {describe, it, expect, beforeEach} from 'vitest'
import {z} from 'zod'
import {registerExtensionPageVerbs, clearExtensionPageVerbs, dispatchExtVerb} from '../src/page-verb-registry.js'

describe('ext verb dispatch', () => {
  beforeEach(() => clearExtensionPageVerbs())
  it('runs a registered verb and returns its result', async () => {
    registerExtensionPageVerbs('demo', {ping: {args: z.object({n: z.number()}), handler: (a) => ({pong: a.n + 1})}})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":41}')).toEqual({result: {pong: 42}})
  })
  it('reports unknown-verb and invalid-args as structured errors', async () => {
    registerExtensionPageVerbs('demo', {ping: {args: z.object({n: z.number()}), handler: () => ({})}})
    expect(await dispatchExtVerb('demo', 'nope', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":"x"}')).toMatchObject({error: {code: 'invalid-args'}})
  })
})
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement the registry + dispatch**

```ts
import type {PageVerbMap} from '@conciv/extension'

const registry = new Map<string, PageVerbMap>()

export function registerExtensionPageVerbs(extension: string, verbs: PageVerbMap): void {
  registry.set(extension, verbs)
}
export function unregisterExtensionPageVerbs(extension: string): void {
  registry.delete(extension)
}
export function clearExtensionPageVerbs(): void {
  registry.clear()
}

type Dispatch = {result: unknown} | {error: {code: string; message: string}}

export async function dispatchExtVerb(
  extension: string,
  verb: string,
  argsJson: string | undefined,
): Promise<Dispatch> {
  const def = registry.get(extension)?.[verb]
  if (!def) return {error: {code: 'unknown-verb', message: `${extension}.${verb} is not registered`}}
  const raw = argsJson ? safeJson(argsJson) : {}
  const parsed = def.args.safeParse(raw)
  if (!parsed.success) return {error: {code: 'invalid-args', message: parsed.error.message}}
  try {
    return {result: (await def.handler(parsed.data)) ?? null}
  } catch (error) {
    return {error: {code: 'handler-error', message: error instanceof Error ? error.message : String(error)}}
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
```

Wire into `page-handlers.ts`: add an `ext` branch that calls `dispatchExtVerb(query.extension, query.verb, query.argsJson)` and returns its value as the reply `data`.

- [ ] **Step 4: Run tests + typecheck** → PASS.

- [ ] **Step 5: Commit** — `feat(page): ext verb registry + dispatch with zod arg validation and structured errors`

---

### Task 4: Client authoring shape + thread the `Verbs` generic; register/unregister on mount

The client-side half: `pageVerbs` is a sibling of `value`/`dispose` in the client factory result (so it never pollutes the UI `useContext`); handlers are closures over the factory scope (they read the extension's own client state or the DOM/fiber directly — no injected context); the verb-map type flows to the server caller; mount registers, dispose unregisters.

**Files:**

- Modify: `packages/extension/src/types.ts` (`ClientFactoryResult` gains `pageVerbs?: Verbs`; add `Verbs` to `ServerApi`; `page: PageCaller<Verbs>`), `packages/extension/src/define-extension.ts` (capture `pageVerbs` from `.client`, thread its type to `.server`), `packages/extension/src/mount-extension.tsx` (register on mount, unregister on dispose).
- Test: `packages/extension/test/extension-page-verbs.test-d.ts` + a client-lifecycle test.

**Interfaces:**

- Consumes: `definePageVerbs`/`PageCaller` (Task 2), `registerExtensionPageVerbs`/`unregisterExtensionPageVerbs` (Task 3).
- Produces: `ClientFactoryResult<Value, Verbs> = {value: Value; pageVerbs?: Verbs; dispose?: () => void}`; `.client(() => ({value, pageVerbs}))` sets the builder's `Verbs`; `.server((server) => …)` sees `server.page: PageCaller<Verbs>`.

- [ ] **Step 1: Write the failing tests**

Type test — an extension that declares `pageVerbs` in `.client` (handlers closing over a factory-scope value) and, in `.server`, `expectTypeOf(server.page.call).toBeCallableWith('routerState', {})` with the inferred return type; `@ts-expect-error` for an unknown verb and for wrong args.

Lifecycle test (real Chromium) — mount an extension whose `pageVerbs.ping` closes over a factory counter; assert the verb is registered (dispatch returns a result); call the returned `dispose`; assert the verb is unregistered (dispatch returns `unknown-verb`).

- [ ] **Step 2: Run them, expect FAIL.**

- [ ] **Step 3: Implement the client shape + generic threading**

Extend `ClientFactoryResult`:

```ts
export type ClientFactoryResult<Value extends object, Verbs extends PageVerbMap = {}> = {
  value: Value
  pageVerbs?: Verbs
  dispose?: () => void
}
```

Add `Verbs extends PageVerbMap = {}` to `ExtensionBuilder` and `ServerApi<Config, Verbs>` (`page: PageCaller<Verbs>`). `.client(factory)` infers `Verbs` from `factory().pageVerbs`; `.server(factory)` receives `ServerApi<Config, Verbs>`. Require `.client` before `.server` for inference (document it). In `mount-extension.tsx`: after building the client factory result, `registerExtensionPageVerbs(extensionName, result.pageVerbs ?? {})`; wrap `result.dispose` so it also calls `unregisterExtensionPageVerbs(extensionName)`.

- [ ] **Step 4: Build embed + run both tests + `pnpm --filter @conciv/extension typecheck`** → PASS.

- [ ] **Step 5: Commit** — `feat(extension): pageVerbs client authoring shape, verb-map generic, register/unregister on mount`

---

### Task 5: Core wiring — `PageBus`-backed `server.page.call` end to end

**Files:**

- Modify: `packages/core/src/app.ts` (build a `callPageVerb` from `pageBus`), the extension server-host boot (`packages/plugin/src/core/vite.ts` `bootEngine` / `@conciv/core/start`) to inject `page.call` into each extension's `ServerApi`.
- Modify: `packages/extension/src/define-extension.ts` server-side to implement `page.call` from the injected `callPageVerb`, mapping `PageBus` failures to `PageVerbError`.
- Test: `packages/extension-testkit` round-trip in real Chromium — a tiny test extension registering a `ping` verb, a server call reaching the browser and returning.

**Interfaces:**

- Consumes: `pageBus.ask` (core), `pageVerbError` (Task 2), `registerExtensionPageVerbs` (Task 3).
- Produces: a working `server.page.call(verb, args)` that resolves with the browser result or rejects with a typed `PageVerbError`.

- [ ] **Step 1: Write the failing round-trip browser test** — mount a test extension whose client declares `pageVerbs: {ping: {args: z.object({n: z.number()}), handler: (a) => ({pong: a.n + 1})}}` and whose server tool calls `server.page.call('ping', {n: 41})`; drive a turn; assert the tool result is `{pong: 42}`. Also assert: with no widget connected, the call rejects with `code: 'no-widget'`.

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement the core injection**

In `app.ts`, expose `callPageVerb(extension, verb, argsJson)`:

```ts
const callPageVerb = async (extension: string, verb: string, argsJson: string): Promise<unknown> => {
  const reply = await pageBus.ask({kind: 'ext', extension, verb, argsJson})
  const data = reply as {result?: unknown; error?: {code: string; message: string}}
  if (data.error) throw pageVerbError(mapCode(data.error.code), extension, verb, data.error.message)
  return data.result
}
```

Thread `callPageVerb` into extension mounting so each extension's `ServerApi.page.call(verb, args)` becomes `callPageVerb(thisExtension, verb, JSON.stringify(args))`. Map `pageBus.ask` throws: HTTP 503 → `no-widget`, 504 → `timeout`. `mapCode` maps browser-reported codes (`unknown-verb`/`invalid-args`/`handler-error`) straight through.

- [ ] **Step 4: Build embed + testkit, run the round-trip** → PASS (both the success and the `no-widget` rejection).

- [ ] **Step 5: Commit** — `feat(core): PageBus-backed server.page.call with typed PageVerbError mapping`

---

### Task 6: Robustness pass — timeout, loading contract, docs, gates

**Files:**

- Modify: `packages/extension/src/page-verbs.ts` (JSDoc-free but self-describing helper for tools to render loading/error from a call), tests for each error code.
- Create: a short authoring note in the extension package README or `docs/` describing the `pageVerbs` + `server.page.call` pattern for third-party authors.
- Modify: `.changeset/extension-browser-verbs.md`.

- [ ] **Step 1: Write tests for every error code** — `unknown-verb`, `invalid-args`, `handler-error` (handler throws), `no-widget`, `timeout` (a handler that never resolves past the bus timeout). Each asserts `isPageVerbError` + the exact `code`.
- [ ] **Step 2: Run them, expect FAIL for any not yet covered.**
- [ ] **Step 3: Close gaps** — ensure the handler-error path serializes safely, the timeout maps from the bus 504, and results are size-bounded (extensions dehydrate; the dispatch also guards against non-serializable returns by JSON round-tripping and reporting `handler-error` on failure).
- [ ] **Step 4: Loading contract** — document + assert that a tool calling `server.page.call` surfaces its tool part as running until resolve/reject, so cards render loading then result/error (no green-on-failure). Add one widget assertion that a rejected call renders an error card.
- [ ] **Step 5: Changeset**

```md
---
'@conciv/extension': patch
---

Extensions can declare typed, zod-validated browser `pageVerbs` in `.client(...)` and invoke them from `.server(...)` via a scoped, fully-typed `server.page.call(verb, args)`. Every failure path rejects with a typed `PageVerbError` (`no-widget` | `unknown-verb` | `invalid-args` | `handler-error` | `timeout`). Core gains one generic `ext` page-query kind; no framework-specific code.
```

- [ ] **Step 6: Full gates** — `pnpm typecheck && pnpm build && pnpm test`; `pnpm exec fallow audit --changed-since main --format json` → fix anything INTRODUCED.
- [ ] **Step 7: Commit** — `feat(extension): robustness pass — all page-verb error codes, loading contract, author docs`

---

## Self-Review

- **Decisions honored:** scoping (server.page auto-scoped to the extension, Task 5) ✓; zod at every boundary (envelope Task 1, per-verb args Task 3) ✓; declarative authoring (`definePageVerbs` in `.client`, Tasks 2/4) ✓; fully typed round-trip (`PageCaller` derivation, Tasks 2/4) ✓.
- **Client side:** `pageVerbs` is a sibling of the UI `value` (Task 4) — cards keep using `useContext(value)`, the agent reaches verbs separately; handlers are closures over the factory scope (client state + DOM/fiber, typed, no injected ctx); mount registers / dispose unregisters (Tasks 3/4); the client UI renders loading→result→error straight off the tool-part lifecycle a `server.page.call` drives (Task 6), no new client machinery.
- **Robustness:** typed `PageVerbError` for all five failure paths (Tasks 2/5/6); loading + error card contract (Task 6); no silent success.
- **Type consistency:** `definePageVerbs`/`PageVerbMap`/`PageCaller`/`PageVerbError` names are identical across Tasks 2→6; the `ext` field names (`extension`, `verb`, `argsJson`) match between protocol (Task 1), dispatch (Task 3), and core call (Task 5).
- **Generality:** no framework/extension name appears in `packages/protocol`, `packages/page`, or `packages/core` — only the generic `ext` envelope. Any extension author uses the same surface.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-extension-browser-verbs.md`. This is the prerequisite for the TanStack adapter plan (`2026-07-21-tanstack-inspection-adapter.md`), whose Task 1 is replaced by "consume this capability."
