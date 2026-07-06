# TanStack Sandbox Harness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace our hand-rolled harness spawn/decode layer with TanStack AI sandbox harness adapters (`@tanstack/ai-claude-code`, `-codex`, `-opencode`, `-acp`), turning our three stub harnesses (pi, gemini-cli, opencode) into working ones and deleting the claude/codex decoders — while keeping our blocking permission gate, transcript history, TTY, launch, and slash-command sidecars.

**Architecture:** Core already drives every turn through `chat({adapter: harnessText(harness, deps)})` (`packages/core/src/api/chat/turn.ts:134`). We add an optional `chatConfig` field to `HarnessAdapter`: when present, `turn.ts` uses the TanStack harness adapter it returns (plus `withSandbox(localProcessSandbox({dir: cwd}))` and a permission-gate middleware) instead of `harnessText`. Harnesses migrate one at a time; the fake testkit harness and any unmigrated harness keep using `harnessText`. Our blocking permission UX survives via the public `ToolBridgeProvisionerCapability` DI seam (claude/codex) and `onPermissionRequest` config (opencode/ACP). Conciv tools convert from MCP-served handlers to `chat()` `toolDefinition().server()` tools carried by the tool bridge.

**Tech Stack:** `@tanstack/ai` 0.40.0, `@tanstack/ai-sandbox` 0.2.2, `@tanstack/ai-sandbox-local-process` 0.2.0, `@tanstack/ai-claude-code` / `-codex` / `-opencode` / `-acp` 0.2.1, `@tanstack/ai-client` 0.20.0, `@tanstack/ai-solid` 0.14.3, `@tanstack/ai-mcp` 0.2.3.

## Global Constraints

