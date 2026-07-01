# Tool UI — Plan B: `@conciv/tool-ui` package + renderers + Storybook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new SolidJS package holding every tool renderer, keyed on `ToolKind`, each viewable in Storybook across all states. The widget (Plan C) consumes the registry.

**Architecture:** `@conciv/tool-ui` exports a `toolRenderers: Record<ToolKind, ToolRenderer>` map and a `ToolCardShell` that draws the header (icon + family rail + title + state) while each renderer draws the kind-specific body. Renderers are pure Solid components taking `{call, part, result, ctx}`; interactive needs (TestCard live stream, "fix") arrive via `ctx`. Shared `--pw-*` tokens move here so cards look identical in Storybook and the app.

**Tech Stack:** SolidJS, `@tanstack/ai-client` (`ToolCallPart`/`ToolResultPart`), `@conciv/protocol` (`ClassifiedTool`), `storybook-solidjs-vite` (already a repo devDep), vite, vitest, oxfmt/oxlint.

**Depends on:** Plan A (the `ToolKind`/`ClassifiedTool` contract). Conventions: functions not classes; no IIFEs; one-line comments; oxfmt. Visual reference: the approved mockup `.superpowers/brainstorm/.../narrow-modal.html` (family rails: page=magenta `--pw-accent`, code=teal `--pw-agent`, test=gold `--pw-warn`, read=purple, neutral=line).

---

## File structure

- `packages/tool-ui/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts` (create) — new package, mirroring `packages/solid-streamdown`.
- `packages/tool-ui/.storybook/main.ts`, `.storybook/preview.tsx` (create) — Storybook config + token import.
- `packages/tool-ui/src/tokens.css` (create) — the `--pw-*` token block (moved from widget).
- `packages/tool-ui/src/types.ts` (create) — `ToolRendererCtx`, `ToolRenderer`, `ToolRenderProps`.
- `packages/tool-ui/src/shell.tsx` (create) — `ToolCardShell` (header chrome) + state glyph.
- `packages/tool-ui/src/cards/*.tsx` (create) — one per kind: `generic`, `shell`, `file-edit`, `page-action`, `test`, `file-read`, `search`, `todo`, `ui`.
- `packages/tool-ui/src/registry.tsx` (create) — `toolRenderers` map + `rendererFor(kind)`.
- `packages/tool-ui/src/reflection.tsx`, `src/now-line.tsx`, `src/done-card.tsx` (create).
- `packages/tool-ui/src/index.ts` (create) — public exports.
- `packages/tool-ui/src/**/*.stories.tsx` (create) — one per renderer.
- `packages/tool-ui/src/fixtures.ts` (create) — fixture `ClassifiedTool`/`ToolCallPart`/`ToolResultPart` builders for stories + tests.

Each `*.stories.tsx` lives beside its component.

---

## Task 1: scaffold the package

**Files:** create `packages/tool-ui/{package.json,tsconfig.json,tsconfig.build.json,vite.config.ts}`.

- [ ] **Step 1: Copy the build setup from solid-streamdown**

Run: `cat packages/solid-streamdown/tsconfig.json packages/solid-streamdown/tsconfig.build.json packages/solid-streamdown/vite.config.ts`
Use them as the template; create the four files under `packages/tool-ui/` with the same compiler options and a SolidJS vite plugin. `package.json`:

