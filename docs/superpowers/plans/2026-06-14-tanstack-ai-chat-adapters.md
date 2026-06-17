# TanStack AI chat() + Harness Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make aidx drive every chat turn through `@tanstack/ai`'s `chat()`, with each harness wrapped as a complete `TextAdapter`, and aidx's own tools (`ui`/`page`/`test`) exposed to the harness CLI as `@tanstack/ai` tools over an in-process MCP-over-HTTP server.

**Architecture:** CLI-only. `chat()` is the stream orchestrator (lifecycle pass-through, middleware, message conversion); the harness CLI owns iteration and executes aidx tools via MCP. `HarnessTextAdapter extends BaseTextAdapter` wraps any `HarnessAdapter` (built via the `harnessText(harness, deps)` factory function) — `chat()` and the adapter stay harness-agnostic; all CLI specifics live in the `HarnessAdapter`. (The class is a justified, narrow exception to functions-not-classes: it is the only cast-free way to satisfy the `TextAdapter` interface's `never`-typed `'~types'`.) `/api/mcp` is a streamable-HTTP MCP server built on `@modelcontextprotocol/sdk`'s **Web Standard** transport (`WebStandardStreamableHTTPServerTransport`), which takes a web `Request` and returns a `Response` — so it drops straight into an h3 route (`return transport.handleRequest(event.req)`) with no node-object bridge.

**Tech Stack:** `@tanstack/ai` 0.28 (`chat`, `TextAdapter` interface, `StreamChunk`, `TextOptions`, `normalizeSystemPrompts`, `toServerSentEventsStream`, `toolDefinition`), `@modelcontextprotocol/sdk` 1.29 (server: `McpServer`, `WebStandardStreamableHTTPServerTransport`), h3 (web `Request`/`Response`), zod, vitest (integration `*.it.test.ts`, real `claude` + real servers — no mocks/jsdom per repo convention).

---

## Reference: verified library signatures

These are confirmed against the installed packages — use them verbatim.

```ts
// @tanstack/ai/adapters exports the abstract BaseTextAdapter class + StructuredOutputOptions/Result.
// We EXTEND BaseTextAdapter (the library's pattern — Ollama/OpenAI do this). This is the only
// cast-free way to satisfy the TextAdapter interface: its `'~types'.systemPromptMetadata` is typed
// `never` (uninhabited), so no object literal can satisfy it without a cast. Extending the base —
// which declares `'~types'` as a never-assigned class property — is cast-free and library-intended.
// A justified, narrow exception to functions-not-classes, forced by the no-casts rule.
abstract class BaseTextAdapter<TModel extends string, TProviderOptions extends Record<string, any>,
  TInputModalities extends ReadonlyArray<Modality>, TMessageMetadataByModality, ...> {
  readonly kind: 'text'; abstract readonly name: string; readonly model: TModel
  constructor(config: TextAdapterConfig | undefined, model: TModel)
  abstract chatStream(options: TextOptions<TProviderOptions>): AsyncIterable<StreamChunk>
  abstract structuredOutput(options: StructuredOutputOptions<TProviderOptions>): Promise<StructuredOutputResult<unknown>>
  protected generateId(): string
}
// @tanstack/ai TextOptions fields used here: messages, systemPrompts, runId?, threadId?, parentRunId?, abortController?, logger
// @tanstack/ai exports: chat, normalizeSystemPrompts, toServerSentEventsStream, EventType
// @modelcontextprotocol/sdk/server/mcp.js: class McpServer; server.registerTool(name, {description, inputSchema}, handler); server.connect(transport)
// @modelcontextprotocol/sdk/server/webStandardStreamableHttp.js: class WebStandardStreamableHTTPServerTransport
//   new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }) // stateless, JSON response
//   handleRequest(req: Request): Promise<Response>   // pure Web Standard — h3 returns it directly
```

## File structure

**New files**

- `packages/tools/` — new package `@opendui/aidx-tools`. The `toolDefinition().server()` registry.
  - `packages/tools/package.json`, `tsconfig.json`, `tsdown.config.ts`
  - `packages/tools/src/types.ts` — `AidxToolContext` (handles the tools bridge to)
  - `packages/tools/src/ui.ts` — `aidxUiTool`
  - `packages/tools/src/page.ts` — `aidxPageTool`
  - `packages/tools/src/test.ts` — `aidxTestTool`
  - `packages/tools/src/registry.ts` — `aidxTools(ctx): Tool[]`
- `packages/harness/src/_shared/text-adapter.ts` — `HarnessTextAdapter`, `harnessText(harness, deps)`, `lastUserModelText`
- `packages/core/src/api/mcp/mcp.ts` — `registerMcpRoutes(app, deps)` (the `/api/mcp` server)

**Modified files**

- `packages/protocol/src/harness-types.ts` — add `mcp` capability, `mcpUrl` turn field, decoder opts (`runId`/`threadId`/`logger`)
- `packages/harness/src/_shared/agui.ts` — thread `runId`/`threadId`/`logger`; non-empty delta guard
- `packages/harness/src/claude/index.ts` — `capabilities.mcp: 'http'`
- `packages/harness/src/claude/args.ts` — inject `--mcp-config`; drop `Bash(aidx ui:*)` / `Bash(aidx tools:*)` allowedTools
- `packages/harness/src/codex/index.ts` — `capabilities.mcp: 'http'` (+ codex args mcp flag, Task 12)
- `packages/harness/src/{gemini-cli,opencode,pi}/index.ts` — `capabilities.mcp: 'none'`
- `packages/core/src/api/chat/turn.ts` — route the turn through `chat()`
- `packages/core/src/api/chat/chat.ts` + `packages/core/src/app.ts` — pass mcp url + register `/api/mcp`
- `packages/harness/plugins/claude/skills/react-introspection/SKILL.md` — reference MCP tools, not `aidx` CLI

---

## Phase 0 — Contract changes

### Task 1: Extend the harness contract (capabilities, turn, decoder opts)

**Files:**

- Modify: `packages/protocol/src/harness-types.ts`

- [ ] **Step 1: Add the `mcp` capability, `mcpUrl`, and decoder opts**

In `packages/protocol/src/harness-types.ts`, change `HarnessCapabilities`, `HarnessTurn`, and `HarnessDecoder`:

```ts
import type {Readable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'none'
  transcriptHistory: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'
  // From the chat-image-input spec (server-half absorbed here):
  // 'native'  → ingests image content blocks (claude: --input-format stream-json on stdin)
  // 'fileRef' → no vision channel; server writes temp files + appends path refs to the prompt
  // false     → no image support
  imageInput: 'native' | 'fileRef' | false
}

// An image content part carried from chat()'s messages to the harness (base64 data source).
export type HarnessImage = {mediaType: string; dataBase64: string}

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string
  mcpUrl?: string
  images?: HarnessImage[] // present when the user turn carried images and the harness can use them
}

// Minimal logger shape the adapter threads in (matches @tanstack/ai InternalLogger surface we use).
export type HarnessDecodeLogger = {provider(msg: string, meta?: unknown): void}

export type HarnessDecodeOpts = {
  onSessionId(id: string): void
  runId?: string
  threadId?: string
  logger?: HarnessDecodeLogger
}

export type HarnessDecoder = (lines: AsyncIterable<string>, opts: HarnessDecodeOpts) => AsyncGenerator<StreamChunk>
```

Also extend `HarnessChild` with an optional writable stdin (native image delivery writes a
stream-json message to it), and add an optional `deliverInput` hook to the adapter for post-spawn
input delivery (keeps delivery specifics inside the harness — the adapter stays harness-agnostic):

```ts
import type {Readable, Writable} from 'node:stream'
export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; stdin?: Writable; kill(): void}

// Optional: write the turn's input to the child after spawn (e.g. claude native images →
// a stream-json user message on stdin). Harnesses that take everything via argv omit it.
export type HarnessDeliverInput = (child: HarnessChild, turn: HarnessTurn) => void | Promise<void>
```

Add `deliverInput?: HarnessDeliverInput` to `HarnessAdapterBase`. Leave `HarnessArgsBuilder`,
`HarnessHistory`, `defineHarness` otherwise unchanged.

- [ ] **Step 2: Typecheck the protocol package**

Run: `pnpm --filter @opendui/aidx-protocol typecheck`
Expected: FAIL — existing harness adapters don't yet set `mcp`, and `agui.ts`/`decode.ts` still use the old opts. These are fixed in later tasks; the protocol package itself compiles, but dependents break. Confirm the _protocol_ package's own `tsc` passes (the break is downstream).

- [ ] **Step 3: Set `mcp` + `imageInput` on every adapter so the workspace typechecks again**

Add both new capability fields to each adapter's `capabilities` (`packages/harness/src/*/index.ts`):

| Harness    | `mcp`    | `imageInput`                                   |
| ---------- | -------- | ---------------------------------------------- |
| claude     | `'http'` | `'native'`                                     |
| codex      | `'http'` | `'fileRef'` (verify during impl; else `false`) |
| gemini-cli | `'none'` | `false`                                        |
| opencode   | `'none'` | `false`                                        |
| pi         | `'none'` | `false`                                        |

Example (claude):

```ts
capabilities: {resume: true, permissionGate: 'hook', transcriptHistory: true, systemPrompt: 'file', mcp: 'http', imageInput: 'native'},
```

- [ ] **Step 4: Build protocol + typecheck harness**

Run: `pnpm --filter @opendui/aidx-protocol build && pnpm --filter @opendui/aidx-harness typecheck`
Expected: harness typecheck FAILs only in `_shared/agui.ts` / `claude/decode.ts` (decoder opts) — fixed in Task 2. No capability errors.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/harness-types.ts packages/harness/src/*/index.ts
git commit -m "feat(protocol): add mcp + imageInput caps, mcpUrl/images on turn, child stdin, deliverInput hook, decoder runId/threadId/logger opts"
```

---

## Phase 1 — Route the turn through chat()

### Task 2: Thread runId/threadId/logger through runAgui; non-empty delta guard

**Files:**

- Modify: `packages/harness/src/_shared/agui.ts`
- Modify: `packages/harness/src/claude/decode.ts` (signature pass-through only)
- Modify: `packages/harness/src/codex/decode.ts` (same)
- Test: `packages/harness/test/agui-lifecycle.it.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/harness/test/agui-lifecycle.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {runAgui, textMessage} from '../src/_shared/agui.js'
import {z} from 'zod'

async function* lines(...ls: string[]) {
  for (const l of ls) yield l
}

describe('runAgui lifecycle', () => {
  it('emits RUN_STARTED/RUN_FINISHED with the supplied runId/threadId', async () => {
    const schema = z.object({type: z.string(), text: z.string().optional()}).loose()
    const out: StreamChunk[] = []
    const gen = runAgui(lines('{"type":"x"}'), schema, {onSessionId() {}, runId: 'R1', threadId: 'T1'}, () => [])
    for await (const c of gen) out.push(c)
    const start = out.find((c) => c.type === EventType.RUN_STARTED)
    const end = out.find((c) => c.type === EventType.RUN_FINISHED)
    expect(start).toMatchObject({runId: 'R1', threadId: 'T1'})
    expect(end).toMatchObject({runId: 'R1', threadId: 'T1'})
  })

  it('drops empty TEXT_MESSAGE_CONTENT deltas', () => {
    const chunks = [...textMessage('m1', '')]
    expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/agui-lifecycle.it.test.ts`
Expected: FAIL — `runAgui` ignores `runId`/`threadId` (uses hardcoded constants) and `textMessage` emits an empty delta.

- [ ] **Step 3: Update `runAgui` and the emitters**

In `packages/harness/src/_shared/agui.ts`:

- Replace the `THREAD_ID`/`RUN_ID` constants usage. Change `runAgui`'s signature to read ids/logger from opts:

```ts
export async function* runAgui<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  opts: HarnessDecodeOpts,
  step: Step<E>,
): AsyncGenerator<StreamChunk> {
  const runId = opts.runId ?? 'aidx-run'
  const threadId = opts.threadId ?? 'aidx-chat'
  const counter = {n: 0}
  const mint: Mint = (prefix) => {
    counter.n += 1
    return `${prefix}${counter.n}`
  }
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const line of lines) {
    opts.logger?.provider('harness-line', {line})
    const event = parseJsonLine(line, schema)
    if (event === null) continue
    yield* step(event, {mint, onSessionId: opts.onSessionId})
  }
  yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
}
```

- Import `HarnessDecodeOpts` from `@opendui/aidx-protocol/harness-types` and drop the local `SessionSink` type (replace its uses with `HarnessDecodeOpts`).
- Guard the empty delta in `textMessage` and `reasoningMessage`:

```ts
export function* textMessage(id: string, text: string): Generator<StreamChunk> {
  yield {type: EventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant'}
  if (text) yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: id}
}
```

(Apply the same `if (text)` guard in `reasoningMessage` around `REASONING_MESSAGE_CONTENT`.)

- [ ] **Step 4: Update the decoders' opts type**

In `packages/harness/src/claude/decode.ts` and `packages/harness/src/codex/decode.ts`, change the exported decode fn signature from `opts: SessionSink` to `opts: HarnessDecodeOpts` and pass `opts` straight to `runAgui`. No logic change. Update imports accordingly.

- [ ] **Step 5: Run the test to confirm pass**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/agui-lifecycle.it.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck harness + run existing harness tests for regressions**

Run: `pnpm --filter @opendui/aidx-harness typecheck && pnpm --filter @opendui/aidx-harness test`
Expected: PASS — existing `harness.it.test.ts` / `codex-decode.test.ts` still green (they call decode with `{onSessionId}`, still valid).

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/_shared/agui.ts packages/harness/src/claude/decode.ts packages/harness/src/codex/decode.ts packages/harness/test/agui-lifecycle.it.test.ts
git commit -m "feat(harness): thread runId/threadId/logger through runAgui; guard empty deltas"
```

### Task 3: The HarnessTextAdapter + harnessText factory

**Files:**

- Create: `packages/harness/src/_shared/text-adapter.ts`
- Test: `packages/harness/test/text-adapter.it.test.ts`

- [ ] **Step 1: Write the failing test (real claude turn through the adapter)**

Create `packages/harness/test/text-adapter.it.test.ts`. This drives the real `claude` CLI through `chat()` via the adapter and asserts the AG-UI contract (one RUN_STARTED/RUN_FINISHED, some text). Skips if `claude` is absent.

```ts
import {execSync} from 'node:child_process'
import {spawn} from 'node:child_process'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChild} from '@opendui/aidx-protocol/harness-types'
import {harnessText} from '../src/_shared/text-adapter.js'
import {claude} from '../src/claude/index.js'

function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

const spawnHarness = (args: string[], cwd: string): HarnessChild => {
  const child = spawn('claude', args, {cwd, stdio: ['ignore', 'pipe', 'pipe']})
  return {pid: child.pid ?? 0, stdout: child.stdout!, stderr: child.stderr!, kill: () => child.kill()}
}

describe('harnessText adapter', () => {
  it.skipIf(!hasClaude())(
    'drives claude through chat() with one lifecycle pair',
    async () => {
      const adapter = harnessText(claude, {cwd: process.cwd(), spawnHarness, systemPrompt: '', onSpawn() {}})
      const out: StreamChunk[] = []
      for await (const chunk of chat({adapter, messages: [{role: 'user', content: 'reply with exactly PONG'}]})) {
        out.push(chunk)
      }
      expect(out.filter((c) => c.type === EventType.RUN_STARTED)).toHaveLength(1)
      expect(out.filter((c) => c.type === EventType.RUN_FINISHED)).toHaveLength(1)
      const text = out.flatMap((c) => (c.type === EventType.TEXT_MESSAGE_CONTENT ? [c.delta] : [])).join('')
      expect(text.toUpperCase()).toContain('PONG')
    },
    60_000,
  )
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/text-adapter.it.test.ts`
Expected: FAIL — `harnessText` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `packages/harness/src/_shared/text-adapter.ts`:

```ts
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {normalizeSystemPrompts, type StreamChunk, type TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import type {HarnessAdapter, HarnessChild, HarnessImage, HarnessTurn} from '@opendui/aidx-protocol/harness-types'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type HarnessAdapterDeps = {
  cwd: string
  spawnHarness: SpawnHarness
  systemPrompt: string // resolved text or file path, per harness.capabilities.systemPrompt
  resumeSessionId?: string | null
  permissionUrl?: string
  mcpUrl?: string
  onSessionId?: (id: string) => void
  onSpawn?: (child: HarnessChild) => void // route acquires the lock here
}

type InputModalities = readonly ['text']
type MsgMeta = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

// Latest user-turn text from chat()'s ModelMessage[] (content is string or ContentPart[]).
// flatMap + the `type` discriminant narrows each part — no cast, no type-guard predicate.
export function lastUserModelText(messages: TextOptions['messages']): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.content] : [])).join('\n')
}

// Image parts from the latest user turn. Narrow `type==='image'` then `source.type==='data'`
// (the data source carries base64) — cast-free; `source.mimeType` is the verified field name.
export function lastUserImages(messages: TextOptions['messages']): HarnessImage[] {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last || typeof last.content === 'string') return []
  return last.content.flatMap((p) => {
    if (p.type !== 'image' || p.source.type !== 'data') return []
    return [{mediaType: p.source.mimeType, dataBase64: p.source.value}]
  })
}

async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

// Extends BaseTextAdapter (the library's cast-free way to satisfy the never-typed `'~types'`).
// A justified, narrow exception to functions-not-classes: a plain object cannot implement the
// TextAdapter interface without a cast, which the no-casts rule forbids.
export class HarnessTextAdapter extends BaseTextAdapter<string, Record<string, never>, InputModalities, MsgMeta> {
  readonly name: string
  private readonly harness: HarnessAdapter
  private readonly deps: HarnessAdapterDeps

  constructor(harness: HarnessAdapter, deps: HarnessAdapterDeps) {
    super({}, harness.id)
    this.harness = harness
    this.deps = deps
    this.name = harness.id
  }

  async *chatStream(options: TextOptions<Record<string, never>>): AsyncIterable<StreamChunk> {
    const {harness, deps} = this
    options.logger.request(`activity=chat provider=${harness.id} messages=${options.messages.length} stream=true`, {
      provider: harness.id,
      model: harness.id,
    })
    const mode = harness.capabilities.systemPrompt
    const sysFromPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .join('\n')
    const sysText = sysFromPrompts || deps.systemPrompt
    const userText = lastUserModelText(options.messages)
    const images = harness.capabilities.imageInput !== false ? lastUserImages(options.messages) : []
    const turn: HarnessTurn = {
      prompt: mode === 'none' && sysText ? `${sysText}\n\n${userText}` : userText,
      cwd: deps.cwd,
      resumeSessionId: deps.resumeSessionId ?? null,
      systemPrompt: mode === 'none' ? '' : sysText,
      permissionUrl: deps.permissionUrl,
      mcpUrl: deps.mcpUrl,
      ...(images.length ? {images} : {}),
    }
    const child = deps.spawnHarness(harness.buildArgs(turn), deps.cwd)
    deps.onSpawn?.(child)
    options.abortController?.signal.addEventListener('abort', () => child.kill())
    await harness.deliverInput?.(child, turn) // e.g. claude native images → stream-json on stdin
    try {
      yield* harness.decode(linesOf(child.stdout), {
        onSessionId: (id) => deps.onSessionId?.(id),
        runId: options.runId,
        threadId: options.threadId,
        logger: options.logger,
      })
    } catch (error) {
      options.logger.errors(`${harness.id}.chatStream fatal`, {error, source: `${harness.id}.chatStream`})
      throw error
    }
  }

  structuredOutput(_options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        `harness '${this.harness.id}' does not support structured output (coding CLIs have no native schema mode)`,
      ),
    )
  }
}

// Factory wrapper so call sites read as functions; returns the adapter instance.
export function harnessText(harness: HarnessAdapter, deps: HarnessAdapterDeps): HarnessTextAdapter {
  return new HarnessTextAdapter(harness, deps)
}
```

- [ ] **Step 4: Export the adapter from the package root**

- Confirm `@opendui/aidx-harness` `package.json` `dependencies` includes `@tanstack/ai` (it does). No new dep.
- Core imports `harnessText` from the `@opendui/aidx-harness` root. The root (`.`) export maps to `dist/registry.js` (`packages/harness/package.json`), so add this line to `packages/harness/src/registry.ts` (no `package.json` change): `export {harnessText, HarnessTextAdapter, lastUserModelText, lastUserImages} from './_shared/text-adapter.js'`. Task 4 depends on this export existing.

- [ ] **Step 5: Run the test (requires `claude` on PATH + auth)**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/text-adapter.it.test.ts`
Expected: PASS (or SKIP if no `claude`). One RUN_STARTED, one RUN_FINISHED, text contains PONG.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @opendui/aidx-harness typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/_shared/text-adapter.ts packages/harness/src/registry.ts packages/harness/test/text-adapter.it.test.ts
git commit -m "feat(harness): HarnessTextAdapter (extends BaseTextAdapter) + harnessText factory"
```

### Task 4: Route the chat turn through chat()

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts`
- Test: `packages/core/test/api/chat/chat.it.test.ts` (existing — extend assertions)

- [ ] **Step 1: Extend the existing chat integration test**

In `packages/core/test/api/chat/chat.it.test.ts`, add an assertion that a streamed turn contains exactly one `RUN_STARTED` and one `RUN_FINISHED` SSE event (verifies chat() passes the adapter's lifecycle through without doubling). Use the existing test's harness/stub setup; assert against the collected SSE chunk types.

```ts
it('streams exactly one run lifecycle pair through chat()', async () => {
  const events = await collectChatSse(/* existing helper / fixture from this file */)
  expect(events.filter((e) => e.type === 'RUN_STARTED')).toHaveLength(1)
  expect(events.filter((e) => e.type === 'RUN_FINISHED')).toHaveLength(1)
})
```

(Use the file's existing stub harness + request helpers; if the file uses a stub decode, ensure the stub emits a lifecycle pair so the assertion is meaningful.)

- [ ] **Step 2: Run it to confirm it fails or is unstable on the old path**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/chat/chat.it.test.ts`
Expected: the new assertion may pass on the old path (decode emits the pair directly) — that's fine; it becomes the regression guard. If the helper doesn't exist, the test FAILs to compile. Build the minimal helper inline from the existing request code in the file.

