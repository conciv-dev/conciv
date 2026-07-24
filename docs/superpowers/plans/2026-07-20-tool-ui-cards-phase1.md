# Tool-UI Cards Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purpose-built cards for `execute_typescript`, `discover_tools`, `__lazy__tool__discovery__`, and `conciv_extensions` in `@conciv/ui-kit-chat-tools` — no owned tool ever hits the generic fallback.

**Architecture:** Four new styled cards registered in `builtinToolCards` (`ToolCardEntry {names, render}`); a shared `ToolChip` (chip + Ark `Tooltip` from `@conciv/ui-kit-system`) and a pure `schemaParams` formatter feed both discovery cards; code/type-stub highlighting reuses the `Markdown` shiki path from `@conciv/ui-kit-chat` via fenced ```ts blocks. Spec: `docs/superpowers/specs/2026-07-20-tool-ui-cards-design.md`.

**Tech Stack:** Solid, `@conciv/ui-kit-chat` (`ToolCard`, `CollapsibleCard`, `parseInput`, `resultText`, `Markdown`), `@conciv/ui-kit-system` (`Tooltip`), zod, storybook-solidjs-vite stories with `storybook/test` play functions, embed widget IT.

## Global Constraints

- Functions, not classes. No IIFEs. ZERO code comments. No `any`/`as`/`@ts-ignore`/non-null `!`. No `else` where guard clauses work.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- UnoCSS utility classes + `--chat-*` tokens only; NEW utility classes need an embed rebuild to appear (css generated at embed build). No arbitrary CSS properties beyond the `[prop:value]` escapes already used in neighboring cards.
- Failure rule (spec): output `success: false` renders the failure state (red icon, error surfaced) — never a success dot.
- Chips: compact `inline-flex` cloud; hover/focus tooltip = description + params line; never raw JSON schema.
- Cards: expanded while `part.state` is active/running, collapse when settled (follow how `CollapsibleCard` consumers do this today — read `bash-card.tsx` first).
- `part.input` is ALWAYS empty — read args via `parseInput(schema, props.part)` (parses `part.arguments`).
- Tests: stories with play functions per card per state; no jsdom; Solid packages pin `test: {environment: 'node'}` in vitest configs (already set — do not change).
- Storybook checks: run the storybook test suite the way CI does (see `apps/storybook`; NEVER run it while the user's own storybook dev server is running — check `lsof -ti tcp:6006 -sTCP:LISTEN` first and stop if occupied).
- Widget ITs load the PREBUILT bundle: `pnpm turbo run build --filter=@conciv/embed` first; `browser.newPage()`; never `networkidle`.
- Commit with pathspec. Do not push.

---

### Task 1: `schemaParams` formatter + shared `ToolChip`

**Files:**

- Create: `packages/ui-kit-chat-tools/src/primitives/tools/schema-params.ts`
- Create: `packages/ui-kit-chat-tools/src/styled/tools/tool-chip.tsx`
- Create: `packages/ui-kit-chat-tools/src/styled/tools/tool-chip.stories.tsx`
- Test: `packages/ui-kit-chat-tools/test/schema-params.test.ts` (create; mirror the package's existing vitest setup — if the package has no `test/` dir yet, add `vitest.config.ts` copying a sibling Solid package's config with `test: {environment: 'node'}`)
- Modify: `packages/ui-kit-chat-tools/src/index.tsx` (exports)

**Interfaces:**

- Produces: `schemaParams(schema: unknown): string` — accepts a JSON-schema-shaped object (`{properties?: Record<string, {type?: string}>, required?: string[]}` parsed via zod), returns `'seconds: number · keyframes?: number'` style (required first, optional suffixed `?`); returns `''` for no/empty properties. `ToolChip(props: {name: string, tone?: 'new' | 'bad', tip?: JSX.Element}): JSX.Element` — chip with optional Ark tooltip (`Tooltip` from `@conciv/ui-kit-system`). Tasks 3 and 4 consume both.

- [ ] **Step 1: Write the failing test**

```ts
import {expect, test} from 'vitest'
import {schemaParams} from '../src/primitives/tools/schema-params.js'

test('renders required then optional params with types', () => {
  const schema = {
    type: 'object',
    properties: {seconds: {type: 'number'}, keyframes: {type: 'number'}, label: {type: 'string'}},
    required: ['seconds'],
  }
  expect(schemaParams(schema)).toBe('seconds: number · keyframes?: number · label?: string')
})

