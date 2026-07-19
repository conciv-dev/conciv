# Lazy Tool Discovery + Code Mode Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every extension tool behind `@tanstack/ai` native lazy discovery (and Code Mode where safe), shrinking conciv's standing system prompt to near zero.

**Architecture:** Extension tools are already converted to native `toolDefinition(...)` at `packages/core/src/chat/runtime.ts:36` and passed to `chat()` at `packages/core/src/chat/run.ts:124`. We mark them `lazy: true` there, fold per-tool prompt prose into descriptions (revealed only on discovery), stop concatenating `promptSnippet` into the standing prompt in `packages/core/src/start.ts`, and add a Code Mode execute tool built from the non-approval subset. Plan is spec section 6 of `docs/superpowers/specs/2026-07-19-framework-inspection-extensions-design.md`.

**Tech Stack:** `@tanstack/ai` 0.41.0 (installed), `@tanstack/ai-code-mode@0.3.7` + `@tanstack/ai-isolate-node@0.1.46` (installed + committed, Task 6 done), vitest, `@conciv/harness-testkit`.

**Review status:** validated by 4 independent opus reviews (lazy API, code-mode API, conciv integration, security) + a tool-path spike (`2026-07-19-lazy-spike-findings.md`). All blockers folded in: Task 1 rescoped to the two remaining empirical questions, Task 5 re-scoped (chat path never uses `/api/mcp`), Task 6b added (approval-gate name normalization — pre-existing security hole), Task 7 rebuilt (opt-in `codeMode` flag, real sessionId, probe-gated driver singleton, non-lazy bindings, `codeMode.tools` wiring).

## Global Constraints

- Functions, not classes. No IIFEs. ZERO code comments (lint deletes them). No `any`/`as`/`@ts-ignore`/non-null `!`. No `else` where guard clauses work.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- `pnpm test` builds first via turbo; never hand-rebuild `dist/`. Final gates: `pnpm typecheck && pnpm build && turbo run test --force`.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` — fix everything INTRODUCED.
- Tests: no jsdom, no mocks of our own plumbing; use `@conciv/harness-testkit` doubles (no `__` dunder surfaces; drive via `harness.script`). Native assertions.
- Widget ITs load the PREBUILT bundle — `pnpm turbo run build --filter=@conciv/embed` first; `browser.newPage()` not `newContext()`; never wait `networkidle`.
- Commit with pathspec (parallel sessions share the repo). Do not push.

---

### Task 1: Spike — RESOLVED (see findings doc); two empirical questions remain

Static analysis is done: `docs/superpowers/plans/2026-07-19-lazy-spike-findings.md`. Summary:
chat turns never touch conciv's `/api/mcp` — `chat()` lazy-filters the active tool set BEFORE the
adapter sees it, and the claude adapter provisions exactly that set into its own in-process
bridge (`@tanstack/ai-claude-code/dist/esm/adapters/text.js:164-188`, written once at spawn as
`.tanstack-mcp-bridge-<runId>.json`). So `lazy: true` genuinely shrinks what the CLI's model
sees. The bridge is static per provision (no `tools/list_changed` in `@tanstack/ai-sandbox`), so
mid-turn discovery→callability and cross-turn discovery persistence are the open questions.

**Files:**

- Modify: `docs/superpowers/plans/2026-07-19-lazy-spike-findings.md` (append empirical results)
- Test (committed, unlike the original throwaway idea): `packages/core/test/chat/lazy-extension-tools.it.test.ts`

**Interfaces:**

- Produces: empirical answers appended to the findings doc for (a) is a tool discovered mid-run
  callable within the same turn through the claude bridge (expected: NO — static bridge; confirm
  and file an upstream issue on `@tanstack/ai-sandbox` for re-provisioning); (b) do the synthetic
  `__lazy__tool__discovery__` call + `role: 'tool'` result messages survive conciv's persisted
  history across turns for a `transcriptHistory: true` harness (claude merges history from the
  CLI transcript by msgid — synthetic chat()-layer messages may be dropped). If (b) fails, Task 4
  gains a precondition: persist those synthetic messages in the session/attach layer.

- [ ] **Step 1: Write the committed lazy-path test** — using `@conciv/harness-testkit` (scripted harness, no real CLI): register an extension with one eager and one lazy tool, run a scripted turn, assert the harness was offered the eager tool + `__lazy__tool__discovery__` and NOT the lazy tool; script a discovery call and assert the discovery result contains the lazy tool's schema; run a second turn on the same session and assert (via the manager's behavior) whether the lazy tool is offered without re-discovery.
- [ ] **Step 2: Run it against the claude harness locally too** (the real-CLI ITs are `it.skipIf(!runReal)`-gated and CI-skipped — run with the local claude binary once, record results in the findings doc).
- [ ] **Step 3: Append results + final GO/ADAPT refinement to the findings doc; file the upstream issue if mid-turn callability fails.**
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-19-lazy-spike-findings.md packages/core/test/chat/lazy-extension-tools.it.test.ts
git commit -m "test(core): committed lazy extension-tool path coverage + spike results" -- docs/superpowers/plans/2026-07-19-lazy-spike-findings.md packages/core/test/chat/lazy-extension-tools.it.test.ts
```