- [ ] **Step 3: Rewrite `registerTurnRoutes` to use `chat()`**

In `packages/core/src/api/chat/turn.ts`, replace the body of the `app.post('/api/chat', …)` handler. Keep `/api/chat/ui`, `linesOf`, and `withLockRelease` (still used for lock release on the merged stream). New handler:

```ts
import {chat, toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import {harnessText} from '@opendui/aidx-harness'
// … existing imports …

app.post('/api/chat', async (event) => {
  if (readLock(deps.stateRoot).held) throw new HTTPError({status: 409, message: 'agent busy'})
  const chatReq = await readValidatedBody(event, ChatRequestSchema)
  const resumeSessionId = harness.capabilities.resume ? chatReq.sessionId || state.sessionId || null : null
  const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
  const mode = harness.capabilities.systemPrompt
  const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
  const abort = new AbortController()

  const adapter = harnessText(harness, {
    cwd: deps.cwd,
    spawnHarness: deps.spawnHarness,
    systemPrompt: sysText,
    resumeSessionId,
    permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
    mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,
    onSessionId: (id) => {
      state.sessionId = id
      writeSession(deps.stateRoot, deps.previewId, id)
    },
    onSpawn: (child) => {
      acquireLock(deps.stateRoot, 'chat', child.pid)
      event.req.signal.addEventListener('abort', () => {
        abort.abort()
        child.kill()
      })
    },
  })

  const stream = chat({
    adapter,
    messages: chatReq.messages,
    systemPrompts: sysText ? [sysText] : [],
    abortController: abort,
  })
  const merged = uiBus.run(stream)
  const sse = toServerSentEventsStream(withLockRelease(merged, deps.stateRoot), abort)
  return new Response(sse, {status: 200, headers: sseHeaders(event)})
})
```

