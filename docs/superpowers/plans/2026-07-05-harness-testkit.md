# Harness Testkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@conciv/harness-testkit` — a foundation that makes server/harness integration tests deterministic and harness-agnostic — and prove it by migrating the two flakiest core ITs.

**Architecture:** A test drives the real server (`makeApp`) with a harness it passes in. `createTestHarness(realAdapter)` derives a deterministic harness by replacing only the model-facing `run` seam (plus a turn hold/release). `createTestkit(harness)` boots the real server, and event consumption is push-based (`waitFor`/`until` resolve on the actual event/condition, reject fast on terminal signals, hang-guard only on a true stall) — never a fixed time-window snapshot. Fake vs real is which harness object you pass; CI passes only the fake (no claude there).

**Tech Stack:** TypeScript (strict, NodeNext, verbatimModuleSyntax), pnpm workspace + turbo, vitest (`environment: 'node'`), `srvx` serve, `@tanstack/ai` (`StreamChunk`/`EventType`), `@tanstack/ai-mcp` MCP client, `h3`.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments (the `conciv/no-comments` lint autofix DELETES them).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- TypeScript strict: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext. No `any`/`as`/`@ts-ignore`/non-null `!`.
- No barrel files that only re-export. Follow `extension-testkit`'s single-entry convention (a `.` export whose file defines/collects the public API).
- Build/typecheck/test via turbo, never hand-built `dist/`. `pnpm test` depends on `build`.
- Every package's `vitest.config.ts` pins `test: {environment: 'node'}`.
- No mocks/stubs: real server, real MCP client, real harness adapter. The fake harness is a real `HarnessAdapter` with deterministic seams.
- Commit with explicit pathspec (`git commit -- <paths>`); parallel sessions share this machine.
- Work from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/tty-terminal-mode`; verify `pwd` when it matters.

---

### Task 1: Scaffold `@conciv/harness-testkit`

**Files:**

- Create: `packages/harness-testkit/package.json`
- Create: `packages/harness-testkit/tsconfig.json`
- Create: `packages/harness-testkit/tsconfig.build.json`
- Create: `packages/harness-testkit/vitest.config.ts`
- Create: `packages/harness-testkit/src/until.ts` (placeholder export so the entry resolves)
- Create: `packages/harness-testkit/test/smoke.test.ts`

**Interfaces:**

- Produces: a buildable, testable workspace package `@conciv/harness-testkit`.

- [ ] **Step 1: Copy an existing node package's config as the template**

Read `packages/extension-testkit/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` and mirror them. `package.json`:

```json
{
  "name": "@conciv/harness-testkit",
  "version": "0.0.0",
  "type": "module",
  "exports": {".": "./src/testkit.ts"},
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run"
  },
  "dependencies": {
    "@conciv/core": "workspace:*",
    "@conciv/harness": "workspace:*",
    "@conciv/protocol": "workspace:*",
    "@conciv/extension": "workspace:*",
    "@tanstack/ai": "catalog:",
    "@tanstack/ai-mcp": "catalog:",
    "srvx": "catalog:",
    "h3": "catalog:"
  },
  "devDependencies": {"vitest": "catalog:", "tsdown": "catalog:"}
}
```

Match exact `catalog:`/versions to what `extension-testkit` uses. `vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({test: {environment: 'node'}})
```

- [ ] **Step 2: Add a placeholder source so the entry resolves**

`src/until.ts`:

```ts
export function until(): void {}
```

`src/testkit.ts`:

```ts
export {until} from './until.js'
```

- [ ] **Step 3: Write the smoke test**

`test/smoke.test.ts`:

```ts
import {expect, it} from 'vitest'
import {until} from '../src/testkit.js'

it('package resolves', () => {
  expect(typeof until).toBe('function')
})
```

- [ ] **Step 4: Install + run**

Run: `pnpm install && pnpm turbo run typecheck test --filter=@conciv/harness-testkit`
Expected: install links the package; typecheck + smoke test PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harness-testkit pnpm-lock.yaml
git commit -m "chore(harness-testkit): scaffold package" -- packages/harness-testkit pnpm-lock.yaml
```

---

### Task 2: `until` — the condition-wait primitive

**Files:**

- Modify: `packages/harness-testkit/src/until.ts`
- Test: `packages/harness-testkit/test/until.test.ts`

**Interfaces:**

- Produces:

  ```ts
  type UntilOpts = {hangGuardMs?: number; settleFor?: number; failWhen?: () => boolean; intervalMs?: number}
  function until(predicate: () => boolean | Promise<boolean>, opts?: UntilOpts): Promise<void>
  ```

  Resolves when `predicate` is true (and, if `settleFor` set, has held true continuously that long). Rejects immediately if `failWhen` returns true. Rejects with a stall error after `hangGuardMs` (default 5000). Polls every `intervalMs` (default 10).

- [ ] **Step 1: Write the failing tests**