```json
{
  "name": "@conciv/tool-ui",
  "version": "0.0.0",
  "license": "MIT",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"},
    "./tokens.css": "./dist/tokens.css"
  },
  "scripts": {
    "build": "vite build && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "oxlint",
    "test": "vitest run",
    "storybook": "storybook dev -p 6007",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "@conciv/protocol": "workspace:*",
    "solid-js": "catalog:"
  },
  "devDependencies": {
    "@tanstack/ai-client": "catalog:",
    "@storybook/addon-a11y": "^10.4.4",
    "@storybook/addon-docs": "^10.4.4",
    "@storybook/addon-vitest": "^10.4.4",
    "storybook": "^10.4.4",
    "storybook-solidjs-vite": "^10.3.0",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

Match the exact `catalog:`/version spelling used in `solid-streamdown/package.json` (run
`grep -E "solid-js|@tanstack/ai-client|vite|vitest" packages/solid-streamdown/package.json` and copy
the specifiers). `@tanstack/ai-client` is a devDep because renderers import only its _types_.

- [ ] **Step 2: Install + confirm the workspace links**

Run: `pnpm install`
Expected: `@conciv/tool-ui` is linked; no peer errors.

- [ ] **Step 3: Add the public entry stub**

```ts
// packages/tool-ui/src/index.ts
export {toolRenderers, rendererFor} from './registry.js'
export {ToolCardShell} from './shell.js'
export {ReflectionCard} from './reflection.js'
export {NowLine} from './now-line.js'
export {DoneCard} from './done-card.js'
export type {ToolRenderer, ToolRendererCtx, ToolRenderProps} from './types.js'
```

(These modules are created in later tasks; the index will not typecheck until Task 3+. That is
fine — build/typecheck is gated at Task 10.)

- [ ] **Step 4: Commit**

```bash
git add packages/tool-ui pnpm-lock.yaml
git commit -m "chore(tool-ui): scaffold @conciv/tool-ui package"
```

---

## Task 2: move the design tokens

**Files:** create `packages/tool-ui/src/tokens.css`; modify `packages/widget/src/styles.css`.

- [ ] **Step 1: Extract the token block**

Run: `sed -n '1,80p' packages/widget/src/styles.css` to find the `:root { --pw-* }` block (the
palette/spacing/shadow variables, roughly lines 6-76). Move that block verbatim into
`packages/tool-ui/src/tokens.css`, changing the selector so it applies in both shadow DOM and
Storybook light DOM:

```css
/* tokens.css — shared conciv design tokens; resolves in the widget shadow root and on :root */
:host,
:root {
  /* ...the moved --pw-* declarations... */
}
```

- [ ] **Step 2: Import tokens back into the widget**

At the top of `packages/widget/src/styles.css`, replace the removed block with an import so the
widget bundle still ships the tokens:

```css
@import '@conciv/tool-ui/tokens.css';
```

Add `"@conciv/tool-ui": "workspace:*"` to `packages/widget/package.json` dependencies.

- [ ] **Step 3: Verify the widget still builds with tokens resolved**

Run: `pnpm turbo run build --filter=@conciv/widget`
Expected: builds; the emitted CSS still contains `--pw-accent` (grep the dist css). If the widget's
CSS pipeline does not resolve `@import` from a workspace package, instead copy `tokens.css` into the
widget build inputs and import by relative path; note which approach was used.

- [ ] **Step 4: Commit**

```bash
git add packages/tool-ui/src/tokens.css packages/widget/src/styles.css packages/widget/package.json
git commit -m "refactor(tokens): move --pw-* tokens into @conciv/tool-ui"
```

---

## Task 3: renderer types, fixtures, ToolCardShell, registry + generic card

**Files:** create `src/types.ts`, `src/fixtures.ts`, `src/shell.tsx`, `src/cards/generic.tsx`, `src/registry.tsx`, `src/shell.stories.tsx`.

- [ ] **Step 1: Define the renderer contract**

```ts
// packages/tool-ui/src/types.ts
import type {JSX, Component} from 'solid-js'
import type {ClassifiedTool} from '@conciv/protocol/tool-types'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// Actions a renderer may need from the host app (TestCard live stream, "fix this", etc).
export type ToolRendererCtx = {
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
}

export type ToolRenderProps = {
  call: ClassifiedTool
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolRendererCtx
}

// A kind's renderer: an icon for the header + the body below it. The shell draws the header.
export type ToolRenderer = {
  Icon: Component
  Body: (props: ToolRenderProps) => JSX.Element
}
```

- [ ] **Step 2: Fixtures for stories + tests**

```ts
// packages/tool-ui/src/fixtures.ts
import type {ClassifiedTool} from '@conciv/protocol/tool-types'
import type {ToolCallPart, ToolResultPart, ToolCallState} from '@tanstack/ai-client'

export function call(over: Partial<ToolCallPart> = {}): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'Bash', arguments: '{}', state: 'complete', ...over}
}
export function result(content: string, over: Partial<ToolResultPart> = {}): ToolResultPart {
  return {type: 'tool-result', toolCallId: 't1', content, state: 'complete', ...over}
}
export function classified(over: Partial<ClassifiedTool> = {}): ClassifiedTool {
  return {kind: 'shell', title: 'Ran pnpm build', family: 'code', fields: {command: 'pnpm build'}, ...over}
}
export const NO_CTX = {apiBase: '', harnessId: 'claude', sendMessage: () => {}}
export const STATES: ToolCallState[] = ['input-streaming', 'input-complete', 'complete', 'approval-requested']
```

- [ ] **Step 3: ToolCardShell (header chrome + state glyph)**

```tsx
// packages/tool-ui/src/shell.tsx
import {Show, type JSX, type Component} from 'solid-js'
import type {ClassifiedTool} from '@conciv/protocol/tool-types'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// Glyph for the call/result lifecycle. `error` wins; else streaming spins; else done.
function glyph(part: ToolCallPart, result: ToolResultPart | undefined): 'spin' | 'done' | 'error' {
  if (result?.state === 'error') return 'error'
  if (part.state === 'complete' || result?.state === 'complete') return 'done'
  return 'spin'
}