Notes (cast-free — repo rule forbids `as`):

- `chatReq.messages` is already `UIMessage[]` (`@opendui/aidx-protocol/chat-types` re-exports `UIMessage` from `@tanstack/ai`), and `chat()` accepts `Array<UIMessage | ModelMessage>`, so it passes with no cast. If `tsc` reports a mismatch, fix the _type_ of `ChatRequest['messages']` to be `UIMessage[]` — do not cast.
- `chat()`'s streaming return is `AsyncIterable<StreamChunk>`, which `uiBus.run` accepts directly — no cast.
- The `lastUserText` import + `mode === 'none'` prompt-prefix logic moves into the adapter (Task 3), so remove the now-unused `lastUserText` import from `turn.ts`.
- The lock is acquired in `onSpawn` (after the child exists, so we still record the pid).
- `mcpUrl` points at `/api/mcp`, which only exists after Task 6 — a real claude turn run between Task 4 and Task 6 would 404 on tool calls. The Task 4 test does not exercise MCP, so it passes; the live tool path lights up in Task 7.

- [ ] **Step 4: Run the chat integration test**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/chat/chat.it.test.ts`
Expected: PASS — one lifecycle pair; existing streaming assertions still green.

- [ ] **Step 5: Typecheck core**

Run: `pnpm --filter @opendui/aidx-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/chat/turn.ts packages/core/test/api/chat/chat.it.test.ts
git commit -m "feat(core): drive the chat turn through @tanstack/ai chat()"
```

### Task 4b: Native image delivery for claude (server-half of chat-image-input)

Absorbs the chat-image-input spec's **server half** for the `imageInput:'native'` harness (claude).
The composer/widget UI half stays in the chat-image-input plan; this task makes images reach claude.

**Files:**

- Modify: `packages/harness/src/claude/args.ts` (switch to stream-json stdin when images present)
- Create: `packages/harness/src/claude/deliver-input.ts` (the `deliverInput` hook)
- Modify: `packages/harness/src/claude/index.ts` (wire `deliverInput`)
- Test: `packages/core/test/api/mcp/claude-image.it.test.ts` (real claude, a tiny base64 PNG)

- [ ] **Step 1: Write the failing test**

`packages/core/test/api/mcp/claude-image.it.test.ts` — POST a chat turn whose user message carries a 1×1 PNG as a `@tanstack/ai` image content part; assert claude's reply references having seen an image (e.g. ask "reply with the image dimensions" → contains `1`). Skip if no `claude`. Use `startTestServer({harness:'claude', realSpawn:true})` + a `postChat(messageWithImage)` helper that sends `{role:'user', content:[{type:'text',content:'...'},{type:'image',source:{type:'data',mediaType:'image/png',value:'<base64>'}}]}`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/claude-image.it.test.ts`
Expected: FAIL — `buildClaudeArgs` ignores images and uses `-p`, so claude never receives the image.