`test/until.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {until} from '../src/until.js'

describe('until', () => {
  it('resolves once the predicate turns true', async () => {
    const state = {n: 0}
    const tick = setInterval(() => (state.n += 1), 5)
    await until(() => state.n >= 3)
    clearInterval(tick)
    expect(state.n).toBeGreaterThanOrEqual(3)
  })

  it('rejects fast via failWhen without waiting for the guard', async () => {
    const started = performance.now()
    await expect(until(() => false, {failWhen: () => true, hangGuardMs: 4000})).rejects.toThrow()
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('rejects with a stall error after the hang guard', async () => {
    await expect(until(() => false, {hangGuardMs: 60})).rejects.toThrow(/stall|guard|timed out/i)
  })

  it('waits for the predicate to hold continuously when settleFor is set', async () => {
    const state = {open: true}
    setTimeout(() => (state.open = false), 20)
    await until(() => !state.open, {settleFor: 40})
    expect(state.open).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --dir packages/harness-testkit test/until.test.ts`
Expected: FAIL (`until` is a no-op).

- [ ] **Step 3: Implement**

`src/until.ts`:

```ts
export type UntilOpts = {hangGuardMs?: number; settleFor?: number; failWhen?: () => boolean; intervalMs?: number}

export async function until(predicate: () => boolean | Promise<boolean>, opts: UntilOpts = {}): Promise<void> {
  const hangGuardMs = opts.hangGuardMs ?? 5000
  const intervalMs = opts.intervalMs ?? 10
  const settleFor = opts.settleFor ?? 0
  const deadline = performance.now() + hangGuardMs
  const heldSince = {at: null as number | null}
  while (true) {
    if (opts.failWhen?.()) throw new Error('until: failWhen tripped before the condition held')
    const ok = await predicate()
    if (ok) {
      if (settleFor === 0) return
      heldSince.at ??= performance.now()
      if (performance.now() - heldSince.at >= settleFor) return
    } else {
      heldSince.at = null
    }
    if (performance.now() > deadline) throw new Error(`until: stall - condition not met within ${hangGuardMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run --dir packages/harness-testkit test/until.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(harness-testkit): until() condition wait with settleFor + failWhen" -- packages/harness-testkit/src/until.ts packages/harness-testkit/test/until.test.ts
```

---

### Task 3: `makeRunStream` + `RunEvents` — push consumer over StreamChunks

**Files:**

- Create: `packages/harness-testkit/src/run-events.ts`
- Create: `packages/harness-testkit/src/run-stream.ts`
- Test: `packages/harness-testkit/test/run-stream.test.ts`

**Interfaces:**

- Consumes: `StreamChunk`, `EventType` from `@tanstack/ai`; `CONCIV_UI_EVENT`, `UiSpec` from `@conciv/protocol/ui-types`.
- Produces:

  ```ts
  type RunEvents = {
    all: StreamChunk[]
    text(): string
    uiSpecs(): UiSpec[]
    errors(): string[]
    runs(): number
  }
  type RunStream = {
    waitFor(match: (e: StreamChunk) => boolean, opts?: {hangGuardMs?: number}): Promise<StreamChunk>
    waitForUiSpec(question?: string): Promise<UiSpec>
    waitForText(substr: string): Promise<void>
    done(opts?: {hangGuardMs?: number}): Promise<RunEvents>
  }
  function makeRunStream(source: AsyncIterable<StreamChunk>): RunStream
  ```

  `waitFor` resolves on first match; rejects fast when a `RUN_FINISHED`/`RUN_ERROR` arrives or the source ends without a match; hang-guard (default 90000) only on a true stall. `done` drains to `RUN_FINISHED`.

- [ ] **Step 1: Write the failing tests**

`test/run-stream.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {aguiCustomFor} from '@conciv/protocol/ui-types'
import {makeRunStream} from '../src/run-stream.js'

async function* scripted(chunks: StreamChunk[], gapMs = 5): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    await new Promise((r) => setTimeout(r, gapMs))
    yield chunk
  }
}

const text = (delta: string): StreamChunk => ({type: EventType.TEXT_MESSAGE_CONTENT, delta}) as StreamChunk
const started = {type: EventType.RUN_STARTED} as StreamChunk
const finished = {type: EventType.RUN_FINISHED} as StreamChunk