test('empty or foreign input renders empty string', () => {
  expect(schemaParams({})).toBe('')
  expect(schemaParams(null)).toBe('')
  expect(schemaParams({properties: {}})).toBe('')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @conciv/ui-kit-chat-tools exec vitest run test/schema-params.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `schema-params.ts`**

```ts
import {z} from 'zod'

const JsonSchemaShape = z.object({
  properties: z.record(z.string(), z.object({type: z.string().optional()}).loose()).optional(),
  required: z.array(z.string()).optional(),
})

export function schemaParams(schema: unknown): string {
  const parsed = JsonSchemaShape.safeParse(schema)
  if (!parsed.success) return ''
  const properties = parsed.data.properties ?? {}
  const required = new Set(parsed.data.required ?? [])
  const names = Object.keys(properties)
  const ordered = [...names.filter((name) => required.has(name)), ...names.filter((name) => !required.has(name))]
  return ordered
    .map((name) => `${name}${required.has(name) ? '' : '?'}: ${properties[name]?.type ?? 'unknown'}`)
    .join(' · ')
}
```

(zod version note: if `.loose()` does not exist on the installed zod, use `.passthrough()` — check `packages/ui-kit-chat-tools/package.json` zod version and pick the one that typechecks.)

- [ ] **Step 4: Implement `tool-chip.tsx`**

`Tooltip` is Ark's compound component re-exported from `@conciv/ui-kit-system` (already a dependency of this package) — `Tooltip.Root` / `Tooltip.Trigger` / `Tooltip.Positioner` / `Tooltip.Content`, verified in `packages/ui-kit-system/src/tooltip.tsx` and used in `tooltip-icon-button.tsx`. There is NO `content` prop.

```tsx
import {Show, type JSX} from 'solid-js'
import {Tooltip} from '@conciv/ui-kit-system'

const TONE = {
  new: '[border-color:color-mix(in_srgb,var(--chat-accent)_45%,transparent)] [color:var(--chat-accent)]',
  bad: '[border-color:var(--chat-danger-line)] [color:var(--chat-danger)]',
}

const CHIP =
  'inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--chat-radius-pill)] px-2 py-0.5 text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)]'

export function ToolChip(props: {name: string; tone?: 'new' | 'bad'; tip?: JSX.Element}): JSX.Element {
  return (
    <Show when={props.tip} fallback={<span class={`${CHIP} ${props.tone ? TONE[props.tone] : ''}`}>{props.name}</span>}>
      <Tooltip.Root>
        <Tooltip.Trigger class={`${CHIP} ${props.tone ? TONE[props.tone] : ''}`}>{props.name}</Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>{props.tip}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
    </Show>
  )
}
```

Ark tooltips in the widget shadow DOM rely on the `EnvironmentProvider` the host already supplies — no extra wiring here.

- [ ] **Step 5: Write `tool-chip.stories.tsx`** following `todo-card.stories.tsx` structure exactly (same `frame` helper, `chat-theme-dark` + a light story): stories `Plain`, `Accent` (tone new + tip with description and a params line), `Error` (tone bad). Play function on `Accent`: `userEvent.hover` the chip, `waitFor` the tooltip text visible via `within(...).findByText`.

- [ ] **Step 6: Export from `index.tsx`**

```ts
export {schemaParams} from './primitives/tools/schema-params.js'
export {ToolChip} from './styled/tools/tool-chip.js'
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @conciv/ui-kit-chat-tools exec vitest run test/schema-params.test.ts && pnpm --filter @conciv/ui-kit-chat-tools typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui-kit-chat-tools/src/primitives/tools/schema-params.ts packages/ui-kit-chat-tools/src/styled/tools/tool-chip.tsx packages/ui-kit-chat-tools/src/styled/tools/tool-chip.stories.tsx packages/ui-kit-chat-tools/test/schema-params.test.ts packages/ui-kit-chat-tools/src/index.tsx
git commit -m "feat(ui-kit-chat-tools): schemaParams formatter + ToolChip with tooltip" -- packages/ui-kit-chat-tools/src/primitives/tools/schema-params.ts packages/ui-kit-chat-tools/src/styled/tools/tool-chip.tsx packages/ui-kit-chat-tools/src/styled/tools/tool-chip.stories.tsx packages/ui-kit-chat-tools/test/schema-params.test.ts packages/ui-kit-chat-tools/src/index.tsx
```

(Include `vitest.config.ts` in the pathspec if you had to create it.)

---

### Task 2: CodeRunCard — `execute_typescript`

**Files:**

- Create: `packages/ui-kit-chat-tools/src/styled/tools/code-run-card.tsx`
- Create: `packages/ui-kit-chat-tools/src/styled/tools/code-run-card.stories.tsx`
- Modify: `packages/ui-kit-chat-tools/src/styled/tools/builtin-tool-cards.ts`, `packages/ui-kit-chat-tools/src/index.tsx`

**Interfaces:**

- Consumes: `ToolCardProps {part, result, ctx}` from `@conciv/protocol/tool-view-types`; `parseInput`, `resultText`, `CollapsibleCard`, `Markdown` from `@conciv/ui-kit-chat`.
- Produces: `CodeRunCard(props: ToolCardProps): JSX.Element`; `codeRunTool: ToolCardEntry = {names: ['execute_typescript'], render: CodeRunCard}`. Task 5's IT asserts its rendered text.

- [ ] **Step 1: Write the stories first (they are the failing test)** — `code-run-card.stories.tsx` with the `todo-card.stories.tsx` frame/ctx pattern. Wire data uses the REAL shapes:

```tsx
const CODE = `const drawn = await external_canvas_draw({elements})\nconsole.log('committed', drawn.ids)\nreturn drawn.ids`

function part(state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'c1',
    name: 'execute_typescript',
    arguments: JSON.stringify({typescriptCode: CODE}),
    state,
  }
}

const okResult = JSON.stringify({success: true, result: ['el_9f2'], logs: ['committed ["el_9f2"]']})
const failResult = JSON.stringify({
  success: false,
  error: {message: "Unexpected token '.'", name: 'SyntaxError', line: 2},
})
```

Stories: `Running` (state not settled, no result — expect code visible, no result section), `Success` (play: `findByText('committed ["el_9f2"]')` and the result chip text), `Failure` (play: `findByText(/SyntaxError/)` and `findByText(/line 2/)`; assert the error text is present and NO success indicator — assert via the accessible status text the card renders, e.g. `queryByText('failed')` truthy).

- [ ] **Step 2: Run stories to verify they fail** — run the storybook test suite per the repo's CI command for `apps/storybook` scoped to this package's stories (read `apps/storybook` README/package.json for the exact runner; check port 6006 is free first). Expected: FAIL (component missing).

- [ ] **Step 3: Implement `code-run-card.tsx`**

```tsx
import {Show, type JSX} from 'solid-js'
import {Code} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CollapsibleCard, Markdown, parseInput, resultText} from '@conciv/ui-kit-chat'

const Input = z.object({typescriptCode: z.string()})
const Output = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: z.object({message: z.string(), name: z.string().optional(), line: z.number().optional()}).optional(),
})

function parseOutput(result: ToolCardProps['result']): z.infer<typeof Output> | null {
  const text = resultText(result)
  if (!text) return null
  const json = safeJson(text)
  const parsed = Output.safeParse(json)
  return parsed.success ? parsed.data : null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function firstLine(code: string): string {
  return (
    code
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ''
  )
}

export function CodeRunCard(props: ToolCardProps): JSX.Element {
  const code = () => parseInput(Input, props.part)?.typescriptCode ?? ''
  const output = () => parseOutput(props.result)
  const failed = () => output()?.success === false
  return (
    <CollapsibleCard
      header={
        <>
          <Code
            size={14}
            class={`shrink-0 ${failed() ? 'text-[color:var(--chat-danger)]' : 'text-[color:var(--chat-text-3)]'}`}
            aria-hidden="true"
          />
          <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">run code</span>
          <span class="truncate text-[color:var(--chat-text-3)]">{firstLine(code())}</span>
          <Show when={failed()}>
            <span class="text-[length:var(--chat-text-xs)] text-[color:var(--chat-danger)]">failed</span>
          </Show>
        </>
      }
    >
      <div class="flex flex-col gap-2">
        <Markdown content={`\`\`\`ts\n${code()}\n\`\`\``} />
        <Show when={(output()?.logs?.length ?? 0) > 0}>
          <span class="text-[length:0.625rem] uppercase tracking-[0.08em] text-[color:var(--chat-text-3)]">
            console
          </span>
          <pre class="m-0 overflow-x-auto rounded-[var(--chat-radius-sm)] border-l-2 border-[color:var(--chat-line)] p-2 text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [font-family:var(--chat-mono)]">
            {output()?.logs?.join('\n')}
          </pre>
        </Show>
        <Show when={output()?.success === true && output()?.result !== undefined}>
          <span class="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--chat-radius-sm)] px-2 py-0.5 text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [font-family:var(--chat-mono)]">
            {JSON.stringify(output()?.result)}
          </span>
        </Show>
        <Show when={output()?.error}>
          <div class="overflow-x-auto rounded-[var(--chat-radius-sm)] p-2 text-[length:var(--chat-text-xs)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)] [font-family:var(--chat-mono)]">
            {output()?.error?.name ?? 'Error'}: {output()?.error?.message}
            <Show when={output()?.error?.line !== undefined}>
              <span class="text-[color:var(--chat-text-3)]"> · line {output()?.error?.line}</span>
            </Show>
          </div>
        </Show>
      </div>
    </CollapsibleCard>
  )
}

