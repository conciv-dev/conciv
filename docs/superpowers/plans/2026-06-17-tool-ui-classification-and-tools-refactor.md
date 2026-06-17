# Tool UI — Plan A: classification + tools refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the harness-agnostic tool-classification layer (pure functions the widget will call) and refactor `@opendui/aidx-tools` so tool definitions are the single source of truth, instantiated `.server()` for MCP today and `.client()` later.

**Architecture:** A `ToolKind`/`ClassifiedTool` contract lives in `@opendui/aidx-protocol`. Pure `classify(name, input)` functions (aidx tools in `@opendui/aidx-tools`; claude in `@opendui/aidx-harness` behind a browser-safe `./classify` entry; generic fallback) turn a tool-call's name + input into a `ClassifiedTool`. The tools package drops the `AidxMcpTool` re-wrap + double zod parse; `core` registers MCP tools from the bound server tools directly. This plan is pure logic + wiring — no UI. Plans B (renderers + Storybook), C (widget integration + mirror), D (structured done card) build on it.

**Tech Stack:** TypeScript (strict, NodeNext, no `any`/`as`), zod, `@tanstack/ai` `toolDefinition`, vitest, oxfmt/oxlint, pnpm + turbo. Package scope is `@opendui/aidx-*` (rename in progress).

**Conventions (AGENTS.md):** functions not classes; no IIFEs; one-line comments; oxfmt (no semicolons, single quotes, no bracket spacing, trailing commas, width 120). Pre-commit `prek` runs oxfmt+oxlint on staged files and will reformat Markdown/code on first run — if a commit aborts with "files were modified by this hook", re-stage and commit again.

---

## File structure

- `packages/protocol/src/tool-types.ts` (create) — `ToolKind`, `ToolFamily`, `ClassifiedTool`, `TOOL_KINDS`, `familyForKind`.
- `packages/protocol/package.json` (modify) — add `./tool-types` subpath export.
- `packages/protocol/test/tool-types.test.ts` (create) — runtime sanity for the const/map.
- `packages/tools/src/classify.ts` (create) — `classifyAidxTool(name, input): ClassifiedTool | null`.
- `packages/tools/test/classify.test.ts` (create).
- `packages/tools/src/types.ts` (modify) — remove `AidxMcpTool`; keep `AidxToolContext`; add `AidxServerTool` alias.
- `packages/tools/src/{page,test,ui,open}.ts` (modify) — export a `*ServerTool(ctx)` returning the bound tanstack `ServerTool` (drop the hand-rolled `{name,description,inputSchema,run}`).
- `packages/tools/src/tools.ts` (modify) — `aidxTools(ctx)` returns `AidxServerTool[]`.
- `packages/core/src/api/mcp/mcp.ts` (modify) — register from the server tool + def schema directly; validate args once at the boundary.
- `packages/harness/src/claude/classify.ts` (create) — `classifyClaudeTool(name, input): ClassifiedTool`.
- `packages/harness/src/classify.ts` (create) — `classifyTool(harnessId, name, input): ClassifiedTool` barrel.
- `packages/harness/package.json` (modify) — add a browser-safe `./classify` subpath export.
- `packages/harness/test/classify.test.ts` (create).
- `packages/tools/test/*.it.test.ts` (modify) — update to the new `aidxTools` shape.

---

## Task 1: ToolKind + ClassifiedTool contract in protocol

**Files:**

- Create: `packages/protocol/src/tool-types.ts`
- Modify: `packages/protocol/package.json`
- Test: `packages/protocol/test/tool-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/protocol/test/tool-types.test.ts
import {describe, it, expect} from 'vitest'
import {TOOL_KINDS, familyForKind, type ClassifiedTool} from '../src/tool-types.js'

describe('tool-types', () => {
  it('exposes every kind and a family for each', () => {
    expect(TOOL_KINDS).toContain('page-action')
    expect(TOOL_KINDS).toContain('unknown')
    for (const kind of TOOL_KINDS) expect(typeof familyForKind(kind)).toBe('string')
  })

  it('maps kinds to the expected family rails', () => {
    expect(familyForKind('page-action')).toBe('page')
    expect(familyForKind('shell')).toBe('code')
    expect(familyForKind('file-edit')).toBe('code')
    expect(familyForKind('test')).toBe('test')
    expect(familyForKind('file-read')).toBe('read')
    expect(familyForKind('unknown')).toBe('neutral')
  })

  it('ClassifiedTool shape compiles', () => {
    const c: ClassifiedTool = {kind: 'shell', title: 'Ran build', family: 'code', fields: {command: 'pnpm build'}}
    expect(c.kind).toBe('shell')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @opendui/aidx-protocol exec vitest run test/tool-types.test.ts`