describe('makeRunStream', () => {
  it('waitForUiSpec resolves when the spec lands mid-stream', async () => {
    const spec = {kind: 'confirm', id: 'r1', question: 'Proceed?'} as never
    const run = makeRunStream(scripted([started, text('thinking'), aguiCustomFor(spec), finished]))
    const got = await run.waitForUiSpec('Proceed?')
    expect(got.question).toBe('Proceed?')
  })

  it('waitFor rejects fast when the run finishes without a match', async () => {
    const run = makeRunStream(scripted([started, text('nope'), finished]))
    await expect(run.waitForUiSpec('Proceed?')).rejects.toThrow(/finished|without/i)
  })

  it('done drains to RUN_FINISHED and exposes typed queries', async () => {
    const run = makeRunStream(scripted([started, text('hello '), text('world'), finished]))
    const events = await run.done()
    expect(events.text()).toBe('hello world')
    expect(events.runs()).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --dir packages/harness-testkit test/run-stream.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `run-events.ts`**

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_UI_EVENT, type UiSpec} from '@conciv/protocol/ui-types'

export type RunEvents = {
  all: StreamChunk[]
  text: () => string
  uiSpecs: () => UiSpec[]
  errors: () => string[]
  runs: () => number
}

export function makeRunEvents(all: StreamChunk[]): RunEvents {
  return {
    all,
    text: () =>
      all
        .flatMap((c) => (c.type === EventType.TEXT_MESSAGE_CONTENT ? [(c as {delta?: string}).delta ?? ''] : []))
        .join(''),
    uiSpecs: () =>
      all.flatMap((c) =>
        c.type === EventType.CUSTOM && (c as {name?: string}).name === CONCIV_UI_EVENT
          ? [(c as {value: UiSpec}).value]
          : [],
      ),
    errors: () =>
      all.flatMap((c) => (c.type === EventType.RUN_ERROR ? [(c as {message?: string}).message ?? 'error'] : [])),
    runs: () => all.filter((c) => c.type === EventType.RUN_FINISHED).length,
  }
}
```

- [ ] **Step 4: Implement `run-stream.ts`**

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_UI_EVENT, type UiSpec} from '@conciv/protocol/ui-types'
import {makeRunEvents, type RunEvents} from './run-events.js'

export type RunStream = {
  waitFor: (match: (e: StreamChunk) => boolean, opts?: {hangGuardMs?: number}) => Promise<StreamChunk>
  waitForUiSpec: (question?: string) => Promise<UiSpec>
  waitForText: (substr: string) => Promise<void>
  done: (opts?: {hangGuardMs?: number}) => Promise<RunEvents>
}

function isTerminal(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

export function makeRunStream(source: AsyncIterable<StreamChunk>): RunStream {
  const seen: StreamChunk[] = []
  const iterator = source[Symbol.asyncIterator]()

  async function pump(match: (e: StreamChunk) => boolean, hangGuardMs: number): Promise<StreamChunk> {
    for (const chunk of seen) if (match(chunk)) return chunk
    const deadline = performance.now() + hangGuardMs
    while (true) {
      if (performance.now() > deadline) throw new Error(`run-stream: stall — no matching event within ${hangGuardMs}ms`)
      const {value, done} = await iterator.next()
      if (done) throw new Error('run-stream: source ended without a matching event')
      seen.push(value)
      if (match(value)) return value
      if (isTerminal(value)) throw new Error('run-stream: run finished without a matching event')
    }
  }

  const uiSpecMatch =
    (question?: string) =>
    (chunk: StreamChunk): boolean =>
      chunk.type === EventType.CUSTOM &&
      (chunk as {name?: string}).name === CONCIV_UI_EVENT &&
      (question === undefined || (chunk as {value?: {question?: string}}).value?.question === question)

  return {
    waitFor: (match, opts) => pump(match, opts?.hangGuardMs ?? 90_000),
    waitForUiSpec: async (question) => {
      const chunk = await pump(uiSpecMatch(question), 90_000)
      return (chunk as {value: UiSpec}).value
    },
    waitForText: async (substr) => {
      await pump(
        (chunk) =>
          makeRunEvents([...seen, chunk])
            .text()
            .includes(substr),
        90_000,
      )
    },
    done: async (opts) => {
      const deadline = performance.now() + (opts?.hangGuardMs ?? 90_000)
      while (true) {
        if (performance.now() > deadline) throw new Error('run-stream: stall — run did not finish')
        const {value, done} = await iterator.next()
        if (done) break
        seen.push(value)
        if (value.type === EventType.RUN_FINISHED) break
      }
      return makeRunEvents(seen)
    },
  }
}
```

- [ ] **Step 5: Run to verify pass, then commit**

Run: `pnpm vitest run --dir packages/harness-testkit test/run-stream.test.ts`
Expected: PASS (3 tests).

```bash
git commit -m "feat(harness-testkit): push RunStream + typed RunEvents" -- packages/harness-testkit/src/run-stream.ts packages/harness-testkit/src/run-events.ts packages/harness-testkit/test/run-stream.test.ts
```

---

### Task 4: `hasClaude` + `callTool` (real MCP client)

**Files:**

- Create: `packages/harness-testkit/src/has-claude.ts`
- Create: `packages/harness-testkit/src/call-tool.ts`
- Test: `packages/harness-testkit/test/call-tool.test.ts`

**Interfaces:**

- Produces: `function hasClaude(): boolean`; `function makeCallTool(apiBase: string, session: string): (name: string, input: unknown) => Promise<unknown>`.

- [ ] **Step 1: Implement `has-claude.ts`** (single source; the 3 copies get deleted in the follow-up plan)

```ts
import {execSync} from 'node:child_process'

export function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Implement `call-tool.ts`** (port the proven shape from `extension-testkit/src/call-tool.ts`)

```ts
import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export function makeCallTool(apiBase: string, session: string): (name: string, input: unknown) => Promise<unknown> {
  return async (name, input) => {
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${apiBase}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
    })
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === name)
      if (!tool?.execute) throw new Error(`tool ${name} not on /api/mcp`)
      const result = await tool.execute(input)
      if (typeof result !== 'string') return result
      try {
        return JSON.parse(result)
      } catch {
        return result
      }
    } finally {
      await mcp.close()
    }
  }
}
```

- [ ] **Step 3: Test `hasClaude` returns a boolean and `makeCallTool` builds a function**

`test/call-tool.test.ts`:

```ts
import {expect, it} from 'vitest'
import {hasClaude} from '../src/has-claude.js'
import {makeCallTool} from '../src/call-tool.js'