export const codeRunTool: ToolCardEntry = {names: ['execute_typescript'], render: CodeRunCard}
```

Adapt to `CollapsibleCard`'s real props (read `bash-card.tsx` and `collapsible-card.tsx` first — including how expanded-while-running is driven; if `CollapsibleCard` takes an `open`/`defaultOpen` signal from part state, wire it the same way BashCard does).

- [ ] **Step 4: Register + export** — in `builtin-tool-cards.ts` add `codeRunTool` to the array; in `index.tsx` export `{CodeRunCard, codeRunTool}`.

- [ ] **Step 5: Run stories, expect PASS; run `pnpm --filter @conciv/ui-kit-chat-tools typecheck`.**

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit-chat-tools/src/styled/tools/code-run-card.tsx packages/ui-kit-chat-tools/src/styled/tools/code-run-card.stories.tsx packages/ui-kit-chat-tools/src/styled/tools/builtin-tool-cards.ts packages/ui-kit-chat-tools/src/index.tsx
git commit -m "feat(ui-kit-chat-tools): CodeRunCard for execute_typescript" -- packages/ui-kit-chat-tools/src/styled/tools/code-run-card.tsx packages/ui-kit-chat-tools/src/styled/tools/code-run-card.stories.tsx packages/ui-kit-chat-tools/src/styled/tools/builtin-tool-cards.ts packages/ui-kit-chat-tools/src/index.tsx
```