- Repo rules apply to every task: functions not classes (the `BaseTextAdapter` subclass in `packages/harness/src/_shared/text-adapter.ts` stays the sole exception — it SURVIVES this migration because the testkit fake harness uses it), zero code comments, no `any`/`as`/non-null `!`, oxfmt (no semicolons, single quotes), strict TS.
- Never hand-rebuild `dist/` — `pnpm turbo run build --filter=<pkg>`; `pnpm test` builds first.
- New npm dependencies in this plan (`@tanstack/ai-sandbox`, `@tanstack/ai-sandbox-local-process`, `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, `@tanstack/ai-opencode`, `@tanstack/ai-acp`) were approved as part of this migration; do not add any OTHER dependency without asking.
- Tests: real processes, no mocks/stubs of our own plumbing (`no-stubs-or-mocks`); harness ITs use `@conciv/harness-testkit` (`BootApp`, `runReal = !CI`); tight timeouts sized to the real operation.
- Commit with pathspec always: `git commit -- <paths>` (parallel-session safety). Commits use the omridevk noreply identity (repo-configured).
- Before finishing any task that touches package graphs: `pnpm exec fallow audit --changed-since main --format json` — fix INTRODUCED findings.
- All work happens in this worktree (`.claude/worktrees/tanstack-harness-migration`); run every command from the worktree root.
- Verified upstream facts this plan relies on (do not re-litigate, but re-verify if `@tanstack/ai-*` versions differ from the ones pinned above):
  - `localProcessSandbox({dir})` uses that exact dir in place and never removes it on destroy by default (`ai-sandbox-local-process/src/provider.ts`).
  - `createToolBridgeCore.callTool` AWAITS `permission.resolve` — an unbounded async permission handler is supported (`ai-sandbox/src/tool-bridge.ts:155`).
  - Harness adapters resolve their bridge via `getToolBridgeProvisioner(ctx) ?? nodeHttpBridgeProvisioner`; `provideToolBridgeProvisioner` is public (precedent: `withNgrokBridge`).
  - claude-code provisions the bridge when `tools.length > 0 || permission !== undefined`; the permission tool exists only when a sandbox POLICY is attached. codex and acp provision only when `tools.length > 0`.
  - Adapter `permissionMode` config beats policy-derived flags: `modelOptions?.permissionMode ?? config.permissionMode ?? policyFlags.permissionMode ?? 'bypassPermissions'`.
  - claude-code CLI invocation today has NO `--strict-mcp-config` / `--plugin-dir` / arbitrary-flag support → Task 9 upstream PR gates the claude cutover (Task 10).
  - Session id arrives as CUSTOM event `` `${adapterName}.session-id` `` with `value: {sessionId: string}`; resume via `modelOptions.sessionId`.
  - Known accepted regressions (call them out in the PR description): usage arrives only on RUN_FINISHED (no mid-turn token ticker from migrated harnesses); harness prompts are text-only upstream (we inject image `@path` refs into the prompt text ourselves, Task 10).

## Design Decisions (locked)

1. **Integration seam:** optional `chatConfig?: (deps: HarnessChatDeps) => HarnessChatConfig` on `HarnessAdapterBase`. `turn.ts` branches: `chatConfig` present → TanStack adapter + sandbox middleware; absent → existing `harnessText` path. No flag day; fake testkit harness untouched.
2. **Sandbox:** one `defineSandbox` per core app instance: `localProcessSandbox({dir: cwd})`, NO `workspace` (prevents any projection writes into the user's repo), `fileEvents: false` (widget doesn't consume `sandbox.file` events yet), `lifecycle: {reuse: 'thread', destroyOnComplete: false}`, `policy: defineSandboxPolicy({default: 'ask'})`. `chat()` gets `threadId: sessionId` so the sandbox instance key is stable per session.
3. **Permission gate:** for claude/codex — `defineChatMiddleware` that wraps `nodeHttpBridgeProvisioner`, replacing `permission.resolve` with our blocking `gate.decide(...)`. For opencode/ACP — `onPermissionRequest` adapter config calling the same gate. Adapter config pins `permissionMode: 'default'` so prompts actually route to the gate.
4. **Tools:** convert `@conciv/tools` `RegistrableTool`s + extension server tools into `toolDefinition().server()` chat tools (session captured by closure — kills the session-header hack for bridged tools). `/api/mcp` route STAYS (the `launch`-in-terminal path still points real CLIs at it); only the in-turn tool transport changes.
5. **Cutover order:** codex → opencode → pi/gemini (ACP) → claude (last, gated on upstream `extraArgs` PR). Claude keeps the current SDK path until Task 10 flips it.
6. **Sidecars stay ours:** `history.ts` (transcript parse/list), `tty.ts`, `launch`, `plugin-dir.ts`, `system-prompt.ts`, `claudeSdkCommands` (live slash commands), compaction fallback prompt (already handled in `turn.ts` for `compaction: false`).

## File Structure (end state)

```
packages/protocol/src/harness-types.ts        # + HarnessChatDeps, HarnessChatConfig, chatConfig field
packages/core/src/api/chat/sandbox.ts         # NEW: defineSandbox wiring + withConcivGate middleware
packages/core/src/api/chat/chat-tools.ts      # NEW: RegistrableTool -> toolDefinition converter, buildChatTools
packages/core/src/api/chat/turn.ts            # chatConfig branch, session-id CUSTOM tap, image-ref injection
packages/core/src/api/chat/stream-effects.ts  # NEW: extracted chunk-tap (session-id, usage) — unit-testable
packages/harness/src/codex/index.ts           # chatConfig via codexText; decode.ts/args.ts DELETED
packages/harness/src/opencode/index.ts        # real harness via opencodeText (stub today)
packages/harness/src/pi/index.ts              # real harness via acpCompatible (stub today)
packages/harness/src/gemini-cli/index.ts      # real harness via acpCompatible (stub today)
packages/harness/src/claude/index.ts          # chatConfig via claudeCodeText (Task 10); sdk.ts trimmed to commands
packages/harness/src/claude/{decode,args}.ts  # DELETED in Task 11 (imageRefs moves to _shared/image-refs.ts)
```

---

### Task 1: Upgrade the @tanstack/ai stack to latest

**Files:**

- Modify: every `package.json` declaring `@tanstack/ai` (8: `packages/protocol`, `packages/core`, `packages/harness`, `packages/tools`, `packages/widget`, `packages/extension`, plus run the grep below for the authoritative list), `@tanstack/ai-client` (4), `@tanstack/ai-solid` (2), `@tanstack/ai-mcp` (2)

**Interfaces:**

- Consumes: nothing (first task)
- Produces: repo-wide `@tanstack/ai@^0.40.0`, `@tanstack/ai-client@^0.20.0`, `@tanstack/ai-solid@^0.14.3`, `@tanstack/ai-mcp@^0.2.3` — the peer-dep floor every later task needs

All 16 symbols we import from `@tanstack/ai` were verified present in 0.40.0 source (`StreamChunk`, `EventType`, `UIMessage`, `toolDefinition`, `ContentPart`, `MessagePart`, `toServerSentEventsStream`, `ToolOutputState`, `TokenUsage`, `TextOptions`, `StreamProcessor`, `normalizeSystemPrompts`, `ModelMessage`, `Logger`, `isContentPartArray`, `DebugConfig`), so breakage should be type-shape drift, not missing APIs.

- [ ] **Step 1: Bump manifests**

```bash
grep -rl '"@tanstack/ai"' --include=package.json packages apps | grep -v node_modules
```

In each listed manifest set:

```json
"@tanstack/ai": "^0.40.0"
```

and wherever present:

```json
"@tanstack/ai-client": "^0.20.0"
"@tanstack/ai-solid": "^0.14.3"
"@tanstack/ai-mcp": "^0.2.3"
```

- [ ] **Step 2: Install and typecheck**

Run: `pnpm install && pnpm typecheck`
Expected: likely type errors from 0.28→0.40 drift. Fix each at the call site (no `as`, no version pinning retreat). Common drift spots: `TextOptions` generics in `packages/harness/src/_shared/text-adapter.ts`, `chat()` option types in `packages/core/src/api/chat/turn.ts`, client event types in widget.

- [ ] **Step 3: Full gates**

Run: `pnpm build && pnpm test && pnpm lint`
Expected: all green. If a widget IT fails, rebuild the widget bundle first (`pnpm turbo run build --filter=@conciv/widget`) — stale-bundle failures are not upgrade failures.

- [ ] **Step 4: Commit**

```bash
git add -- '**/package.json' pnpm-lock.yaml packages
git commit -m 'chore: upgrade @tanstack/ai stack to 0.40' -- '**/package.json' pnpm-lock.yaml packages
```

---

### Task 2: `chatConfig` seam on HarnessAdapter

**Files:**

- Modify: `packages/protocol/src/harness-types.ts`
- Modify: `packages/core/src/api/chat/turn.ts:88-134`
- Test: `packages/core/test/chat-config-seam.test.ts`

**Interfaces:**

- Consumes: `AnyTextAdapter` type from `@tanstack/ai` (exported; used in `chat()`'s own signature)
- Produces:

  ```ts
  export type HarnessChatDeps = {
    cwd: string
    sessionId: string
    resumeSessionId: string | null
    model?: string
    env: Record<string, string | undefined>
    decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
  }
  export type HarnessChatConfig = {
    adapter: AnyTextAdapter
    modelOptions?: Record<string, unknown>
  }
  // on HarnessAdapterBase:
  chatConfig?: (deps: HarnessChatDeps) => HarnessChatConfig
  ```

  Every later harness task implements `chatConfig`; Task 4 supplies the middleware `turn.ts` attaches next to it.

- [ ] **Step 1: Write the failing test**

`packages/core/test/chat-config-seam.test.ts` — a scripted `AnyTextAdapter` (a real `BaseTextAdapter` subclass is not allowed outside `_shared/text-adapter.ts`; use `harnessText` itself over a scripted stub harness for the fallback case, and for the chatConfig case build the adapter with the testkit's `createTestHarness` pattern). Assert both branches:

```ts
import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {runTurnStream} from '../src/api/chat/turn.js'

test('turn uses chatConfig adapter when present', async () => {
  const seen: string[] = []
  const harness = makeScriptedHarness({
    chatConfig: (deps) => {
      seen.push(deps.sessionId)
      return {adapter: scriptedTextAdapter([textChunk('from-chatconfig')])}
    },
  })
  const chunks = await collect(runTurnStream(harness, baseDeps({sessionId: 's1'})))
  expect(seen).toEqual(['s1'])
  expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
})

test('turn falls back to harnessText without chatConfig', async () => {
  const harness = makeScriptedHarness({})
  const chunks = await collect(runTurnStream(harness, baseDeps({sessionId: 's2'})))
  expect(chunks.length).toBeGreaterThan(0)
})
```

Structure note: `turn.ts` today builds the stream inline inside the route handler. Extract the adapter-selection + `chat()` call into an exported `runTurnStream(harness, deps)` so it is unit-testable — that extraction is part of this task. `registerTurnRoutes` calls it; behavior identical.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/chat-config-seam --root packages/core`
Expected: FAIL — `runTurnStream` not exported / `chatConfig` not a known property.

- [ ] **Step 3: Implement**

`harness-types.ts`: add the two types + optional field to `HarnessAdapterBase` (import `type {AnyTextAdapter} from '@tanstack/ai'`).

`turn.ts` inside the extracted `runTurnStream`:

```ts
const config = harness.chatConfig?.({
  cwd: deps.cwd,
  sessionId,
  resumeSessionId,
  model: requestedModel,
  env: deps.harnessEnv?.(sessionId) ?? process.env,
  decide: (toolName, input, toolUseId) => deps.gate.decide(toolName, input, sessionId, toolUseId),
})
const stream = config
  ? chat({
      adapter: config.adapter,
      messages,
      systemPrompts: sysText ? [sysText] : [],
      threadId: sessionId,
      modelOptions: config.modelOptions,
      abortController: abort,
      debug: harnessDebug,
    })
  : chat({
      adapter: harnessText(harness, legacyDeps),
      messages,
      systemPrompts: sysText ? [sysText] : [],
      abortController: abort,
      debug: harnessDebug,
    })
```

(Middleware and tools are added to the `config` branch in Tasks 3–4; keep this task minimal — the branch exists and compiles.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/chat-config-seam --root packages/core`
Expected: PASS. Then `pnpm turbo run test --filter=@conciv/core` for no regressions (testkit fake harness must be green — it exercises the fallback branch).

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): chatConfig seam for tanstack harness adapters' -- packages/protocol/src/harness-types.ts packages/core/src/api/chat/turn.ts packages/core/test/chat-config-seam.test.ts
```

---

### Task 3: Conciv tools as chat() tools

**Files:**

- Create: `packages/core/src/api/chat/chat-tools.ts`
- Modify: `packages/core/src/api/chat/turn.ts` (TurnDeps + pass `tools` to the chatConfig branch), `packages/core/src/app.ts` (thread the same `makeCtx`/`extensionTools` already given to `registerMcpRoutes` into `TurnDeps`)
- Test: `packages/core/test/chat-tools.test.ts`

**Interfaces:**

- Consumes: `RegistrableTool` shape from `packages/core/src/api/mcp/mcp.ts:11` (`{name, description, inputSchema: z.ZodObject, execute}`), `concivTools(ctx)` from `@conciv/tools`, `ExtensionServerTool` from `@conciv/extension`, `toContent`/`isContentPartArray` result conventions
- Produces: `buildChatTools(sessionId: string): AnyTool[]` — Task 4's bridge serves these; Tasks 6–10 rely on them being passed to `chat({tools})`

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
  const result = await tool.execute({value: 'hi'}, minimalToolCallContext())
  expect(result).toEqual({echoed: {value: 'hi'}})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/chat-tools --root packages/core`
Expected: FAIL — module not found.

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

Wire in `app.ts`: build once next to the `registerMcpRoutes` call and put `tools: buildChatTools(makeCtx, extensionTools, sessionModel)` on `TurnDeps`. In `runTurnStream`'s chatConfig branch add `tools: deps.tools(sessionId)`.

Type friction warning: `toolDefinition` takes a Standard-Schema input; our zod version already backs `readValidatedBody` — if the generic complains, fix the tool TYPE, don't cast. If our zod major is incompatible with 0.40's standard-schema expectation, STOP and surface it (dependency change needs approval).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/chat-tools --root packages/core && pnpm turbo run test --filter=@conciv/core`
Expected: PASS; `/api/mcp` untouched and still green.

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(core): conciv tools as chat() tool definitions' -- packages/core/src/api/chat/chat-tools.ts packages/core/src/api/chat/turn.ts packages/core/src/app.ts packages/core/test/chat-tools.test.ts
```

---

### Task 4: Sandbox definition + blocking permission-gate middleware

**Files:**

- Create: `packages/core/src/api/chat/sandbox.ts`
- Modify: `packages/core/src/api/chat/turn.ts` (attach middleware in the chatConfig branch)
- Test: `packages/core/test/bridge-gate.it.test.ts`

**Interfaces:**

- Consumes: `PermissionGate.decide(toolName, input, sessionId, toolUseId)` (`packages/core/src/api/chat/permission.ts:12`); from `@tanstack/ai-sandbox`: `defineSandbox`, `defineSandboxPolicy`, `withSandbox`, `nodeHttpBridgeProvisioner`, `provideToolBridgeProvisioner`, types `ToolBridgeProvisioner`, `BridgePermission`, `PermissionToolResult`; from `@tanstack/ai`: `defineChatMiddleware`; from `@tanstack/ai-sandbox-local-process`: `localProcessSandbox`
- Produces: `concivSandbox(cwd: string)` (memoized `defineSandbox` result) and `withConcivGate(gate: PermissionGate, sessionId: string)` (chat middleware) — Tasks 6 and 10 put both in the middleware array

- [ ] **Step 1: Add dependencies**

In `packages/core/package.json`:

```json
"@tanstack/ai-sandbox": "^0.2.2",
"@tanstack/ai-sandbox-local-process": "^0.2.0"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing integration test**

Real bridge, real HTTP, real (in-test) gate — no mocks. The test provisions through `withConcivGate`'s provisioner exactly as an adapter would, calls the permission tool over HTTP, and proves the call BLOCKS until the gate resolves:

```ts
import {expect, test} from 'vitest'
import {gateProvisioner} from '../src/api/chat/sandbox.js'

test('permission tool blocks until gate decides, then allows', async () => {
  let release: (d: 'allow' | 'deny') => void = () => {}
  const gate = {
    decide: (toolName: string) =>
      new Promise<'allow' | 'deny'>((resolve) => {
        expect(toolName).toBe('Bash')
        release = resolve
      }),
  }
  const provisioner = gateProvisioner(gate, 'session-1')
  const bridge = await provisioner.provision([], {
    provider: 'local-process',
    permission: {toolName: 'approval_prompt', resolve: () => ({behavior: 'deny', message: 'unused upstream resolver'})},
  })
  const callPromise = callBridgeTool(bridge, 'approval_prompt', {tool_name: 'Bash', input: {command: 'rm -rf /'}})
  await expect(Promise.race([callPromise, timeout(300)])).resolves.toBe('pending')
  release('allow')
  const result = await callPromise
  expect(JSON.parse(result)).toEqual({behavior: 'allow'})
  await bridge.close()
})
```

`callBridgeTool` speaks MCP `tools/call` over `fetch` to `bridge.url` with `Authorization: Bearer ${bridge.token}` — copy the wire shape from `@tanstack/ai-sandbox`'s own bridge tests (`packages/ai-sandbox` in the tanstack repo has them; the scratchpad clone at `scratchpad/tanstack-ai` is a reference). `timeout(ms)` resolves `'pending'` — proves the call did not settle early.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run test/bridge-gate --root packages/core`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `sandbox.ts`**

```ts
import {defineChatMiddleware} from '@tanstack/ai'
import {
  defineSandbox,
  defineSandboxPolicy,
  nodeHttpBridgeProvisioner,
  provideToolBridgeProvisioner,
  type SandboxDefinition,
  type ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import {randomUUID} from 'node:crypto'
import type {PermissionGate} from './permission.js'

const sandboxes = new Map<string, SandboxDefinition>()

export function concivSandbox(cwd: string): SandboxDefinition {
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

function permissionRequestFields(request: unknown): {toolName: string; input: unknown; toolUseId: string} {
  const record = typeof request === 'object' && request !== null ? request : {}
  const toolName = 'tool_name' in record && typeof record.tool_name === 'string' ? record.tool_name : 'tool'
  const input = 'input' in record ? record.input : undefined
  const toolUseId =
    'tool_use_id' in record && typeof record.tool_use_id === 'string' ? record.tool_use_id : randomUUID()
  return {toolName, input, toolUseId}
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
                const {toolName, input, toolUseId} = permissionRequestFields(request)
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

(Exact `ToolBridgeProvisioner`/`BridgePermission` option shapes: mirror `@tanstack/ai-sandbox`'s exported types; if `provision`'s second parameter type rejects the spread, align field-by-field rather than casting.)

Wire in `runTurnStream`'s chatConfig branch:

```ts
middleware: [withSandbox(concivSandbox(deps.cwd)), withConcivGate(deps.gate, sessionId)],
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run test/bridge-gate --root packages/core && pnpm turbo run test --filter=@conciv/core`
Expected: PASS, including the block-then-allow race assertion.

- [ ] **Step 6: Commit**

```bash
git commit -m 'feat(core): local-process sandbox + blocking permission bridge gate' -- packages/core/src/api/chat/sandbox.ts packages/core/src/api/chat/turn.ts packages/core/package.json pnpm-lock.yaml packages/core/test/bridge-gate.it.test.ts
```

---

### Task 5: Stream effects — session-id CUSTOM tap + image refs

**Files:**

- Create: `packages/core/src/api/chat/stream-effects.ts`
- Create: `packages/harness/src/_shared/image-refs.ts` (move `imageRefs` + `IMAGE_EXT` from `packages/harness/src/claude/args.ts:30-46`, re-export from `args.ts` until Task 11 deletes it)
- Modify: `packages/core/src/api/chat/turn.ts` (`withLockRelease` uses the tap; message pre-processing injects image refs)
- Test: `packages/core/test/stream-effects.test.ts`

**Interfaces:**

- Consumes: `EventType.CUSTOM` chunks shaped `{name: `${string}.session-id`, value: {sessionId: string}}`; `recordMintedToken(store, id, token)` (`turn.ts:19`); `imageRefs(images, cwd)` writing `.conciv-img-<uuid>.<ext>` files and returning `@path` refs
- Produces:

  ```ts
  export function tapSessionId(chunk: StreamChunk, onSessionId: (id: string) => void): void
  export function injectImageRefs(messages: ModelMessage[], cwd: string): ModelMessage[]
  ```

  Task 6+ harnesses rely on `tapSessionId` for resume bookkeeping (the legacy `onSessionId` callback does not fire for tanstack adapters); Task 10 relies on `injectImageRefs` for claude `fileRef` images.

- [ ] **Step 1: Write the failing tests**

```ts
import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {tapSessionId, injectImageRefs} from '../src/api/chat/stream-effects.js'

test('captures any adapter session-id custom event', () => {
  const ids: string[] = []
  tapSessionId(
    {
      type: EventType.CUSTOM,
      name: 'claude-code.session-id',
      value: {sessionId: 'abc'},
      timestamp: 1,
      threadId: 't',
      runId: 'r',
    },
    (id) => ids.push(id),
  )
  tapSessionId(
    {
      type: EventType.CUSTOM,
      name: 'codex.session-id',
      value: {sessionId: 'def'},
      timestamp: 1,
      threadId: 't',
      runId: 'r',
    },
    (id) => ids.push(id),
  )
  expect(ids).toEqual(['abc', 'def'])
})

test('injects @path refs for image parts and strips them from content', () => {
  const messages = [userMessageWithImage('describe this', PNG_BASE64)]
  const out = injectImageRefs(messages, testCwd)
  const text = lastUserText(out)
  expect(text).toMatch(/describe this\n\n@.*\.conciv-img-.*\.png/)
  expect(existsSync(text.split('@')[1].trim())).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/stream-effects --root packages/core`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import {EventType, type ModelMessage, type StreamChunk} from '@tanstack/ai'
import {imageRefs} from '@conciv/harness/image-refs'

export function tapSessionId(chunk: StreamChunk, onSessionId: (id: string) => void): void {
  if (chunk.type !== EventType.CUSTOM) return
  if (!chunk.name.endsWith('.session-id')) return
  const value = chunk.value
  if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
    onSessionId(value.sessionId)
  }
}

export function injectImageRefs(messages: ModelMessage[], cwd: string): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user' || message.content === null || typeof message.content === 'string') return message
    const images = message.content.flatMap((part) =>
      part.type === 'image' && part.source.type === 'data'
        ? [{mediaType: part.source.mimeType, dataBase64: part.source.value}]
        : [],
    )
    if (!images.length) return message
    const text = message.content.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
    return {...message, content: `${text}\n\n${imageRefs(images, cwd)}`}
  })
}
```

(`@conciv/harness/image-refs` needs a package export entry in `packages/harness/package.json` — same pattern as its existing subpath exports.)

In `withLockRelease` add `tapSessionId(c, (id) => void recordMintedToken(store, sessionId, id).catch(() => {}))` beside the existing `RUN_FINISHED` usage persistence. In `runTurnStream`'s chatConfig branch, pass `messages: injectImageRefs(messages, deps.cwd)` when `harness.capabilities.imageInput === 'fileRef'`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/stream-effects --root packages/core && pnpm turbo run test --filter=@conciv/core --filter=@conciv/harness`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(core): session-id tap + image ref injection for tanstack harnesses' -- packages/core/src/api/chat/stream-effects.ts packages/core/src/api/chat/turn.ts packages/harness/src/_shared/image-refs.ts packages/harness/src/claude/args.ts packages/harness/package.json packages/core/test/stream-effects.test.ts
```

---

### Task 6: Codex cutover

**Files:**

- Modify: `packages/harness/src/codex/index.ts` (chatConfig; drop `buildArgs`/`decode` usage)
- Delete: `packages/harness/src/codex/decode.ts`, `packages/harness/src/codex/args.ts`
- Modify: `packages/harness/package.json` (add `@tanstack/ai-codex@^0.2.1`, `@tanstack/ai-sandbox` peer already via core middleware — adapter package only needs `-codex`)
- Test: `packages/harness/test/codex-chat-config.test.ts`, plus a gated IT in `packages/core/test/testkit/`

**Interfaces:**

- Consumes: `codexText(model, config)` from `@tanstack/ai-codex`; `HarnessChatDeps` (Task 2)
- Produces: `codex` HarnessAdapter with `chatConfig` — capabilities update: `resume: true`, `mcp` handled by bridge (set `mcp: 'none'` — the `mcpUrl` plumbing no longer applies to codex), `permissionGate: 'callback'`

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {codex} from '../src/codex/index.js'

test('codex chatConfig resumes via modelOptions.sessionId', () => {
  const config = codex.chatConfig?.({
    cwd: '/repo',
    sessionId: 's',
    resumeSessionId: 'codex-thread-1',
    model: 'gpt-5.3-codex',
    env: {},
    decide: async () => 'allow',
  })
  expect(config?.adapter.name).toBe('codex')
  expect(config?.modelOptions).toMatchObject({sessionId: 'codex-thread-1'})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/codex-chat-config --root packages/harness`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add once to `packages/harness/src/_shared/env.ts` (used again by Task 10):

```ts
export function definedEntries(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])))
}
```

```ts
import {codexText} from '@tanstack/ai-codex'
import {defineHarness, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'

const codexChatConfig = (deps: HarnessChatDeps) => ({
  adapter: codexText(deps.model ?? 'gpt-5.3-codex', {cwd: deps.cwd, env: definedEntries(deps.env)}),
  modelOptions: {...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {}), workingDirectory: deps.cwd},
})
```

Check the actual `CodexTextConfig`/provider-options field names against `node_modules/@tanstack/ai-codex/dist` before finalizing (`sessionId`, `workingDirectory`, `approvalPolicy`, `sandboxMode`, `skipGitRepoCheck` per upstream docs). Set `skipGitRepoCheck: true` only if the default breaks non-git cwds in the IT.

- [ ] **Step 4: Gated integration test**

In `packages/core/test/testkit/` add a codex turn IT following the existing testkit pattern (`harness-available.ts` gates on binary presence — skip when `codex` is not installed, run when present locally):
prompt → expect a TEXT chunk and a RUN_FINISHED, then a second turn resuming and expect `resumeSessionId` threading (session record updated by the Task 5 tap).

Run: `pnpm turbo run test --filter=@conciv/harness --filter=@conciv/core`
Expected: PASS (IT skipped in CI, real locally if codex installed).

- [ ] **Step 5: Fallow + commit**

Run: `pnpm exec fallow audit --changed-since main --format json` — deleting `decode.ts`/`args.ts` must not leave INTRODUCED dead exports.

```bash
git commit -m 'feat(harness): codex on @tanstack/ai-codex adapter' -- packages/harness/src/codex packages/harness/package.json pnpm-lock.yaml packages/harness/test/codex-chat-config.test.ts packages/core/test/testkit
```

---

### Task 7: OpenCode — stub becomes real

**Files:**

- Modify: `packages/harness/src/opencode/index.ts` (replace `defineStubHarness`)
- Modify: `packages/harness/package.json` (add `@tanstack/ai-opencode@^0.2.1`)
- Test: `packages/harness/test/opencode-chat-config.test.ts`

**Interfaces:**

- Consumes: `opencodeText(model, config)` with `onPermissionRequest: (request) => Promise<'once' | 'always' | 'reject'>` (async handler REPLACES default policy; request shape `{id, sessionID, type, title, callID?}`)
- Produces: real `opencode` HarnessAdapter (capabilities `resume: true`, `permissionGate: 'callback'`)

- [ ] **Step 1: Write the failing test**

```ts
test('opencode permission handler routes to gate and maps decisions', async () => {
  const calls: string[] = []
  const config = opencode.chatConfig?.({
    ...baseDeps,
    decide: async (toolName) => {
      calls.push(toolName)
      return toolName === 'bash' ? 'allow' : 'deny'
    },
  })
  const handler = configuredPermissionHandler(config)
  await expect(handler({id: '1', sessionID: 's', type: 'bash', title: 'run ls'})).resolves.toBe('once')
  await expect(handler({id: '2', sessionID: 's', type: 'webfetch', title: 'fetch'})).resolves.toBe('reject')
  expect(calls).toEqual(['bash', 'webfetch'])
})
```

Export the handler factory (`opencodePermissionHandler(decide)`) so the test reaches it without spawning opencode.

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run test/opencode-chat-config --root packages/harness` → FAIL.

- [ ] **Step 3: Implement**

```ts
import {opencodeText} from '@tanstack/ai-opencode'

export function opencodePermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: {id: string; sessionID: string; type: string; title: string; callID?: string}) => {
    const decision = await decide(request.type, {title: request.title}, request.callID ?? request.id)
    return decision === 'allow' ? 'once' : 'reject'
  }
}

const opencodeChatConfig = (deps: HarnessChatDeps) => ({
  adapter: opencodeText(deps.model ?? defaultModel, {
    directory: deps.cwd,
    onPermissionRequest: opencodePermissionHandler(deps.decide),
  }),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})
```

Verify config field names (`directory` vs `cwd`) against `@tanstack/ai-opencode` dist types; pick a real default model id from its model-meta.

- [ ] **Step 4: Run tests** — harness unit + core suite green.

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): opencode real adapter via @tanstack/ai-opencode' -- packages/harness/src/opencode packages/harness/package.json pnpm-lock.yaml packages/harness/test/opencode-chat-config.test.ts
```

---

### Task 8: pi + gemini-cli via acpCompatible

**Files:**

- Modify: `packages/harness/src/pi/index.ts`, `packages/harness/src/gemini-cli/index.ts` (replace stubs)
- Create: `packages/harness/src/_shared/acp.ts` (shared factory)
- Modify: `packages/harness/package.json` (add `@tanstack/ai-acp@^0.2.1`)
- Test: `packages/harness/test/acp-harnesses.test.ts`

**Interfaces:**

- Consumes: `acpCompatible({name, command, permissions, onPermissionRequest, refusalMessage})`; `command` receives `{model, harnessCwd, modelOptions}`; `onPermissionRequest: (request: AcpPermissionRequest) => Promise<AcpPermissionOutcome>` where outcome selects an option id (`{outcome: 'selected', optionId}` / `{outcome: 'cancelled'}`), request has `{toolCall: {title?, toolCallId, kind?}, options: [{optionId, kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'}]}`
- Produces: real `pi` and `geminiCli` HarnessAdapters (`resume: true`, `permissionGate: 'callback'`)

- [ ] **Step 1: Write the failing test**

```ts
test('acp permission handler picks allow_once on gate allow, reject_once on deny', async () => {
  const handler = acpPermissionHandler(async () => 'allow')
  const outcome = await handler({
    sessionId: 's',
    toolCall: {toolCallId: 'tc1', title: 'Edit file'},
    options: [
      {optionId: 'a', kind: 'allow_once'},
      {optionId: 'r', kind: 'reject_once'},
    ],
  })
  expect(outcome).toEqual({outcome: 'selected', optionId: 'a'})
})

test('gemini harness builds gemini --acp command', () => {
  const config = geminiCli.chatConfig?.(baseDeps({model: 'gemini-2.5-pro'}))
  expect(config?.adapter.name).toBe('gemini-cli')
})
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm vitest run test/acp-harnesses --root packages/harness`.

- [ ] **Step 3: Implement `_shared/acp.ts`**

```ts
import {acpCompatible} from '@tanstack/ai-acp'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export function acpPermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: AcpPermissionRequest) => {
    const title = request.toolCall.title ?? request.toolCall.toolCallId
    const decision = await decide(title, {toolCall: request.toolCall}, request.toolCall.toolCallId)
    const wanted = decision === 'allow' ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
    const option = request.options.find((candidate) => wanted.includes(candidate.kind))
    return option ? {outcome: 'selected', optionId: option.optionId} : {outcome: 'cancelled'}
  }
}

export function acpChatConfig(name: string, commandOf: (model: string, cwd: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps) => ({
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

`pi/index.ts`: `acpChatConfig('pi', (m, cwd) => \`pi --acp -m ${m} --cwd ${cwd}\`, <verify pi's real model ids + --acp flag against ~/Public/web/pi-mono before finalizing>)`.
`gemini-cli/index.ts`: `acpChatConfig('gemini-cli', (m, cwd) => \`gemini --acp -m ${m}\`, 'gemini-2.5-pro')`(verify`gemini --acp`accepts cwd via ACP`newSession` rather than a flag — acpCompatible passes cwd over the protocol).

The exact `AcpPermissionRequest`/`AcpPermissionOutcome` types are exported from `@tanstack/ai-acp` — import them, don't redeclare.

- [ ] **Step 4: Run tests** — harness + core green; ITs gated on binary presence like Task 6.

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): pi + gemini-cli real adapters via acpCompatible' -- packages/harness/src/pi packages/harness/src/gemini-cli packages/harness/src/_shared/acp.ts packages/harness/package.json pnpm-lock.yaml packages/harness/test/acp-harnesses.test.ts
```

---

### Task 9: Upstream PR — `extraArgs` on ClaudeCodeTextConfig

**Files (in a fork of tanstack/ai, NOT this repo):**

- Modify: `packages/ai-claude-code/src/adapters/text.ts` (config field + `buildCommand` append)
- Test: their existing adapter test file for `buildCommand`
- Create: `.changeset/` entry per their contributing flow

**Interfaces:**

- Produces: released `@tanstack/ai-claude-code` accepting `extraArgs?: Array<string>` — Task 10 passes `['--strict-mcp-config', '--plugin-dir', CONCIV_PLUGIN_DIR]`. Task 10 is BLOCKED until this ships (or the fallback below is chosen).

- [ ] **Step 1: Fork + branch, add config field**

```ts
/** Extra CLI flags appended verbatim to the `claude` command (e.g. `--strict-mcp-config`). */
extraArgs?: Array<string>
```

In `buildCommand`, before `return`:

```ts
for (const arg of config.extraArgs ?? []) args.push(q(arg))
```

- [ ] **Step 2: Add their-style test** asserting `extraArgs: ['--strict-mcp-config']` lands in the built command string, run their `pnpm test` for the package, open the PR referencing the use case (host-mode local-process runs need `--strict-mcp-config` so user-level MCP servers don't shadow bridged tools).

- [ ] **Step 3: Record the decision point.** If the PR is not merged within the sprint, choose explicitly (do not drift): (a) hold Task 10 (claude stays on the current SDK path — fully working today), or (b) cut over WITHOUT `--strict-mcp-config` and accept user-MCP shadowing (memory says this bit us: `claude --strict-mcp-config` note). Default: (a).

---

### Task 10: Claude cutover (behind env flag, then default)

**Files:**

- Modify: `packages/harness/src/claude/index.ts` (add `chatConfig`, keep SDK path selectable), `packages/harness/package.json` (add `@tanstack/ai-claude-code@^0.2.1`)
- Test: `packages/harness/test/claude-chat-config.test.ts` + testkit parity ITs in `packages/core/test/testkit/` (runReal gate)

**Interfaces:**

- Consumes: `claudeCodeText(model, config)` — config verified fields: `cwd`, `permissionMode`, `allowedTools`, `disallowedTools`, `addDirs`, `maxTurns`, `systemPromptMode`, `claudeExecutable`, `streamPartials`, `env`, `emitDiff`, plus `extraArgs` from Task 9; modelOptions: `sessionId`, `forkSession`, `maxTurns`, `permissionMode`, `allowedTools`, `disallowedTools`, `cwd`
- Produces: claude on the TanStack adapter; `CONCIV_CLAUDE_TANSTACK=1` opts in during bake-off, flipped to default at the end of this task

- [ ] **Step 1: Write the failing unit test**

```ts
test('claude chatConfig pins interactive permission mode and strict mcp', () => {
  const config = makeClaudeChatConfig({
    cwd: '/repo',
    sessionId: 's',
    resumeSessionId: 'r1',
    model: 'sonnet',
    env: {},
    decide: async () => 'allow',
  })
  expect(config.adapter.name).toBe('claude-code')
  expect(config.modelOptions).toMatchObject({sessionId: 'r1', permissionMode: 'default'})
})
```

- [ ] **Step 2: Run to verify FAIL**, then implement:

```ts
import {claudeCodeText} from '@tanstack/ai-claude-code'

export const makeClaudeChatConfig = (deps: HarnessChatDeps) => ({
  adapter: claudeCodeText(deps.model ?? 'sonnet', {
    cwd: deps.cwd,
    permissionMode: 'default',
    systemPromptMode: 'append',
    emitDiff: false,
    env: definedEntries(deps.env),
    extraArgs: ['--strict-mcp-config', ...(CONCIV_PLUGIN_DIR ? ['--plugin-dir', CONCIV_PLUGIN_DIR] : [])],
  }),
  modelOptions: {permissionMode: 'default', ...(deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {})},
})

export function makeClaudeAdapter(useTanstack: boolean): HarnessAdapter {
  // existing SDK/CLI variants stay; when useTanstack, defineHarness spreads claudeBase
  // with chatConfig: makeClaudeChatConfig, capabilities: {...sdkCapabilities, permissionGate: 'callback', slashCommands: 'live', imageInput: 'fileRef'}
}
export const claude = makeClaudeAdapter(Boolean(process.env.CONCIV_CLAUDE_TANSTACK))
```

Note `compaction: false` (the `COMPACT_FALLBACK_PROMPT` path in `turn.ts` already covers compact intent — same as today's SDK mode). `commands: claudeSdkCommands` stays (live slash commands). `history`, `tty`, `launch` unchanged.

- [ ] **Step 3: Parity ITs (testkit, runReal gate).** Extend `packages/core/test/testkit/` with a `CONCIV_CLAUDE_TANSTACK=1` mode run asserting, against real claude:
  1. text turn streams TEXT chunks + RUN_FINISHED with usage,
  2. second turn resumes (session record got the harness session id via the Task 5 tap),
  3. a gated Bash command produces a pending permission in our gate and PROCEEDS after `allow` (reuse the existing permission IT pattern from the SDK path),
  4. a conciv tool call round-trips through the bridge (tool event name arrives as `mcp__conciv-... `— assert against whatever the real event carries and confirm the widget tool-card mapping in `packages/widget` still matches; if names changed from the `/api/mcp` era, fix the mapping in the widget, not the name).

Run: `pnpm turbo run test --filter=@conciv/core` locally (real claude), and CI (fake-only) stays green.

- [ ] **Step 4: Flip the default** (`makeClaudeAdapter(!process.env.CONCIV_CLAUDE_SDK)` — inverted escape hatch), re-run the full suite + a manual `pnpm dev` smoke: chat turn, permission prompt, image paste, slash-command menu, session browser attach. Server restart required for harness edits (dev-loop rule).

- [ ] **Step 5: Commit**

```bash
git commit -m 'feat(harness): claude on @tanstack/ai-claude-code with blocking gate' -- packages/harness/src/claude packages/harness/package.json pnpm-lock.yaml packages/harness/test/claude-chat-config.test.ts packages/core/test/testkit
```

---

### Task 11: Deletions, fallow, docs

**Files:**

- Delete: `packages/harness/src/claude/decode.ts`, `packages/harness/src/claude/args.ts`, `packages/harness/src/claude/blocks.ts` (verify sole consumer was decode), SDK run/`release`/`shutdown` portions of `packages/harness/src/claude/sdk.ts` (keep `claudeSdkCommands`), `CONCIV_CLAUDE_CLI` handling in `packages/core/vitest.config.ts`
- Modify: `packages/protocol/src/harness-types.ts` (drop now-unused `buildArgs`/`decode`/`deliverInput`/`buildCompactArgs`/`run` members IF no harness uses them — the testkit fake still needs the `harnessText` path, so keep exactly what it consumes and delete the rest), `packages/core/src/api/chat/turn.ts` (drop `spawnHarness` plumbing if unreferenced), `AGENTS.md` (harness section: adapters now come from `@tanstack/ai-*`; capability contract note updated)
- Test: existing suites are the net

- [ ] **Step 1: Trace before deleting.** For each candidate export: `pnpm exec fallow dead-code --trace 'packages/harness/src/claude/decode.ts:claudeToAguiEvents'` etc. "USED but file unreachable" means a missing entry point — investigate, don't delete.
- [ ] **Step 2: Delete + fix types.** Run `pnpm typecheck` after each file removal; update `HarnessAdapter` capability unions so a `chatConfig` harness cannot also be forced to carry `buildArgs` (make `buildArgs` optional only when `chatConfig` is present — same discriminated-union style as `transcriptHistory`).
- [ ] **Step 3: Full gates + fallow.** `pnpm typecheck && pnpm build && pnpm test && pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED.
- [ ] **Step 4: Docs + changeset.** Update `AGENTS.md` harness bullet; add one changeset (`.changeset/tanstack-harness-migration.md`, patch bump, any `@conciv/*` name releases the fixed set).
- [ ] **Step 5: Commit**

```bash
git commit -m 'refactor(harness): delete bespoke decoders superseded by tanstack adapters' -- packages/harness packages/protocol/src/harness-types.ts packages/core AGENTS.md .changeset
```

---

## Verification (whole plan)

- `pnpm typecheck && pnpm build && pnpm test` green at EVERY task boundary — no task may leave the tree red.
- Local real-harness pass before the PR: `pnpm turbo run test --filter=@conciv/core` with real `claude` installed (testkit `runReal`), plus manual widget smoke (`pnpm dev`, hard-reload rules apply; core/harness edits need a server restart).
- `pnpm exec fallow audit --changed-since main --format json` clean.
- PR description lists the two accepted regressions (mid-turn usage ticker, upstream text-only prompts worked around via fileRef injection) and links the Task 9 upstream PR.

## Risks & Rollbacks

- Every harness cutover is one commit and independently revertable; claude additionally sits behind an env flag until Step 4 of Task 10.
- If `@tanstack/ai` 0.40 upgrade (Task 1) breaks the widget beyond a day's work, STOP and land the upgrade as its own PR first — nothing in Tasks 2+ depends on being co-located with it.
- If the `provideToolBridgeProvisioner` seam changes upstream (it is public API but 0.x), the fallback for claude is the current SDK path (kept until Task 11) — do not ship a deny+re-run permission UX without explicit approval.
