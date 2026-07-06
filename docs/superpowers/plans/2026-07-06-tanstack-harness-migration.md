# TanStack Sandbox Harness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One chat path for every harness on TanStack AI 0.40: claude composed from `@tanstack/ai-claude-code`'s exported building blocks (their stream translator, our flags and blocking permission hook), codex/opencode/pi/gemini on the full TanStack harness adapters — deleting our decoders and the SDK run path outright. No compatibility branch, no upstream dependency.

**Architecture:** `HarnessAdapter.chatConfig(deps)` becomes REQUIRED — it returns the TanStack text adapter for that harness, and `turn.ts` has exactly one code path: `chat({adapter, tools, middleware: [withSandbox(localProcess), withConcivGate], threadId})`. Claude's adapter is ours, built from `translateSdkStream` + `buildPrompt` + `SESSION_ID_EVENT` (all public exports of `@tanstack/ai-claude-code`) over our existing `buildClaudeArgs` command line — which already carries `--strict-mcp-config`, `--plugin-dir`, `--settings` (permission hook), `--append-system-prompt-file`, image refs, and `/compact`. The other four harnesses use `codexText` / `opencodeText` / `acpCompatible` as shipped; their in-sandbox agents get conciv tools over the tool bridge and our blocking gate via the public `ToolBridgeProvisionerCapability` override (codex) and `onPermissionRequest` (opencode/ACP). The testkit fake harness converts to a scripted text adapter in the same task that rewrites `turn.ts` — nothing keeps the old spawn/decode machinery alive.

**Tech Stack:** `@tanstack/ai` 0.40.0, `@tanstack/ai-sandbox` 0.2.2, `@tanstack/ai-sandbox-local-process` 0.2.0, `@tanstack/ai-claude-code` / `-codex` / `-opencode` / `-acp` 0.2.1, `@tanstack/ai-client` 0.20.0, `@tanstack/ai-solid` 0.14.3, `@tanstack/ai-mcp` 0.2.3.

## Global Constraints

- Repo rules on every task: functions not classes — the sole class exception remains `packages/harness/src/_shared/text-adapter.ts`, REWRITTEN in Task 4 as the one `BaseTextAdapter` extension point (`makeTextAdapter`); zero code comments; no `any`/`as`/non-null `!`; oxfmt; strict TS.
- This plan builds the finished product in one session, executed task-by-task in order: NO seams, NO dual paths, NO back-compat branches, NO deferred follow-ups. Old code is deleted in the same task that replaces it; nothing ships half-migrated.
- NO upstream PRs, forks, vendored copies, or executable shims. Only their published exports and documented config.
- Never hand-rebuild `dist/` — turbo only; `pnpm test` builds first.
- Approved new dependencies for this plan: `@tanstack/ai-sandbox`, `@tanstack/ai-sandbox-local-process`, `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-opencode`, `@tanstack/ai-acp`. Nothing else without asking.
- Tests: real processes only (`no-stubs-or-mocks` covers our plumbing; a SCRIPTED adapter feeding recorded real NDJSON is data, not a mock); harness ITs via `@conciv/harness-testkit` (`runReal = !CI`); tight timeouts.
- Commit with pathspec (`git commit -- <paths>`); omridevk noreply identity.
- `pnpm exec fallow audit --changed-since main --format json` clean (no INTRODUCED) before finishing each task that changes the module graph.
- Work happens only in this worktree (`.claude/worktrees/tanstack-harness-migration`).
- Verified upstream facts (re-verify only if package versions move):
  - `@tanstack/ai-claude-code` exports: `claudeCodeText`, `ClaudeCodeTextAdapter`, `translateSdkStream`, `TranslateContext`, `AgentSdkMessage`, `buildPrompt`, `BuiltPrompt`, `SESSION_ID_EVENT`, `stripMcpPrefix`, `BRIDGED_MCP_SERVER_NAME`, `CLAUDE_CODE_MODELS` (`packages/ai-claude-code/src/index.ts`).
  - `translateSdkStream(messages: AsyncIterable<AgentSdkMessage>, ctx: TranslateContext)` turns claude `stream-json` NDJSON lines into AG-UI `StreamChunk`s including reasoning, partials, tool calls, usage-on-result, and emits the `claude-code.session-id` CUSTOM event.
  - `localProcessSandbox({dir})` runs in that exact dir, never removes it on destroy by default.
  - `createToolBridgeCore.callTool` AWAITS `permission.resolve` — unbounded async permission handlers are supported; `provideToolBridgeProvisioner` is public API (first-party precedent: `withNgrokBridge`).
  - `opencodeText` config takes async `onPermissionRequest`; `acpCompatible` config takes async `onPermissionRequest`; codex has no interactive permission hook — it maps to native codex approval/sandbox settings only.
  - codex/acp provision the tool bridge only when `chat()` `tools.length > 0` (we always pass conciv tools, so it always provisions).
  - Session ids arrive as CUSTOM `` `${adapterName}.session-id` `` with `value: {sessionId: string}`; resume threads back via `modelOptions.sessionId`.
- Accepted regressions to list in the PR: mid-turn usage ticker becomes end-of-turn for codex/opencode/ACP (claude keeps per-message usage only if `translateSdkStream` emits it — verify, do not assume); upstream harness prompts are text-only (claude images keep working via our `imageRefs` in `buildClaudeArgs`; other harnesses declare `imageInput: false`).

## Design Decisions (locked)