---

### Task 3: DiscoveredApisCard — `discover_tools`

**Files:**

- Create: `packages/ui-kit-chat-tools/src/styled/tools/discovered-apis-card.tsx`
- Create: `packages/ui-kit-chat-tools/src/styled/tools/discovered-apis-card.stories.tsx`
- Modify: `builtin-tool-cards.ts`, `index.tsx` (same package)

**Interfaces:**

- Consumes: `ToolChip` (Task 1), `ToolCard` + `resultText` + `Markdown` from `@conciv/ui-kit-chat`.
- Produces: `DiscoveredApisCard(props: ToolCardProps)`; `discoveredApisTool: ToolCardEntry = {names: ['discover_tools'], render: DiscoveredApisCard}`.

- [ ] **Step 1: Stories first.** Wire shapes:

```tsx
const okResult = JSON.stringify({
  tools: [
    {
      name: 'external_canvas_draw',
      description: 'Draw elements onto the agent draft.',
      typeStub: 'declare function external_canvas_draw(input: {elements: Skeleton[]}): Promise<{ids: string[]}>',
    },
  ],
  errors: ["Unknown tool: 'canvas_zap'"],
})
```

Stories `Discovered` (play: `findByText('Discovered 1 API')` — pluralize N; chip text visible; expanding shows the stub text) and `WithErrors` (play: red chip `findByText(/canvas_zap/)`).

- [ ] **Step 2: Run stories, expect FAIL (component missing).**

- [ ] **Step 3: Implement `discovered-apis-card.tsx`**