- [ ] **Step 3: Branch `buildClaudeArgs` on images**

In `packages/harness/src/claude/args.ts`: when `turn.images?.length`, switch the invocation to stream-json stdin instead of `-p`:

- Replace `'-p', turn.prompt` with `'-p', '--input-format', 'stream-json'` (keep `--output-format stream-json`). The user message (text + image blocks) is written to stdin by `deliverInput` (Step 4). When there are no images, keep today's `-p turn.prompt` argv unchanged.

- [ ] **Step 4: Implement the `deliverInput` hook**

Create `packages/harness/src/claude/deliver-input.ts`. When `turn.images?.length`, write one stream-json user message to `child.stdin` then end it:

```ts
import type {HarnessChild, HarnessTurn} from '@opendui/aidx-protocol/harness-types'

// claude --input-format stream-json expects newline-delimited JSON user messages on stdin.
// Verify the exact envelope against the installed claude (`claude --help`, stream-json input docs);
// the shape below is the documented user-message-with-content-blocks form.
export function claudeDeliverInput(child: HarnessChild, turn: HarnessTurn): void {
  if (!turn.images?.length || !child.stdin) return
  const content = [
    {type: 'text', text: turn.prompt},
    ...turn.images.map((img) => ({
      type: 'image',
      source: {type: 'base64', media_type: img.mediaType, data: img.dataBase64},
    })),
  ]
  const message = {type: 'user', message: {role: 'user', content}}
  child.stdin.write(JSON.stringify(message) + '\n')
  child.stdin.end()
}
```