1. **No seams.** `chatConfig` is a required `HarnessAdapter` member. `harnessText`'s spawn/decode logic, `HarnessAdapter.buildArgs`/`decode`/`run`/`deliverInput`/`buildCompactArgs` protocol members, `claude/decode.ts`, `claude/sdk.ts` run path, `codex/decode.ts` all die inside this plan — most in the same task that obsoletes them.
2. **Claude = composition, not their turnkey adapter.** Their `claudeCodeText` cannot express `--strict-mcp-config` / `--plugin-dir` / `--settings` hooks / `--append-system-prompt-file`, and we refuse upstream coupling. Our adapter: `buildClaudeArgs(turn)` (existing, already correct) → `spawnHarness` (existing) → readline → their `translateSdkStream`. Their tested translator replaces our `decode.ts` (233 lines) and the agent-sdk run path in `sdk.ts` (~230 of 244 lines). Bonus: the CLI path restores `compaction: true` (`buildClaudeCompactArgs`), which the current SDK default had lost.
3. **Claude keeps its existing tool + permission transports:** conciv tools via `/api/mcp` (`claudeMcpArgs`, session header, `--strict-mcp-config`) and the blocking hook gate (`--settings hookSettings(permissionUrl)` → `/api/chat/permission` → `gate.decide`). Zero behavioral change, zero widget tool-card change for the flagship harness.
4. **Other harnesses = full TanStack adapters** under `withSandbox(localProcessSandbox({dir: cwd}))`: conciv tools converted to `toolDefinition().server()` and bridged (session captured by closure); blocking gate via `onPermissionRequest` (opencode, ACP) and the bridge-provisioner wrap (available to any adapter that provisions a permission tool). Codex permission = native codex approval/sandbox settings (no interactive hook exists upstream); configure the most conservative mode that still functions and assert it in the IT.
5. **Build order: claude FIRST** (Task 4, biggest deletion, no sandbox infra needed), then sandbox infra + codex/opencode/pi/gemini — all in this session. Claude does not wait on anything.
6. **Sidecars stay ours:** `history.ts`, `tty.ts`, `launch`, `plugin-dir.ts`, `system-prompt.ts`, `claudeSdkCommands` (live slash commands — keeps `@anthropic-ai/claude-agent-sdk` as a commands-listing dep only), `/api/mcp` route (launch path + claude turns), compaction fallback prompt for harnesses without native compaction.

## File Structure (end state)

```
packages/protocol/src/harness-types.ts        # HarnessChatDeps + required chatConfig; buildArgs/decode/run/deliverInput/buildCompactArgs REMOVED
packages/harness/src/_shared/text-adapter.ts  # REWRITTEN: makeTextAdapter({name, chatStream}) — the single BaseTextAdapter extension point
packages/harness/src/_shared/env.ts           # NEW: definedEntries
packages/harness/src/_shared/acp.ts           # NEW: shared acpCompatible factory + permission handler
packages/harness/src/claude/chat.ts           # NEW: composed claude adapter (buildClaudeArgs + spawn + translateSdkStream)
packages/harness/src/claude/index.ts          # chatConfig: claudeChat; models/history/tty/launch/commands unchanged
packages/harness/src/claude/decode.ts         # DELETED
packages/harness/src/claude/sdk.ts            # TRIMMED to claudeSdkCommands (+ shutdown/release if commands need them)
packages/harness/src/codex/{decode,args}.ts   # DELETED
packages/harness/src/codex/index.ts           # chatConfig via codexText
packages/harness/src/opencode/index.ts        # real harness via opencodeText (stub today)
packages/harness/src/pi/index.ts              # real harness via acpCompatible (stub today)
packages/harness/src/gemini-cli/index.ts      # real harness via acpCompatible (stub today)
packages/harness/src/_shared/stub.ts          # stub chatConfig -> scripted RUN_ERROR adapter (binary-missing message)
packages/core/src/api/chat/turn.ts            # ONE path: chat({adapter, tools, middleware, threadId}); session-id tap
packages/core/src/api/chat/chat-tools.ts      # NEW: RegistrableTool -> toolDefinition converter
packages/core/src/api/chat/sandbox.ts         # NEW: defineSandbox(localProcess) + withConcivGate middleware
packages/core/src/api/chat/stream-effects.ts  # NEW: tapSessionId
packages/harness-testkit/src/*                # fake harness returns scripted text adapter via makeTextAdapter
```

---

### Task 1: Upgrade the @tanstack/ai stack to latest

**Files:**

- Modify: every `package.json` declaring `@tanstack/ai` (authoritative list: `grep -rl '"@tanstack/ai"' --include=package.json packages apps | grep -v node_modules`), plus those declaring `@tanstack/ai-client`, `@tanstack/ai-solid`, `@tanstack/ai-mcp`

**Interfaces:**

- Produces: repo-wide `@tanstack/ai@^0.40.0`, `@tanstack/ai-client@^0.20.0`, `@tanstack/ai-solid@^0.14.3`, `@tanstack/ai-mcp@^0.2.3` — peer-dep floor for everything after

All 16 symbols we import from `@tanstack/ai` are verified present in 0.40.0 (`StreamChunk`, `EventType`, `UIMessage`, `toolDefinition`, `ContentPart`, `MessagePart`, `toServerSentEventsStream`, `ToolOutputState`, `TokenUsage`, `TextOptions`, `StreamProcessor`, `normalizeSystemPrompts`, `ModelMessage`, `Logger`, `isContentPartArray`, `DebugConfig`) — expect type-shape drift, not missing APIs.

- [ ] **Step 1: Bump manifests** to the versions above in every listed package.
- [ ] **Step 2: Install + typecheck.** Run `pnpm install && pnpm typecheck`; fix drift at call sites (no casts). Likely spots: `TextOptions` generics in `_shared/text-adapter.ts`, `chat()` options in `core/src/api/chat/turn.ts`, client event types in widget.
- [ ] **Step 3: Full gates.** `pnpm build && pnpm test && pnpm lint` green. Widget IT failures: rebuild widget bundle first (`pnpm turbo run build --filter=@conciv/widget`) before debugging.
- [ ] **Step 4: Commit**

```bash
git commit -m 'chore: upgrade @tanstack/ai stack to 0.40' -- '**/package.json' pnpm-lock.yaml packages apps
```

---

### Task 2: `makeTextAdapter` — the one BaseTextAdapter extension point