---

### Task 2: Fold tool prose into descriptions; carry `approval` on server tools

Per-tool `promptSnippet`/`promptGuidelines` move out of the standing prompt (Task 3 removes them there) and into the tool description, which lazy discovery reveals on demand. `approval` must ride `ExtensionServerTool` so Task 7 can exclude gated tools from Code Mode.

**Files:**

- Modify: `packages/extension/src/types.ts:23-30` (`ExtensionServerTool`)
- Modify: `packages/core/src/app.ts:101-114` (`buildExtensionTools`)
- Test: `packages/core/test/chat/extension-tool-description.test.ts` (create)

**Interfaces:**

- Consumes: `ExtensionTool` fields `promptSnippet?: string`, `promptGuidelines?: string[]`, `approval?: 'ask'` (`packages/extension/src/types.ts`).
- Produces: `ExtensionServerTool` gains `approval?: 'ask'`; `buildExtensionTools` returns tools whose `description` is `[description, promptSnippet, ...promptGuidelines].filter(Boolean).join('\n\n')`. Task 4 and Task 7 rely on `approval` being present; discovery payloads and the MCP projection both get the enriched description for free.

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {buildExtensionTools} from '../../src/app.js'

const extension = {
  name: 'demo',
  parseConfig: (raw: unknown) => raw,
  useContext: Object.assign(() => ({}), {}) as never,
  client: (() => {}) as never,
  server: (() => {}) as never,
  tools: [
    {
      name: 'demo_tool',
      description: 'Does a demo thing.',
      inputSchema: z.object({}),
      promptSnippet: 'Use demo_tool before demo_other.',
      promptGuidelines: ['Never call twice.', 'Prefer small inputs.'],
      approval: 'ask' as const,
      __execute: async () => 'ok',
    },
  ],
}

test('folds snippet and guidelines into the server tool description and keeps approval', () => {
  const [tool] = buildExtensionTools(extension as never, {})
  expect(tool?.description).toBe(
    'Does a demo thing.\n\nUse demo_tool before demo_other.\n\nNever call twice.\n\nPrefer small inputs.',
  )
  expect(tool?.approval).toBe('ask')
})
```

Note: `buildExtensionTools` is currently module-private in `app.ts` — export it as part of Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core test test/chat/extension-tool-description.test.ts`
Expected: FAIL (`buildExtensionTools` not exported).

- [ ] **Step 3: Implement**

In `packages/extension/src/types.ts`, extend `ExtensionServerTool`:

```ts
export type ExtensionServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  approval?: 'ask'
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
}
```