export function ToolCardShell(props: {
  call: ClassifiedTool
  part: ToolCallPart
  result: ToolResultPart | undefined
  Icon: Component
  meta?: string
  children?: JSX.Element
}): JSX.Element {
  return (
    <div class={`pw-tool pw-tool-${props.call.family}`}>
      <div class="pw-tool-head">
        <span class="pw-tool-ic" aria-hidden="true">
          <props.Icon />
        </span>
        <span class="pw-tool-title">{props.call.title}</span>
        <span class={`pw-tool-glyph pw-tool-${glyph(props.part, props.result)}`} aria-hidden="true" />
        <Show when={props.meta}>
          <span class="pw-tool-meta">{props.meta}</span>
        </Show>
      </div>
      <Show when={props.children}>
        <div class="pw-tool-body">{props.children}</div>
      </Show>
    </div>
  )
}
```

Add the corresponding CSS (rails by family) to `tokens.css` or a new `src/tool-ui.css` imported by
`index.ts`; base it on the mockup `.tool`, `.t-hd`, `.t-ic`, `.t--page/--code/--test/--read` rules.

- [ ] **Step 4: Generic fallback card + registry**

```tsx
// packages/tool-ui/src/cards/generic.tsx
import {Show, type JSX} from 'solid-js'
import type {ToolRenderProps} from '../types.js'

function rawArgs(part: ToolRenderProps['part']): string {
  if (part.input !== undefined) return JSON.stringify(part.input, null, 2)
  try {
    return JSON.stringify(JSON.parse(part.arguments), null, 2)
  } catch {
    return part.arguments
  }
}
function resultText(result: ToolRenderProps['result']): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
}

export function GenericBody(props: ToolRenderProps): JSX.Element {
  return (
    <>
      <Show when={props.result?.state === 'error'}>
        <div class="pw-tool-error">{props.result?.error ?? resultText(props.result)}</div>
      </Show>
      <Show when={props.result?.state !== 'error'}>
        <details class="pw-tool-raw">
          <summary>details</summary>
          <pre>{rawArgs(props.part)}</pre>
          <Show when={resultText(props.result)}>
            <pre>{resultText(props.result)}</pre>
          </Show>
        </details>
      </Show>
    </>
  )
}

export function GlyphDot(): JSX.Element {
  return <span class="pw-tool-dot" />
}
```

```tsx
// packages/tool-ui/src/registry.tsx
import type {ToolKind} from '@conciv/protocol/tool-types'
import type {ToolRenderer} from './types.js'
import {GenericBody, GlyphDot} from './cards/generic.js'

// Filled in as each card task lands; unmapped kinds resolve to the generic renderer.
const REGISTRY: Partial<Record<ToolKind, ToolRenderer>> = {}

const GENERIC: ToolRenderer = {Icon: GlyphDot, Body: GenericBody}

export const toolRenderers = REGISTRY
export function rendererFor(kind: ToolKind): ToolRenderer {
  return REGISTRY[kind] ?? GENERIC
}
```

- [ ] **Step 5: Story for the shell + generic card**

```tsx
// packages/tool-ui/src/shell.stories.tsx
import {ToolCardShell} from './shell.js'
import {GenericBody, GlyphDot} from './cards/generic.js'
import {call, classified, result, NO_CTX} from './fixtures.js'

export default {title: 'tool-ui/Shell'}

export const Done = () => (
  <ToolCardShell call={classified()} part={call()} result={result('ok')} Icon={GlyphDot} meta="1.8s">
    <GenericBody call={classified()} part={call()} result={result('built in 1.8s')} ctx={NO_CTX} />
  </ToolCardShell>
)
export const Error = () => (
  <ToolCardShell
    call={classified()}
    part={call()}
    result={result('boom', {state: 'error', error: 'exit 1'})}
    Icon={GlyphDot}
  >
    <GenericBody
      call={classified()}
      part={call()}
      result={result('boom', {state: 'error', error: 'exit 1'})}
      ctx={NO_CTX}
    />
  </ToolCardShell>
)
export const Streaming = () => (
  <ToolCardShell call={classified()} part={call({state: 'input-streaming'})} result={undefined} Icon={GlyphDot} />
)
```

- [ ] **Step 6: Launch Storybook and eyeball it**

Run: `pnpm --filter @conciv/tool-ui storybook`
Open `http://localhost:6007`. Expected: the Shell stories render (Done/Error/Streaming) with the
family rail + glyph; no console errors. Stop the server when satisfied.