**Files:**

- Rewrite: `packages/harness/src/_shared/text-adapter.ts`
- Test: `packages/harness/test/make-text-adapter.test.ts`

**Interfaces:**

- Consumes: `BaseTextAdapter`, `TextOptions`, `StreamChunk` from `@tanstack/ai` / `@tanstack/ai/adapters`
- Produces:

  ```ts
  export type ChatStreamFn = (options: TextOptions<Record<string, never>>) => AsyncIterable<StreamChunk>
  export function makeTextAdapter(name: string, chatStream: ChatStreamFn): AnyTextAdapter
  ```

  Claude's composed adapter (Task 4), the stub adapter (Task 5), and the testkit fake (Task 5) all build on this. The old `harnessText`/`HarnessTextAdapter` spawn-decode logic is NOT preserved here — this file becomes ~30 lines.

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {EventType, chat} from '@tanstack/ai'
import {makeTextAdapter} from '../src/_shared/text-adapter.js'

test('makeTextAdapter drives chat() with the provided stream fn', async () => {
  const adapter = makeTextAdapter('scripted', async function* (options) {
    yield* scriptedRunChunks(`echo:${lastUserText(options.messages)}`)
  })
  const chunks = []
  for await (const chunk of chat({adapter, messages: [{role: 'user', content: 'hi'}]})) chunks.push(chunk)
  expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
})
```

`scriptedRunChunks` emits the minimal legal AG-UI sequence (RUN_STARTED → TEXT_MESSAGE_START/CONTENT/END → RUN_FINISHED) — copy exact chunk shapes from `@tanstack/ai` types; keep it as a shared test helper in `packages/harness/test/helpers/scripted-chunks.ts` because Task 5's testkit conversion reuses it.

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run test/make-text-adapter --root packages/harness` (fails: `makeTextAdapter` not exported).

- [ ] **Step 3: Implement.** Keep the existing class (sole exception) but reduce it to delegation:

```ts
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import type {StreamChunk, TextOptions} from '@tanstack/ai'

export type ChatStreamFn = (options: TextOptions<Record<string, never>>) => AsyncIterable<StreamChunk>

type InputModalities = readonly ['text']
type MsgMeta = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

class DelegatingTextAdapter extends BaseTextAdapter<string, Record<string, never>, InputModalities, MsgMeta> {
  readonly name: string
  private readonly stream: ChatStreamFn

  constructor(name: string, stream: ChatStreamFn) {
    super({}, name)
    this.name = name
    this.stream = stream
  }

  chatStream(options: TextOptions<Record<string, never>>): AsyncIterable<StreamChunk> {
    return this.stream(options)
  }

  structuredOutput(_options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error(`harness '${this.name}' does not support structured output`))
  }
}

export function makeTextAdapter(name: string, stream: ChatStreamFn): DelegatingTextAdapter {
  return new DelegatingTextAdapter(name, stream)
}
```

Leave `lastUserModelText`/`lastUserImages` exports in place for now (Task 4 consumes them; Task 8 deletes whatever is left unused).

- [ ] **Step 4: Run** the new test + `pnpm turbo run test --filter=@conciv/harness`. Existing `harnessText` consumers still compile (old code untouched until Task 5).
- [ ] **Step 5: Commit**

```bash
git commit -m 'refactor(harness): makeTextAdapter as the single BaseTextAdapter extension point' -- packages/harness/src/_shared/text-adapter.ts packages/harness/test
```

---

### Task 3: Conciv tools as chat() tools

**Files:**

- Create: `packages/core/src/api/chat/chat-tools.ts`
- Modify: `packages/core/src/app.ts` (thread the same `makeCtx` / `extensionTools` / `sessionModel` already given to `registerMcpRoutes` into `TurnDeps.tools`)
- Test: `packages/core/test/chat-tools.test.ts`

**Interfaces:**

- Consumes: `RegistrableTool` shape (`packages/core/src/api/mcp/mcp.ts:11`), `concivTools(ctx)` from `@conciv/tools`, `ExtensionServerTool`/`ToolRequest` from `@conciv/extension`
- Produces: `buildChatTools(makeCtx, extensionTools, sessionModel): (sessionId: string) => AnyTool[]` — Task 5 passes the result to `chat({tools})`; codex/opencode/ACP bridge these into their agents

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {toChatTool} from '../src/api/chat/chat-tools.js'

test('converts a registrable tool and executes with parsed args', async () => {
  const tool = toChatTool(
    {name: 'echo_tool', description: 'echoes', inputSchema: z.object({value: z.string()})},
    async (args) => ({echoed: args}),
  )
  expect(tool.name).toBe('echo_tool')
  const result = await tool.execute({value: 'hi'}, minimalExecutionContext())
  expect(result).toEqual({echoed: {value: 'hi'}})
})
```

(`minimalExecutionContext()` = the smallest object `AnyTool.execute`'s second parameter accepts in 0.40 — read the type, construct it literally in the test helper.)

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run test/chat-tools --root packages/core`.

- [ ] **Step 3: Implement**

```ts
import {toolDefinition, type AnyTool} from '@tanstack/ai'
import type {z} from 'zod'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'

type Registrable = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

export function toChatTool(tool: Registrable, run: (args: unknown) => Promise<unknown>): AnyTool {
  return toolDefinition({name: tool.name, description: tool.description, inputSchema: tool.inputSchema}).server(run)
}

export function buildChatTools(
  makeCtx: (sessionId: string) => ConcivToolContext,
  extensionTools: ExtensionServerTool[],
  sessionModel: (sessionId: string) => string | null,
): (sessionId: string) => AnyTool[] {
  return (sessionId) => {
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, model: sessionModel(sessionId)}
    return [
      ...concivTools(ctx).map((tool) => toChatTool(tool, (args) => tool.execute(args))),
      ...extensionTools.map((tool) => toChatTool(tool, (args) => tool.execute(args, request))),
    ]
  }
}
```