Wire it in `packages/harness/src/claude/index.ts`: add `deliverInput: claudeDeliverInput` to the `defineHarness({...})` object.

- [ ] **Step 5: Ensure the child exposes a writable stdin**

The `spawnHarness` in `packages/core/src/engine.ts` must pipe stdin (`stdio: ['pipe','pipe','pipe']`) and put the writable on `HarnessChild.stdin`. Update it and the `HarnessChild` construction.

- [ ] **Step 6: Run the test**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/claude-image.it.test.ts`
Expected: PASS (or SKIP) — claude received and described the image.

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/claude/args.ts packages/harness/src/claude/deliver-input.ts packages/harness/src/claude/index.ts packages/core/src/engine.ts packages/core/test/api/mcp/claude-image.it.test.ts
git commit -m "feat(harness): native image input for claude via stream-json stdin (chat-image-input server half)"
```

---

## Phase 2 — @opendui/aidx-tools + /api/mcp + aidx_ui (first tool end-to-end)

### Task 5: Scaffold @opendui/aidx-tools with the aidx_ui tool

**Files:**

- Create: `packages/tools/package.json`, `packages/tools/tsconfig.json`, `packages/tools/tsdown.config.ts`
- Create: `packages/tools/src/types.ts`, `packages/tools/src/ui.ts`, `packages/tools/src/registry.ts`
- Test: `packages/tools/test/ui-tool.it.test.ts`

- [ ] **Step 1: Create the package manifest**