- [ ] **Step 7: Commit**

```bash
git add packages/tool-ui/src
git commit -m "feat(tool-ui): renderer contract, shell, generic card, registry"
```

---

## Tasks 4-8: per-kind renderers

Each renderer task follows the SAME shape (repeat per kind): create `src/cards/<kind>.tsx` with an
`Icon` + a `Body` reading `props.call.fields`/`props.result`, honoring the state contract (error via
`result.state==='error'`, streaming via `part.state`), register it in `registry.tsx`, add
`src/cards/<kind>.stories.tsx` covering complete/error/streaming, and eyeball in Storybook.

### Task 4: `shell` card (terminal)

**Files:** `src/cards/shell.tsx`, `src/cards/shell.stories.tsx`, modify `src/registry.tsx`.

- [ ] **Step 1: Body**

```tsx
// packages/tool-ui/src/cards/shell.tsx
import {Show, type JSX} from 'solid-js'
import type {ToolRenderProps} from '../types.js'

const MAX_LINES = 40 // vertical cap; longer output collapses behind "show more"

function output(result: ToolRenderProps['result']): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
}
function command(props: ToolRenderProps): string {
  const c = props.call.fields.command
  return typeof c === 'string' ? c : ''
}

export function ShellBody(props: ToolRenderProps): JSX.Element {
  const out = () => output(props.result)
  const lines = () => out().split('\n')
  const long = () => lines().length > MAX_LINES
  return (
    <div class="pw-term" classList={{'pw-tool-errbox': props.result?.state === 'error'}}>
      <div class="pw-term-cmd">{command(props)}</div>
      <Show when={out()}>
        <pre class="pw-term-out">{long() ? lines().slice(0, MAX_LINES).join('\n') : out()}</pre>
        <Show when={long()}>
          <details class="pw-tool-more">
            <summary>show {lines().length - MAX_LINES} more lines</summary>
            <pre>{lines().slice(MAX_LINES).join('\n')}</pre>
          </details>
        </Show>
      </Show>
    </div>
  )
}

export function ShellIcon(): JSX.Element {
  return <span class="pw-tool-glyph-term">$</span>
}
```

- [ ] **Step 2: Register + story**

In `registry.tsx`, import and add `shell: {Icon: ShellIcon, Body: ShellBody}` to `REGISTRY`. Create
`shell.stories.tsx` using `classified({kind:'shell'})` + `result('✓ built in 1.8s · 142 modules')`,
plus an error story (`result('exit 1', {state:'error'})`) and a long-output story (200 lines).

- [ ] **Step 3: Eyeball + commit**

Run: `pnpm --filter @conciv/tool-ui storybook` → verify; then

```bash
git add packages/tool-ui/src/cards/shell.tsx packages/tool-ui/src/cards/shell.stories.tsx packages/tool-ui/src/registry.tsx
git commit -m "feat(tool-ui): shell terminal card"
```

### Task 5: `file-edit` card (diff)

**Files:** `src/cards/file-edit.tsx` (+ story), register.

- [ ] **Step 1: Body** — render `fields.file` (or `file_path`) in the header meta as `+A −R`, body shows a colorized diff built from `old_string`/`new_string` (claude Edit) or `content` (Write). Compute added/removed line counts from those fields. Lines prefixed `+`/`−` get `.pw-diff-add`/`.pw-diff-del`.