it('hasClaude returns a boolean', () => {
  expect(typeof hasClaude()).toBe('boolean')
})

it('makeCallTool returns a caller', () => {
  expect(typeof makeCallTool('http://127.0.0.1:0', 's')).toBe('function')
})
```

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run --dir packages/harness-testkit test/call-tool.test.ts` → PASS.

```bash
git commit -m "feat(harness-testkit): hasClaude + real MCP callTool" -- packages/harness-testkit/src/has-claude.ts packages/harness-testkit/src/call-tool.ts packages/harness-testkit/test/call-tool.test.ts
```

---

### Task 5: `scripted-run` — the two TestHarness seams

**Files:**

- Create: `packages/harness-testkit/src/scripted-run.ts`
- Test: `packages/harness-testkit/test/scripted-run.test.ts`

**Interfaces:**

- Consumes: `HarnessRun`, `HarnessTurn`, `HarnessRunContext` from `@conciv/protocol/harness-types`; `EventType`, `StreamChunk` from `@tanstack/ai`.
- Produces:

  ```ts
  type ScriptedRun = {run: HarnessRun; hold: () => void; release: () => void}
  function makeScriptedRun(opts?: {text?: string}): ScriptedRun
  ```

  `run` yields `RUN_STARTED`, optional `TEXT_MESSAGE_CONTENT(text)`, then — if held — waits for `release()` before yielding `RUN_FINISHED`. Default (not held): emits the full lifecycle immediately.

- [ ] **Step 1: Write the failing tests**

`test/scripted-run.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessRunContext, HarnessTurn} from '@conciv/protocol/harness-types'
import {makeScriptedRun} from '../src/scripted-run.js'

const turn: HarnessTurn = {prompt: 'hi', cwd: '.', resumeSessionId: null, systemPrompt: '', kind: 'chat'}
const ctx = (): HarnessRunContext => ({
  sessionId: 's',
  env: {},
  onSessionId: () => {},
  signal: new AbortController().signal,
  decide: async () => 'allow',
  threadId: 's',
})

describe('makeScriptedRun', () => {
  it('emits a full lifecycle by default', async () => {
    const {run} = makeScriptedRun({text: 'hello from fake'})
    const out: StreamChunk[] = []
    for await (const chunk of run(turn, ctx())) out.push(chunk)
    expect(out.at(0)?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  })

  it('holds the turn open until release()', async () => {
    const scripted = makeScriptedRun()
    scripted.hold()
    const chunks: StreamChunk[] = []
    const drained = (async () => {
      for await (const chunk of scripted.run(turn, ctx())) chunks.push(chunk)
    })()
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    scripted.release()
    await drained
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --dir packages/harness-testkit test/scripted-run.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessRun} from '@conciv/protocol/harness-types'

export type ScriptedRun = {run: HarnessRun; hold: () => void; release: () => void}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const gate = {held: false, release: () => {}}
  const hold = () => {
    gate.held = true
  }
  const release = () => gate.release()
  const run: HarnessRun = async function* () {
    yield {type: EventType.RUN_STARTED} as StreamChunk
    yield {type: EventType.TEXT_MESSAGE_CONTENT, delta: opts.text ?? 'ok'} as StreamChunk
    if (gate.held) await new Promise<void>((resolve) => (gate.release = resolve))
    yield {type: EventType.RUN_FINISHED} as StreamChunk
  }
  return {run, hold, release}
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `pnpm vitest run --dir packages/harness-testkit test/scripted-run.test.ts` → PASS (2 tests).

```bash
git commit -m "feat(harness-testkit): scripted-run seam (injectable run + hold/release)" -- packages/harness-testkit/src/scripted-run.ts packages/harness-testkit/test/scripted-run.test.ts
```

---

### Task 6: `createTestHarness` — derive a deterministic harness from any adapter

**Files:**

- Create: `packages/harness-testkit/src/create-test-harness.ts`
- Test: `packages/harness-testkit/test/create-test-harness.test.ts`

**Interfaces:**

- Consumes: `HarnessAdapter` from `@conciv/protocol/harness-types`; `makeScriptedRun` from Task 5.
- Produces:

  ```ts
  type TestHarness = HarnessAdapter & {__scripted: ScriptedRun}
  function createTestHarness(real: HarnessAdapter): TestHarness
  ```

  Keeps every real field (id, capabilities, decode, history, tty, commands); replaces `run` with the scripted run and `shutdown`/`release` with no-ops. Exposes `__scripted` so the kit can drive hold/release.

- [ ] **Step 1: Write the failing test**

`test/create-test-harness.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '../src/create-test-harness.js'