If `toolDefinition`'s Standard-Schema generic rejects our zod version, STOP and surface it — zod version changes need approval.

- [ ] **Step 4: Run tests** — new test + `pnpm turbo run test --filter=@conciv/core` (`/api/mcp` untouched, still green).
- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(core): conciv tools as chat() tool definitions' -- packages/core/src/api/chat/chat-tools.ts packages/core/src/app.ts packages/core/test/chat-tools.test.ts
```

---

### Task 4: Claude composed adapter (their translator, our command)

**Files:**

- Create: `packages/harness/src/claude/chat.ts`
- Modify: `packages/harness/src/claude/index.ts` (single variant: `chatConfig: claudeChatConfig`; delete `makeClaudeAdapter(useSdk)` dual construction), `packages/harness/package.json` (add `@tanstack/ai-claude-code@^0.2.1`)
- Test: `packages/harness/test/claude-chat.test.ts` with a recorded fixture `packages/harness/test/fixtures/claude-stream.ndjson`

**Interfaces:**

- Consumes: `translateSdkStream`, `buildPrompt`, `AgentSdkMessage`, `TranslateContext` from `@tanstack/ai-claude-code`; `buildClaudeArgs`/`buildClaudeCompactArgs` from `./args.js` (existing — already emit `-p <prompt> --output-format stream-json --verbose --include-partial-messages --permission-mode acceptEdits --add-dir <cwd> --mcp-config <conciv> --strict-mcp-config --plugin-dir <dir> --settings <hook> --append-system-prompt-file <file> --resume <id>`); `makeTextAdapter` (Task 2); `HarnessChatDeps` (defined here, moved to protocol in Task 5 — see Step 3)
- Produces: `claudeChatConfig(deps: HarnessChatDeps): HarnessChatConfig` — Task 5's `turn.ts` calls it; session id flows out via the `claude-code.session-id` CUSTOM event that `translateSdkStream` emits

- [ ] **Step 1: Record the fixture.** Run real claude once and capture NDJSON (this is data for a scripted replay, not a mock of our code):

```bash
claude -p 'say the word pong and nothing else' --output-format stream-json --verbose --include-partial-messages > packages/harness/test/fixtures/claude-stream.ndjson
```

Sanity-check it contains `system:init` (session id), streamed `assistant` events, and a `result` line with usage.

- [ ] **Step 2: Write the failing test**

```ts
import {createReadStream} from 'node:fs'
import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {claudeChatStream} from '../src/claude/chat.js'

test('composed adapter translates a real recorded stream', async () => {
  const chunks = []
  const stream = claudeChatStream(
    {
      cwd: process.cwd(),
      sessionId: 's1',
      resumeSessionId: null,
      env: {},
      kind: 'chat',
      spawn: () => fixtureChild('test/fixtures/claude-stream.ndjson'),
      decide: async () => 'allow',
    },
    minimalTextOptions('say pong'),
  )
  for await (const chunk of stream) chunks.push(chunk)
  const sessionEvents = chunks.filter((c) => c.type === EventType.CUSTOM && c.name === 'claude-code.session-id')
  expect(sessionEvents).toHaveLength(1)
  expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
})
```

`fixtureChild(path)` returns a `HarnessChild` whose `stdout` is `createReadStream(path)` — a real stream of real claude output.

- [ ] **Step 3: Run to verify FAIL**, then implement `chat.ts`:

```ts
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import type {StreamChunk, TextOptions} from '@tanstack/ai'
import {buildPrompt, translateSdkStream, type AgentSdkMessage} from '@tanstack/ai-claude-code'
import type {HarnessChatDeps, HarnessChild} from '@conciv/protocol/harness-types'
import {makeTextAdapter, lastUserImages, lastUserModelText} from '../_shared/text-adapter.js'
import {buildClaudeArgs, buildClaudeCompactArgs} from './args.js'

async function* ndjson(stream: Readable): AsyncIterable<AgentSdkMessage> {
  const lines = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of lines) {
    if (!line.trim()) continue
    yield JSON.parse(line)
  }
}

export async function* claudeChatStream(
  deps: HarnessChatDeps,
  options: TextOptions<Record<string, never>>,
): AsyncIterable<StreamChunk> {
  const {prompt, resume} = buildPrompt(options.messages, deps.resumeSessionId ?? undefined)
  const turn = {
    prompt,
    cwd: deps.cwd,
    resumeSessionId: resume ?? null,
    systemPrompt: deps.systemPromptFile ?? '',
    mcpUrl: deps.mcpUrl,
    permissionUrl: deps.permissionUrl,
    sessionId: deps.sessionId,
    images: lastUserImages(options.messages),
    model: deps.model,
    kind: deps.kind,
  }
  const args = deps.kind === 'compact' ? buildClaudeCompactArgs(turn) : buildClaudeArgs(turn)
  const child = deps.spawn(args, deps.cwd)
  options.abortController?.signal.addEventListener('abort', () => child.kill())
  yield* translateSdkStream(ndjson(child.stdout), {
    model: deps.model ?? 'sonnet',
    runId: options.runId ?? deps.sessionId,
    threadId: options.threadId ?? deps.sessionId,
    genId: () => crypto.randomUUID(),
  })
}