In `packages/core/src/app.ts`, export and extend `buildExtensionTools`:

```ts
export function buildExtensionTools(extension: AnyExtension, context: unknown): ExtensionServerTool[] {
  return (extension.tools ?? []).flatMap((tool) => {
    const run = tool.__execute
    if (!run) return []
    const description = [tool.description, tool.promptSnippet, ...(tool.promptGuidelines ?? [])]
      .filter(Boolean)
      .join('\n\n')
    return [
      {
        name: tool.name,
        description,
        inputSchema: tool.inputSchema,
        approval: tool.approval,
        execute: (input: unknown, request: ToolRequest) => run(input, context, request),
      },
    ]
  })
}
```

Add the `ExtensionServerTool` import to `app.ts` if missing.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @conciv/core test test/chat/extension-tool-description.test.ts`
Expected: PASS. Also run `pnpm --filter @conciv/core typecheck` (or `pnpm typecheck`).

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/types.ts packages/core/src/app.ts packages/core/test/chat/extension-tool-description.test.ts
git commit -m "feat(core): fold tool prose into server tool descriptions, carry approval" -- packages/extension/src/types.ts packages/core/src/app.ts packages/core/test/chat/extension-tool-description.test.ts
```

---

### Task 3: Remove per-tool promptSnippet from the standing system prompt

**Files:**

- Modify: `packages/core/src/start.ts:52-60`
- Test: `packages/core/test/system-prompt.test.ts` (create; if a start.ts prompt test already exists, extend it instead)

**Interfaces:**

- Consumes: nothing new.
- Produces: standing prompt = `cfg.systemPrompt` + each extension's `systemPrompt` only. No tool prose. This is the context-shrink deliverable; Task 9's anti-pattern grep guards it.

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {composeSystemPrompt} from '../src/start.js'

