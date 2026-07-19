# Lazy Tool Discovery + Code Mode Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every extension tool behind `@tanstack/ai` native lazy discovery (and Code Mode where safe), shrinking conciv's standing system prompt to near zero.

**Architecture:** Extension tools are already converted to native `toolDefinition(...)` at `packages/core/src/chat/runtime.ts:36` and passed to `chat()` at `packages/core/src/chat/run.ts:124`. We mark them `lazy: true` there, fold per-tool prompt prose into descriptions (revealed only on discovery), stop concatenating `promptSnippet` into the standing prompt in `packages/core/src/start.ts`, and add a Code Mode execute tool built from the non-approval subset. Plan is spec section 6 of `docs/superpowers/specs/2026-07-19-framework-inspection-extensions-design.md`.

**Tech Stack:** `@tanstack/ai` 0.41.0 (installed), `@tanstack/ai-code-mode@0.3.7` + `@tanstack/ai-isolate-node@0.1.46` (NEW DEPS — flagged for user approval before Task 6), vitest, `@conciv/harness-testkit`.

## Global Constraints

- Functions, not classes. No IIFEs. ZERO code comments (lint deletes them). No `any`/`as`/`@ts-ignore`/non-null `!`. No `else` where guard clauses work.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- `pnpm test` builds first via turbo; never hand-rebuild `dist/`. Final gates: `pnpm typecheck && pnpm build && turbo run test --force`.
- Before finishing: `pnpm exec fallow audit --changed-since main --format json` — fix everything INTRODUCED.
- Tests: no jsdom, no mocks of our own plumbing; use `@conciv/harness-testkit` doubles (no `__` dunder surfaces; drive via `harness.script`). Native assertions.
- Widget ITs load the PREBUILT bundle — `pnpm turbo run build --filter=@conciv/embed` first; `browser.newPage()` not `newContext()`; never wait `networkidle`.
- Commit with pathspec (parallel sessions share the repo). Do not push.

---

### Task 1: Spike — trace the tool path per harness and prove lazy discovery engages

The one open architectural question (spec research task 5). Extension tools reach agents two ways: `chat({tools})` (`packages/core/src/chat/run.ts:129`) and the MCP server (`packages/core/src/api/mcp.ts:57`, tools named `mcp__conciv__<name>`, see risky-set construction at `packages/core/src/app.ts:155`). Lazy discovery lives in `chat()` — if a CLI harness consumes tools from the MCP server instead, chat-level lazy filtering may not reduce what the CLI sees.

**Files:**