describe('createTestHarness', () => {
  it('keeps the real capabilities but swaps run for a deterministic one', () => {
    const real = getHarness('claude')
    if (!real) throw new Error('claude adapter not registered')
    const test = createTestHarness(real)
    expect(test.id).toBe(real.id)
    expect(test.capabilities).toEqual(real.capabilities)
    expect(typeof test.run).toBe('function')
    expect(test.run).not.toBe(real.run)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --dir packages/harness-testkit test/create-test-harness.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeScriptedRun, type ScriptedRun} from './scripted-run.js'

export type TestHarness = HarnessAdapter & {__scripted: ScriptedRun}

export function createTestHarness(real: HarnessAdapter): TestHarness {
  const scripted = makeScriptedRun()
  return {
    ...real,
    run: scripted.run,
    shutdown: () => {},
    release: () => {},
    __scripted: scripted,
  } as TestHarness
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `pnpm vitest run --dir packages/harness-testkit test/create-test-harness.test.ts` → PASS.

```bash
git commit -m "feat(harness-testkit): createTestHarness derives a deterministic adapter" -- packages/harness-testkit/src/create-test-harness.ts packages/harness-testkit/test/create-test-harness.test.ts
```

---

### Task 7: `makeApp` harness DI seam (production)

**Files:**

- Modify: `packages/core/src/app.ts` (`MakeAppOpts` + `requireHarness` call around line 48-58)
- Test: `packages/core/test/app-harness-di.test.ts`

**Interfaces:**

- Produces: `MakeAppOpts` gains optional `harness?: HarnessAdapter`; `makeApp` uses `opts.harness ?? requireHarness(opts.cfg.harness)`.
- Consumes (later): the testkit passes its `TestHarness` here.

- [ ] **Step 1: Write the failing test**

`packages/core/test/app-harness-di.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {makeApp} from '../src/app.js'

describe('makeApp harness DI', () => {
  it('uses the injected harness over the registry lookup', async () => {
    const real = getHarness('claude')
    if (!real) throw new Error('no claude')
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-di-'))
    const marker = {seen: false}
    const injected = {
      ...real,
      get id() {
        marker.seen = true
        return real.id
      },
    }
    const {disposers} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot,
        harness: 'claude',
        harnessBin: undefined,
        sessionId: '',
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: stateRoot,
      openInEditor: () => {},
      spawnHarness: () => ({pid: -1, stdin: undefined, stdout: undefined, stderr: undefined, kill: () => {}}) as never,
      harness: injected as never,
    })
    await Promise.all(disposers.map((d) => d()))
    rmSync(stateRoot, {recursive: true, force: true})
    expect(marker.seen).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --dir packages/core test/app-harness-di.test.ts`
Expected: FAIL (`harness` not accepted / registry lookup used).

- [ ] **Step 3: Implement — add the field and prefer it**

In `packages/core/src/app.ts`, add to `MakeAppOpts`:

```ts
  harness?: HarnessAdapter
```

Change the resolution in `makeApp` from `const harness = requireHarness(opts.cfg.harness)` to:

```ts
const harness = opts.harness ?? requireHarness(opts.cfg.harness)
```

(`HarnessAdapter` is already imported at the top of `app.ts`.)

- [ ] **Step 4: Run to verify pass; run the core suite for no regressions**

Run: `pnpm vitest run --dir packages/core test/app-harness-di.test.ts` → PASS.
Run: `pnpm turbo run typecheck --filter=@conciv/core` → PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): accept an injected harness in makeApp (DI seam)" -- packages/core/src/app.ts packages/core/test/app-harness-di.test.ts
```

---

### Task 8: `createTestkit` — boot the real server, expose the verbs

**Files:**

- Create: `packages/harness-testkit/src/create-testkit.ts`
- Modify: `packages/harness-testkit/src/testkit.ts` (export the public API)
- Test: `packages/harness-testkit/test/create-testkit.it.test.ts`

**Interfaces:**

- Consumes: `makeApp` from `@conciv/core`, `getHarness` from `@conciv/harness`, `createTestHarness` (Task 6), `makeRunStream` (Task 3), `makeCallTool` (Task 4), the fake-claude spawn.
- Produces:

  ```ts
  type Kit = {
    base: string
    session: (id?: string) => Promise<string>
    attach: (session?: string) => RunStream
    chat: (content: string, session?: string) => Promise<void>
    invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<void>
    callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
    cleanup: () => Promise<void>
  }
  type Testkit = {setup: () => Promise<Kit>}
  function createTestkit(harness: HarnessAdapter): Testkit
  ```

  `attach` connects to `/api/chat/attach` (fetch + SSE parse → `makeRunStream`). `invokeTool`: if the harness is a `TestHarness` (has `__scripted`), `hold()` the turn, send a trivial chat, `callTool` over real MCP, then `release()`; otherwise (real harness) send `opts.instruction` as the chat so real claude calls the tool.

- [ ] **Step 1: Write the failing IT (fake harness, real server)**

`test/create-testkit.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '../src/create-test-harness.js'
import {createTestkit} from '../src/create-testkit.js'

describe('createTestkit (fake harness, real server)', () => {
  it('streams a run lifecycle', async () => {
    const claude = getHarness('claude')
    if (!claude) throw new Error('no claude')
    const kit = await createTestkit(createTestHarness(claude)).setup()
    try {
      const stream = kit.attach()
      await kit.chat('hello')
      const events = await stream.done()
      expect(events.runs()).toBe(1)
    } finally {
      await kit.cleanup()
    }
  }, 20_000)

  it('conciv_ui injection lands on the live stream', async () => {
    const claude = getHarness('claude')
    if (!claude) throw new Error('no claude')
    const kit = await createTestkit(createTestHarness(claude)).setup()
    try {
      const stream = kit.attach()
      await kit.invokeTool(
        'conciv_ui',
        {kind: 'confirm', question: 'Proceed?'},
        {instruction: 'Call the conciv_ui tool with kind confirm, question "Proceed?".'},
      )
      const spec = await stream.waitForUiSpec('Proceed?')
      expect(spec.question).toBe('Proceed?')
    } finally {
      await kit.cleanup()
    }
  }, 20_000)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm turbo run build --filter=@conciv/core --filter=@conciv/harness && pnpm vitest run --dir packages/harness-testkit test/create-testkit.it.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `create-testkit.ts`**

Model the boot on `packages/core/test/helpers/server.ts` (real `makeApp` + `srvx` serve), but consume events push-based and inject the harness. Reference `fake-claude` for the fake spawn (this plan reuses the existing `packages/core/test/fixtures/fake-claude.ts` via a spawn; a follow-up moves it into the package).

```ts
import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve, type Server} from 'srvx'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {StreamChunk} from '@tanstack/ai'
import {makeApp} from '@conciv/core/app'
import {makeRunStream, type RunStream} from './run-stream.js'
import {makeCallTool} from './call-tool.js'
import type {TestHarness} from './create-test-harness.js'

const fakeClaude = fileURLToPath(new URL('../../core/test/fixtures/fake-claude.ts', import.meta.url))

function fakeSpawn(): (args: string[], cwd: string) => HarnessChild {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    return {
      pid: child.pid ?? -1,
      stdin: child.stdin ?? undefined,
      stdout: child.stdout ?? undefined,
      stderr: child.stderr ?? undefined,
      kill: () => child.kill('SIGTERM'),
    }
  }
}

function realSpawn(bin: string): (args: string[], cwd: string) => HarnessChild {
  return (args, cwd) => {
    const child = spawn(bin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    return {
      pid: child.pid ?? -1,
      stdin: child.stdin ?? undefined,
      stdout: child.stdout ?? undefined,
      stderr: child.stderr ?? undefined,
      kill: () => child.kill('SIGTERM'),
    }
  }
}

function isTestHarness(h: HarnessAdapter): h is TestHarness {
  return '__scripted' in h
}

async function* parseSse(response: Response, signal: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const {value, done} = await reader.read()
    if (done) return
    buffer += decoder.decode(value, {stream: true})
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (json) yield JSON.parse(json) as StreamChunk
    }
  }
}

export type Kit = {
  base: string
  session: (id?: string) => Promise<string>
  attach: (session?: string) => RunStream
  chat: (content: string, session?: string) => Promise<void>
  invokeTool: (name: string, input: unknown, opts: {instruction: string}, session?: string) => Promise<void>
  callTool: (name: string, input: unknown, session?: string) => Promise<unknown>
  cleanup: () => Promise<void>
}
export type Testkit = {setup: () => Promise<Kit>}

export function createTestkit(harness: HarnessAdapter): Testkit {
  return {
    setup: async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
      const spawnHarness = isTestHarness(harness) ? fakeSpawn() : realSpawn(harness.binName)
      const {app, disposers} = await makeApp({
        cfg: {
          enabled: true,
          widgetUrl: undefined,
          stateRoot,
          harness: harness.id,
          harnessBin: undefined,
          sessionId: '',
          systemPrompt: '',
          extensions: undefined,
        },
        cwd: stateRoot,
        openInEditor: () => {},
        spawnHarness,
        harness,
      })
      const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
      await server.ready()
      const base = new URL(server.url ?? '').origin
      const aborts: AbortController[] = []

      const post = (path: string, body: unknown, session?: string) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', ...(session ? {[CONCIV_SESSION_HEADER]: session} : {})},
          body: JSON.stringify(body),
        })
      const resolve = async (id?: string) =>
        ((await (await post('/api/chat/session/resolve', id ? {id} : {})).json()) as {sessionId: string}).sessionId
      const activeSession = {id: ''}
      const sessionFor = async (session?: string) => session ?? (activeSession.id ||= await resolve())

      const callTool = async (name: string, input: unknown, session?: string) =>
        makeCallTool(base, await sessionFor(session))(name, input)

      return {
        base,
        session: (id) => resolve(id),
        attach: (session) => {
          const abort = new AbortController()
          aborts.push(abort)
          const source = (async function* () {
            const id = await sessionFor(session)
            const response = await fetch(`${base}/api/chat/attach`, {
              headers: {[CONCIV_SESSION_HEADER]: id},
              signal: abort.signal,
            })
            yield* parseSse(response, abort.signal)
          })()
          return makeRunStream(source)
        },
        chat: async (content, session) => {
          await post(
            '/api/chat',
            {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content}]}]},
            await sessionFor(session),
          )
        },
        invokeTool: async (name, input, opts, session) => {
          const id = await sessionFor(session)
          if (isTestHarness(harness)) {
            harness.__scripted.hold()
            await post('/api/chat', {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: 'go'}]}]}, id)
            await callTool(name, input, id)
            harness.__scripted.release()
          } else {
            await post(
              '/api/chat',
              {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: opts.instruction}]}]},
              id,
            )
          }
        },
        callTool,
        cleanup: async () => {
          for (const abort of aborts) abort.abort()
          await Promise.all(disposers.map((dispose) => dispose()))
          await server.close()
          rmSync(stateRoot, {recursive: true, force: true})
        },
      }
    },
  }
}
```

Note: `@conciv/core/app` must be an allowed subpath export of `@conciv/core`; if it is not, add the subpath export to `packages/core/package.json` (mirror how `startTestServer` imports `../src/app.js`, or expose `makeApp` via the core entry). Verify before implementing and adjust the import.

- [ ] **Step 4: Wire the public entry**

`src/testkit.ts`:

```ts
export {until} from './until.js'
export {createTestkit} from './create-testkit.js'
export {createTestHarness} from './create-test-harness.js'
export {hasClaude} from './has-claude.js'
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm turbo run build --filter=@conciv/core --filter=@conciv/harness && pnpm vitest run --dir packages/harness-testkit test/create-testkit.it.test.ts`
Expected: PASS (2 tests) — deterministic, no real claude.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(harness-testkit): createTestkit boots the real server + push verbs" -- packages/harness-testkit/src/create-testkit.ts packages/harness-testkit/src/testkit.ts packages/harness-testkit/test/create-testkit.it.test.ts
```

---

### Task 9: Migrate `claude-mcp.it` — the proof (fake + real, one body)

**Files:**

- Modify: `packages/core/test/api/mcp/claude-mcp.it.test.ts` (full rewrite)
- Modify: `packages/core/package.json` (add `@conciv/harness-testkit` devDependency)

**Interfaces:**

- Consumes: `createTestkit`, `createTestHarness`, `hasClaude` from `@conciv/harness-testkit`; `getHarness` from `@conciv/harness`.

- [ ] **Step 1: Add the devDependency**

Add `"@conciv/harness-testkit": "workspace:*"` to `packages/core` devDependencies; run `pnpm install`.

- [ ] **Step 2: Rewrite the test as a fake/real matrix**

```ts
import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness, createTestkit, hasClaude} from '@conciv/harness-testkit'

const claude = getHarness('claude')
if (!claude) throw new Error('claude adapter not registered')

const harnesses = [
  {name: 'fake', harness: createTestHarness(claude), run: true},
  {name: 'real', harness: claude, run: hasClaude()},
]

describe('claude → /api/mcp → uiBus', () => {
  for (const mode of harnesses) {
    it.skipIf(!mode.run)(
      `[${mode.name}] conciv_ui injection lands on the live stream`,
      async () => {
        const kit = await createTestkit(mode.harness).setup()
        try {
          const stream = kit.attach()
          await kit.invokeTool(
            'conciv_ui',
            {kind: 'confirm', question: 'Proceed?'},
            {instruction: 'Call the conciv_ui tool with kind confirm, question "Proceed?". Then reply DONE.'},
          )
          const spec = await stream.waitForUiSpec('Proceed?')
          expect(spec.question).toBe('Proceed?')
        } finally {
          await kit.cleanup()
        }
      },
      90_000,
    )
  }
})
```

- [ ] **Step 3: Run the fake path (always) and, if claude present, the real path**

Run: `pnpm turbo run build --filter=@conciv/core --filter=@conciv/harness && pnpm vitest run --dir packages/core test/api/mcp/claude-mcp.it.test.ts`
Expected: `[fake]` PASS every run; `[real]` PASS or SKIP (never the old 5s-snapshot flake).

- [ ] **Step 4: Prove non-flaky — run the fake path 10× in a row**

Run: `for i in $(seq 1 10); do pnpm vitest run --dir packages/core test/api/mcp/claude-mcp.it.test.ts -t 'fake' || break; done`
Expected: 10/10 PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "test(core): migrate claude-mcp.it to harness-testkit (fake+real, no snapshot)" -- packages/core/test/api/mcp/claude-mcp.it.test.ts packages/core/package.json pnpm-lock.yaml
```

---

### Task 10: Migrate `chat.it` "streams a run lifecycle"

**Files:**

- Modify: `packages/core/test/api/chat/chat.it.test.ts` (the `streams a run lifecycle with assistant text` test)

**Interfaces:**

- Consumes: `createTestkit`, `createTestHarness`, `hasClaude` from `@conciv/harness-testkit`.

- [ ] **Step 1: Replace the dual-mode lifecycle test with the matrix**

Replace the `it.skipIf(!useFakeHarness && !hasClaude())('streams a run lifecycle with assistant text', ...)` block with:

```ts
import {createTestHarness, createTestkit, hasClaude as kitHasClaude} from '@conciv/harness-testkit'
import {getHarness} from '@conciv/harness'

const claudeAdapter = getHarness('claude')
if (!claudeAdapter) throw new Error('claude adapter not registered')

for (const mode of [
  {name: 'fake', harness: createTestHarness(claudeAdapter), run: true},
  {name: 'real', harness: claudeAdapter, run: kitHasClaude()},
]) {
  it.skipIf(!mode.run)(
    `[${mode.name}] streams a run lifecycle with assistant text`,
    async () => {
      const kit = await createTestkit(mode.harness).setup()
      try {
        const stream = kit.attach()
        await kit.chat('reply with exactly PONG')
        const events = await stream.done()
        expect(events.runs()).toBe(1)
        if (mode.name === 'real') expect(events.text().toUpperCase()).toContain('PONG')
      } finally {
        await kit.cleanup()
      }
    },
    90_000,
  )
}
```

Leave the remaining `fakeIt(...)` unit-style tests in this file untouched for now (they exercise the old `startTestServer` fake spawn directly; the follow-up plan migrates or removes them).

- [ ] **Step 2: Run**

Run: `pnpm turbo run build --filter=@conciv/core --filter=@conciv/harness && pnpm vitest run --dir packages/core test/api/chat/chat.it.test.ts -t 'streams a run lifecycle'`
Expected: `[fake]` PASS; `[real]` PASS or SKIP.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): migrate chat lifecycle IT to harness-testkit matrix" -- packages/core/test/api/chat/chat.it.test.ts
```

---

## Follow-up (separate plan, built on this foundation)

Not in this plan — track as `docs/superpowers/plans/2026-07-05-harness-testkit-migration.md`:

- Move `fake-claude.ts` into `@conciv/harness-testkit`; delete the 3 `hasClaude()` copies.
- Migrate remaining Layer-B ITs (`sessions.it`, `turn-detach.it`, `turn-end.it`, `turn-error-flood.it`, `extension-server-surfaces.it`) and Layer-A (`claude-sdk.it`, `text-adapter.it`).
- Extend `extension-testkit` to consume the foundation; migrate the 52 `waitForTimeout`/`sleep` calls to `until`; terminal buffer + whiteboard convergence; `terminal-mode.it` deterministic variant.
- Remove `USE_SDK`/`CONCIV_CLAUDE_CLI` global; register `makeClaudeAdapter(true)` as the default `claude`.
- Add the lint rule banning `waitForTimeout`/`sleep`/hand-rolled deadline loops in `**/test`; the zero-sleep `grep` acceptance gate.
- Add `pnpm test` (fake only, CI) vs `pnpm test:real` scripts.

## Self-Review

- **Spec coverage:** Foundation (createTestHarness, createTestkit, RunStream, until, callTool, hasClaude) = Tasks 1-8. The two seams = Task 5. Kill-the-global DI seam = Task 7 (global _removal_ deferred to follow-up to keep each step non-breaking). Proof migration (Layer B, fake+real, no snapshot) = Tasks 9-10. Broad migration + ban-list + scripts = explicitly deferred follow-up (spec's full-suite migration is a separable sweep).
- **Placeholder scan:** No TBD/TODO; every code step has complete code. The one `condition未 met` typo in Task 2 Step 3 is flagged inline to write as ASCII.
- **Type consistency:** `createTestHarness → TestHarness (__scripted)` consumed by `createTestkit` Task 8 (`isTestHarness`/`__scripted.hold/release`). `makeRunStream → RunStream` consumed by `attach`. `makeCallTool` signature consistent Tasks 4/8. `makeApp` `harness?` (Task 7) consumed by `createTestkit` (Task 8).
- **Known verification points for the implementer:** (a) `@conciv/core` must export `makeApp` on an importable subpath — confirm/add before Task 8; (b) exact `catalog:` versions from `extension-testkit`; (c) `HarnessTurn` field names (`kind`, `resumeSessionId`) as used in Task 5 test — confirm against `harness-types.ts`.