```tsx
// packages/tool-ui/src/cards/file-edit.tsx
import {For, Show, type JSX} from 'solid-js'
import type {ToolRenderProps} from '../types.js'

type Line = {sign: ' ' | '+' | '-'; text: string}

function diffLines(fields: Record<string, unknown>): Line[] {
  const oldS = typeof fields.old_string === 'string' ? fields.old_string : ''
  const newS =
    typeof fields.new_string === 'string' ? fields.new_string : typeof fields.content === 'string' ? fields.content : ''
  const out: Line[] = []
  for (const t of oldS ? oldS.split('\n') : []) out.push({sign: '-', text: t})
  for (const t of newS ? newS.split('\n') : []) out.push({sign: '+', text: t})
  return out
}

export function FileEditBody(props: ToolRenderProps): JSX.Element {
  const lines = () => diffLines(props.call.fields)
  return (
    <Show when={lines().length} fallback={<div class="pw-tool-muted">no diff</div>}>
      <pre class="pw-diff">
        <For each={lines()}>
          {(l) => (
            <div class={l.sign === '+' ? 'pw-diff-add' : l.sign === '-' ? 'pw-diff-del' : 'pw-diff-ctx'}>
              {l.sign} {l.text}
            </div>
          )}
        </For>
      </pre>
    </Show>
  )
}

export function FileEditIcon(): JSX.Element {
  return <span class="pw-tool-glyph-edit">✎</span>
}
```

- [ ] **Step 2: meta counts** — In `registry.tsx` the shell only passes `call`/`part`/`result`; the `+A −R` meta is computed inside the card and rendered via the shell's `meta` prop. To do that, the widget (Plan C) passes `meta` to `ToolCardShell`; for the story, render `ToolCardShell` with `meta="+2 −1"` directly.
- [ ] **Step 3: register, story (complete + streaming-partial), eyeball, commit** (`feat(tool-ui): file-edit diff card`).

### Task 6: `page-action` card

**Files:** `src/cards/page-action.tsx` (+ story), register.

- [ ] **Step 1: Body** — show an element chip (`fields.selector`/`name`/`ref`) and, when `fields.verb` is a visual verb, a "shown on your page" affordance (the actual on-page ring is Plan C; here just the chip + note).

```tsx
// packages/tool-ui/src/cards/page-action.tsx
import {Show, type JSX} from 'solid-js'
import type {ToolRenderProps} from '../types.js'

function target(fields: Record<string, unknown>): string | undefined {
  for (const k of ['selector', 'name', 'ref']) {
    const v = fields[k]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}

export function PageActionBody(props: ToolRenderProps): JSX.Element {
  const t = () => target(props.call.fields)
  return (
    <Show when={t()}>
      <span class="pw-elchip">◉ {t()}</span>
    </Show>
  )
}

export function PageActionIcon(): JSX.Element {
  return <span class="pw-tool-glyph-page">◉</span>
}
```

- [ ] **Step 2: register, story (click/fill/error), eyeball, commit** (`feat(tool-ui): page-action card`).

### Task 7: `test` card (move TestCard)

**Files:** create `src/cards/test.tsx` by moving `packages/widget/src/test-card.tsx`; modify `registry.tsx`; story.