Expected: FAIL — cannot find module `../src/tool-types.js`.

- [ ] **Step 3: Create the contract**

```ts
// packages/protocol/src/tool-types.ts
// Harness-independent taxonomy for rendering tool calls. The widget classifies each tool-call
// part into a ClassifiedTool and renders by `kind`; raw CLI names never reach the UI switch.

export const TOOL_KINDS = [
  'shell',
  'file-edit',
  'file-read',
  'search',
  'page-action',
  'test',
  'todo',
  'fetch',
  'ui',
  'unknown',
] as const

export type ToolKind = (typeof TOOL_KINDS)[number]

// The color rail / grouping a kind renders under.
export type ToolFamily = 'page' | 'code' | 'test' | 'read' | 'neutral'

const FAMILY: Record<ToolKind, ToolFamily> = {
  shell: 'code',
  'file-edit': 'code',
  'file-read': 'read',
  search: 'read',
  'page-action': 'page',
  test: 'test',
  todo: 'neutral',
  fetch: 'read',
  ui: 'neutral',
  unknown: 'neutral',
}

export function familyForKind(kind: ToolKind): ToolFamily {
  return FAMILY[kind]
}

// The normalized view the UI renders from. `title` is a human label; `fields` is kind-specific
// data the renderer reads (e.g. {command} for shell, {file, added, removed} for file-edit).
export type ClassifiedTool = {
  kind: ToolKind
  title: string
  family: ToolFamily
  fields: Record<string, unknown>
}
```

- [ ] **Step 4: Add the subpath export**

In `packages/protocol/package.json`, inside `"exports"`, add an entry alongside the existing `./ui-types` block:

```json
    "./tool-types": {
      "types": "./dist/tool-types.d.ts",
      "import": "./dist/tool-types.js"
    },
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm --filter @opendui/aidx-protocol exec vitest run test/tool-types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/tool-types.ts packages/protocol/package.json packages/protocol/test/tool-types.test.ts
git commit -m "feat(protocol): ToolKind + ClassifiedTool tool taxonomy"
```

---

## Task 2: aidx\_\* classifier (pure)

The `aidx_*` tools are aidx-owned and classify identically on every harness. `classifyAidxTool`
returns `null` for non-aidx names so the barrel can fall through. It must tolerate partial/missing
input (args stream in).

**Files:**

- Create: `packages/tools/src/classify.ts`
- Test: `packages/tools/test/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/tools/test/classify.test.ts
import {describe, it, expect} from 'vitest'
import {classifyAidxTool} from '../src/classify.js'

describe('classifyAidxTool', () => {
  it('returns null for non-aidx tools', () => {
    expect(classifyAidxTool('Bash', {command: 'ls'})).toBeNull()
  })

  it('classifies aidx_page click with a human title', () => {
    const c = classifyAidxTool('aidx_page', {verb: 'click', selector: 'button.save'})
    expect(c).not.toBeNull()
    expect(c?.kind).toBe('page-action')
    expect(c?.family).toBe('page')
    expect(c?.title).toBe('Clicked button.save')
    expect(c?.fields.verb).toBe('click')
  })

  it('classifies aidx_page fill with the typed value', () => {
    const c = classifyAidxTool('aidx_page', {verb: 'fill', selector: '#name', value: 'Ada'})
    expect(c?.title).toBe('Typed "Ada" into #name')
  })

  it('tolerates missing input (streaming)', () => {
    const c = classifyAidxTool('aidx_page', {})
    expect(c?.kind).toBe('page-action')
    expect(c?.title).toBe('Page action')
  })

  it('classifies aidx_test run', () => {
    const c = classifyAidxTool('aidx_test', {action: 'run', pattern: 'widget'})
    expect(c?.kind).toBe('test')
    expect(c?.title).toBe('Ran tests: widget')
  })

  it('classifies aidx_ui and aidx_open', () => {
    expect(classifyAidxTool('aidx_ui', {kind: 'form'})?.kind).toBe('ui')
    expect(classifyAidxTool('aidx_ui', {kind: 'form'})?.title).toBe('Rendered form')
    expect(classifyAidxTool('aidx_open', {file: 'src/a.ts', line: 12})?.kind).toBe('file-read')
    expect(classifyAidxTool('aidx_open', {file: 'src/a.ts'})?.title).toBe('Opened src/a.ts')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run test/classify.test.ts`