```tsx
import {For, Show, type JSX} from 'solid-js'
import {Search} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Markdown, resultText, ToolCard} from '@conciv/ui-kit-chat'
import {ToolChip} from './tool-chip.js'

const Output = z.object({
  tools: z.array(z.object({name: z.string(), description: z.string(), typeStub: z.string()})),
  errors: z.array(z.string()).optional(),
})

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseOutput(result: ToolCardProps['result']): z.infer<typeof Output> | null {
  const text = resultText(result)
  if (!text) return null
  const parsed = Output.safeParse(safeJson(text))
  return parsed.success ? parsed.data : null
}

function Icon(): JSX.Element {
  return <Search size={14} />
}

export function DiscoveredApisCard(props: ToolCardProps): JSX.Element {
  const output = () => parseOutput(props.result)
  const tools = () => output()?.tools ?? []
  const errors = () => output()?.errors ?? []
  const title = () => `Discovered ${tools().length} API${tools().length === 1 ? '' : 's'}`
  return (
    <ToolCard Icon={Icon} title={title()} part={props.part} result={props.result}>
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap gap-1.5">
          <For each={tools()}>{(tool) => <ToolChip name={tool.name} tone="new" tip={tool.description} />}</For>
          <For each={errors()}>{(error) => <ToolChip name={error} tone="bad" tip={error} />}</For>
        </div>
        <For each={tools()}>
          {(tool) => (
            <div class="flex flex-col gap-1.5">
              <span class="text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)]">{tool.description}</span>
              <Markdown content={`\`\`\`ts\n${tool.typeStub}\n\`\`\``} />
            </div>
          )}
        </For>
        <Show when={tools().length === 0 && errors().length === 0}>
          <span class="text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]">no APIs returned</span>
        </Show>
      </div>
    </ToolCard>
  )
}

export const discoveredApisTool: ToolCardEntry = {names: ['discover_tools'], render: DiscoveredApisCard}
```

Read `tool-lookup-card.tsx` first and match `ToolCard`'s real prop names (`Icon`, `title`, `part`, `result` as used there).

- [ ] **Step 4: Register `discoveredApisTool` + export. Run stories PASS + package typecheck.**

- [ ] **Step 5: Commit** (pathspec: the four touched files, message `feat(ui-kit-chat-tools): DiscoveredApisCard for discover_tools`).

---

### Task 4: LoadedToolsCard — `__lazy__tool__discovery__`

**Files:**

- Create: `packages/ui-kit-chat-tools/src/styled/tools/loaded-tools-card.tsx`
- Create: `packages/ui-kit-chat-tools/src/styled/tools/loaded-tools-card.stories.tsx`
- Modify: `builtin-tool-cards.ts`, `index.tsx`

**Interfaces:**

- Consumes: `ToolChip` + `schemaParams` (Task 1); `ToolCard`, `resultText` from `@conciv/ui-kit-chat`.
- Produces: `LoadedToolsCard(props: ToolCardProps)`; `loadedToolsTool: ToolCardEntry = {names: ['__lazy__tool__discovery__'], render: LoadedToolsCard}`.

- [ ] **Step 1: Stories first.** Result shape `{tools: [{name, description, inputSchema}]}`, e.g. `inputSchema: {type: 'object', properties: {seconds: {type: 'number'}}, required: ['seconds']}`. Stories `Loaded` (play: `findByText('Loaded 2 tools')`; chips visible; hover chip → `waitFor` tooltip shows description AND `seconds: number`). Header summary = comma-joined names (play asserts it).

- [ ] **Step 2: Run stories, expect FAIL.**

- [ ] **Step 3: Implement `loaded-tools-card.tsx`**

```tsx
import {For, Show, type JSX} from 'solid-js'
import {Wrench} from 'lucide-solid'
import {z} from 'zod'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {resultText, ToolCard} from '@conciv/ui-kit-chat'
import {schemaParams} from '../../primitives/tools/schema-params.js'
import {ToolChip} from './tool-chip.js'

const Output = z.object({
  tools: z.array(z.object({name: z.string(), description: z.string().optional(), inputSchema: z.unknown().optional()})),
})

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseOutput(result: ToolCardProps['result']): z.infer<typeof Output> | null {
  const text = resultText(result)
  if (!text) return null
  const parsed = Output.safeParse(safeJson(text))
  return parsed.success ? parsed.data : null
}