export const claudeChatConfig = (deps: HarnessChatDeps) => ({
  adapter: makeTextAdapter('claude-code', (options) => claudeChatStream(deps, options)),
})
```

Field-verify `TranslateContext` against the installed dist types (`onSdkMessage` optional logger hook — wire it to `options.logger.provider` like their adapter does). `HarnessChatDeps` for this task lives in `packages/harness/src/claude/chat.ts` temporarily if protocol isn't updated yet — Task 5 moves it to `harness-types.ts`; keep the shape identical: `{cwd, sessionId, resumeSessionId, model?, env, kind, mcpUrl?, permissionUrl?, systemPromptFile?, spawn, decide}`.

`index.ts` collapses to ONE `defineHarness` call: capabilities `{resume: true, permissionGate: 'hook', transcriptHistory: true, compaction: true, systemPrompt: 'file', mcp: 'http', slashCommands: 'live', imageInput: 'fileRef'}`, `chatConfig: claudeChatConfig`, `commands: claudeSdkCommands`, existing `models`/`history`/`launch`/`tty`. `USE_SDK` env switch deleted.

- [ ] **Step 4: Run** — fixture test green; `pnpm turbo run test --filter=@conciv/harness`. Type errors in core (old `harnessText` still calling `harness.run`) are EXPECTED to stay green because index.ts keeps `decode: claudeToAguiEvents` only if the old path still type-requires it — if the discriminated union forces members Task 5 removes, land Tasks 4+5 as one commit series in the same PR and let Task 5's protocol change resolve it; do NOT re-introduce dual adapters to appease types.
- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): claude adapter composed from @tanstack/ai-claude-code exports' -- packages/harness/src/claude packages/harness/package.json pnpm-lock.yaml packages/harness/test
```

---

### Task 5: One turn path — protocol reshape, turn.ts rewrite, testkit + stub conversion

**Files:**

- Modify: `packages/protocol/src/harness-types.ts` — DELETE `HarnessArgsBuilder`, `HarnessDecoder`, `HarnessRun`, `HarnessDeliverInput`, `buildArgs`, `decode`, `run`, `deliverInput`, `buildCompactArgs` members and the compaction/slash-command union arms that reference them; ADD `HarnessChatDeps`, `HarnessChatConfig`, required `chatConfig`
- Modify: `packages/core/src/api/chat/turn.ts` — single `chat()` path; `tapSessionId`; compact fallback prompt for harnesses with `compaction: false`
- Create: `packages/core/src/api/chat/stream-effects.ts` (`tapSessionId`)
- Modify: `packages/harness/src/_shared/stub.ts` — stub `chatConfig` returns `makeTextAdapter` emitting a RUN_ERROR chunk (`<binName> is not installed or not yet supported`)
- Modify: `packages/harness-testkit/src/create-test-harness.ts` (+ whatever `scripted-run.ts` feeds it) — fake harness returns `chatConfig` built on `makeTextAdapter` + the Task 2 scripted-chunks helper
- Test: `packages/core/test/stream-effects.test.ts`; the ENTIRE existing core testkit suite is the acceptance gate

**Interfaces:**

- Consumes: `makeTextAdapter` (Task 2), `buildChatTools` (Task 3), `claudeChatConfig` (Task 4)
- Produces (in `harness-types.ts`):

  ```ts
  export type HarnessChatDeps = {
    cwd: string
    sessionId: string
    resumeSessionId: string | null
    model?: string
    env: Record<string, string | undefined>
    kind: 'chat' | 'compact'
    mcpUrl?: string
    permissionUrl?: string
    systemPromptFile?: string
    spawn(args: string[], cwd: string): HarnessChild
    decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
  }
  export type HarnessChatConfig = {adapter: AnyTextAdapter; modelOptions?: Record<string, unknown>}
  // required on HarnessAdapterBase:
  chatConfig: (deps: HarnessChatDeps) => HarnessChatConfig
  ```

- [ ] **Step 1: Write the failing tap test**

```ts
import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {tapSessionId} from '../src/api/chat/stream-effects.js'

test('captures session-id custom events from any adapter', () => {
  const ids: string[] = []
  for (const name of ['claude-code.session-id', 'codex.session-id']) {
    tapSessionId(
      {type: EventType.CUSTOM, name, value: {sessionId: name}, timestamp: 1, threadId: 't', runId: 'r'},
      (id) => ids.push(id),
    )
  }
  tapSessionId(
    {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'x', timestamp: 1, threadId: 't', runId: 'r'},
    (id) => ids.push(id),
  )
  expect(ids).toEqual(['claude-code.session-id', 'codex.session-id'])
})
```

Implementation:

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'

