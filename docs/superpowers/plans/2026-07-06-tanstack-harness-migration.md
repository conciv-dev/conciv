# TanStack Sandbox Harness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One chat path for every harness on TanStack AI 0.40: claude on `@tanstack/ai-claude-code`'s `claudeCodeText` harness adapter AS SHIPPED (amended 2026-07-06 after user override — the original "composition" framing is dead), codex/opencode/pi/gemini on the full TanStack harness adapters — deleting our decoders, our claude arg builder, and the SDK run path outright. No compatibility branch, no upstream dependency.

**Architecture:** `HarnessAdapter.chatConfig(deps)` becomes REQUIRED — it returns the TanStack text adapter for that harness, and `turn.ts` has exactly one code path: `chat({adapter, tools, middleware: [withConcivSandbox(concivSandbox(cwd)), withConcivGate(gate, sessionId)], threadId})`. ALL five harnesses run their published adapters inside the local-process sandbox. Claude = `claudeCodeText(model, config)` with config verified against the 0.2.1 source (their docs page still describes the pre-0.2 agent-sdk adapter — STALE, ignore it): `--strict-mcp-config` + `--plugin-dir` ride the `claudeExecutable` config string (their command is composed as a shell string `${exe} ${args}`), conciv tools ride `chat({tools})` → their MCP tool bridge (prefix stripped on the way out, widget `part.name` unchanged), the blocking permission gate rides our `provideToolBridgeProvisioner` override wrapping their `approval_prompt` resolver with `gate.decide` (verified: bridge `callTool` AWAITS `permission.resolve`), images ride a `prepareMessages` step that ports today's `imageRefs` (@path fileRefs under cwd), `/compact` rides through their `buildPrompt` verbatim as the trailing user message. The testkit fake harness converts to a scripted text adapter in the same task that rewrites `turn.ts` — nothing keeps the old spawn/decode machinery alive.

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
  - `claudeCodeText` 0.2.1 (re-verified against master source 2026-07-06; published same-day as `@tanstack/ai` 0.40.0 — the docs page still describes the dead pre-0.2 agent-sdk adapter with `canUseTool`/`settingSources`/`mcpServers`, IGNORE IT): config = `{cwd, permissionMode, allowedTools, disallowedTools, addDirs, maxTurns, systemPromptMode, claudeExecutable, streamPartials, env, emitDiff}`; `requires: [SandboxCapability]`; command composed as a SHELL STRING `${claudeExecutable} ${args}` (so `claudeExecutable` can carry extra flags); bridges `chat()` tools + an `approval_prompt` permission tool over `--mcp-config` (bearer token in a file, not argv) and wires `--permission-prompt-tool mcp__<bridge>__approval_prompt`; reads the tool-bridge provisioner via `getToolBridgeProvisioner` with `nodeHttpBridgeProvisioner` fallback (our override point); `buildPrompt` passes the trailing user message through verbatim (`/compact` works) and flattens history text-only; resume via `modelOptions.sessionId`; emits `claude-code.session-id` CUSTOM; permission tool exists only when a sandbox POLICY is defined (`concivSandbox` defines `default: 'ask'`).
  - `translateSdkStream(messages: AsyncIterable<AgentSdkMessage>, ctx: TranslateContext)` turns claude `stream-json` NDJSON lines into AG-UI `StreamChunk`s including reasoning, partials, tool calls, usage-on-result, and emits the `claude-code.session-id` CUSTOM event (used INTERNALLY by `claudeCodeText` — we no longer call it ourselves).
  - `localProcessSandbox({dir})` runs in that exact dir, never removes it on destroy by default.
  - GOTCHA (found in Task 5): their `withSandbox` declares `provides: [SandboxCapability, ProjectionCapability]` but only provides the projection when `definition.workspace` is set — no workspace → `chat()` throws "declares it provides … but never called provide()"; an empty workspace would write `.tanstack-projected-*` marker files into our repo. Fix: our own `withConcivSandbox(definition)` middleware from their public exports (`provideSandbox` + `provideSandboxPolicy`), skipping the workspace/watcher/snapshot machinery we don't use. Public API only, ~12 lines, lives in `sandbox.ts`.
  - `createToolBridgeCore.callTool` AWAITS `permission.resolve` — unbounded async permission handlers are supported; `provideToolBridgeProvisioner` is public API (first-party precedent: `withNgrokBridge`).
  - `opencodeText` config takes async `onPermissionRequest`; `acpCompatible` config takes async `onPermissionRequest`; codex has no interactive permission hook — it maps to native codex approval/sandbox settings only.
  - codex/acp provision the tool bridge only when `chat()` `tools.length > 0` (we always pass conciv tools, so it always provisions).
  - Session ids arrive as CUSTOM `` `${adapterName}.session-id` `` with `value: {sessionId: string}`; resume threads back via `modelOptions.sessionId`.