Expected: FAIL — cannot find module `../src/classify.js`.

- [ ] **Step 3: Implement the classifier**

```ts
// packages/tools/src/classify.ts
import type {ClassifiedTool} from '@opendui/aidx-protocol/tool-types'

// Read a string field off an unknown input bag without throwing on partial/streaming args.
function str(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

// The element a page verb targets, in priority order (selector, then component name, then ref).
function pageTarget(input: unknown): string | undefined {
  return str(input, 'selector') ?? str(input, 'name') ?? str(input, 'ref')
}

// Human label for an aidx_page verb. `t` is the resolved target (may be undefined while streaming).
function pageTitle(verb: string | undefined, input: unknown): string {
  const t = pageTarget(input)
  const at = t ? ` ${t}` : ''
  const value = str(input, 'value') ?? str(input, 'text')
  switch (verb) {
    case 'click':
      return `Clicked${at || ' element'}`
    case 'fill':
      return value ? `Typed "${value}" into${at || ' field'}` : `Filled${at || ' field'}`
    case 'select':
      return value ? `Selected "${value}"` : `Selected an option${at}`
    case 'check':
      return `Checked${at || ' box'}`
    case 'uncheck':
      return `Unchecked${at || ' box'}`
    case 'press':
      return `Pressed ${str(input, 'key') ?? 'a key'}`
    case 'hover':
      return `Hovered${at || ' element'}`
    case 'scroll':
      return 'Scrolled'
    case 'submit':
      return `Submitted${at || ' the form'}`
    case 'find':
      return `Found${at || ' elements'}`
    case 'locate':
      return `Located${at || ' element'}`
    case 'inspect':
      return `Inspected${at || ' element'}`
    case 'tree':
      return 'Read the page tree'
    case 'wait':
      return `Waited for${at || ' the page'}`
    case 'eval':
      return 'Ran a script on the page'
    case undefined:
      return 'Page action'
    default:
      return `${verb}${at}`
  }
}

function testTitle(input: unknown): string {
  const action = str(input, 'action')
  const pattern = str(input, 'pattern')
  if (action === 'run') return pattern ? `Ran tests: ${pattern}` : 'Ran tests'
  if (action === 'list') return 'Listed tests'
  if (action === 'status') return 'Checked test status'
  return 'Tests'
}

// Classify an aidx-owned tool by name + input. Returns null for any other tool so the harness
// barrel can fall through to a CLI classifier or the generic fallback.
export function classifyAidxTool(name: string, input: unknown): ClassifiedTool | null {
  if (name === 'aidx_page') {
    const verb = str(input, 'verb')
    return {kind: 'page-action', family: 'page', title: pageTitle(verb, input), fields: {verb, ...asFields(input)}}
  }
  if (name === 'aidx_test') {
    return {kind: 'test', family: 'test', title: testTitle(input), fields: asFields(input)}
  }
  if (name === 'aidx_ui') {
    const k = str(input, 'kind')
    return {kind: 'ui', family: 'neutral', title: k ? `Rendered ${k}` : 'Rendered UI', fields: asFields(input)}
  }
  if (name === 'aidx_open') {
    const file = str(input, 'file')
    return {
      kind: 'file-read',
      family: 'read',
      title: file ? `Opened ${file}` : 'Opened a file',
      fields: asFields(input),
    }
  }
  return null
}

// Shallow object-or-empty, so `fields` is always a plain record even on partial input.
function asFields(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? {...(input as Record<string, unknown>)} : {}
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm --filter @opendui/aidx-tools exec vitest run test/classify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/classify.ts packages/tools/test/classify.test.ts
git commit -m "feat(tools): pure classifier for aidx_* tools"
```