`packages/tools/package.json` (mirror `@opendui/aidx-harness`'s shape — tsdown build, per-subpath exports, `@tanstack/ai` + `zod` deps):

```json
{
  "name": "@opendui/aidx-tools",
  "version": "0.0.0",
  "description": "aidx agent tools as @tanstack/ai toolDefinition().server() functions: ui, page, test.",
  "license": "MIT",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {"types": "./dist/registry.d.ts", "import": "./dist/registry.js"}
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run"
  },
  "dependencies": {
    "@opendui/aidx-protocol": "workspace:*",
    "@tanstack/ai": "^0.28.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.19.21",
    "tsdown": "^0.22.2",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

Copy `tsconfig.json` and `tsdown.config.ts` from `packages/harness` (adjust entry to `src/registry.ts`). Add `@opendui/aidx-tools` to the root `pnpm-workspace.yaml` if packages aren't globbed (check: it globs `packages/*`, so no change needed — verify).

- [ ] **Step 2: Write the failing test**

`packages/tools/test/ui-tool.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/registry.js'

describe('aidx_ui tool', () => {
  it('bridges to the ctx.injectUi sink and returns injected:true', async () => {
    const seen: unknown[] = []
    const tools = aidxTools({
      injectUi: (spec) => (seen.push(spec), true),
      page: async () => ({}),
      test: async () => ({}),
    })
    const ui = tools.find((t) => t.name === 'aidx_ui')!
    const result = await ui.execute({kind: 'confirm', question: 'ok?'}, {context: undefined})
    expect(seen).toHaveLength(1)
    expect(result).toMatchObject({injected: true})
  })
})
```

(Exact `.execute` invocation shape comes from `toolDefinition().server()`. If the resolved tool object exposes the handler under a different key, adjust the call to match the `@tanstack/ai` `Tool` runtime — verify against `toolDefinition` types in `node_modules/@tanstack/ai`. The behavior asserted — bridge called, `injected:true` returned — is fixed.)

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run`
Expected: FAIL — package/exports don't exist yet.

- [ ] **Step 4: Define the context type**

`packages/tools/src/types.ts`:

```ts
import type {UiSpec} from '@opendui/aidx-protocol/ui-types'
import type {PageQuery} from '@opendui/aidx-protocol/page-types'

export type AidxToolContext = {
  injectUi: (spec: UiSpec) => boolean
  page: (query: PageQuery) => Promise<unknown>
  test: (action: {kind: 'list' | 'run' | 'status'; pattern?: string}) => Promise<unknown>
}
```

- [ ] **Step 5: Implement the aidx_ui tool**

`packages/tools/src/ui.ts` — reuse `buildUiSpec` logic from `packages/cli/src/ui.ts` (move the pure `buildUiSpec` into `@opendui/aidx-protocol/ui-types` or duplicate the small schema here; prefer importing a shared builder). Define with `toolDefinition`:

```ts
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import type {AidxToolContext} from './types.js'
import {buildUiSpec} from '@opendui/aidx-protocol/ui-types' // move buildUiSpec here in Step 5a

const UiInput = z.object({
  kind: z.enum(['choices', 'confirm', 'diff', 'form']),
  question: z.string().optional(),
  detail: z.string().optional(),
  options: z.array(z.string()).optional(),
  file: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(['text', 'select']),
        options: z.array(z.string()).optional(),
      }),
    )
    .optional(),
})

export const aidxUiToolDef = toolDefinition({
  name: 'aidx_ui',
  description:
    'Render real interactive UI (choices/confirm/diff/form) in the chat thread. Non-blocking: the user reply arrives as their next chat message.',
  inputSchema: UiInput,
})

export function aidxUiTool(ctx: AidxToolContext) {
  return aidxUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    const spec = buildUiSpec(input.kind, input, renderId)
    const injected = ctx.injectUi(spec)
    return {renderId, injected}
  })
}
```

- **Step 5a:** Move `buildUiSpec` (and `parseField`) from `packages/cli/src/ui.ts` into `packages/protocol/src/ui-types.ts`, export it, and re-import it in `cli/src/ui.ts` (so the CLI and the tool share one builder — DRY). Rebuild `@opendui/aidx-protocol`.

- [ ] **Step 6: Implement the registry**

`packages/tools/src/registry.ts`:

```ts
import type {AidxToolContext} from './types.js'
import {aidxUiTool} from './ui.js'
import {aidxPageTool} from './page.js' // added in Task 8
import {aidxTestTool} from './test.js' // added in Task 9

export type {AidxToolContext} from './types.js'

export function aidxTools(ctx: AidxToolContext) {
  return [aidxUiTool(ctx), aidxPageTool(ctx), aidxTestTool(ctx)]
}
```

For this task, temporarily export only `aidxUiTool(ctx)` and add the others in their tasks (or create thin stub `page.ts`/`test.ts` that throw "not implemented" so the file compiles — replace in Tasks 8/9).

- [ ] **Step 7: Run the test**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run && pnpm --filter @opendui/aidx-tools typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/tools packages/protocol/src/ui-types.ts packages/cli/src/ui.ts
git commit -m "feat(tools): @opendui/aidx-tools package with aidx_ui tool; share buildUiSpec via protocol"
```

### Task 6: The /api/mcp streamable-HTTP server

**Files:**

- Create: `packages/core/src/api/mcp/mcp.ts`
- Modify: `packages/core/package.json` (add `@modelcontextprotocol/sdk`)
- Modify: `packages/core/src/app.ts` (register the route, pass uiBus/page/test)
- Test: `packages/core/test/api/mcp/mcp.it.test.ts`

- [ ] **Step 1: Add the dependencies (user-approved)**

```bash
pnpm --filter @opendui/aidx-core add @modelcontextprotocol/sdk
pnpm --filter @opendui/aidx-core add -D @tanstack/ai-mcp   # TEST-ONLY MCP client for /api/mcp (no hand-rolled JSON-RPC)
```

Confirm a single version resolves and both server subpaths exist. Run: `pnpm --filter @opendui/aidx-core exec node -e "Promise.all([import('@modelcontextprotocol/sdk/server/mcp.js'),import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js')]).then(([a,b])=>console.log('McpServer' in a, 'WebStandardStreamableHTTPServerTransport' in b))"`
Expected: prints `true true` (verified against 1.29.0). If a subpath differs, find it: `ls node_modules/.pnpm/@modelcontextprotocol+sdk@*/node_modules/@modelcontextprotocol/sdk/dist/esm/server/`.

> **Why `@tanstack/ai-mcp` is test-only:** it is a host-side MCP _client_ (for `chat()` to consume external MCP servers). In aidx's production path the _CLI_ is the MCP client (via `--mcp-config`), so `chat()` never uses it. But our tests need an MCP client to exercise `/api/mcp` — `createMCPClient` is exactly that, so we use it instead of hand-rolling JSON-RPC.

- [ ] **Step 2: Write the failing test (drive /api/mcp with the real MCP client)**

`packages/core/test/api/mcp/mcp.it.test.ts` — boot the h3 app, connect a `@tanstack/ai-mcp` client to `/api/mcp`, call `aidx_ui`, assert the uiBus sink fired. Mirror `chat.it.test.ts`'s server bootstrap for `startTestServer`.

```ts
import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js' // create if absent, from chat.it.test.ts pattern

describe('/api/mcp', () => {
  it('runs aidx_ui and bridges to uiBus', async () => {
    const injected: unknown[] = []
    const {url, close} = await startTestServer({onInjectUi: (s: unknown) => (injected.push(s), true)})
    // Connect the TanStack MCP client to our server (http transport at `${url}/api/mcp`).
    // Confirm the exact createMCPClient transport-config shape against @tanstack/ai-mcp's types.
    const mcp = await createMCPClient({transport: {type: 'http', url: `${url}/api/mcp`}})
    // MCPClient exposes tools() → ServerTool[] (each with .execute), not a callTool() method.
    const tools = await mcp.tools()
    const uiTool = tools.find((t) => t.name === 'aidx_ui')
    if (!uiTool) throw new Error('aidx_ui not registered on /api/mcp')
    const result = await uiTool.execute({kind: 'confirm', question: 'ok?'})
    expect(injected).toHaveLength(1)
    expect(JSON.stringify(result)).toContain('renderId')
    await mcp.close()
    await close()
  }, 30_000)
})
```

(`startTestServer` wires a uiBus whose `inject` calls `onInjectUi`. Confirm `createMCPClient`'s transport-config option shape and `ServerTool.execute`'s argument shape against the installed `@tanstack/ai-mcp` types; the asserted behavior is fixed. The `if (!uiTool) throw` guard narrows away `undefined` — no `!`/cast.)

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/mcp.it.test.ts`
Expected: FAIL — `/api/mcp` returns 404.

- [ ] **Step 4: Implement the MCP route (bridge SDK transport via srvx node access)**

`packages/core/src/api/mcp/mcp.ts`:

```ts
import type {H3} from 'h3'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {aidxTools, type AidxToolContext} from '@opendui/aidx-tools'

export function registerMcpRoutes(app: H3, ctx: AidxToolContext): void {
  app.post('/api/mcp', async (event) => {
    const server = new McpServer({name: 'aidx', version: '0.0.0'})
    for (const tool of aidxTools(ctx)) {
      // registerTool wants a Zod RAW SHAPE (not a z.object). Each aidx tool's inputSchema is a
      // z.object, so pass its `.shape` — typed, no cast. The handler's `args` is inferred from the
      // shape and matches the tool's own execute() input; execute closes over `ctx` (the second
      // arg is the tool execution context — build the real value the @tanstack/ai type requires).
      server.registerTool(
        tool.name,
        {description: tool.description, inputSchema: tool.inputSchema.shape},
        async (args, extra) => {
          const result = await tool.execute(args, {toolCallId: extra.requestId, context: undefined})
          return {content: [{type: 'text', text: JSON.stringify(result)}]}
        },
      )
    }
    // Web Standard transport: takes the web Request, returns a Response — stateless, JSON reply.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return transport.handleRequest(event.req)
  })
}
```

Notes / verification (no casts — repo rule; if a type fights you, construct the real value or narrow, do NOT `as`):

- `tool.inputSchema.shape` — confirm `aidx` tools expose their `z.object`'s `.shape`. `toolDefinition({inputSchema: z.object(...)})` keeps the ZodObject; if the `Tool` type widens `inputSchema` to `SchemaInput`, store the raw shape on the tool (or export the shape alongside) so this stays cast-free.
- The `tool.execute(args, ctx)` second arg is `@tanstack/ai`'s `ToolExecutionContext`. Construct a real value (its fields are optional / `context` is the typed runtime context — `undefined` here since our tools close over `ctx`). Confirm the exact field names against the installed `ToolExecutionContext` type and fill them in; no cast.
- No node-object bridge and no double-send concern: `handleRequest(event.req)` returns a `Response` that the h3 route returns directly. `event.req` is already a web `Request`.

- [ ] **Step 5: Wire the route in makeApp + run the test**

In `packages/core/src/app.ts`, after the chat routes, register MCP with a context built from the live `uiBus` + page bus + runner:

```ts
import {registerMcpRoutes} from './api/mcp/mcp.js'
// … inside makeApp, after registerChatRoutes/registerPageRoutes/registerTestRunnerRoutes.
// page/test are throwing placeholders THIS task (the aidx_ui test doesn't exercise them);
// Task 8 replaces `page` with the real page-bus `ask`, Task 9 replaces `test` with the runner.
registerMcpRoutes(app, {
  injectUi: (spec) => uiBus.inject(spec),
  page: async () => {
    throw new Error('aidx_page not wired until Task 8')
  },
  test: async () => {
    throw new Error('aidx_test not wired until Task 9')
  },
})
```

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/mcp.it.test.ts && pnpm --filter @opendui/aidx-core typecheck`
Expected: PASS — `injected` has 1 entry; result contains `renderId`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/mcp/mcp.ts packages/core/src/app.ts packages/core/package.json packages/core/test/api/mcp pnpm-lock.yaml
git commit -m "feat(core): /api/mcp streamable-HTTP server bridging @tanstack/ai tools via MCP SDK"
```

### Task 7: Claude calls aidx_ui via MCP end-to-end (productionize the spike)

**Files:**

- Modify: `packages/harness/src/claude/args.ts`
- Test: `packages/core/test/api/mcp/claude-mcp.it.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

`packages/core/test/api/mcp/claude-mcp.it.test.ts` — boot the real app, spawn real `claude` pointed at `/api/mcp`, send a chat turn instructing it to call `aidx_ui`, assert the uiBus saw the inject. Skip if no `claude`. This is the spike, productionized.

```ts
import {execSync} from 'node:child_process'
import {describe, expect, it} from 'vitest'
import {startTestServer} from '../../helpers/server.js'

function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

describe('claude → /api/mcp → uiBus', () => {
  it.skipIf(!hasClaude())(
    'claude calls aidx_ui and the inject reaches uiBus',
    async () => {
      const injected: unknown[] = []
      const {postChat, close} = await startTestServer({
        onInjectUi: (s: unknown) => (injected.push(s), true),
        harness: 'claude',
        realSpawn: true,
      })
      await postChat('Call the aidx_ui tool with kind "confirm" and question "Proceed?". Then reply DONE.')
      expect(injected.length).toBeGreaterThanOrEqual(1)
      await close()
    },
    90_000,
  )
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/claude-mcp.it.test.ts`
Expected: FAIL — claude isn't told about the MCP server (`--mcp-config` not injected), so it can't call `aidx_ui`.

- [ ] **Step 3: Inject `--mcp-config` and drop the Bash tool allowances**

In `packages/harness/src/claude/args.ts`:

- Add the MCP config when `turn.mcpUrl` is present; allow the MCP tool:

```ts
if (turn.mcpUrl) {
  args.push('--mcp-config', JSON.stringify({mcpServers: {aidx: {type: 'http', url: turn.mcpUrl}}}))
  args.push('--allowedTools', 'mcp__aidx__aidx_ui', 'mcp__aidx__aidx_page', 'mcp__aidx__aidx_test')
}
```

- Remove the old `--allowedTools 'Bash(aidx tools:*)' 'Bash(aidx ui:*)'` entries from the base `args` array.

- [ ] **Step 4: Run the end-to-end test**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/claude-mcp.it.test.ts`
Expected: PASS (or SKIP). The uiBus observed at least one inject from a real claude MCP call.

- [ ] **Step 5: Typecheck + harness tests**

Run: `pnpm --filter @opendui/aidx-harness typecheck && pnpm --filter @opendui/aidx-harness test`
Expected: PASS — update any existing arg-builder assertion that referenced the removed `Bash(aidx …)` allowances.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/claude/args.ts packages/core/test/api/mcp/claude-mcp.it.test.ts
git commit -m "feat(harness): claude --mcp-config to /api/mcp; drop Bash(aidx) allowances"
```

---

## Phase 3 — Migrate page + test tools; rewrite the skill

### Task 8: aidx_page tool wired to the page bus

**Files:**

- Modify: `packages/core/src/api/page/page.ts` (export the bus `ask` handle to `makeApp`)
- Create: `packages/tools/src/page.ts`
- Modify: `packages/tools/src/registry.ts`, `packages/core/src/app.ts`
- Test: `packages/tools/test/page-tool.it.test.ts` + extend `mcp.it.test.ts`

- [ ] **Step 1: Expose the page bus's `ask` from the page route**

`registerPageRoutes` currently constructs `makePageBus()` internally. Change it to return the bus (or accept an external one) so `makeApp` can give `/api/mcp` a `page(query)` handle that calls the same `bus.ask`. Minimal change: have `registerPageRoutes` return `{ask: bus.ask}` and capture it in `makeApp`.

- [ ] **Step 2: Write the failing test**

`packages/tools/test/page-tool.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/registry.js'

describe('aidx_page tool', () => {
  it('forwards the verb+args to ctx.page and returns its result', async () => {
    const calls: unknown[] = []
    const tools = aidxTools({
      injectUi: () => true,
      page: async (q) => (calls.push(q), {ok: true}),
      test: async () => ({}),
    })
    const page = tools.find((t) => t.name === 'aidx_page')!
    const result = await page.execute({verb: 'tree', ref: 'main'}, {context: undefined})
    expect(calls[0]).toMatchObject({kind: 'tree', ref: 'main'})
    expect(result).toMatchObject({ok: true})
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run test/page-tool.it.test.ts`
Expected: FAIL — `page.ts` is the throwing stub.

- [ ] **Step 4: Implement aidx_page**

`packages/tools/src/page.ts` — input schema mirrors `PageQueryInputSchema` + a `verb` field (the page-bus verbs: `tree`/`inspect`/`find`/`locate`/etc., from `@opendui/aidx-protocol/page-types`):

```ts
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {PageQueryKindSchema, PageQueryInputSchema} from '@opendui/aidx-protocol/page-types'
import type {AidxToolContext} from './types.js'

const PageInput = z.object({verb: PageQueryKindSchema}).and(PageQueryInputSchema)

export const aidxPageToolDef = toolDefinition({
  name: 'aidx_page',
  description: 'Inspect and drive the live page DOM/React tree: tree, inspect, find, locate, click, type, etc.',
  inputSchema: PageInput,
})

export function aidxPageTool(ctx: AidxToolContext) {
  return aidxPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input}))
}
```

- [ ] **Step 5: Wire `page` in makeApp; restore the real registry**

In `packages/core/src/app.ts`, replace the `page` placeholder with the captured `pageAsk`. In `packages/tools/src/registry.ts`, include `aidxPageTool(ctx)`.

- [ ] **Step 6: Run tool + MCP tests**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run && pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/mcp.it.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/page.ts packages/tools/src/registry.ts packages/core/src/api/page/page.ts packages/core/src/app.ts packages/tools/test/page-tool.it.test.ts
git commit -m "feat(tools): aidx_page tool bridged to the live page bus"
```

### Task 9: aidx_test tool wired to the runner

**Files:**

- Create: `packages/tools/src/test.ts`
- Modify: `packages/tools/src/registry.ts`, `packages/core/src/app.ts`
- Test: `packages/tools/test/test-tool.it.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/tools/test/test-tool.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/registry.js'

describe('aidx_test tool', () => {
  it('forwards the action to ctx.test', async () => {
    const calls: unknown[] = []
    const tools = aidxTools({
      injectUi: () => true,
      page: async () => ({}),
      test: async (a) => (calls.push(a), {tests: []}),
    })
    const test = tools.find((t) => t.name === 'aidx_test')!
    const result = await test.execute({action: 'list'}, {context: undefined})
    expect(calls[0]).toMatchObject({kind: 'list'})
    expect(result).toMatchObject({tests: []})
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run test/test-tool.it.test.ts`
Expected: FAIL — `test.ts` is the throwing stub.

- [ ] **Step 3: Implement aidx_test**

`packages/tools/src/test.ts`:

```ts
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import type {AidxToolContext} from './types.js'

const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export const aidxTestToolDef = toolDefinition({
  name: 'aidx_test',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
})

export function aidxTestTool(ctx: AidxToolContext) {
  return aidxTestToolDef.server(async ({action, pattern}) => ctx.test({kind: action, pattern}))
}
```

- [ ] **Step 4: Wire `test` in makeApp**

In `packages/core/src/app.ts`, replace the `test` placeholder with a call into the runner. Map `{kind:'list'|'run'|'status'}` onto the runner's existing methods used by `registerTestRunnerRoutes` (reuse the same calls the routes make). Include `aidxTestTool(ctx)` in the registry.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run && pnpm --filter @opendui/aidx-core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/test.ts packages/tools/src/registry.ts packages/core/src/app.ts packages/tools/test/test-tool.it.test.ts
git commit -m "feat(tools): aidx_test tool bridged to the test runner"
```

### Task 10: Rewrite the react-introspection skill for MCP tools

**Files:**

- Modify: `packages/harness/plugins/claude/skills/react-introspection/SKILL.md`

- [ ] **Step 1: Read the current skill and rewrite tool references**

Replace every instruction that tells the agent to run `aidx tools page …` / `aidx ui …` via Bash with the MCP tool equivalents (`aidx_page` with a `verb`, `aidx_ui`). Keep the React-introspection guidance (locate/inspect/tree/find verbs) but route it through `aidx_page`. Remove any mention of the Bash CLI for these tools.

- [ ] **Step 2: Verify the agent uses the MCP tool (reuse Task 7's e2e)**

Run: `pnpm --filter @opendui/aidx-core exec vitest run test/api/mcp/claude-mcp.it.test.ts`
Expected: PASS — still green; the skill change doesn't regress tool invocation.

- [ ] **Step 3: Commit**

```bash
git add packages/harness/plugins/claude/skills/react-introspection/SKILL.md
git commit -m "docs(harness): rewrite react-introspection skill to use MCP tools, not the aidx CLI"
```

### Task 11: Full build, typecheck, lint, format

**Files:** none (verification gate)

- [ ] **Step 1: Build the workspace**

Run: `pnpm build`
Expected: all packages (now including `@opendui/aidx-tools`) build. Add `@opendui/aidx-tools` to any turbo pipeline filters if a task lists packages explicitly (check `turbo.json` — it globs, so likely no change).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: PASS. Fix oxlint/oxfmt issues inline.

- [ ] **Step 3: Run the integration suite**

Run: `pnpm test`
Expected: PASS (claude-dependent tests skip when `claude` is absent in CI; run locally with `claude` on PATH to exercise them).

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "chore: build/lint/format fixups for tanstack-ai chat adapters"
```

### Task 12 (optional, follow-up): codex --mcp-config parity

**Files:** `packages/harness/src/codex/args.ts`

- [ ] Mirror Task 7's `--mcp-config` injection for codex's CLI flag shape (verify codex's MCP config flag/format), keeping `capabilities.mcp: 'http'`. Add a codex variant of the e2e test guarded by `command -v codex`. Out of scope for the claude-first milestone; listed so it isn't lost.

---

## Self-review notes

- **Spec coverage:** `@opendui/aidx-tools` (T5,8,9) · `/api/mcp` via MCP SDK (T6) · complete adapter (`HarnessTextAdapter extends BaseTextAdapter`) + `structuredOutput` NotSupported (T3) · chat() routing + lifecycle pass-through (T2,T4) · `mcp` + `imageInput` caps + `mcpUrl`/`images`/`deliverInput` (T1) · native image delivery to claude (T4b, absorbed chat-image-input server-half) · `--mcp-config` + Bash drop (T7) · skill rewrite (T10) · claude-first sequencing (T7→T12). Composer/widget image UI stays in the chat-image-input plan. Codex `fileRef` image delivery: noted in T12 (verify), defaulting `false` until then.
- **Library types (no wheel-reinvention):** `BaseTextAdapter`/`TextOptions`/`StreamChunk`/`toServerSentEventsStream`/`normalizeSystemPrompts`/`toolDefinition` from `@tanstack/ai`; `McpServer`/`WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`. The MCP server is fully web-standard (`Request`→`Response`), so it needs nothing from `srvx` beyond h3's existing `event.req` — no node-object bridge.
- **Open verification points (flagged in-task, not placeholders):** (a) the `@tanstack/ai` `Tool` runtime property names (`name`/`description`/`inputSchema`/`execute`) used by the MCP registration loop — confirm against installed types in T6; (b) MCP SDK subpath import paths (`server/mcp.js`, `server/webStandardStreamableHttp.js`) — confirmed against 1.29.0 in T6 Step 1.