function Icon(): JSX.Element {
  return <Wrench size={14} />
}

function Tip(props: {description?: string; params: string}): JSX.Element {
  return (
    <div class="flex flex-col gap-1">
      <Show when={props.description}>
        <span>{props.description}</span>
      </Show>
      <Show when={props.params}>
        <span class="text-[length:0.625rem] [color:var(--chat-text-3)] [font-family:var(--chat-mono)]">
          {props.params}
        </span>
      </Show>
    </div>
  )
}

export function LoadedToolsCard(props: ToolCardProps): JSX.Element {
  const tools = () => parseOutput(props.result)?.tools ?? []
  const title = () => `Loaded ${tools().length} tool${tools().length === 1 ? '' : 's'}`
  return (
    <ToolCard Icon={Icon} title={title()} part={props.part} result={props.result}>
      <div class="flex flex-wrap gap-1.5">
        <For each={tools()}>
          {(tool) => (
            <ToolChip
              name={tool.name}
              tone="new"
              tip={<Tip description={tool.description} params={schemaParams(tool.inputSchema)} />}
            />
          )}
        </For>
      </div>
    </ToolCard>
  )
}

export const loadedToolsTool: ToolCardEntry = {names: ['__lazy__tool__discovery__'], render: LoadedToolsCard}
```

No expanded rows and no raw schema JSON anywhere — the chip cloud plus tooltips is the whole body. If `ToolCard` supports a header summary slot, pass the comma-joined tool names so the collapsed state stays informative; otherwise leave the title alone and note it in your report.

- [ ] **Step 4: Register + export; stories PASS; package typecheck.**

- [ ] **Step 5: Commit** (pathspec, message `feat(ui-kit-chat-tools): LoadedToolsCard for lazy discovery`).

---

### Task 5: `conciv_extensions` inline chip + widget IT + gates

**Files:**

- Modify: `packages/ui-kit-chat-tools/src/styled/tools/inline-tool.tsx` (add `ExtensionsInline`), `builtin-tool-cards.ts` OR the inline registry (read how `ReadInline`/`GrepInline` register — follow that mechanism exactly), `index.tsx`
- Test: extend `packages/embed/test/embed.it.test.ts`

**Interfaces:**

- Consumes: the existing inline-tool helpers (`inlineTool`, `inlineValue` in `primitives/tools/inline-tool.tsx` / `styled/tools/inline-tool.tsx` — read both first).
- Produces: `ExtensionsInline` rendering `Listed extensions` + comma-joined extension names from the result; registered for name `conciv_extensions`.

- [ ] **Step 1: Read the inline-tool implementation and add `ExtensionsInline` the same way `WebSearchInline` is built** (title "Listed extensions", summary from result text — the result is the extensions listing; render its names, truncated). Register for `conciv_extensions` wherever the other inlines register.
- [ ] **Step 2: Story or reuse `inline-tool.stories.tsx`** — add an `Extensions` story with play asserting `findByText('Listed extensions')`.
- [ ] **Step 3: Rebuild embed:** `pnpm turbo run build --filter=@conciv/embed`
- [ ] **Step 4: Extend the widget IT** (`embed.it.test.ts`, follow the Task-8 test from the lazy/code-mode plan sitting right there): script a turn with `scriptToolCall('execute_typescript', {typescriptCode: 'return 1'}, {blocking: false})` — the scripted result is `{ok: true}` (testkit default), which does NOT parse as code-mode output; assert the card still renders (title `run code` via `getByText`) and no `role='alert'` content. Add a second scripted call for `__lazy__tool__discovery__` and assert `getByText(/Loaded/)`.
- [ ] **Step 5: Full gates for touched packages:** `pnpm turbo run test --filter=@conciv/ui-kit-chat-tools --filter=@conciv/embed --force && pnpm typecheck`. Then `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.
- [ ] **Step 6: Commit** (pathspec: all files touched this task, message `feat(ui-kit-chat-tools): conciv_extensions inline + widget IT for new cards`).

---

### Task 6: Full gates

- [ ] **Step 1:** `pnpm typecheck && pnpm build && pnpm turbo run test --force` — all green.
- [ ] **Step 2:** `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED.
- [ ] **Step 3:** Report results. No push.