---

## Task 3: claude classifier + harness classify barrel

`classifyClaudeTool` maps claude's built-in tool names to kinds/titles. `classifyTool` is the
browser-safe barrel: aidx tools first (harness-independent), then the per-harness classifier, then
a generic fallback. Both files are pure (no node imports) so the widget can import them.

**Files:**

- Create: `packages/harness/src/claude/classify.ts`
- Create: `packages/harness/src/classify.ts`
- Modify: `packages/harness/package.json`
- Test: `packages/harness/test/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/test/classify.test.ts
import {describe, it, expect} from 'vitest'
import {classifyTool} from '../src/classify.js'

describe('classifyTool', () => {
  it('classifies claude Bash as shell', () => {
    const c = classifyTool('claude', 'Bash', {command: 'pnpm build'})
    expect(c.kind).toBe('shell')
    expect(c.family).toBe('code')
    expect(c.title).toBe('Ran pnpm build')
  })

  it('classifies Edit/Write/Read/Grep', () => {
    expect(classifyTool('claude', 'Edit', {file_path: 'a.css'}).kind).toBe('file-edit')
    expect(classifyTool('claude', 'Write', {file_path: 'a.css'}).title).toBe('Wrote a.css')
    expect(classifyTool('claude', 'Read', {file_path: 'a.css'}).kind).toBe('file-read')
    expect(classifyTool('claude', 'Grep', {pattern: 'foo'}).kind).toBe('search')
    expect(classifyTool('claude', 'TodoWrite', {}).kind).toBe('todo')
  })

  it('routes aidx tools through the shared classifier regardless of harness', () => {
    expect(classifyTool('codex', 'aidx_page', {verb: 'click', selector: 'b'}).kind).toBe('page-action')
  })

  it('falls back to unknown for unmapped tools and harnesses', () => {
    const a = classifyTool('claude', 'mcp__foo__bar', {})
    expect(a.kind).toBe('unknown')
    expect(a.title).toBe('mcp__foo__bar')
    const b = classifyTool('gemini-cli', 'shell_command', {})
    expect(b.kind).toBe('unknown')
  })

  it('tolerates missing input', () => {
    expect(classifyTool('claude', 'Bash', {}).title).toBe('Ran a command')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/classify.test.ts`
Expected: FAIL — cannot find module `../src/classify.js`.

- [ ] **Step 3: Implement the claude classifier**

```ts
// packages/harness/src/claude/classify.ts
import type {ClassifiedTool} from '@opendui/aidx-protocol/tool-types'

function str(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const v = (input as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function fields(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? {...(input as Record<string, unknown>)} : {}
}

// claude's built-in tool names -> ClassifiedTool. Returns null for names this classifier does not
// know (the barrel then uses the generic fallback).
export function classifyClaudeTool(name: string, input: unknown): ClassifiedTool | null {
  const f = fields(input)
  switch (name) {
    case 'Bash': {
      const cmd = str(input, 'command')
      return {kind: 'shell', family: 'code', title: cmd ? `Ran ${cmd}` : 'Ran a command', fields: f}
    }
    case 'Read':
      return {kind: 'file-read', family: 'read', title: label('Read', str(input, 'file_path')), fields: f}
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return {kind: 'file-edit', family: 'code', title: label('Edited', str(input, 'file_path')), fields: f}
    case 'Write':
      return {kind: 'file-edit', family: 'code', title: label('Wrote', str(input, 'file_path')), fields: f}
    case 'Grep':
      return {kind: 'search', family: 'read', title: label('Searched', str(input, 'pattern')), fields: f}
    case 'Glob':
      return {kind: 'search', family: 'read', title: label('Globbed', str(input, 'pattern')), fields: f}
    case 'TodoWrite':
      return {kind: 'todo', family: 'neutral', title: 'Updated the to-do list', fields: f}
    case 'WebFetch':
      return {kind: 'fetch', family: 'read', title: label('Fetched', str(input, 'url')), fields: f}
    case 'WebSearch':
      return {kind: 'fetch', family: 'read', title: label('Searched the web for', str(input, 'query')), fields: f}
    case 'Task':
      return {kind: 'unknown', family: 'neutral', title: label('Ran a subagent:', str(input, 'description')), fields: f}
    default:
      return null
  }
}

// "Verb target" with a graceful fallback when the target arg has not streamed in yet.
function label(verb: string, target: string | undefined): string {
  return target ? `${verb} ${target}` : `${verb} …`
}
```