export function tapSessionId(chunk: StreamChunk, onSessionId: (id: string) => void): void {
  if (chunk.type !== EventType.CUSTOM || !chunk.name.endsWith('.session-id')) return
  const value = chunk.value
  if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
    onSessionId(value.sessionId)
  }
}
```

- [ ] **Step 2: Reshape `harness-types.ts`.** Delete the run-path types/members listed above. Keep: capabilities (drop `compaction`'s union arm tying it to `buildCompactArgs` — compaction becomes a plain boolean the harness honors inside its own `chatConfig`), `models`, `defaultModel`, `launch`, `tty`, `release`/`shutdown` (still used by `claudeSdkCommands` lifecycle — verify with fallow trace, keep only if used), the `transcriptHistory`/`history` and `slashCommands`/`commands` unions.

- [ ] **Step 3: Rewrite `runTurnStream` in `turn.ts`** (single path):

```ts
const config = harness.chatConfig({
  cwd: deps.cwd,
  sessionId,
  resumeSessionId,
  model: requestedModel,
  env: deps.harnessEnv?.(sessionId) ?? process.env,
  kind: turnKind,
  mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,
  permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
  systemPromptFile: mode === 'file' ? deps.systemPromptFile : undefined,
  spawn: (args, cwd) => deps.spawnHarness(args, cwd, sessionId),
  decide: (toolName, input, toolUseId) => deps.gate.decide(toolName, input, sessionId, toolUseId),
})
const stream = chat({
  adapter: config.adapter,
  messages,
  systemPrompts: mode === 'flag' && sysText ? [sysText] : [],
  threadId: sessionId,
  tools: deps.tools(sessionId),
  modelOptions: config.modelOptions,
  middleware: deps.chatMiddleware(sessionId),
  abortController: abort,
  debug: harnessDebug,
})
```

`deps.chatMiddleware` is `() => []` until Task 6 wires the sandbox — keep the TurnDeps field now so Task 6 is additive. The compact-fallback block (`COMPACT_FALLBACK_PROMPT` when `!harness.capabilities.compaction`) stays exactly as is. In `withLockRelease`, add `tapSessionId(c, (id) => void recordMintedToken(store, sessionId, id).catch(() => {}))`. Delete `harnessText` import and the `HarnessTextAdapter` spawn/decode remnants from `text-adapter.ts` (`linesOf`, `HarnessAdapterDeps`, `harnessText`); `lastUserModelText`/`lastUserImages` stay (claude uses them).

- [ ] **Step 4: Convert stub + testkit.** `stub.ts`:

```ts
chatConfig: () => ({
  adapter: makeTextAdapter(id, async function* () {
    yield* runErrorChunks(`${binName} is not installed or not yet supported`)
  }),
})
```

Testkit `create-test-harness.ts`: the fake's scripted turns become a `ChatStreamFn` yielding the same chunk sequences the old decode produced (reuse `scripted-chunks.ts`; the scripted content comes from the existing `scripted-run.ts` fixtures). Session-id emission becomes a CUSTOM `fake.session-id` chunk so the Task 5 tap covers the fake too — update any testkit assertion that relied on the old `onSessionId` callback.

- [ ] **Step 5: The gate is the whole suite.** Run `pnpm typecheck && pnpm build && pnpm test`. Every existing core/testkit/extension IT must pass on the new single path (CI mode = fake harness; local = real claude through Task 4's adapter). Fix forward — reverting to the old path is not an option, it no longer exists.
- [ ] **Step 6: Fallow + commit**

```bash
pnpm exec fallow audit --changed-since main --format json
git commit -m 'refactor(core)!: single tanstack chat path for all harnesses' -- packages/protocol/src packages/core/src packages/core/test packages/harness/src packages/harness-testkit/src
```

---

### Task 6: Sandbox infra + blocking gate middleware (for the bridged harnesses)

**Files:**

- Create: `packages/core/src/api/chat/sandbox.ts`
- Modify: `packages/core/src/api/chat/turn.ts` (`deps.chatMiddleware` returns the real array), `packages/core/src/app.ts`, `packages/core/package.json` (add `@tanstack/ai-sandbox@^0.2.2`, `@tanstack/ai-sandbox-local-process@^0.2.0`)
- Test: `packages/core/test/bridge-gate.it.test.ts`

**Interfaces:**

- Consumes: `PermissionGate.decide` (`permission.ts:12`); `defineSandbox`, `defineSandboxPolicy`, `withSandbox`, `nodeHttpBridgeProvisioner`, `provideToolBridgeProvisioner`, `ToolBridgeProvisioner` from `@tanstack/ai-sandbox`; `defineChatMiddleware` from `@tanstack/ai`; `localProcessSandbox`
- Produces: `concivSandbox(cwd)` + `withConcivGate(gate, sessionId)`; `TurnDeps.chatMiddleware = (sessionId) => [withSandbox(concivSandbox(cwd)), withConcivGate(gate, sessionId)]` — required by Tasks 7–9 adapters (`requires: [SandboxCapability]`), inert for claude (its adapter declares no sandbox requirement and ignores the capability)

- [ ] **Step 1: Write the failing IT** — real `nodeHttpBridgeProvisioner`, real HTTP, prove the permission call BLOCKS until the gate resolves:

```ts
import {expect, test} from 'vitest'
import {gateProvisioner} from '../src/api/chat/sandbox.js'

test('permission tool blocks until gate decides, then allows', async () => {
  let release: (d: 'allow' | 'deny') => void = () => {}
  const gate = {decide: () => new Promise<'allow' | 'deny'>((resolve) => (release = resolve))}
  const bridge = await gateProvisioner(gate, 'session-1').provision([], {
    provider: 'local-process',
    permission: {toolName: 'approval_prompt', resolve: () => ({behavior: 'deny', message: 'unused upstream resolver'})},
  })
  const call = callBridgeTool(bridge, 'approval_prompt', {tool_name: 'Bash', input: {command: 'rm -rf /'}})
  await expect(Promise.race([call, settle(300, 'pending')])).resolves.toBe('pending')
  release('allow')
  expect(JSON.parse(await call)).toEqual({behavior: 'allow'})
  await bridge.close()
})
```

`callBridgeTool` speaks MCP `tools/call` over `fetch` to `bridge.url` with `Authorization: Bearer ${bridge.token}` (wire shape: `@modelcontextprotocol/sdk` client or a literal JSON-RPC POST — match what `startHostToolBridge` serves).

- [ ] **Step 2: Implement `sandbox.ts`**

```ts
import {randomUUID} from 'node:crypto'
import {defineChatMiddleware} from '@tanstack/ai'
import {
  defineSandbox,
  defineSandboxPolicy,
  nodeHttpBridgeProvisioner,
  provideToolBridgeProvisioner,
  withSandbox,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import type {PermissionGate} from './permission.js'

const sandboxes = new Map<string, ReturnType<typeof defineSandbox>>()

export function concivSandbox(cwd: string) {
  const existing = sandboxes.get(cwd)
  if (existing) return existing
  const definition = defineSandbox({
    id: 'conciv',
    provider: localProcessSandbox({dir: cwd}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  sandboxes.set(cwd, definition)
  return definition
}

function requestFields(request: unknown): {toolName: string; input: unknown; toolUseId: string} {
  const record: Record<string, unknown> = typeof request === 'object' && request !== null ? {...request} : {}
  return {
    toolName: typeof record.tool_name === 'string' ? record.tool_name : 'tool',
    input: record.input,
    toolUseId: typeof record.tool_use_id === 'string' ? record.tool_use_id : randomUUID(),
  }
}

export function gateProvisioner(gate: Pick<PermissionGate, 'decide'>, sessionId: string): ToolBridgeProvisioner {
  return {
    provision: (tools, options) =>
      nodeHttpBridgeProvisioner.provision(tools, {
        ...options,
        permission: options.permission
          ? {
              ...options.permission,
              resolve: async (request) => {
                const {toolName, input, toolUseId} = requestFields(request)
                const decision = await gate.decide(toolName, input, sessionId, toolUseId)
                return decision === 'allow' ? {behavior: 'allow'} : {behavior: 'deny', message: 'Denied by user'}
              },
            }
          : undefined,
      }),
  }
}

export function withConcivGate(gate: Pick<PermissionGate, 'decide'>, sessionId: string) {
  return defineChatMiddleware({
    name: 'conciv-gate',
    setup(ctx) {
      provideToolBridgeProvisioner(ctx, gateProvisioner(gate, sessionId))
    },
  })
}
```

Wire `TurnDeps.chatMiddleware` in `app.ts`. Align field shapes with the installed `@tanstack/ai-sandbox` types field-by-field, never by cast.

- [ ] **Step 3: Run** — the IT plus full core suite (claude path must be unaffected: middleware present but unused by our composed adapter).
- [ ] **Step 4: Commit**

```bash
git commit -m 'feat(core): local-process sandbox + blocking bridge permission gate' -- packages/core/src/api/chat/sandbox.ts packages/core/src/api/chat/turn.ts packages/core/src/app.ts packages/core/package.json pnpm-lock.yaml packages/core/test/bridge-gate.it.test.ts
```

---

### Task 7: Codex on `codexText`

**Files:**

- Modify: `packages/harness/src/codex/index.ts`; Delete: `packages/harness/src/codex/decode.ts`, `packages/harness/src/codex/args.ts`
- Create: `packages/harness/src/_shared/env.ts`
- Modify: `packages/harness/package.json` (add `@tanstack/ai-codex@^0.2.1`)
- Test: `packages/harness/test/codex-chat-config.test.ts` + binary-gated IT in `packages/core/test/testkit/`

**Interfaces:**

- Consumes: `codexText(model, config)`; `HarnessChatDeps`
- Produces: codex `chatConfig`; `definedEntries` in `_shared/env.ts`:

```ts
export function definedEntries(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])))
}
```

- [ ] **Step 1: Failing test** — `codex.chatConfig(deps)` returns adapter named `codex` and `modelOptions.sessionId === deps.resumeSessionId`.
- [ ] **Step 2: Implement**

```ts
import {codexText} from '@tanstack/ai-codex'
import {definedEntries} from '../_shared/env.js'