- [ ] **Step 1: Move + decouple transport** — `TestCard` imports `createTransport` from the widget. Move the component to `src/cards/test.tsx`; replace the direct transport import with a stream factory taken from `ctx` (extend `ToolRendererCtx` with `streamTestRunner?: (onEvent) => () => void`). The static path (`result !== null`) needs no ctx; the live path uses `ctx.streamTestRunner`. The card receives `result` from `props.call.fields`/`props.result` per how Plan C feeds it (Plan C parses the runner result, same as today's `parseRunResult`).
- [ ] **Step 2: `onFix`** — wire the card's "fix" button to `ctx.sendMessage(fixMessage(error))` (the existing `fixMessage` helper moves with the card).
- [ ] **Step 3: register, story (passing/failing static fixtures — no live stream in Storybook), eyeball, commit** (`feat(tool-ui): move TestCard into tool-ui`). Update the widget import in Plan C.

### Task 8: `file-read`, `search`, `todo`, `ui` cards

**Files:** `src/cards/{file-read,search,todo,ui}.tsx` (+ stories), register all four.

- [ ] **Step 1:** `file-read` → file path + optional line range (`fields.file_path`, `fields.offset`/`limit`). `search` → pattern + match count (parse `result.content` line count). `todo` → checklist from `fields.todos` (array of `{content, status}` → done/active/pending dot). `ui` → a one-line chip (`fields.kind` → "Rendered form"); the interactive UI stays the widget's GenUi. Each ~20-40 lines following the Task 4 shape.
- [ ] **Step 2:** register all four; one story file each (complete + streaming). Eyeball.
- [ ] **Step 3: Commit** (`feat(tool-ui): file-read, search, todo, ui cards`).

---

## Task 9: reflection card, now-line, done card

**Files:** `src/reflection.tsx`, `src/now-line.tsx`, `src/done-card.tsx` (+ stories).

- [ ] **Step 1: ReflectionCard** — takes `{content: string}` (the thinking text). If lines match `^(goal|next|memory|observation):` (case-insensitive), render labeled rows with the page-agent glyphs (🎯/🔍/💾); else render the text in the accent-rail card. Pure; no streaming logic (the widget passes the current thinking content).

```tsx
// packages/tool-ui/src/reflection.tsx
import {For, type JSX} from 'solid-js'

type Row = {glyph: string; text: string}
const LABELS: Record<string, string> = {goal: '🎯', next: '🎯', memory: '💾', observation: '🔍'}

function parse(content: string): Row[] | null {
  const rows: Row[] = []
  for (const raw of content.split('\n')) {
    const m = raw.match(/^\s*(goal|next|memory|observation)\s*:\s*(.+)$/i)
    if (!m) return null
    rows.push({glyph: LABELS[m[1].toLowerCase()] ?? '•', text: m[2]})
  }
  return rows.length ? rows : null
}

export function ReflectionCard(props: {content: string}): JSX.Element {
  const rows = () => parse(props.content)
  return (
    <div class="pw-reflect">
      {rows() ? (
        <For each={rows()!}>
          {(r) => (
            <div class="pw-reflect-row">
              <span aria-hidden="true">{r.glyph}</span>
              {r.text}
            </div>
          )}
        </For>
      ) : (
        <div class="pw-reflect-row">{props.content}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: NowLine** — `{title: string; onStop: () => void}`: a single morphing status line with a spinner + the active tool `title` + a stop button. CSS sweep from the mockup `.now`.
- [ ] **Step 3: DoneCard** — `{data: {message: string; summary: string; filesChanged: string[]; pageActions: string[]; testsPassed: number}}`: renders the structured summary (Plan D feeds `data`; here just render it). The prose `message` is rendered by the widget's text part, so DoneCard shows only the structured roll-up (files/page/tests chips).
- [ ] **Step 4: stories** for all three (reflection: structured + freeform; now-line; done-card). Eyeball.
- [ ] **Step 5: Commit** (`feat(tool-ui): reflection card, now-line, done card`).

---

## Task 10: Storybook config + package verification

**Files:** `.storybook/main.ts`, `.storybook/preview.tsx`.

- [ ] **Step 1: Storybook config** — mirror `packages/solid-streamdown/.storybook/main.ts` (framework `storybook-solidjs-vite`, addons a11y/docs/vitest, stories glob `../src/**/*.stories.@(ts|tsx)`); drop the markdown `optimizeDeps` block (not needed here). `preview.tsx` imports the tokens + tool-ui css and wraps stories in a dark panel matching `--pw-panel`:

```tsx
// packages/tool-ui/.storybook/preview.tsx
import '../src/tokens.css'
import '../src/tool-ui.css'
import type {Decorator} from 'storybook-solidjs-vite'

export const decorators: Decorator[] = [
  (Story) => (
    <div style={{background: 'var(--pw-panel)', padding: '20px', 'max-width': '420px'}}>
      <Story />
    </div>
  ),
]
export const parameters = {layout: 'fullscreen'}
```

- [ ] **Step 2: Build Storybook headless**

Run: `pnpm --filter @conciv/tool-ui build-storybook`
Expected: builds with no errors; every renderer has at least one story.

- [ ] **Step 3: Typecheck + build + test the package**

Run: `pnpm turbo run typecheck build test --filter=@conciv/tool-ui`
Expected: green. The `tsc` build (`tsconfig.build.json`) emits `dist/index.d.ts` and the css.

- [ ] **Step 4: Lint + format**

Run: `pnpm --filter @conciv/tool-ui lint && pnpm format:check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/tool-ui
git commit -m "feat(tool-ui): Storybook config + all renderers verified"
```

---

## Self-review notes (author)

- Spec coverage: creates `@conciv/tool-ui` with the registry keyed on `ToolKind`, all nine
  card kinds (full set per the locked decision), the renderer state contract (error/streaming/
  truncation), moved `TestCard`, moved tokens (`:host, :root` for shadow + Storybook), reflection
  card, now-line, done card, and a story per renderer. Widget wiring + the live on-page mirror are
  Plan C; the done-card _data_ is Plan D (here it just renders given `data`).
- Interactive-renderer-callbacks gap (#3) resolved via `ToolRendererCtx` (`sendMessage`, `apiBase`,
  optional `streamTestRunner`).
- Verify during execution: the exact `catalog:`/version specifiers from `solid-streamdown`, and
  whether the widget CSS pipeline resolves `@import` from a workspace package (Task 2 Step 3 has the
  fallback).