- Accepted regressions to list in the PR: mid-turn usage ticker becomes end-of-turn for ALL harnesses including claude (usage arrives on RUN_FINISHED; the `onUsage` mid-turn injection dies with the old path); upstream harness prompts are text-only (claude images keep working via the `prepareMessages` @path fileRef port of `imageRefs`; other harnesses declare `imageInput: false`); claude built-in-tool gating moves from the `--settings` PreToolUse hook to the bridge `approval_prompt` tool (still blocking through the same `gate.decide` — behavior equivalent, transport different).

## Design Decisions (locked)

1. **No seams.** `chatConfig` is a required `HarnessAdapter` member. `harnessText`'s spawn/decode logic, `HarnessAdapter.buildArgs`/`decode`/`run`/`deliverInput`/`buildCompactArgs` protocol members, `claude/decode.ts`, `claude/args.ts` (`buildClaudeArgs`/`buildClaudeCompactArgs`/`claudeMcpArgs`/`hookSettings`), `claude/sdk.ts` run path, `codex/decode.ts` all die inside this plan — most in the same task that obsoletes them.
2. **Claude = their turnkey `claudeCodeText`, as shipped** (USER DECISION 2026-07-06 — this is the reason the plan was approved; the earlier "composition" decision is void). Verified against the published 0.2.1 source (same-day release batch as `@tanstack/ai` 0.40.0; the docs page describes the dead pre-0.2 agent-sdk adapter — trust source only). Config surface: `{cwd, permissionMode, allowedTools, disallowedTools, addDirs, maxTurns, systemPromptMode, claudeExecutable, streamPartials, env, emitDiff}`. The two flags with no config field — `--strict-mcp-config`, `--plugin-dir` — ride `claudeExecutable: 'claude --strict-mcp-config --plugin-dir <CONCIV_PLUGIN_DIR>'`, valid because their command is composed as a shell string (`${exe} ${args.join(' ')}`, text.ts); the IT asserts both flags reach the spawned process. Their adapter deletes `decode.ts`, `args.ts`, and the agent-sdk run path in `sdk.ts` wholesale.
3. **Claude tool + permission transports move to the TanStack rails:** conciv tools via `chat({tools})` → their in-process MCP bridge (model sees `mcp__tanstack__<name>`, their translator strips the prefix on the way back — widget `part.name` unchanged); blocking gate via our `gateProvisioner` override (`provideToolBridgeProvisioner`) wrapping the `approval_prompt` resolver in `gate.decide` (bridge `callTool` awaits it — verified) AND wrapping each bridged tool's `execute` in `gate.decide` so conciv tools stay gated exactly like today's `mcp__conciv__.*` hook matcher. `--settings` hook + `/api/chat/permission` hook route die; `/api/mcp` stays for the launch path only. `/compact` survives: their `buildPrompt` passes the trailing user message through verbatim, so a `kind: 'compact'` turn sends `/compact` (claude `-p` executes it — same as today's `buildClaudeCompactArgs`). Images survive: `prepareMessages` ports today's `imageRefs` (write `.conciv-img-*` files under cwd, append `@path` refs to the message text).
4. **Other harnesses = full TanStack adapters** under the same sandbox/gate middleware: conciv tools converted to `toolDefinition().server()` and bridged (session captured by closure); blocking gate via `onPermissionRequest` (opencode, ACP) and the bridge-provisioner wrap (any adapter that provisions a permission tool — claude included). Codex permission = native codex approval/sandbox settings (no interactive hook exists upstream); configure the most conservative mode that still functions and assert it in the IT.
5. **Build order: sandbox infra FIRST** — `claudeCodeText` declares `requires: [SandboxCapability]`, so Task 4 = sandbox + gate middleware, Task 5 = claude on `claudeCodeText`, Task 6 = the one-turn-path rewrite. Then codex/opencode/pi/gemini.
6. **Sidecars stay ours:** `history.ts`, `tty.ts`, `launch`, `plugin-dir.ts`, `system-prompt.ts`, `claudeSdkCommands` (live slash commands — keeps `@anthropic-ai/claude-agent-sdk` as a commands-listing dep only), `/api/mcp` route (launch path only now), compaction fallback prompt for harnesses without native compaction (claude keeps `compaction: true` via the `/compact` message).

## File Structure (end state)

```
packages/protocol/src/harness-types.ts        # HarnessChatDeps + required chatConfig; buildArgs/decode/run/deliverInput/buildCompactArgs REMOVED
packages/harness/src/_shared/text-adapter.ts  # REWRITTEN: makeTextAdapter({name, chatStream}) — the single BaseTextAdapter extension point
packages/harness/src/_shared/env.ts           # NEW: definedEntries
packages/harness/src/_shared/acp.ts           # NEW: shared acpCompatible factory + permission handler
packages/harness/src/claude/chat.ts           # NEW: claudeChatConfig — claudeCodeText(model, config) + prepareMessages (images, /compact)
packages/harness/src/claude/index.ts          # chatConfig: claudeChatConfig; models/history/tty/launch/commands unchanged
packages/harness/src/claude/decode.ts         # DELETED
packages/harness/src/claude/args.ts           # DELETED (their adapter builds the command; imageRefs logic moves into chat.ts)
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

- [x] **Step 1: Bump manifests** to the versions above in every listed package.
- [x] **Step 2: Install + typecheck.** Run `pnpm install && pnpm typecheck`; fix drift at call sites (no casts). Likely spots: `TextOptions` generics in `_shared/text-adapter.ts`, `chat()` options in `core/src/api/chat/turn.ts`, client event types in widget. (Zero drift; needed `minimumReleaseAgeExclude` for same-day @tanstack releases in pnpm-workspace.yaml.)
- [x] **Step 3: Full gates.** `pnpm build && pnpm test && pnpm lint` green. Widget IT failures: rebuild widget bundle first (`pnpm turbo run build --filter=@conciv/widget`) before debugging. (One terminal-mode Escape flake = known issue #32; green on rerun.)
- [x] **Step 4: Commit**

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

  The stub adapter and the testkit fake (both Task 6) build on this; the five real harnesses return their published `@tanstack/*` adapters directly from `chatConfig`. The old `harnessText`/`HarnessTextAdapter` spawn-decode logic is NOT preserved here — this file becomes ~30 lines.

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run to verify FAIL** — `pnpm vitest run test/make-text-adapter --root packages/harness` (fails: `makeTextAdapter` not exported).

- [x] **Step 3: Implement.** Keep the existing class (sole exception) but reduce it to delegation:

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

Leave `lastUserModelText`/`lastUserImages` exports in place for now (claude's `prepareMessages` and the testkit may consume them; Task 10 deletes whatever is left unused).

- [x] **Step 4: Run** the new test + `pnpm turbo run test --filter=@conciv/harness`. Existing `harnessText` consumers still compile (old code untouched until Task 5).
- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run to verify FAIL** — `pnpm vitest run test/chat-tools --root packages/core`.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run tests** — new test + `pnpm turbo run test --filter=@conciv/core` (`/api/mcp` untouched, still green).
- [x] **Step 5: Commit**

```bash
git commit -m 'feat(core): conciv tools as chat() tool definitions' -- packages/core/src/api/chat/chat-tools.ts packages/core/src/app.ts packages/core/test/chat-tools.test.ts
```

---

### Task 4: Sandbox infra + blocking gate middleware (every harness runs inside it)

**Files:**

- Create: `packages/core/src/api/chat/sandbox.ts`
- Modify: `packages/core/package.json` (add `@tanstack/ai-sandbox@^0.2.2`, `@tanstack/ai-sandbox-local-process@^0.2.0`)
- Test: `packages/core/test/bridge-gate.it.test.ts`

No `turn.ts`/`app.ts` wiring in this task — Task 6 wires the middleware into the one turn path. This task lands the standalone, tested building blocks Task 5's claude adapter resolves at runtime (`claudeCodeText` declares `requires: [SandboxCapability]` and reads the tool-bridge provisioner + policy through `chat()` capabilities).

**Interfaces:**

- Consumes: `PermissionGate.decide` (`permission.ts:12`); `defineSandbox`, `defineSandboxPolicy`, `withSandbox`, `nodeHttpBridgeProvisioner`, `provideToolBridgeProvisioner`, `ToolBridgeProvisioner` from `@tanstack/ai-sandbox`; `defineChatMiddleware` from `@tanstack/ai`; `localProcessSandbox`
- Produces: `concivSandbox(cwd)`, `gateProvisioner(gate, sessionId)`, `withConcivGate(gate, sessionId)` — consumed by Task 5's claude IT and wired into `turn.ts` in Task 6; the same middleware pair serves codex/opencode/pi/gemini in Tasks 7–9

- [x] **Step 1: Write the failing IT** — real `nodeHttpBridgeProvisioner`, real HTTP, prove the permission call BLOCKS until the gate resolves:

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

`callBridgeTool` speaks MCP `tools/call` over `fetch` to `bridge.url` with `Authorization: Bearer ${bridge.token}` (wire shape: `@modelcontextprotocol/sdk` client or a literal JSON-RPC POST — match what `startHostToolBridge` serves). Add a second test: a bridged TOOL call (not the permission tool) also routes through `gate.decide` before executing — this preserves today's `mcp__conciv__.*` hook gating for conciv tools.

- [x] **Step 2: Implement `sandbox.ts`**

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
      nodeHttpBridgeProvisioner.provision(gatedTools(tools, gate, sessionId), {
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

`gatedTools(tools, gate, sessionId)` wraps each tool's `execute` in `await gate.decide(tool.name, args, sessionId, randomUUID())` (deny → throw a descriptive error the model sees) — field-verify the `AnyTool`/bridged-tool shape against the installed `@tanstack/ai-sandbox` dist types and preserve every other property untouched. `gate.decide` auto-allows non-risky tools, so wrapping everything is behavior-preserving. Align field shapes with the installed types field-by-field, never by cast.

- [x] **Step 3: Run** — the ITs plus full core suite (nothing else consumes the new module yet).
- [x] **Step 4: Commit**

```bash
git commit -m 'feat(core): local-process sandbox + blocking bridge permission gate' -- packages/core/src/api/chat/sandbox.ts packages/core/package.json pnpm-lock.yaml packages/core/test/bridge-gate.it.test.ts
```

---

### Task 5: Claude on `claudeCodeText` (their adapter, as shipped)

**Files:**

- Create: `packages/harness/src/claude/chat.ts` (`claudeChatConfig` + `prepareMessages` helpers)
- Create: `packages/harness/src/_shared/env.ts` (`definedEntries` — moved up from the old codex task; claude's `env` config needs it first)
- Modify: `packages/harness/src/claude/index.ts` — single `defineHarness` call; delete `makeClaudeAdapter(useSdk)` dual construction + the `USE_SDK` switch; add `chatConfig: claudeChatConfig` ALONGSIDE the old `decode`/`buildArgs` members (the old turn path still runs until Task 6 deletes it and them)
- Modify: `packages/harness/package.json` (add `@tanstack/ai-claude-code@^0.2.1`)
- Test: `packages/harness/test/claude-chat-config.test.ts` (unit) + `packages/core/test/claude-tanstack.it.test.ts` (binary-gated real IT, `runReal = !CI`)

**Interfaces:**

- Consumes: `claudeCodeText`, `CLAUDE_CODE_MODELS` from `@tanstack/ai-claude-code`; `CONCIV_PLUGIN_DIR` from `./plugin-dir.js`; `imageRefs` from `./args.js` (args.ts otherwise untouched until Task 6 deletes it and moves `imageRefs` into `chat.ts`); `concivSandbox`/`withConcivGate` (Task 4, IT only); `HarnessChatDeps` (temporarily local to `chat.ts`; Task 6 moves it to protocol)
- Produces: `claudeChatConfig(deps): HarnessChatConfig` — `{adapter, modelOptions, prepareMessages}`; session id flows out via the `claude-code.session-id` CUSTOM event their adapter emits

- [x] **Step 1: Write the failing unit tests** — `claude-chat-config.test.ts`:
  - `claudeExecutable(null)` = `claude --strict-mcp-config`; `claudeExecutable('/x/plugins')` also carries `--plugin-dir '/x/plugins'` (path single-quoted — it lands in a shell string)
  - `claudeChatConfig(deps).adapter.name === 'claude-code'` and `.model` = the resolved model
  - `modelOptions` carries `{cwd}` and `sessionId` only when `resumeSessionId` is set
  - `prepareMessages` on a `kind: 'compact'` turn rewrites the trailing user message to `/compact`
  - `prepareMessages` on a chat turn with image parts writes `.conciv-img-*` files under cwd and appends `@<path>` refs to the trailing user text (port of today's `imageRefs` behavior — reuse it from `./args.js`)

- [x] **Step 2: Run to verify FAIL, then implement `chat.ts`:**

```ts
import {claudeCodeText} from '@tanstack/ai-claude-code'
import {definedEntries} from '../_shared/env.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {imageRefs} from './args.js'

export function claudeExecutable(pluginDir: string | null): string {
  const flags = ['claude', '--strict-mcp-config']
  if (pluginDir) flags.push('--plugin-dir', `'${pluginDir}'`)
  return flags.join(' ')
}

export const claudeChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: claudeCodeText(resolveClaudeModel(deps.model), {
    cwd: deps.cwd,
    permissionMode: 'acceptEdits',
    addDirs: [deps.cwd],
    claudeExecutable: claudeExecutable(CONCIV_PLUGIN_DIR),
    systemPromptMode: 'append',
    env: definedEntries(deps.env),
  }),
  modelOptions: {cwd: deps.cwd, ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {})},
  prepareMessages: (messages) =>
    deps.kind === 'compact' ? withLastUserText(messages, '/compact') : withImageRefs(messages, deps.cwd),
})
```

Field-verify EVERYTHING against the installed `@tanstack/ai-claude-code` dist types, not the docs site (docs describe the dead pre-0.2 adapter): the `ClaudeCodeModel` union (`resolveClaudeModel` maps our model ids/`undefined` onto it — read `model-meta.ts`, no casts), the `ClaudeCodeTextConfig` field set, `modelOptions` (`sessionId`/`cwd`/`forkSession`). `withImageRefs` delegates to the existing `imageRefs(images, cwd)` and appends to the trailing user message text; `withLastUserText` replaces it.

`index.ts` collapses to ONE `defineHarness` call (old `decode`/`buildArgs` members stay wired to the old path until Task 6): capabilities unchanged for now except the additions Task 6 formalizes; `chatConfig: claudeChatConfig`, `commands: claudeSdkCommands`, existing `models`/`history`/`launch`/`tty`.

- [x] **Step 3: Binary-gated IT** — `packages/core/test/claude-tanstack.it.test.ts` (`runReal = !CI`, real claude, real sandbox, real bridge):

```ts
const stream = chat({
  adapter: claude.chatConfig(deps).adapter,
  messages: [{role: 'user', content: 'reply with exactly PONG'}],
  tools: [echoTool],
  middleware: [withConcivSandbox(concivSandbox(dir)), withConcivGate(autoAllowGate, 's1')],
  modelOptions: claude.chatConfig(deps).modelOptions,
})
```

Assert: TEXT_MESSAGE_CONTENT streamed, final chunk RUN_FINISHED, exactly one `claude-code.session-id` CUSTOM event; a second `chat()` threading that session id back via `modelOptions.sessionId` resumes (claude recalls a token from turn 1). Tight timeouts (~30s per turn).

- [x] **Step 4: Run** — unit + IT green; `pnpm turbo run test --filter=@conciv/harness --filter=@conciv/core` (old path untouched, still green).
- [x] **Step 5: Commit**

```bash
git commit -m 'feat(harness): claude on @tanstack/ai-claude-code claudeCodeText' -- packages/harness/src/claude packages/harness/src/_shared/env.ts packages/harness/package.json pnpm-lock.yaml packages/harness/test packages/core/test
```

---

### Task 6: One turn path — protocol reshape, turn.ts rewrite, testkit + stub conversion

**Files:**

- Modify: `packages/protocol/src/harness-types.ts` — DELETE `HarnessArgsBuilder`, `HarnessDecoder`, `HarnessRun`, `HarnessDeliverInput`, `buildArgs`, `decode`, `run`, `deliverInput`, `buildCompactArgs` members and the compaction/slash-command union arms that reference them; ADD `HarnessChatDeps`, `HarnessChatConfig`, required `chatConfig`
- Modify: `packages/core/src/api/chat/turn.ts` — single `chat()` path with `[withSandbox(concivSandbox(cwd)), withConcivGate(gate, sessionId)]`; `tapSessionId`; compact fallback prompt for harnesses with `compaction: false`
- Create: `packages/core/src/api/chat/stream-effects.ts` (`tapSessionId`)
- Modify: `packages/harness/src/claude/index.ts` (drop the old `decode`/`buildArgs` members), DELETE `packages/harness/src/claude/decode.ts` + `packages/harness/src/claude/args.ts` (move `imageRefs` into `chat.ts`; `hookSettings`/`claudeMcpArgs`/`buildClaudeArgs`/`buildClaudeCompactArgs` die), `packages/harness/src/codex/index.ts` → temporary stub `chatConfig` (real in Task 7, same session)
- Modify: `packages/harness/src/_shared/stub.ts` — stub `chatConfig` returns `makeTextAdapter` emitting a RUN_ERROR chunk (`<binName> is not installed or not yet supported`)
- Modify: `packages/harness-testkit/src/create-test-harness.ts` (+ whatever `scripted-run.ts` feeds it) — fake harness returns `chatConfig` built on `makeTextAdapter` + the Task 2 scripted-chunks helper
- Test: `packages/core/test/stream-effects.test.ts`; the ENTIRE existing core testkit suite is the acceptance gate

**Interfaces:**

- Consumes: `makeTextAdapter` (Task 2), `buildChatTools` (Task 3), `concivSandbox`/`withConcivGate` (Task 4), `claudeChatConfig` (Task 5)
- Produces (in `harness-types.ts`):

  ```ts
  export type HarnessChatDeps = {
    cwd: string
    sessionId: string
    resumeSessionId: string | null
    model?: string
    env: Record<string, string | undefined>
    kind: 'chat' | 'compact'
    decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
  }
  export type HarnessChatConfig = {
    adapter: AnyTextAdapter
    modelOptions?: Record<string, unknown>
    prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
  }
  // required on HarnessAdapterBase:
  chatConfig: (deps: HarnessChatDeps) => HarnessChatConfig
  ```

  No `spawn`/`mcpUrl`/`permissionUrl`/`systemPromptFile`: every adapter spawns its own CLI through the sandbox, tools/permissions ride the bridge, and the system prompt travels as TEXT via `chat()` `systemPrompts` (for claude their adapter maps it to `--append-system-prompt`; `turn.ts` reads `systemPromptFile` content once at route registration). `SpawnHarness` leaves `TurnDeps` entirely — `launch`/`tty` keep their own spawn paths.

- [x] **Step 1: Write the failing tap test**

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

- [x] **Step 2: Reshape `harness-types.ts`.** Delete the run-path types/members listed above. Keep: capabilities (drop `compaction`'s union arm tying it to `buildCompactArgs` — compaction becomes a plain boolean the harness honors inside its own `chatConfig`), `models`, `defaultModel`, `launch`, `tty`, `release`/`shutdown` (still used by `claudeSdkCommands` lifecycle — verify with fallow trace, keep only if used), the `transcriptHistory`/`history` and `slashCommands`/`commands` unions.

- [x] **Step 3: Rewrite `runTurnStream` in `turn.ts`** (single path):

```ts
const config = harness.chatConfig({
  cwd: deps.cwd,
  sessionId,
  resumeSessionId,
  model: requestedModel,
  env: deps.harnessEnv?.(sessionId) ?? process.env,
  kind: turnKind,
  decide: (toolName, input, toolUseId) => deps.gate.decide(toolName, input, sessionId, toolUseId),
})
const stream = chat({
  adapter: config.adapter,
  messages: config.prepareMessages?.(messages) ?? messages,
  systemPrompts: sysText ? [sysText] : [],
  threadId: sessionId,
  tools: deps.tools(sessionId),
  modelOptions: config.modelOptions,
  middleware: [withConcivSandbox(concivSandbox(deps.cwd)), withConcivGate(deps.gate, sessionId)],
  abortController: abort,
  debug: harnessDebug,
})
```

`sysText` = the PROMPT TEXT for every harness now: `mode === 'file'` reads `deps.systemPromptFile`'s content (once, at `registerTurnRoutes` setup); `mode === 'text'` uses `deps.systemPromptText`. The middleware pair is inert for the fake/stub adapters (they declare no `requires` and never call `getSandbox`, so no sandbox process is created in fake-mode CI). The compact-fallback block (`COMPACT_FALLBACK_PROMPT` when `!harness.capabilities.compaction`) stays exactly as is — claude declares `compaction: true` and its `prepareMessages` maps the compact turn to `/compact`. In `withLockRelease`, add `tapSessionId(c, (id) => void recordMintedToken(store, sessionId, id).catch(() => {}))`. Delete `harnessText` import and the `HarnessTextAdapter` spawn/decode remnants from `text-adapter.ts` (`linesOf`, `HarnessAdapterDeps`, `harnessText`); `lastUserModelText`/`lastUserImages` move/stay wherever their remaining consumers (claude `prepareMessages`, testkit) need them — delete what ends up unconsumed.

- [x] **Step 4: Convert stub + testkit.** `stub.ts`:

```ts
chatConfig: () => ({
  adapter: makeTextAdapter(id, async function* () {
    yield* runErrorChunks(`${binName} is not installed or not yet supported`)
  }),
})
```

Testkit `create-test-harness.ts`: the fake's scripted turns become a `ChatStreamFn` yielding the same chunk sequences the old decode produced (reuse `scripted-chunks.ts`; the scripted content comes from the existing `scripted-run.ts` fixtures). Session-id emission becomes a CUSTOM `fake.session-id` chunk so this task's tap covers the fake too — update any testkit assertion that relied on the old `onSessionId` callback.

- [x] **Step 5: The gate is the whole suite.** Run `pnpm typecheck && pnpm build && pnpm test`. Every existing core/testkit/extension IT must pass on the new single path (CI mode = fake harness; local = real claude through Task 5's `claudeCodeText` config). Fix forward — reverting to the old path is not an option, it no longer exists.
- [x] **Step 6: Fallow + commit**

```bash
pnpm exec fallow audit --changed-since main --format json
git commit -m 'refactor(core)!: single tanstack chat path for all harnesses' -- packages/protocol/src packages/core/src packages/core/test packages/harness/src packages/harness-testkit/src
```

---

### Task 7: Codex on `codexText`

**Files:**

- Modify: `packages/harness/src/codex/index.ts` (temporary stub from Task 6 → real); Delete: `packages/harness/src/codex/decode.ts`, `packages/harness/src/codex/args.ts`
- Modify: `packages/harness/package.json` (add `@tanstack/ai-codex@^0.2.1`)
- Test: `packages/harness/test/codex-chat-config.test.ts` + binary-gated IT in `packages/core/test/testkit/`

**Interfaces:**

- Consumes: `codexText(model, config)`; `HarnessChatDeps`; `definedEntries` from `_shared/env.ts` (created in Task 5)
- Produces: codex `chatConfig`

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
git commit -m 'feat(harness): codex on @tanstack/ai-codex' -- packages/harness/src/codex packages/harness/package.json pnpm-lock.yaml packages/harness/test packages/core/test/testkit
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

- Delete: `packages/harness/src/claude/blocks.ts` (if its only consumers were the deleted decode/args — trace first), agent-sdk RUN portions of `packages/harness/src/claude/sdk.ts` (keep `claudeSdkCommands` + whatever `shutdown`/`release` it genuinely needs), the `/api/chat/permission` hook route arm in `registerPermissionRoutes` (no harness declares `permissionGate: 'hook'` anymore — trace first), `CONCIV_CLAUDE_CLI` pin in `packages/core/vitest.config.ts`, `SpawnHarness`-era leftovers in core no longer referenced (`claude/decode.ts`, `claude/args.ts`, `codex/decode.ts`, `codex/args.ts` already died in Tasks 6–7)
- Modify: `AGENTS.md` (harness section: harness = `chatConfig` returning a TanStack text adapter + sidecars; text-adapter exception line updated to `makeTextAdapter`), `.changeset/tanstack-harness-migration.md` (one patch entry naming any `@conciv/*` package — fixed versioning releases the set)

- [ ] **Step 1: Trace every deletion** — `pnpm exec fallow dead-code --trace 'packages/harness/src/claude/blocks.ts:<symbol>'` (and each candidate). "USED but file unreachable" = missing entry point, investigate before deleting.
- [ ] **Step 2: Delete, typecheck after each removal.**
- [ ] **Step 3: Full gates + fallow audit clean.** `pnpm typecheck && pnpm build && pnpm test && pnpm exec fallow audit --changed-since main --format json`.
- [ ] **Step 4: Manual smoke** — `pnpm dev` (server restart, not reload, for harness/core changes): chat turn, risky-Bash permission prompt blocks then proceeds, image paste, slash-command menu, session browser attach, ESC interrupt.
- [ ] **Step 5: Commit**

```bash
git commit -m 'refactor(harness)!: delete bespoke decoders and SDK run path' -- packages/harness packages/core AGENTS.md .changeset
```

---

## Verification (whole plan)

- Green `pnpm typecheck && pnpm build && pnpm test` at every task boundary (Tasks 4 and 5 are additive; Task 6 is the cutover and its gate is the whole suite).
- Local real-claude testkit pass (`runReal`) after Tasks 5–6 and again after Task 10; widget smoke per Task 10 Step 4.
- Tool-card check: claude bridged tool names come back prefix-stripped (their translator applies `stripMcpPrefix`), so widget `part.name` should be unchanged — assert this in the Task 5 IT; for codex/opencode/ACP assert what the IT actually observes and adjust the widget mapping (`packages/widget` tool-ui renders by `part.name`), never the tool names.
- `pnpm exec fallow audit --changed-since main --format json` clean at the end.

## Risks

- Task 6 deletes the old path; its gate is the entire existing suite on both fake and real modes — fix forward until green, do not land red.
- Claude behavior risk is real and owned: command line, permission transport, and MCP transport ALL change to their adapter's (that is the point — user decision). Mitigations: every config field verified against the installed 0.2.1 dist types (docs are stale — source only); the binary-gated real IT (Task 5) drives a real claude turn + resume through the real sandbox/bridge; the full testkit suite re-runs real-mode locally after Tasks 6 and 10; the `claudeExecutable` flag carriage (`--strict-mcp-config --plugin-dir`) is unit-asserted.
- `@tanstack/ai-claude-code` is 6 days old and its API rewrote once already (0.1 agent-sdk → 0.2 sandbox); `^0.2.1` stays within 0.2.x — any future upgrade is deliberate, re-verify the facts section then.
- codex/opencode/pi/gemini are stubs or near-stubs today — those tasks are strictly additive.
- `@tanstack/ai-sandbox` is 0.x: `^0.2.2` stays within 0.2.x by semver-for-0.x rules; any future upgrade is deliberate, not incidental.