- [ ] **Step 4: Implement the barrel + generic fallback**

```ts
// packages/harness/src/classify.ts
import type {ClassifiedTool} from '@opendui/aidx-protocol/tool-types'
import {classifyAidxTool} from '@opendui/aidx-tools/classify'
import {classifyClaudeTool} from './claude/classify.js'

// Per-harness classifiers, keyed by harness id. Each is pure and browser-safe. Harnesses without
// an entry fall through to the generic fallback (still render, just without rich per-kind bodies).
const HARNESS: Record<string, (name: string, input: unknown) => ClassifiedTool | null> = {
  claude: classifyClaudeTool,
}

// Classify any tool call into a ClassifiedTool. aidx-owned tools win first (harness-independent),
// then the active harness's classifier, then a generic fallback. Tolerates partial input.
export function classifyTool(harnessId: string, name: string, input: unknown): ClassifiedTool {
  const aidx = classifyAidxTool(name, input)
  if (aidx) return aidx
  const byHarness = HARNESS[harnessId]?.(name, input)
  if (byHarness) return byHarness
  return {kind: 'unknown', family: 'neutral', title: name, fields: asFields(input)}
}

function asFields(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? {...(input as Record<string, unknown>)} : {}
}
```

- [ ] **Step 5: Export the browser-safe `./classify` entry**

`classifyAidxTool` is imported from `@opendui/aidx-tools/classify`. First add that subpath export to
`packages/tools/package.json` `"exports"` (alongside the package's main entry):

```json
    "./classify": {
      "types": "./dist/classify.d.ts",
      "import": "./dist/classify.js"
    },
```

Then add the `./classify` subpath to `packages/harness/package.json` `"exports"`:

```json
    "./classify": {
      "types": "./dist/classify.d.ts",
      "import": "./dist/classify.js"
    },
```

If either package's `tsdown.config.ts` lists explicit `entry` files, add `src/classify.ts` (and for
tools it is already covered if the config globs `src/*.ts`; otherwise add it). Verify after building
in Step 7.

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @opendui/aidx-harness exec vitest run test/classify.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Verify the new entries build and are pure**

Run: `pnpm turbo run build --filter=@opendui/aidx-tools --filter=@opendui/aidx-harness`
Expected: builds emit `dist/classify.js` + `dist/classify.d.ts` in both packages. Then confirm the
harness classify entry pulls no node builtins:

Run: `node -e "import('@opendui/aidx-harness/classify').then(m => console.log(typeof m.classifyTool))"`
Expected: prints `function` with no error.

- [ ] **Step 8: Commit**

```bash
git add packages/harness/src/classify.ts packages/harness/src/claude/classify.ts packages/harness/test/classify.test.ts packages/harness/package.json packages/tools/package.json
git commit -m "feat(harness): browser-safe tool classify barrel (claude + generic)"
```

---

## Task 4: refactor @opendui/aidx-tools to bound server tools

Drop the `AidxMcpTool` re-wrap and the double zod parse. Each tool module exports a factory
returning the bound tanstack `ServerTool`; `aidxTools(ctx)` returns the list. Validation moves to a
single boundary in `core` (Task 5).

**Files:**

- Modify: `packages/tools/src/types.ts`
- Modify: `packages/tools/src/{page,test,ui,open}.ts`
- Modify: `packages/tools/src/tools.ts`

- [ ] **Step 1: Replace the tool view type**