- Read: `packages/core/src/chat/run.ts`, `packages/core/src/api/mcp.ts`, `packages/harness/src/` (each adapter's `chatConfig`), `packages/core/test/claude-tanstack.it.test.ts`, `packages/core/test/extension-tool-session.it.test.ts`
- Create: `docs/superpowers/plans/2026-07-19-lazy-spike-findings.md`

**Interfaces:**

- Produces: a findings doc answering (a) which harnesses consume `chat({tools})` directly vs the MCP projection; (b) whether `lazy: true` tools disappear from the initial tool list each harness sees; (c) whether a tool discovered mid-run is callable (MCP `tools/list_changed` or equivalent); (d) GO/ADAPT decision for Task 5.

- [ ] **Step 1: Trace how each harness adapter receives the `tools` array**

Read `packages/harness/src/` adapter implementations. For each adapter answer: does `config.adapter` forward `chat()`'s `tools` to the CLI (e.g. as `--mcp-config` / MCP session), or do CLIs list tools from conciv's MCP endpoint in `packages/core/src/api/mcp.ts`? Record exact file:line evidence per harness in the findings doc.

- [ ] **Step 2: Empirically verify with the testkit**

Write a throwaway test (do not commit) patterned on `packages/core/test/extension-tool-session.it.test.ts`: register two extension tools, one converted with `lazy: true` (hand-edit `toChatTool` locally for the spike), script a turn via `@conciv/harness-testkit`, and assert on the wire which tool names the harness was offered. Record the observed tool lists for at least the claude harness in the findings doc.

- [ ] **Step 3: Write the GO/ADAPT decision**

In `docs/superpowers/plans/2026-07-19-lazy-spike-findings.md`, conclude one of:

- GO: `chat()`-level lazy filtering reaches every harness — Task 5 becomes a no-op (delete it when executing).
- ADAPT: name the harnesses that read the MCP projection; Task 5 must apply the same lazy split there.

- [ ] **Step 4: Commit the findings doc**

```bash
git add docs/superpowers/plans/2026-07-19-lazy-spike-findings.md
git commit -m "docs: lazy discovery tool-path spike findings" -- docs/superpowers/plans/2026-07-19-lazy-spike-findings.md
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

Run: `pnpm vitest run packages/core/test/chat/extension-tool-description.test.ts`
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

Run: `pnpm vitest run packages/core/test/chat/extension-tool-description.test.ts`
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

Run: `pnpm vitest run packages/core/test/system-prompt.test.ts`
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

Run: `pnpm vitest run packages/core/test/system-prompt.test.ts` then `pnpm turbo run test --filter=@conciv/core`
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

Run: `pnpm vitest run packages/core/test/chat/chat-tools.test.ts`
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
Expected: PASS, including the harness ITs (`claude-tanstack.it`, `opencode-tanstack.it`, `gemini-tanstack.it`) — these are the first real-path proof that lazy tools still execute end to end.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chat/runtime.ts packages/core/src/chat/run.ts packages/core/test/chat/chat-tools.test.ts
git commit -m "feat(core): extension tools ride native lazy discovery" -- packages/core/src/chat/runtime.ts packages/core/src/chat/run.ts packages/core/test/chat/chat-tools.test.ts
```

---

### Task 5: MCP projection parity (conditional on Task 1 = ADAPT)

If the spike shows some harnesses list tools from `packages/core/src/api/mcp.ts` rather than through `chat()`, the MCP server must present the same reduced surface: eager tools plus a discovery affordance, not the full catalog. If Task 1 concluded GO, delete this task and record that in the plan checklist.

**Files:**

- Modify: `packages/core/src/api/mcp.ts:57-80` (`buildServer`)
- Test: `packages/core/test/mcp-lazy.test.ts` (create)

**Interfaces:**

- Consumes: `ExtensionServerTool.approval` + enriched descriptions (Task 2); the spike findings doc.
- Produces: MCP `tools/list` initially excludes lazy extension tools; a `conciv_discover_tools` MCP tool (input `{names: string[]}`) returns full description + JSON schema per name and triggers `tools/list_changed` so discovered tools become callable. Exact mechanics MUST follow the spike findings — if the MCP SDK in use (`McpServer`) supports dynamic tool registration, use `server.tool(...)` at discovery time; the findings doc names the API.

- [ ] **Step 1: Write the failing test** — assert `tools/list` on a fresh MCP session contains conciv core tools and `conciv_discover_tools` but not `ext_tool`; after calling `conciv_discover_tools` with `{names: ['ext_tool']}`, `tools/list` contains `ext_tool` and calling it executes. Build the test against the same in-process Hono app the existing MCP tests use (see `packages/core/test/` for the MCP test harness pattern; follow it exactly).
- [ ] **Step 2: Run it, expect FAIL.**
- [ ] **Step 3: Implement in `buildServer` per the spike findings.**
- [ ] **Step 4: Run `pnpm turbo run test --filter=@conciv/core`, expect PASS.**
- [ ] **Step 5: Commit with pathspec:** `git commit -m "feat(core): MCP projection mirrors lazy discovery" -- packages/core/src/api/mcp.ts packages/core/test/mcp-lazy.test.ts`

---

### Task 6: Add Code Mode dependencies (USER APPROVAL GATE)

Repo rule: ask before installing. Present to the user before running: adds `@tanstack/ai-code-mode@0.3.7` (peer-pinned to the installed `@tanstack/ai@0.41.0`, dep: sucrase) and `@tanstack/ai-isolate-node@0.1.46` (isolated-vm driver) to `packages/core`.

**Files:**

- Modify: `packages/core/package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Get user approval for the two new deps.**
- [ ] **Step 2: Install**

```bash
pnpm --filter @conciv/core add @tanstack/ai-code-mode@0.3.7 @tanstack/ai-isolate-node@0.1.46
```

- [ ] **Step 3: Verify build**

Run: `pnpm turbo run build --filter=@conciv/core`
Expected: clean build (isolated-vm is a native module — if postinstall fails on this machine, STOP and surface to the user; do not swap drivers silently).

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): add tanstack code-mode + node isolate driver" -- packages/core/package.json pnpm-lock.yaml
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

Run: `pnpm vitest run packages/core/test/chat/code-mode.test.ts`

- [ ] **Step 3: Implement `packages/core/src/chat/code-mode.ts`**

```ts
import {createCodeMode} from '@tanstack/ai-code-mode'
import type {AnyTool} from '@tanstack/ai'
import type {ExtensionServerTool} from '@conciv/extension'
import {toChatTool} from './runtime.js'

const CODE_MODE_TIMEOUT_MS = 30_000

export function makeCodeMode(extensionTools: ExtensionServerTool[]): {tool: AnyTool; systemPrompt: string} | null {
  const safe = extensionTools.filter((tool) => tool.approval !== 'ask')
  if (safe.length === 0) return null
  const tools = safe.map((tool) =>
    toChatTool(tool, (args) => tool.execute(args, {sessionId: '', model: null}), {lazy: true}),
  )
  return createCodeMode({driver: makeDriver(), tools, timeout: CODE_MODE_TIMEOUT_MS})
}
```

IMPLEMENTATION NOTE (not a comment in code): the `ToolRequest` passed above is a placeholder — thread the real `sessionId`/`model` through by building code mode inside `buildChatTools`' session closure instead if the signature above proves too dry; the test in Step 1 pins only exclusion behavior, adjust construction freely. Resolve `makeDriver()` to the actual `@tanstack/ai-isolate-node` factory export (read its `index.d.ts`); pass `lazyToolsConfig` through if `createCodeMode` accepts it (docs say it does).

Add to `packages/protocol/src/harness-types.ts` capabilities:

```ts
codeMode?: boolean
```

In `packages/core/src/chat/run.ts` `buildRunStream`, after `config` is built:

```ts
const codeMode = deps.harness.capabilities.codeMode ? makeCodeMode(deps.extensionServerTools(sessionId)) : null
```

and in the `chat()` call:

```ts
systemPrompts: [deps.systemText, codeMode?.systemPrompt].filter((text): text is string => Boolean(text)),
tools: [...deps.tools(sessionId), ...(codeMode ? [codeMode.tool] : [])],
```

`ChatDeps` gains `extensionServerTools: (sessionId: string) => ExtensionServerTool[]` wired from `makeApp` where `buildExtensionTools` output already exists.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/core/test/chat/code-mode.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Enable capability on one harness and run its IT**

Set `codeMode: true` only on the harness the Task 1 spike proved compatible (likely claude). Run: `pnpm turbo run test --filter=@conciv/core`
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
- Produces: an IT scripting a turn whose wire stream includes a `__lazy__tool__discovery__` tool call part and a code-mode custom event, asserting the transcript still renders the assistant text (native assertions: `getByText`), no error boundary.

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
