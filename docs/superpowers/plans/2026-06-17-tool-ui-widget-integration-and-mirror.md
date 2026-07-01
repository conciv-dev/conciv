# Tool UI — Plan C: widget integration + on-page mirror

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the widget thread to classify tool calls client-side and render them via `@conciv/tool-ui`, replace the collapsed Thinking with the reflection card and per-call spinners with one now-line, and play a cursor+ring mirror on the real page for `conciv_page` element actions.

**Architecture:** `packages/widget/src/chat-panel.tsx` replaces its `ToolCall`/`ToolResult` with a `ToolCardView` that calls `classifyTool(harnessId, name, input)` and the `rendererFor(kind)` registry. Tool-call + tool-result parts pair into one card (generalizing the existing `resultByCallId`/`hiddenResultIds` seam). The on-page mirror hooks `makeDomPageDriver` via a new `onBeforeElementAction` dep.

**Tech Stack:** SolidJS widget (Shadow DOM), `@tanstack/ai-solid` `useChat`, `@conciv/tool-ui`, `@conciv/harness/classify`. Widget UI is tested in a REAL browser (Playwright) against the prebuilt bundle (rebuild before ITs).

**Depends on:** Plan A (classifiers) + Plan B (renderers). Conventions: functions not classes; no IIFEs; one-line comments; oxfmt; never special-case a CLI in the widget (classification comes from the harness classifier lib).

---

## File structure

- `packages/widget/package.json` (modify) — add `@conciv/tool-ui`, `@conciv/harness` deps.
- `packages/widget/src/tool-card.tsx` (create) — `ToolCardView` (classify + shell + registry body + meta).
- `packages/widget/src/chat-panel.tsx` (modify) — use `ToolCardView`; generalize pairing; reflection card; now-line; thread `harnessId`.
- `packages/widget/src/page-mirror.ts` (create) — the cursor+ring overlay played before element actions.
- `packages/widget/src/page-driver.ts` (modify) — add `onBeforeElementAction` dep, call it between resolve and handler.
- `packages/widget/src/mount.tsx` (modify) — thread `harnessId` to `ChatPanel`; wire the mirror into the page driver.
- `packages/harness/src/claude/classify.ts` (modify) — Bash `conciv tools test` → `test` kind (preserve the test card).
- `packages/widget/test/tool-ui.it.test.ts` (create) — browser ITs.

---

## Task 1: add deps + the ToolCardView

**Files:** modify `packages/widget/package.json`; create `packages/widget/src/tool-card.tsx`.

- [ ] **Step 1: Add deps**