In `packages/tools/src/types.ts`, delete the `AidxMcpTool` type and replace it with an alias for the
tanstack server tool (keep `AidxToolContext` unchanged):

```ts
import type {ServerTool} from '@tanstack/ai'

// A bound aidx tool as tanstack produces it: name, description, the zod inputSchema, and a
// validated `execute`. The MCP server iterates these directly (no hand-rolled wrapper).
export type AidxServerTool = ServerTool<z.ZodObject<z.ZodRawShape>, z.ZodTypeAny, string>
```

(Keep the existing `import {z} from 'zod'` and the `AidxToolContext` definition.)

- [ ] **Step 2: Convert each tool module to a server-tool factory**

`packages/tools/src/ui.ts` — replace `aidxUiTool` with:

```ts
import type {AidxServerTool, AidxToolContext} from './types.js'

export function aidxUiServerTool(ctx: AidxToolContext): AidxServerTool {
  return aidxUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    const injected = ctx.injectUi(buildUiSpec(input, renderId))
    return {renderId, injected}
  }) as AidxServerTool
}
```

`packages/tools/src/page.ts` — replace `aidxPageTool` with:

```ts
import type {AidxServerTool, AidxToolContext} from './types.js'

export function aidxPageServerTool(ctx: AidxToolContext): AidxServerTool {
  return aidxPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input})) as AidxServerTool
}
```

`packages/tools/src/test.ts` — replace `aidxTestTool` with:

```ts
import type {AidxServerTool, AidxToolContext} from './types.js'

export function aidxTestServerTool(ctx: AidxToolContext): AidxServerTool {
  return aidxTestToolDef.server(async ({action, pattern}) => ctx.test({kind: action, pattern})) as AidxServerTool
}
```

`packages/tools/src/open.ts` — replace `aidxOpenTool` with:

```ts
import type {AidxServerTool, AidxToolContext} from './types.js'

export function aidxOpenServerTool(ctx: AidxToolContext): AidxServerTool {
  return aidxOpenToolDef.server(async ({file, line}) => {
    ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  }) as AidxServerTool
}
```

Note: the `as AidxServerTool` here narrows tanstack's generic `ServerTool` to the erased alias used
by the MCP iterator; it is the one sanctioned cast at this boundary (the SDK validates args against
`inputSchema` before `execute` runs). If `tsc` accepts the assignment without the cast, drop it.

- [ ] **Step 3: Update the registry barrel**

`packages/tools/src/tools.ts`:

```ts
import type {AidxServerTool, AidxToolContext} from './types.js'
import {aidxPageServerTool} from './page.js'
import {aidxTestServerTool} from './test.js'
import {aidxUiServerTool} from './ui.js'
import {aidxOpenServerTool} from './open.js'

export type {AidxServerTool, AidxToolContext} from './types.js'
export {classifyAidxTool} from './classify.js'

// The aidx tool list as bound tanstack server tools, in one place so the MCP server (and tests)
// get them with a single import.
export function aidxTools(ctx: AidxToolContext): AidxServerTool[] {
  return [aidxUiServerTool(ctx), aidxPageServerTool(ctx), aidxTestServerTool(ctx), aidxOpenServerTool(ctx)]
}
```

- [ ] **Step 4: Typecheck the package**

Run: `pnpm --filter @opendui/aidx-tools typecheck`
Expected: PASS (no `any`, no unused `AidxMcpTool`). If `ServerTool` is not exported from
`@tanstack/ai`, import it from `@tanstack/ai/client` instead and adjust `types.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src
git commit -m "refactor(tools): expose bound server tools, drop AidxMcpTool re-wrap"
```

---

## Task 5: register MCP tools from the server tools directly

`core/src/api/mcp/mcp.ts` iterates `aidxTools(ctx)` and calls `tool.run`. Switch it to call the
server tool's `execute`, validating once against the def schema at the boundary.

**Files:**

- Modify: `packages/core/src/api/mcp/mcp.ts`

- [ ] **Step 1: Update the registration loop**

Replace the `for (const tool of aidxTools(ctx))` block in `buildServer` with:

```ts
for (const tool of aidxTools(ctx)) {
  server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape}, async (args) => {
    // The SDK validated `args` against inputSchema; parse once more to hand `execute` typed input.
    const result = await tool.execute(tool.inputSchema.parse(args))
    return {content: [{type: 'text', text: JSON.stringify(result)}]}
  })
}
```

Keep the import as `import {aidxTools, type AidxToolContext} from '@opendui/aidx-tools'`.

- [ ] **Step 2: Typecheck core**

Run: `pnpm --filter @opendui/aidx-core typecheck`
Expected: PASS. If `tool.execute`'s signature requires a second context arg, pass `undefined`:
`tool.execute(tool.inputSchema.parse(args), undefined)`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/api/mcp/mcp.ts
git commit -m "refactor(core): register MCP tools from bound server tools"
```

---

## Task 6: update tools integration tests to the new shape

The existing ITs (`tools/test/*.it.test.ts`) build tools via the old `aidx*Tool(ctx)` returning
`{run}`. Update them to the server-tool shape (`aidx*ServerTool(ctx).execute`) so they validate the
real path.

**Files:**

- Modify: `packages/tools/test/ui-tool.it.test.ts`
- Modify: `packages/tools/test/page-tool.it.test.ts`
- Modify: `packages/tools/test/test-tool.it.test.ts`
- Modify: `packages/tools/test/open-tool.it.test.ts`

- [ ] **Step 1: Read each IT to see how it invokes the tool**

Run: `grep -n "Tool(\|\\.run(\|aidxTools" packages/tools/test/*.it.test.ts`
Expected: each test constructs a tool and calls `.run(args)`.

- [ ] **Step 2: Swap `.run(args)` for `.execute(parsedArgs)`**

For each IT, change the import + call. Example for `open-tool.it.test.ts`:

```ts
import {aidxOpenServerTool} from '../src/open.js'
import {OpenInput} from '../src/open.js'
// ...
const tool = aidxOpenServerTool(ctx)
const result = await tool.execute(OpenInput.parse({file: 'src/a.ts', line: 3}))
```

Apply the analogous rename in the other three (`aidxPageServerTool` + `PageInput`,
`aidxTestServerTool` + `TestInput`, `aidxUiServerTool` + `UiInput`). The MCP-shape assertions on
`tool.run`/`tool.inputSchema` become assertions on the returned `execute` result.

- [ ] **Step 3: Run the tools test suite**

Run: `pnpm --filter @opendui/aidx-tools test`
Expected: PASS (classifier unit test + the four updated ITs).

- [ ] **Step 4: Commit**

```bash
git add packages/tools/test
git commit -m "test(tools): update ITs to bound server-tool shape"
```

---

## Task 7: full-package verification

- [ ] **Step 1: Typecheck + build + test the touched packages via turbo**

Run: `pnpm turbo run typecheck build test --filter=@opendui/aidx-protocol --filter=@opendui/aidx-tools --filter=@opendui/aidx-harness --filter=@opendui/aidx-core`
Expected: all green.

- [ ] **Step 2: Lint + format check**

Run: `pnpm lint && pnpm format:check`
Expected: clean (oxlint + oxfmt).

- [ ] **Step 3: Final commit if anything was auto-fixed**

```bash
git add -A
git commit -m "chore(tools): formatting + lint after classification layer" || echo "nothing to commit"
```

---

## Self-review notes (author)

- Spec coverage: implements the canonical `ToolKind`/`ClassifiedTool` contract, the client-side
  classifiers (aidx\_* + claude + generic barrel, browser-safe entries), and the tools refactor
  (drop `AidxMcpTool`, bound server tools, simplified `core/mcp.ts`). The widget *consuming\*
  `classifyTool` is Plan C; renderers are Plan B; the structured done card is Plan D.
- The one `as AidxServerTool` cast is called out with a "drop if `tsc` accepts" instruction;
  everything else avoids `as` per AGENTS.md.
- Open dependency to confirm during execution: whether `ServerTool` is exported from `@tanstack/ai`
  vs `@tanstack/ai/client`, and whether `tsdown.config.ts` needs `src/classify.ts` added as an
  entry (Step 3.5 / 3.7 verify both).