const codexChatConfig = (deps: HarnessChatDeps) => ({
  adapter: codexText(deps.model ?? 'gpt-5.3-codex', {cwd: deps.cwd, env: definedEntries(deps.env)}),
  modelOptions: {
    workingDirectory: deps.cwd,
    ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {}),
  },
})
```

Verify every config/modelOptions field name against the installed `@tanstack/ai-codex` dist types (`workingDirectory`, `approvalPolicy`, `sandboxMode`, `skipGitRepoCheck` exist per upstream docs); set the most conservative `sandboxMode`/`approvalPolicy` that lets the IT pass and record the choice in the harness file. Capabilities: `{resume: true, permissionGate: 'none', transcriptHistory: false, compaction: false, systemPrompt: 'flag', mcp: 'none', slashCommands: 'none', imageInput: false}` — codex has no interactive permission hook upstream; document that in the capability choice.

- [ ] **Step 3: Binary-gated IT** (skip when `codex` missing — `harness-available.ts` pattern): one turn streams text + RUN_FINISHED; second turn resumes via the tapped session id.
- [ ] **Step 4: Fallow (deleted decoder must leave no dead exports) + full suite.**
- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): codex on @tanstack/ai-codex' -- packages/harness/src/codex packages/harness/src/_shared/env.ts packages/harness/package.json pnpm-lock.yaml packages/harness/test packages/core/test/testkit
```

---

### Task 8: OpenCode on `opencodeText` (stub → real)

**Files:**

- Modify: `packages/harness/src/opencode/index.ts`, `packages/harness/package.json` (add `@tanstack/ai-opencode@^0.2.1`)
- Test: `packages/harness/test/opencode-chat-config.test.ts`

**Interfaces:**

- Consumes: `opencodeText(model, config)` with async `onPermissionRequest(request: {id, sessionID, type, title, callID?}) => 'once' | 'always' | 'reject'`
- Produces: real opencode harness (`permissionGate: 'callback'`), exported `opencodePermissionHandler(decide)` for the unit test

- [ ] **Step 1: Failing test** — handler maps gate `allow` → `'once'`, `deny` → `'reject'`, passes `request.type` as the tool name and `callID ?? id` as toolUseId.
- [ ] **Step 2: Implement**

```ts
import {opencodeText} from '@tanstack/ai-opencode'

export function opencodePermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: {id: string; sessionID: string; type: string; title: string; callID?: string}) => {
    const decision = await decide(request.type, {title: request.title}, request.callID ?? request.id)
    return decision === 'allow' ? ('once' as const) : ('reject' as const)
  }
}

const opencodeChatConfig = (deps: HarnessChatDeps) => ({
  adapter: opencodeText(deps.model ?? defaultOpencodeModel, {
    directory: deps.cwd,
    onPermissionRequest: opencodePermissionHandler(deps.decide),
  }),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})
```

Verify `directory` vs `cwd` and pick `defaultOpencodeModel` from the installed package's model metadata.

- [ ] **Step 3: Run unit test + full suite; binary-gated IT if `opencode` present.**
- [ ] **Step 4: Commit**

```bash
git commit -m 'feat(harness): opencode real adapter via @tanstack/ai-opencode' -- packages/harness/src/opencode packages/harness/package.json pnpm-lock.yaml packages/harness/test
```

---

### Task 9: pi + gemini-cli on `acpCompatible` (stubs → real)

**Files:**