Add to `packages/widget/package.json` dependencies: `"@conciv/tool-ui": "workspace:*"` and
`"@conciv/harness": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 2: ToolCardView**

```tsx
// packages/widget/src/tool-card.tsx
import {type JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {classifyTool} from '@conciv/harness/classify'
import {rendererFor, ToolCardShell, type ToolRendererCtx} from '@conciv/tool-ui'

// Parsed tool input, tolerant of partial streaming args (input may be undefined; arguments partial).
function toolInput(part: ToolCallPart): unknown {
  if (part.input !== undefined) return part.input
  try {
    return JSON.parse(part.arguments)
  } catch {
    return {}
  }
}

// Header meta per kind: edit counts, durations, etc. Kept here (host-side) so renderers stay pure.
function meta(kind: string, fields: Record<string, unknown>): string | undefined {
  if (kind === 'file-edit') {
    const added = countLines(fields.new_string ?? fields.content)
    const removed = countLines(fields.old_string)
    if (added || removed) return `+${added} −${removed}`
  }
  return undefined
}
function countLines(v: unknown): number {
  return typeof v === 'string' && v.length ? v.split('\n').length : 0
}

export function ToolCardView(props: {
  part: ToolCallPart
  result: ToolResultPart | undefined
  harnessId: string
  ctx: ToolRendererCtx
}): JSX.Element {
  const call = () => classifyTool(props.harnessId, props.part.name, toolInput(props.part))
  const renderer = () => rendererFor(call().kind)
  return (
    <ToolCardShell
      call={call()}
      part={props.part}
      result={props.result}
      Icon={renderer().Icon}
      meta={meta(call().kind, call().fields)}
    >
      {renderer().Body({call: call(), part: props.part, result: props.result, ctx: props.ctx})}
    </ToolCardShell>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @conciv/widget typecheck`
Expected: PASS (the registry/types resolve from `@conciv/tool-ui`).

- [ ] **Step 4: Commit**

```bash
git add packages/widget/package.json packages/widget/src/tool-card.tsx pnpm-lock.yaml
git commit -m "feat(widget): ToolCardView (classify + tool-ui registry)"
```

---

## Task 2: wire ToolCardView into the thread + pair call/result

**Files:** modify `packages/widget/src/chat-panel.tsx`.

- [ ] **Step 1: Thread `harnessId` into ChatPanel**

Add `harnessId: string` to `ChatPanel`'s props and to `chatPanelDef`'s `create` (the shell already
resolves `models.harness` — see `mount.tsx`, Task 5). Build the renderer ctx once:

```tsx
const toolCtx = {
  apiBase: props.apiBase,
  harnessId: props.harnessId,
  sendMessage: (t: string) => void chat.sendMessage(t),
}
```

- [ ] **Step 2: Generalize result pairing**

Replace `analyzeTests` usage with a message-wide result map. In `MessageParts`:

```tsx
const resultByCallId = createMemo(() => {
  const m = new Map<string, ToolResultPart>()
  for (const p of props.parts) if (p.type === 'tool-result' && p.toolCallId) m.set(p.toolCallId, p as ToolResultPart)
  return m
})
```

- [ ] **Step 3: Replace the tool branches in `PartView`**

Delete the `ToolCall`, `ToolResult`, `ToolGlyph`, `prettyArgs`, `asText`, `toolCallStatus`,
`analyzeTests`, `isTestCommand`, `isRunCommand`, `parseRunResult`, and the `isRunCard`/`TestCard`
`<Match>` (tests now flow through the `test` kind renderer — Task 6). The tool `<Match>` becomes:

```tsx
<Match when={props.part.type === 'tool-call' ? (props.part as ToolCallPart) : null}>
  {(p) => (
    <ToolCardView part={p()} result={props.resultByCallId.get(p().id)} harnessId={props.harnessId} ctx={props.toolCtx} />
  )}
</Match>
<Match when={props.part.type === 'tool-result' && !props.resultByCallId.has((props.part as ToolResultPart).toolCallId) ? (props.part as ToolResultPart) : null}>
  {(p) => <ToolCardView part={orphanCall(p())} result={p()} harnessId={props.harnessId} ctx={props.toolCtx} />}
</Match>
```

A `tool-result` whose call is in the map is hidden (rendered inside the call's card); an orphan
result (no matching call part) still renders via a minimal synthetic call. Add the helper:

```tsx
// A result part with no sibling call (rare): wrap it so the card shell still renders.
function orphanCall(r: ToolResultPart): ToolCallPart {
  return {type: 'tool-call', id: r.toolCallId, name: 'unknown', arguments: '{}', state: 'complete'}
}
```

Thread `resultByCallId`, `harnessId`, `toolCtx` through `MessageParts` → `PartView` props.

- [ ] **Step 4: Rebuild the widget + run the existing widget ITs**

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/widget test`
Expected: existing ITs pass (the thread still renders tool calls, now as cards). Fix any IT that
asserted the old `pw-chat-tool` DOM to assert the new `pw-tool` card DOM.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): render tool calls via tool-ui registry, pair call+result"
```

---

## Task 3: reflection card replaces collapsed Thinking

**Files:** modify `packages/widget/src/chat-panel.tsx`.

- [ ] **Step 1: Swap the thinking `<Match>`**

Replace the `thinking` `<Match>` body (the `<details class={thinkingClass(...)}>` block) with the
reflection card, keeping the same guard (non-empty trimmed content):

```tsx
{
  ;(p) => <ReflectionCard content={p().content} />
}
```

Import `ReflectionCard` from `@conciv/tool-ui`. Remove the now-unused `thinkingClass` helper.
Keep the streaming indicator behavior: a still-streaming reflection can get a `pw-reflect-live`
class via a wrapper if `props.streaming && index === parts.length - 1` (optional polish).

- [ ] **Step 2: Rebuild + eyeball in a real browser**

Run: `pnpm turbo run build --filter=@conciv/widget`
Then load the widget against the example app (see `packages/widget/test` harness) and confirm the
agent's thinking renders as the accent-rail reflection card, not a `<details>`.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): reflection card for agent thinking"
```

---

## Task 4: one morphing now-line

**Files:** modify `packages/widget/src/chat-panel.tsx`.

- [ ] **Step 1: Derive the active tool title**

Add a memo over the streaming assistant message's parts for the last in-flight tool call:

```tsx
const activeTool = createMemo(() => {
  if (!isStreaming()) return null
  const last = chat.messages()[lastIndex()]
  if (!last || last.role !== 'assistant') return null
  const calls = last.parts.filter((p): p is ToolCallPart => p.type === 'tool-call')
  const live = calls.findLast((c) => c.state !== 'complete')
  if (!live) return null
  return classifyTool(props.harnessId, live.name, live.input ?? {}).title
})
```

- [ ] **Step 2: Render the NowLine, retire the per-call spinner**

Where the thread renders the streaming indicator (the `ThinkingBubble`/`isThinking()` block), render
`<NowLine title={activeTool() ?? 'Thinking…'} onStop={() => chat.stop()} />` while
`isThinking() || isStreaming()`. Keep the `aria-live` status announcements untouched. Import
`NowLine` from `@conciv/tool-ui`. Individual tool cards no longer show their own "Running"
spinner (the shell glyph shows spin/done/error per card; the NowLine is the single transient).

- [ ] **Step 3: Rebuild + verify**

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/widget test`
Expected: ITs pass; the now-line shows the current action and stops the turn.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): single morphing now-line"
```

---

## Task 5: thread harnessId from the shell

**Files:** modify `packages/widget/src/mount.tsx` (and the panel/shell plumbing as needed).

- [ ] **Step 1: Find where models.harness is available**

Run: `grep -n "models.harness\|harness" packages/widget/src/mount.tsx packages/widget/src/widget-shell.tsx`
The shell already fetches `models` (with `models.harness`). Pass `models.harness.id` (confirm the
field name from the harness models endpoint — it is the adapter `id`, e.g. `'claude'`) into
`chatPanelDef`/`ChatPanel` as `harnessId`.

- [ ] **Step 2: Default + typecheck**

If a surface can mount before models load, default `harnessId` to `'claude'` (the classifier already
falls back to generic for unknowns). Run `pnpm --filter @conciv/widget typecheck`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src
git commit -m "feat(widget): pass active harness id to the chat panel"
```

---

## Task 6: preserve the test card (Bash + conciv_test → test kind)

**Files:** modify `packages/harness/src/claude/classify.ts`; verify the `test` renderer reads the result.

- [ ] **Step 1: Detect test commands in the claude classifier**

The agent runs tests via `conciv tools test …` (Bash) and/or the `conciv_test` MCP tool. `conciv_test` is
already `test` kind (Plan A). Add a Bash branch so `conciv tools test`/`tools vitest` commands also
classify as `test`:

```ts
case 'Bash': {
  const cmd = str(input, 'command') ?? ''
  if (cmd.includes('tools test') || cmd.includes('tools vitest')) {
    return {kind: 'test', family: 'test', title: cmd.includes('test run') || cmd.includes('vitest run') ? 'Ran tests' : 'Tests', fields: {command: cmd}}
  }
  return {kind: 'shell', family: 'code', title: cmd ? `Ran ${cmd}` : 'Ran a command', fields: fields(input)}
}
```

- [ ] **Step 2: Test renderer reads the run result**

Confirm the `test` renderer (Plan B Task 7) parses a `TestRunResult` from `result.content` (via the
moved `parseRunResult`) for the static path, and uses `ctx.streamTestRunner` for the live path.
Update the classifier test (`harness/test/classify.test.ts`) to assert
`classifyTool('claude','Bash',{command:'conciv tools test run'}).kind === 'test'`.

- [ ] **Step 3: Run classifier tests + rebuild widget + ITs**

Run: `pnpm --filter @conciv/harness test && pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/widget test`
Expected: green; a test run renders the test card as before.

- [ ] **Step 4: Commit**

```bash
git add packages/harness/src/claude/classify.ts packages/harness/test/classify.test.ts
git commit -m "feat(harness): classify conciv test Bash commands as test kind"
```

---

## Task 7: on-page mirror

**Files:** create `packages/widget/src/page-mirror.ts`; modify `packages/widget/src/page-driver.ts`; wire at the driver's construction site.

- [ ] **Step 1: The mirror module**

```ts
// packages/widget/src/page-mirror.ts
import type {PageQueryKind} from '@conciv/protocol/page-types'

// Verbs worth showing a cursor + ring for (visual actions). Non-visual verbs (find/inspect/eval)
// are excluded so the page does not flash for reads.
const VISUAL = new Set<PageQueryKind>([
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'submit',
  'settext',
  'sethtml',
  'setstyle',
])

export function shouldMirror(kind: PageQueryKind): boolean {
  return VISUAL.has(kind)
}

// Draw a magenta ring (and a cursor) over `el` for ~600ms, in the page DOM (outside the widget
// shadow root). Non-blocking: returns immediately; the overlay self-removes.
export function playMirror(el: Element): void {
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return
  const ring = document.createElement('div')
  ring.setAttribute('data-conciv-mirror', '')
  Object.assign(ring.style, {
    position: 'fixed',
    left: `${r.left - 4}px`,
    top: `${r.top - 4}px`,
    width: `${r.width + 8}px`,
    height: `${r.height + 8}px`,
    border: '2px solid #ff40e0',
    borderRadius: '9px',
    boxShadow: '0 0 0 5px rgba(255,64,224,.18)',
    pointerEvents: 'none',
    zIndex: '2147483646',
    transition: 'opacity .25s ease',
  })
  document.body.appendChild(ring)
  ring.animate(
    [
      {transform: 'scale(1.04)', opacity: 0},
      {transform: 'scale(1)', opacity: 1},
    ],
    {duration: 180, easing: 'ease-out'},
  )
  setTimeout(() => {
    ring.style.opacity = '0'
    setTimeout(() => ring.remove(), 260)
  }, 600)
}
```

- [ ] **Step 2: Add the hook to the page driver**

In `packages/widget/src/page-driver.ts`, extend the deps and call the hook between resolve and
handler:

```ts
export function makeDomPageDriver(
  deps: {
    handlers?: Partial<Record<PageQueryKind, PageHandler>>
    onBeforeElementAction?: (el: Element, kind: PageQueryKind) => void
  } = {},
): PageDriver {
  // ...existing refs/consoleBuf/handlers...
  async function execute(query: PageQuery): Promise<PageResult> {
    const handler = handlers[query.kind]
    if (!handler) return err(`unknown page action ${query.kind}`)
    const needsEl = ELEMENT_KINDS.has(query.kind)
    const el = needsEl ? resolveTarget(query, refs) : null
    if (needsEl && !el) {
      // ...existing error branches unchanged...
    }
    if (el) deps.onBeforeElementAction?.(el, query.kind)
    try {
      return await handler({query, el, refs, consoleBuf})
    } catch (e) {
      return err(String(e))
    }
  }
  return {execute}
}
```

- [ ] **Step 3: Wire it at construction**

Run: `grep -rn "makeDomPageDriver" packages/widget/src` to find the call site (mount/page-bus). Pass:

```ts
makeDomPageDriver({
  onBeforeElementAction: (el, kind) => {
    if (shouldMirror(kind)) playMirror(el)
  },
})
```

Import `shouldMirror`, `playMirror` from `./page-mirror.js`.

- [ ] **Step 4: Rebuild + manual verify**

Run: `pnpm turbo run build --filter=@conciv/widget`
Drive an `conciv_page click`/`fill` against the example app and confirm the ring flashes on the target
element (in the page, behind the widget), and that find/inspect do NOT flash.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/page-mirror.ts packages/widget/src/page-driver.ts packages/widget/src/mount.tsx
git commit -m "feat(widget): on-page cursor+ring mirror for page actions"
```

---

## Task 8: browser integration tests

**Files:** create `packages/widget/test/tool-ui.it.test.ts`.

- [ ] **Step 1: Write the ITs (real browser, prebuilt bundle)**

Following the existing widget IT pattern (load `dist/conciv-widget.global.js`, `browser.newPage()` not
`newContext()`), drive a fake stream that emits: a Bash tool-call+result, an Edit, an conciv_page
click, and a test run. Assert:

- `.pw-tool.pw-tool-code` exists for the Bash card with a terminal body.
- the Edit card shows a diff with `.pw-diff-add`/`.pw-diff-del` and `+N −M` meta.
- the page-action card shows the element chip; a `[data-conciv-mirror]` element appears on click.
- the now-line (`.pw-now`) shows the active title while streaming and is gone when complete.
- at 390px width, a long shell output does not overflow the panel (scrollWidth check) and the title
  ellipsizes.

- [ ] **Step 2: Rebuild + run**

Run: `pnpm turbo run build --filter=@conciv/widget && pnpm --filter @conciv/widget test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/test/tool-ui.it.test.ts
git commit -m "test(widget): tool-ui rendering + mirror integration tests"
```

---

## Task 9: full verification

- [ ] **Step 1: Typecheck + build + test the chain**

Run: `pnpm turbo run typecheck build test --filter=@conciv/widget --filter=@conciv/tool-ui --filter=@conciv/harness`
Expected: green.

- [ ] **Step 2: Lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: clean.

- [ ] **Step 3: Commit any auto-fixes**

```bash
git add -A && git commit -m "chore(widget): lint/format after tool-ui integration" || echo "nothing to commit"
```

---

## Self-review notes (author)

- Spec coverage: widget renders tool calls via the `@conciv/tool-ui` registry with client-side
  classification (`classifyTool` from the harness lib — no CLI switch in the widget), pairs
  call+result, replaces Thinking with the reflection card and per-call spinners with one now-line,
  and plays the on-page mirror via the `page-driver.execute` seam (visual verbs only, page DOM, max
  z-index). Test card preserved for both `conciv_test` and Bash `conciv tools test` paths.
- Resolves open item #5 (mirror scope/timing): visual-verb allowlist + non-blocking ~600ms ring.
- Verify during execution: the exact `makeDomPageDriver` call site, the `models.harness` field name
  for `harnessId`, and which existing widget ITs assert the old `pw-chat-tool` DOM (update to
  `pw-tool`).