test('standing prompt contains extension systemPrompt but never tool prose', () => {
  const prompt = composeSystemPrompt('base prompt', [
    {
      name: 'demo',
      systemPrompt: 'Demo extension rules.',
      tools: [{name: 'demo_tool', description: 'd', promptSnippet: 'NEVER-IN-PROMPT'}],
    } as never,
  ])
  expect(prompt).toContain('base prompt')
  expect(prompt).toContain('Demo extension rules.')
  expect(prompt).not.toContain('NEVER-IN-PROMPT')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core test test/system-prompt.test.ts`
Expected: FAIL (`composeSystemPrompt` not exported — prompt assembly is inline in `start()` today).

- [ ] **Step 3: Extract and fix**

In `packages/core/src/start.ts`, replace the inline assembly (currently lines 52-60):

```ts
export function composeSystemPrompt(base: string | undefined, extensions: readonly AnyExtension[]): string {
  return [base, ...extensions.map((extension) => extension.systemPrompt)].filter(Boolean).join('\n\n')
}
```

and in `start()`:

```ts
const systemPrompt = composeSystemPrompt(cfg.systemPrompt, opts.extensions ?? [])
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @conciv/core test test/system-prompt.test.ts` then `pnpm turbo run test --filter=@conciv/core`
Expected: PASS; no other core test regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/start.ts packages/core/test/system-prompt.test.ts
git commit -m "feat(core): standing prompt drops per-tool snippets" -- packages/core/src/start.ts packages/core/test/system-prompt.test.ts
```

---

### Task 4: Mark extension tools lazy and enable the discovery catalog

**Files:**

- Modify: `packages/core/src/chat/runtime.ts` (`toChatTool`, `buildChatTools`)
- Modify: `packages/core/src/chat/run.ts:124-134` (`chat()` call)
- Test: `packages/core/test/chat/chat-tools.test.ts` (extend)

**Interfaces:**

- Consumes: `ExtensionServerTool.approval` from Task 2.
- Produces: `toChatTool(tool, run, opts?: {lazy?: boolean})`; extension tools are `lazy: true`, conciv core tools (`concivTools`) stay eager; `chat()` gains `lazyToolsConfig: {includeDescription: 'first-sentence'}`. Task 7 reuses `toChatTool` unchanged.

- [ ] **Step 1: Write the failing test (extend `chat-tools.test.ts`)**

```ts
test('extension tools are lazy, conciv tools are eager', () => {
  const tools = buildChatTools(
    () => ({
      askUi: async () => ({answered: false, note: ''}),
      page: async () => ({ok: false as const, error: 'none'}),
      open: () => {},
    }),
    [{name: 'ext_tool', description: 'extension tool', inputSchema: z.object({}), execute: async () => 'ok'}],
    () => null,
  )('session-1')
  const extension = tools.find((tool) => tool.name === 'ext_tool')
  const core = tools.find((tool) => tool.name !== 'ext_tool')
  expect(extension?.lazy).toBe(true)
  expect(core?.lazy).toBeFalsy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/core test test/chat/chat-tools.test.ts` (deps must be built once first: `pnpm turbo run build --filter=@conciv/core^...`)
Expected: FAIL (`lazy` undefined on extension tool).

- [ ] **Step 3: Implement**

`packages/core/src/chat/runtime.ts`:

```ts
export function toChatTool(tool: Registrable, run: ToolRun, opts?: {lazy?: boolean}): AnyTool {
  return toolDefinition({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    lazy: opts?.lazy,
  }).server(run)
}
```

In `buildChatTools`, extension mapping becomes:

```ts
...extensionTools.map((tool) => toChatTool(tool, (args) => tool.execute(args, request), {lazy: true})),
```

`packages/core/src/chat/run.ts`, add to the `chat()` options object:

```ts
lazyToolsConfig: {includeDescription: 'first-sentence'},
```

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS. NOTE: the real-CLI harness ITs (`claude/opencode/gemini-tanstack.it`) are `it.skipIf`-gated, CI-skipped, and register NO tools — they prove nothing about lazy. The committed proof is Task 1's `lazy-extension-tools.it.test.ts`; it must be green here.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat/runtime.ts packages/core/src/chat/run.ts packages/core/test/chat/chat-tools.test.ts
git commit -m "feat(core): extension tools ride native lazy discovery" -- packages/core/src/chat/runtime.ts packages/core/src/chat/run.ts packages/core/test/chat/chat-tools.test.ts
```

---

### Task 5: `/api/mcp` lazy parity — RE-SCOPED, chat path does NOT need it

Spike verdict: chat turns never consume `/api/mcp` — it serves claude tty/launch/sdk modes,
slash-command listing, and external agents. Chat-level lazy (Task 4) already reaches every
chat-path harness through the adapter bridge. This task is therefore NOT about the chat goal:
apply the same lazy split to `/api/mcp` so interactive-terminal and external-agent surfaces stay
lean. The official MCP SDK supports dynamic registration + `sendToolListChanged`, unlike the
sandbox bridge. Deprioritize to last; skipping it entirely is acceptable for this PR if the
user prefers — record the decision either way.

**Files:**

- Modify: `packages/core/src/api/mcp.ts:57-80` (`buildServer`)
- Test: `packages/core/test/mcp-lazy.test.ts` (create)

**Interfaces:**

- Consumes: `ExtensionServerTool.approval` + enriched descriptions (Task 2); the spike findings doc.
- Produces: MCP `tools/list` initially excludes lazy extension tools; a `conciv_discover_tools` MCP tool (input `{names: string[]}`) returns full description + JSON schema per name and triggers `tools/list_changed` so discovered tools become callable. Exact mechanics MUST follow the spike findings — if the MCP SDK in use (`McpServer`) supports dynamic tool registration, use `server.tool(...)` at discovery time; the findings doc names the API.
- SECURITY INVARIANTS (from review): (a) discovered tools register on the SAME `McpServer` instance built in `buildServer` — never a second server, never a renamed tool, so the client-side `mcp__conciv__<name>` form keeps matching `riskyMatches` (Task 6b); (b) `conciv_discover_tools` returns metadata only and never invokes `tool.execute`; (c) add a test asserting a discovered `approval: 'ask'` tool still triggers the permission callback when subsequently called.

- [ ] **Step 1: Write the failing test** — assert `tools/list` on a fresh MCP session contains conciv core tools and `conciv_discover_tools` but not `ext_tool`; after calling `conciv_discover_tools` with `{names: ['ext_tool']}`, `tools/list` contains `ext_tool` and calling it executes. Build the test against the same in-process Hono app the existing MCP tests use (see `packages/core/test/` for the MCP test harness pattern; follow it exactly).
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement in `buildServer` per the spike findings.**
- [ ] **Step 4: Run `pnpm turbo run test --filter=@conciv/core`, expect PASS.**
- [ ] **Step 5: Commit with pathspec:** `git commit -m "feat(core): MCP projection mirrors lazy discovery" -- packages/core/src/api/mcp.ts packages/core/test/mcp-lazy.test.ts`

---

### Task 6: Add Code Mode dependencies — DONE

User approved; installed and committed on this branch (`chore(core): add tanstack code-mode +
node isolate driver`): `@tanstack/ai-code-mode@0.3.7` + `@tanstack/ai-isolate-node@0.1.46` in
`packages/core`, `isolated-vm@6.1.2` build approved via `pnpm approve-builds isolated-vm` and
smoke-tested (both packages import; exports confirmed: `createCodeMode`,
`createNodeIsolateDriver`, `probeIsolatedVm`).

- [x] Installed, built, committed.

---

### Task 6b: Approval-gate name normalization + per-harness gate-firing proof (SECURITY, do before Task 7)

Security review found a pre-existing hole the plan must not build on top of: the risky set holds
`mcp__conciv__<name>` (`packages/core/src/app.ts:155-159`) but (a) the chat-middleware path
compares BARE names (`packages/core/src/chat/gate.ts` `gatedTools` → `gate.decide(tool.name, ...)`),
and (b) bridge-visible names are `mcp__tanstack__<name>`. Result: in-process/no-callback
harnesses (codex: `permissionGate: 'none'`) execute `approval: 'ask'` extension tools UNGATED
today.

**Files:**

- Modify: `packages/core/src/chat/gate.ts` (name matching), `packages/core/src/app.ts:155` (risky set contents)
- Test: `packages/core/test/chat/permission-gate.test.ts` (extend)

**Interfaces:**

- Consumes: `ExtensionServerTool.approval` (Task 2).
- Produces: `riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean` in `gate.ts` —
  strips a leading `mcp__<server>__` prefix (any server) and matches the bare name against a
  bare-name risky set; `app.ts` risky set switches to bare names. Every `risky.has(...)` call
  site in `gate.ts` switches to `riskyMatches`. Task 7's Code Mode exclusion and capability
  enablement depend on this landing first.

- [ ] **Step 1: Write failing tests** — extend `permission-gate.test.ts`: `decide('canvas.delete')`, `decide('mcp__conciv__canvas.delete')`, and `decide('mcp__tanstack__canvas.delete')` must ALL deny for an `approval: 'ask'` tool named `canvas.delete`; a non-risky name in all three forms must allow. (This intentionally changes the existing assertion at `permission-gate.test.ts:34` that bare `canvas.delete` allows — that assertion documents the bug.)
- [ ] **Step 2: Run, expect the new assertions to FAIL.**

Run: `pnpm --filter @conciv/core test test/chat/permission-gate.test.ts`

- [ ] **Step 3: Implement**

`packages/core/src/chat/gate.ts`:

```ts
const MCP_PREFIX = /^mcp__[a-z0-9-]+__/i

export function riskyMatches(risky: ReadonlySet<string>, toolName: string): boolean {
  return risky.has(toolName.replace(MCP_PREFIX, ''))
}
```

Replace every `risky.has(name)` in `gate.ts` with `riskyMatches(risky, name)`. In
`packages/core/src/app.ts`, drop the prefix from the risky set:

```ts
const risky = new Set(
  (opts.extensions ?? [])
    .flatMap((extension) => extension.tools ?? [])
    .filter((tool) => tool.approval === 'ask')
    .map((tool) => tool.name),
)
```

- [ ] **Step 4: Run the full core suite** — `pnpm turbo run test --filter=@conciv/core`, expect PASS (update any test pinning the old prefixed-set behavior deliberately, noting each).
- [ ] **Step 4b: Approval-flag audit** — list every `defineTool` across `packages/extensions/*` and `packages/tools` with its `approval` value (`grep -rn "defineTool\|approval" packages/extensions/*/src packages/tools/src`). For each tool that mutates state (writes files, deletes records, drives the browser, spawns processes) but lacks `approval: 'ask'`, either add the flag or record in the findings doc WHY it is safe unguarded. Deliverable: an "Approval audit" section appended to `docs/superpowers/plans/2026-07-19-lazy-spike-findings.md` naming every tool and its classification.
- [ ] **Step 4c: Gate-firing proof on the scripted path** — extend Task 1's `lazy-extension-tools.it.test.ts`: register an `approval: 'ask'` extension tool, script a call to it, assert the run pauses on an approval request (wire `approval-requested` event or gate decision), not silent execution.
- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat/gate.ts packages/core/src/app.ts packages/core/test/chat/permission-gate.test.ts
git commit -m "fix(core): approval gate matches tool names across mcp prefixes" -- packages/core/src/chat/gate.ts packages/core/src/app.ts packages/core/test/chat/permission-gate.test.ts
```

---

### Task 7: Code Mode execute tool from the non-approval subset

**Files:**

- Create: `packages/core/src/chat/code-mode.ts`
- Modify: `packages/core/src/chat/run.ts` (`buildRunStream`), `packages/core/src/chat/runtime.ts` (`ChatDeps` — no change expected, tools already flow), `packages/protocol/src/harness-types.ts` (capability flag)
- Test: `packages/core/test/chat/code-mode.test.ts` (create)

**Interfaces:**

- Consumes: `toChatTool` (Task 4), `ExtensionServerTool.approval` (Task 2), `createCodeMode({driver, tools, timeout})` from `@tanstack/ai-code-mode` returning `{tool, systemPrompt}`, `createNodeIsolateDriver` (check exact export name in `@tanstack/ai-isolate-node` at implementation time — `node_modules/@tanstack/ai-isolate-node/dist/esm/index.d.ts`).
- Produces: `makeCodeMode(extensionTools: ExtensionServerTool[]): {tool: AnyTool, systemPrompt: string} | null` — null when no eligible tools; callers gate on the harness capability. `HarnessAdapter.capabilities.codeMode?: boolean` (protocol). SECURITY INVARIANT: tools whose source `ExtensionServerTool.approval === 'ask'` are NEVER passed to `createCodeMode` — Code Mode external calls bypass the chat middleware approval gate.

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {makeCodeMode} from '../../src/chat/code-mode.js'

const ext = (name: string, approval?: 'ask') => ({
  name,
  description: 'd',
  inputSchema: z.object({}),
  approval,
  execute: async () => 'ok',
})

test('code mode excludes approval-gated tools', () => {
  const result = makeCodeMode([ext('safe_tool'), ext('risky_tool', 'ask')])
  expect(result).not.toBeNull()
  expect(result?.systemPrompt).toContain('safe_tool')
  expect(result?.systemPrompt).not.toContain('risky_tool')
})
```

- [ ] **Step 2: Run it, expect FAIL (module missing).**

Run: `pnpm --filter @conciv/core test test/chat/code-mode.test.ts`

- [ ] **Step 3: Implement `packages/core/src/chat/code-mode.ts`**

Reviewer-verified constraints baked in: (1) code-mode bindings are NOT marked lazy — an all-lazy
set moves every binding into the `discover_tools` catalog, and dropping the companion
`discoveryTool` (as the earlier draft did) makes them unreachable; the safe subset is small, so
document it eagerly in the generated prompt. (2) Real `sessionId`/`model` must thread into
`tool.execute` — an empty sessionId breaks per-session scoping and can cross sessions. (3) The
driver is a `probeIsolatedVm`-gated module singleton returning null (fail closed, no mid-run
throw — isolated-vm on an incompatible Node can crash the whole 127.0.0.1 server). (4) Only
tools opted in via a new `codeMode: true` flag on `defineTool` are bound — opt-IN, not
opt-out-by-approval, so a future side-effectful tool is safe by default; `approval: 'ask'` tools
are excluded even if flagged (sandbox `external_*` calls bypass every gate — verified: bindings
call `tool.execute` directly).

```ts
import {createCodeMode} from '@tanstack/ai-code-mode'
import type {IsolateDriver} from '@tanstack/ai-code-mode'
import {createNodeIsolateDriver, probeIsolatedVm} from '@tanstack/ai-isolate-node'
import type {AnyTool} from '@tanstack/ai'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {toChatTool} from './runtime.js'

const CODE_MODE_TIMEOUT_MS = 30_000

let cachedDriver: IsolateDriver | null = null

function getDriver(): IsolateDriver | null {
  if (cachedDriver) return cachedDriver
  if (!probeIsolatedVm().compatible) return null
  cachedDriver = createNodeIsolateDriver()
  return cachedDriver
}

export function makeCodeMode(
  extensionTools: ExtensionServerTool[],
  request: ToolRequest,
): {tools: AnyTool[]; systemPrompt: string} | null {
  const driver = getDriver()
  if (driver === null) return null
  const bound = extensionTools.filter((tool) => tool.codeMode === true && tool.approval !== 'ask')
  if (bound.length === 0) return null
  const tools = bound.map((tool) => toChatTool(tool, (args) => tool.execute(args, request)))
  const codeMode = createCodeMode({driver, tools, timeout: CODE_MODE_TIMEOUT_MS})
  return {tools: codeMode.tools, systemPrompt: codeMode.systemPrompt}
}
```

Type prerequisites: `ExtensionTool` and `ExtensionServerTool` (`packages/extension/src/types.ts`)
gain `codeMode?: boolean`; `defineTool` passes it through; `buildExtensionTools` (Task 2)
copies it. `probeIsolatedVm().compatible` — verify the exact result field name against
`packages/core/node_modules/@tanstack/ai-isolate-node/dist/esm/index.d.ts` when implementing.

Add to `packages/protocol/src/harness-types.ts` capabilities:

```ts
codeMode?: boolean
```

In `packages/core/src/chat/run.ts` `buildRunStream` (real session threading, matching how
`buildChatTools` builds `ToolRequest` at `runtime.ts:46`):

```ts
const codeMode = deps.harness.capabilities.codeMode
  ? makeCodeMode(deps.extensionServerTools(), {sessionId, model: req.model ?? null})
  : null
```

and in the `chat()` call:

```ts
systemPrompts: [deps.systemText, codeMode?.systemPrompt].filter((text): text is string => Boolean(text)),
tools: [...deps.tools(sessionId), ...(codeMode?.tools ?? [])],
```

`ChatDeps` gains `extensionServerTools: () => ExtensionServerTool[]` wired from `makeApp`
(app.ts already holds `extensionTools` at line ~222 and hands it to `buildChatTools` and the MCP
vars — reuse the same array).

Update the Step 1 test to the two-arg signature and opt-in flag:

```ts
const request = {sessionId: 's1', model: null}
test('code mode binds only opted-in, non-approval tools', () => {
  const result = makeCodeMode(
    [{...ext('safe_tool'), codeMode: true}, {...ext('risky_tool', 'ask'), codeMode: true}, ext('unflagged_tool')],
    request,
  )
  expect(result).not.toBeNull()
  expect(result?.systemPrompt).toContain('safe_tool')
  expect(result?.systemPrompt).not.toContain('risky_tool')
  expect(result?.systemPrompt).not.toContain('unflagged_tool')
})
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @conciv/core test test/chat/code-mode.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Enable capability on one harness and run its IT**

Set `codeMode: true` only on the claude harness (spike: Code Mode is the least bridge-sensitive
surface — one eager `execute_typescript` tool; its `code_mode:*` events flow through the
bridge's `emitCustomEvent`, explicitly supported per `tool-bridge.d.ts`). Precondition: Task 6b
merged. Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/chat/code-mode.ts packages/core/src/chat/run.ts packages/core/src/chat/runtime.ts packages/protocol/src/harness-types.ts packages/harness/src packages/core/test/chat/code-mode.test.ts
git commit -m "feat(core): code mode execute tool over non-approval extension tools" -- packages/core/src/chat/code-mode.ts packages/core/src/chat/run.ts packages/core/src/chat/runtime.ts packages/protocol/src/harness-types.ts packages/harness/src packages/core/test/chat/code-mode.test.ts
```

---

### Task 8: Widget rendering sanity for discovery + code-mode parts

No custom cards in this plan (framework-extension cards land with the framework plans). This task only proves the widget renders unknown parts gracefully: `__lazy__tool__discovery__` calls, `execute_typescript` calls, and `code_mode:*` custom events must not blank or crash the chat.

**Files:**

- Test: extend the existing widget IT suite (locate via `ls packages/it` / widget IT files that already drive tool calls; follow that file's exact setup pattern)

**Interfaces:**

- Consumes: prebuilt embed bundle; harness-testkit scripted turn.
- Produces: an IT scripting a turn whose wire stream includes a `__lazy__tool__discovery__` tool call part and a code-mode custom event, asserting the transcript still renders the assistant text (native assertions: `getByText`), no error boundary. Reviewer note: `code_mode:*` events arrive as CUSTOM-type chunks whose `name` is the raw string (e.g. `code_mode:console`) — script/assert that chunk shape, not a bespoke event type.

- [ ] **Step 1: Rebuild embed:** `pnpm turbo run build --filter=@conciv/embed`
- [ ] **Step 2: Write the IT** following the neighboring widget IT file's pattern (scripted harness turn emitting a discovery tool call, then assistant text; assert text visible via `getByText`, assert no `role='alert'` error surface).
- [ ] **Step 3: Run it, fix any blank-render fallout (default tool card must tolerate unknown names).**
- [ ] **Step 4: Commit test (and any fallback-render fix) with pathspec.**

---

### Task 9: Gates, anti-pattern grep, fallow

**Files:** none new.

- [ ] **Step 1: Anti-pattern grep (adoption proof)**

```bash
grep -rn 'promptSnippet' packages/core/src && echo 'FAIL: prose still in prompt path' || echo OK
```

Expected: OK — `promptSnippet` no longer referenced anywhere in `packages/core/src` (only `packages/extension` types and `app.ts` description folding from Task 2; adjust the grep to exclude `app.ts` if the folding lives there — the standing-prompt path must have zero hits).

- [ ] **Step 2: Full gates**

```bash
pnpm typecheck && pnpm build && pnpm turbo run test --force
```

Expected: all green.

- [ ] **Step 3: Fallow**

```bash
pnpm exec fallow audit --changed-since main --format json
```

Expected: zero INTRODUCED findings; fix any.

- [ ] **Step 4: Final commit if fixes were needed; report results.**