- Create: `packages/harness/src/_shared/acp.ts`
- Modify: `packages/harness/src/pi/index.ts`, `packages/harness/src/gemini-cli/index.ts`, `packages/harness/package.json` (add `@tanstack/ai-acp@^0.2.1`)
- Test: `packages/harness/test/acp-harnesses.test.ts`

**Interfaces:**

- Consumes: `acpCompatible({name, command, permissions: 'interactive', onPermissionRequest})`; `AcpPermissionRequest` / `AcpPermissionOutcome` types imported from `@tanstack/ai-acp` (never redeclared)
- Produces: `acpChatConfig(name, commandOf, defaultModel)` shared factory; real `pi` and `geminiCli` harnesses

- [ ] **Step 1: Failing test** — `acpPermissionHandler(async () => 'allow')` returns `{outcome: 'selected', optionId}` for the `allow_once` option; deny path picks `reject_once`; no matching option → `{outcome: 'cancelled'}`.
- [ ] **Step 2: Implement `_shared/acp.ts`**

```ts
import {acpCompatible} from '@tanstack/ai-acp'
import type {AcpPermissionOutcome, AcpPermissionRequest} from '@tanstack/ai-acp'

export function acpPermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: AcpPermissionRequest): Promise<AcpPermissionOutcome> => {
    const title = request.toolCall.title ?? request.toolCall.toolCallId
    const decision = await decide(title, {toolCall: request.toolCall}, request.toolCall.toolCallId)
    const wanted = decision === 'allow' ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
    const option = request.options.find((candidate) => wanted.includes(candidate.kind))
    return option ? {outcome: 'selected', optionId: option.optionId} : {outcome: 'cancelled'}
  }
}

export function acpChatConfig(name: string, commandOf: (model: string, cwd: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps): HarnessChatConfig => ({
    adapter: acpCompatible({
      name,
      command: ({model, harnessCwd}) => commandOf(model, harnessCwd),
      permissions: 'interactive',
      onPermissionRequest: acpPermissionHandler(deps.decide),
    })(deps.model ?? defaultModel),
    modelOptions: {cwd: deps.cwd, ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {})},
  })
}
```

`pi/index.ts`: command from the real pi CLI — verify the ACP entry flag and model ids against `~/Public/web/pi-mono` before finalizing (do not guess flags). `gemini-cli/index.ts`: `gemini --acp` with model via ACP `newSession` (acpCompatible passes cwd/model over the protocol).

- [ ] **Step 3: Run unit tests + full suite; binary-gated ITs where CLIs exist locally.**
- [ ] **Step 4: Commit**

```bash
git commit -m 'feat(harness): pi + gemini-cli via acpCompatible' -- packages/harness/src/pi packages/harness/src/gemini-cli packages/harness/src/_shared/acp.ts packages/harness/package.json pnpm-lock.yaml packages/harness/test
```

---

### Task 10: Sweep — delete the corpses, docs, changeset

**Files:**

- Delete: `packages/harness/src/claude/decode.ts`, `packages/harness/src/claude/blocks.ts` (if its only consumer was decode — trace first), agent-sdk RUN portions of `packages/harness/src/claude/sdk.ts` (keep `claudeSdkCommands` + whatever `shutdown`/`release` it genuinely needs), `CONCIV_CLAUDE_CLI` pin in `packages/core/vitest.config.ts`, `SpawnHarness`-era leftovers in core no longer referenced
- Modify: `AGENTS.md` (harness section: harness = `chatConfig` returning a TanStack text adapter + sidecars; text-adapter exception line updated to `makeTextAdapter`), `.changeset/tanstack-harness-migration.md` (one patch entry naming any `@conciv/*` package — fixed versioning releases the set)

- [ ] **Step 1: Trace every deletion** — `pnpm exec fallow dead-code --trace 'packages/harness/src/claude/decode.ts:claudeToAguiEvents'` (and each candidate). "USED but file unreachable" = missing entry point, investigate before deleting.
- [ ] **Step 2: Delete, typecheck after each removal.**
- [ ] **Step 3: Full gates + fallow audit clean.** `pnpm typecheck && pnpm build && pnpm test && pnpm exec fallow audit --changed-since main --format json`.
- [ ] **Step 4: Manual smoke** — `pnpm dev` (server restart, not reload, for harness/core changes): chat turn, risky-Bash permission prompt blocks then proceeds, image paste, slash-command menu, session browser attach, ESC interrupt.
- [ ] **Step 5: Commit**

```bash
git commit -m 'refactor(harness)!: delete bespoke decoders and SDK run path' -- packages/harness packages/core AGENTS.md .changeset
```

---

## Verification (whole plan)

- Green `pnpm typecheck && pnpm build && pnpm test` at every task boundary except the acknowledged Task 4→5 pairing (they may land as one PR if the discriminated union forces it — noted in Task 4 Step 4).
- Local real-claude testkit pass (`runReal`) after Tasks 4–5 and again after Task 10; widget smoke per Task 10 Step 4.
- Tool-card check: claude tool names are unchanged (`/api/mcp` transport kept); for codex/opencode/ACP the bridged names may differ — assert what the IT actually observes and adjust the widget mapping (`packages/widget` tool-ui renders by `part.name`), never the tool names.
- `pnpm exec fallow audit --changed-since main --format json` clean at the end.

## Risks

- Task 5 deletes the old path; its gate is the entire existing suite on both fake and real modes — fix forward until green, do not land red.
- Claude behavior risk is minimal by construction: same command line (`buildClaudeArgs` untouched), same permission hook, same MCP transport — only the NDJSON→chunks translation changes (ours → theirs). The recorded-fixture test pins the contract; if their translator mishandles a real stream shape, the fixture reproduces it offline.
- codex/opencode/pi/gemini are stubs or near-stubs today — those tasks are strictly additive.
- `@tanstack/ai-sandbox` is 0.x: `^0.2.2` stays within 0.2.x by semver-for-0.x rules; any future upgrade is deliberate, not incidental.
