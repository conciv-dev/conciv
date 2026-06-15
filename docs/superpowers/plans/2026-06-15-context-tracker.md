# Context Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-session model context/usage tracker (circular % ring + hover popover with token breakdown, cost, and turns) to the top bar of the chat modal and each quick-terminal pane.

**Architecture:** Harnesses expose usage via one pure `UsageExtractor` function; the shared `runAgui` spine merges snapshots and emits an `aidx-usage` AG-UI CUSTOM event. The widget's `ChatPanel` consumes it, reports it up via `onUsageChange`, and the shell/quick-terminal render a `ContextTracker` (built on a new reusable `HoverCard` component) in their top bars. Every field is optional, so harnesses that emit nothing degrade to a hidden tracker.

**Tech Stack:** TypeScript, SolidJS, Zod, `@tanstack/ai` AG-UI StreamChunks, native HTML Popover API, pnpm + turborepo, vitest + Playwright (real-browser ITs, no jsdom).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/protocol/src/usage-types.ts` | NEW — `UsageSnapshot` schema, `AIDX_USAGE_EVENT`, `aguiUsageFor`, `contextUsedTokens` |
| `packages/protocol/tsdown.config.ts` | add `src/usage-types.ts` entry |
| `packages/protocol/package.json` | add `./usage-types` export |
| `packages/harness/src/_shared/agui.ts` | `UsageExtractor` type, `runAgui` 5th param, `definedOnly`/`sameUsage` helpers |
| `packages/harness/src/codex/decode.ts` | `codexUsage` extractor + schema field |
| `packages/harness/src/claude/decode.ts` | `claudeUsage` extractor + schema fields |
| `packages/widget/src/hover-card.tsx` | NEW — reusable `HoverCard` popover component |
| `packages/widget/src/context-tracker.tsx` | NEW — `ContextTracker` component |
| `packages/widget/src/styles.css` | `pw-ctx-*` + `pw-hovercard-*` styles |
| `packages/widget/src/chat-panel.tsx` | usage signal, `onCustomEvent` branch, `onUsageChange` prop |
| `packages/widget/src/widget-shell.tsx` | `PanelContext.onUsageChange`, render tracker in `pw-chat-head` |
| `packages/widget/src/quick-terminal.tsx` | per-pane usage signal, render tracker in `pw-qt-pane-bar` |
| `packages/harness/test/codex-decode.test.ts` | codex usage extraction tests |
| `packages/harness/test/claude-decode.test.ts` | NEW — claude usage extraction tests |
| `packages/widget/test/widget.it.test.ts` | tracker + hover-card browser IT |

---

## Task 1: Protocol usage types

**Files:**
- Create: `packages/protocol/src/usage-types.ts`
- Modify: `packages/protocol/tsdown.config.ts`
- Modify: `packages/protocol/package.json`
- Test: `packages/protocol/test/usage-types.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/protocol/test/usage-types.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {UsageSnapshotSchema, AIDX_USAGE_EVENT, aguiUsageFor, contextUsedTokens} from '../src/usage-types.js'

describe('usage-types', () => {
  it('parses a partial snapshot (all fields optional)', () => {
    expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
    const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
    expect(r.success && r.data.inputTokens).toBe(10)
  })

  it('rejects negative tokens', () => {
    expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
  })

  it('wraps a snapshot as a CUSTOM chunk named aidx-usage', () => {
    const chunk = aguiUsageFor({inputTokens: 5})
    expect(chunk.type).toBe(EventType.CUSTOM)
    expect((chunk as {name: string}).name).toBe(AIDX_USAGE_EVENT)
    expect((chunk as {value: unknown}).value).toEqual({inputTokens: 5})
  })

  it('sums prompt-side tokens for occupancy, excludes output', () => {
    expect(contextUsedTokens({inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10, outputTokens: 999})).toBe(160)
  })

  it('returns undefined when no token fields present', () => {
    expect(contextUsedTokens({totalCostUsd: 1})).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/protocol exec vitest run test/usage-types.test.ts`
Expected: FAIL — cannot find module `../src/usage-types.js`.

- [ ] **Step 3: Create the implementation**

Create `packages/protocol/src/usage-types.ts`:

```ts
import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// A normalized, harness-agnostic snapshot of a session's model usage. Every field is
// optional: a harness reports only what its CLI exposes, and the widget degrades per
// missing field. Values are ABSOLUTE (current state), not deltas — the latest snapshot
// fully describes the session, so the decode spine merges them last-wins per field.
export const UsageSnapshotSchema = z.object({
  modelId: z.string().optional(),
  contextWindow: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  totalCostUsd: z.number().nonnegative().optional(),
  numTurns: z.number().int().nonnegative().optional(),
})
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

// The CUSTOM event name the widget listens for via useChat({onCustomEvent}).
export const AIDX_USAGE_EVENT = 'aidx-usage'

// Wrap a snapshot as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiUsageFor(snapshot: UsageSnapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: AIDX_USAGE_EVENT, value: snapshot}
}

// Context occupancy = the prompt resident in the window this turn (input + cache). Output
// is generation, not occupancy, so it is excluded (shown in the breakdown instead).
// Returns undefined when no token data is present.
export function contextUsedTokens(s: UsageSnapshot): number | undefined {
  const parts = [s.inputTokens, s.cacheReadTokens, s.cacheWriteTokens]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}
```

- [ ] **Step 4: Register the build entry + export**

In `packages/protocol/tsdown.config.ts`, add `'src/usage-types.ts',` to the `entry` array (after `'src/page-types.ts',`).

In `packages/protocol/package.json` `exports`, add after the `./page-types` block:

```json
    "./usage-types": {
      "types": "./dist/usage-types.d.ts",
      "import": "./dist/usage-types.js"
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aidx/protocol exec vitest run test/usage-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Build protocol so dependents can import the new subpath**

Run: `pnpm turbo run build --filter=@aidx/protocol`
Expected: success; `packages/protocol/dist/usage-types.js` and `.d.ts` exist.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/usage-types.ts packages/protocol/test/usage-types.test.ts packages/protocol/tsdown.config.ts packages/protocol/package.json
git commit -m "feat(protocol): normalized UsageSnapshot + aidx-usage event"
```

---

## Task 2: Harness spine + codex extractor

**Files:**
- Modify: `packages/harness/src/_shared/agui.ts`
- Modify: `packages/harness/src/codex/decode.ts`
- Test: `packages/harness/test/codex-decode.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/harness/test/codex-decode.test.ts` (inside the existing `describe('codex decode', …)` block, before its closing `})`). Also add the import at the top of the file: `import {AIDX_USAGE_EVENT} from '@aidx/protocol/usage-types'`.

```ts
  it('emits an aidx-usage CUSTOM chunk from turn.completed usage', async () => {
    const got = await collect([THREAD, AGENT, DONE])
    const usage = got.find((c) => c.type === EventType.CUSTOM && (c as {name?: string}).name === AIDX_USAGE_EVENT)
    expect((usage as {value: {inputTokens: number; outputTokens: number}}).value).toEqual({inputTokens: 1, outputTokens: 2})
  })

  it('does not emit usage when no event carries it', async () => {
    const got = await collect([THREAD, AGENT])
    expect(got.some((c) => c.type === EventType.CUSTOM && (c as {name?: string}).name === AIDX_USAGE_EVENT)).toBe(false)
  })

  it('emits usage only once when the snapshot does not change', async () => {
    const got = await collect([THREAD, DONE, DONE])
    const usages = got.filter((c) => c.type === EventType.CUSTOM && (c as {name?: string}).name === AIDX_USAGE_EVENT)
    expect(usages).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aidx/harness exec vitest run test/codex-decode.test.ts`
Expected: FAIL — no CUSTOM `aidx-usage` chunk is emitted.

- [ ] **Step 3: Add the extractor plumbing to the shared spine**

In `packages/harness/src/_shared/agui.ts`, add the import at the top:

```ts
import {aguiUsageFor, type UsageSnapshot} from '@aidx/protocol/usage-types'
```

Add the type next to `Step` (after the `export type Step<E> = …` line):

```ts
// Optional per-harness usage mapping. PURE: decode one already-validated event into the
// usage fields it carries (absolute values), or null when it carries none. The spine
// merges successive partials (last-wins per defined field) and emits an `aidx-usage`
// CUSTOM chunk whenever the merged snapshot changes. A harness that omits this emits no
// usage — the widget tracker stays hidden, degrading cleanly.
export type UsageExtractor<E> = (event: E) => Partial<UsageSnapshot> | null

// Drop undefined-valued keys so a partial never clobbers a known field with a blank.
function definedOnly(delta: Partial<UsageSnapshot>): Partial<UsageSnapshot> {
  const out: Partial<UsageSnapshot> = {}
  for (const [k, v] of Object.entries(delta)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

// Shallow per-field equality over the union of keys — emit only on real change.
function sameUsage(a: UsageSnapshot, b: UsageSnapshot): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  return true
}
```

Change the `runAgui` signature and loop to accept and run the extractor. Replace the existing `runAgui` function with:

```ts
export async function* runAgui<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  opts: HarnessDecodeOpts,
  step: Step<E>,
  extractUsage?: UsageExtractor<E>,
): AsyncGenerator<StreamChunk> {
  const runId = opts.runId ?? 'aidx-run'
  const threadId = opts.threadId ?? 'aidx-chat'
  const counter = {n: 0}
  const mint: Mint = (prefix) => {
    counter.n += 1
    return `${threadId}-${prefix}${counter.n}`
  }
  let usage: UsageSnapshot = {}
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const line of lines) {
    opts.logger?.provider('harness-line', {line})
    const event = parseJsonLine(line, schema)
    if (event === null) continue
    yield* step(event, {mint, onSessionId: opts.onSessionId})
    if (extractUsage) {
      const delta = extractUsage(event)
      if (delta) {
        const next = {...usage, ...definedOnly(delta)}
        if (!sameUsage(usage, next)) {
          usage = next
          yield aguiUsageFor(usage)
        }
      }
    }
  }
  yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
}
```

- [ ] **Step 4: Add the codex extractor**

In `packages/harness/src/codex/decode.ts`:

Add to the existing import from `../_shared/agui.js`: append `type UsageExtractor` to the named imports.
Add the protocol import at the top: `import type {UsageSnapshot} from '@aidx/protocol/usage-types'`.

Add `usage` to `CodexEventSchema` (it is already `.loose()`):

```ts
const CodexEventSchema = z
  .object({type: z.string(), thread_id: z.string().optional(), item: z.unknown().optional(), usage: z.unknown().optional()})
  .loose()
```

Add the extractor (above `codexToAguiEvents`):

```ts
const CodexUsage = z.object({input_tokens: z.number().optional(), output_tokens: z.number().optional()}).loose()

// codex reports cumulative turn usage on turn.completed; no model/window/cost yet.
const codexUsage: UsageExtractor<CodexEvent> = (e) => {
  if (e.type !== 'turn.completed') return null
  const u = CodexUsage.safeParse(e.usage)
  if (!u.success) return null
  return {inputTokens: u.data.input_tokens, outputTokens: u.data.output_tokens}
}
```

Pass it to `runAgui`:

```ts
export function codexToAguiEvents(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
  return runAgui(lines, CodexEventSchema, opts, codexStep, codexUsage)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @aidx/harness exec vitest run test/codex-decode.test.ts`
Expected: PASS (original 4 + new 3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/_shared/agui.ts packages/harness/src/codex/decode.ts packages/harness/test/codex-decode.test.ts
git commit -m "feat(harness): usage extractor API + codex usage"
```

---

## Task 3: Claude usage extractor

**Files:**
- Modify: `packages/harness/src/claude/decode.ts`
- Test: `packages/harness/test/claude-decode.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/harness/test/claude-decode.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {claudeToAguiEvents} from '../src/claude/decode.js'
import {AIDX_USAGE_EVENT} from '@aidx/protocol/usage-types'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}
async function collect(input: string[]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of claudeToAguiEvents(lines(input), {onSessionId: () => {}})) out.push(c)
  return out
}
function usageValues(chunks: StreamChunk[]): Array<Record<string, unknown>> {
  return chunks
    .filter((c) => c.type === EventType.CUSTOM && (c as {name?: string}).name === AIDX_USAGE_EVENT)
    .map((c) => (c as {value: Record<string, unknown>}).value)
}

const ASSISTANT = JSON.stringify({
  type: 'assistant',
  message: {
    model: 'claude-opus-4-8[1m]',
    content: [{type: 'text', text: 'hi'}],
    usage: {input_tokens: 18151, cache_read_input_tokens: 15832, cache_creation_input_tokens: 1912, output_tokens: 19},
  },
})
const RESULT = JSON.stringify({
  type: 'result',
  session_id: 'sess-1',
  total_cost_usd: 0.118,
  num_turns: 1,
  modelUsage: {'claude-opus-4-8[1m]': {contextWindow: 1000000, costUSD: 0.118}},
})

describe('claude decode — usage', () => {
  it('extracts per-turn usage + model from an assistant event', async () => {
    const v = usageValues(await collect([ASSISTANT]))
    expect(v[0]).toEqual({
      modelId: 'claude-opus-4-8[1m]',
      inputTokens: 18151,
      outputTokens: 19,
      cacheReadTokens: 15832,
      cacheWriteTokens: 1912,
    })
  })

  it('merges contextWindow + cost + turns from the result event', async () => {
    const v = usageValues(await collect([ASSISTANT, RESULT]))
    const last = v.at(-1)!
    expect(last.contextWindow).toBe(1000000)
    expect(last.totalCostUsd).toBe(0.118)
    expect(last.numTurns).toBe(1)
    expect(last.inputTokens).toBe(18151) // carried from the assistant snapshot (last-wins merge)
  })

  it('emits no usage for an assistant event without a usage field', async () => {
    const noUsage = JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'hi'}]}})
    expect(usageValues(await collect([noUsage]))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aidx/harness exec vitest run test/claude-decode.test.ts`
Expected: FAIL — no usage chunks emitted.

- [ ] **Step 3: Extend the claude schema + add the extractor**

In `packages/harness/src/claude/decode.ts`:

Add the protocol import at the top: `import type {UsageSnapshot} from '@aidx/protocol/usage-types'`.
Add `type UsageExtractor` to the existing named imports from `../_shared/agui.js`.

Replace `ClaudeEventSchema` with a version that carries the usage-bearing fields (still `.loose()`):

```ts
const ClaudeEventSchema = z
  .object({
    type: z.string(),
    session_id: z.string().optional(),
    message: z
      .object({content: z.array(z.unknown()).optional(), model: z.string().optional(), usage: z.unknown().optional()})
      .loose()
      .optional(),
    total_cost_usd: z.number().optional(),
    num_turns: z.number().optional(),
    modelUsage: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()
```

Add the extractor + helper (above `claudeToAguiEvents`):

```ts
const ClaudeUsage = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .loose()
const ClaudeModelUsage = z.object({contextWindow: z.number().optional()}).loose()

// modelUsage is keyed BY model id (e.g. "claude-opus-4-8[1m]"); a turn has one entry.
function pickModelUsage(m: Record<string, unknown> | undefined): {modelId: string; entry: unknown} | null {
  if (!m) return null
  const [modelId] = Object.keys(m)
  return modelId === undefined ? null : {modelId, entry: m[modelId]}
}

const claudeUsage: UsageExtractor<ClaudeEvent> = (e) => {
  if (e.type === 'assistant') {
    const u = ClaudeUsage.safeParse(e.message?.usage)
    if (!u.success) return null
    return {
      modelId: typeof e.message?.model === 'string' ? e.message.model : undefined,
      inputTokens: u.data.input_tokens,
      outputTokens: u.data.output_tokens,
      cacheReadTokens: u.data.cache_read_input_tokens,
      cacheWriteTokens: u.data.cache_creation_input_tokens,
    }
  }
  if (e.type === 'result') {
    const picked = pickModelUsage(e.modelUsage)
    const win = picked ? ClaudeModelUsage.safeParse(picked.entry) : undefined
    return {
      modelId: picked?.modelId,
      contextWindow: win?.success ? win.data.contextWindow : undefined,
      totalCostUsd: e.total_cost_usd,
      numTurns: e.num_turns,
    }
  }
  return null
}
```

Pass it to `runAgui`:

```ts
export function claudeToAguiEvents(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
  return runAgui(lines, ClaudeEventSchema, opts, claudeStep, claudeUsage)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aidx/harness exec vitest run test/claude-decode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck the harness package**

Run: `pnpm turbo run typecheck --filter=@aidx/harness`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/claude/decode.ts packages/harness/test/claude-decode.test.ts
git commit -m "feat(harness): claude usage extractor (tokens, window, cost, turns)"
```

---

## Task 4: HoverCard component

**Files:**
- Create: `packages/widget/src/hover-card.tsx`

(No isolated unit test — UI is verified in a real browser in Task 9, per the project's no-jsdom rule. This task is verified by typecheck.)

- [ ] **Step 1: Create the component**

Create `packages/widget/src/hover-card.tsx`:

```tsx
import {createSignal, onCleanup, type JSX} from 'solid-js'

// Safe wrappers: showPopover/hidePopover throw if called in the wrong state.
function show(el: HTMLElement | undefined): void {
  try {
    el?.showPopover()
  } catch {
    // already open / not connected
  }
}
function hide(el: HTMLElement | undefined): void {
  try {
    el?.hidePopover()
  } catch {
    // already hidden
  }
}

// Hover/focus-triggered popover. The trigger renders inline; the content renders in the
// top layer (popover="manual") so it escapes the header's overflow and sits above the
// panel and FAB. Opens on pointer-enter OR keyboard focus, stays open while the pointer
// bridges trigger→content, closes on pointer-leave of BOTH / blur / Escape. Position is
// computed under the trigger (flips above when there's no room below) and recomputed on
// scroll/resize while open.
export function HoverCard(props: {
  trigger: JSX.Element
  children: JSX.Element
  openDelay?: number
  closeDelay?: number
  sideOffset?: number
  class?: string
  label?: string
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  let anchorEl: HTMLSpanElement | undefined
  let contentEl: HTMLDivElement | undefined
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const position = () => {
    if (!anchorEl || !contentEl) return
    const a = anchorEl.getBoundingClientRect()
    const c = contentEl.getBoundingClientRect()
    const offset = props.sideOffset ?? 6
    const below = a.bottom + offset
    const flip = below + c.height > window.innerHeight && a.top - offset - c.height > 0
    const top = flip ? a.top - offset - c.height : below
    const left = Math.max(8, Math.min(a.left, window.innerWidth - c.width - 8))
    contentEl.style.left = `${left}px`
    contentEl.style.top = `${top}px`
  }
  const reposition = () => requestAnimationFrame(position)

  const detach = () => {
    window.removeEventListener('scroll', reposition, true)
    window.removeEventListener('resize', reposition)
  }
  const doOpen = () => {
    clearTimeout(closeTimer)
    if (open()) return
    openTimer = setTimeout(() => {
      setOpen(true)
      show(contentEl)
      reposition()
      window.addEventListener('scroll', reposition, true)
      window.addEventListener('resize', reposition)
    }, props.openDelay ?? 0)
  }
  const doClose = () => {
    clearTimeout(openTimer)
    closeTimer = setTimeout(() => {
      setOpen(false)
      hide(contentEl)
      detach()
    }, props.closeDelay ?? 120)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) {
      e.stopPropagation()
      clearTimeout(openTimer)
      setOpen(false)
      hide(contentEl)
      detach()
    }
  }
  onCleanup(() => {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
    detach()
  })

  return (
    <span class="pw-hovercard">
      <span
        class="pw-hovercard-anchor"
        ref={(el) => (anchorEl = el)}
        aria-label={props.label}
        aria-expanded={open()}
        onPointerEnter={doOpen}
        onPointerLeave={doClose}
        onFocusIn={doOpen}
        onFocusOut={doClose}
        onKeyDown={onKeyDown}
      >
        {props.trigger}
      </span>
      <div
        ref={(el) => {
          contentEl = el
          el.setAttribute('popover', 'manual')
        }}
        class={`pw-popover pw-hovercard-content ${props.class ?? ''}`}
        onPointerEnter={doOpen}
        onPointerLeave={doClose}
      >
        {props.children}
      </div>
    </span>
  )
}
```

- [ ] **Step 2: Typecheck the widget package**

Run: `pnpm turbo run typecheck --filter=@aidx/widget`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/hover-card.tsx
git commit -m "feat(widget): reusable HoverCard popover component"
```

---

## Task 5: ContextTracker component + styles

**Files:**
- Create: `packages/widget/src/context-tracker.tsx`
- Modify: `packages/widget/src/styles.css`

(Verified by typecheck here; behavior is exercised in Task 9's browser IT.)

- [ ] **Step 1: Create the component**

Create `packages/widget/src/context-tracker.tsx`:

```tsx
import {Show, type JSX} from 'solid-js'
import {HoverCard} from './hover-card.js'
import {contextUsedTokens, type UsageSnapshot} from '@aidx/protocol/usage-types'

const pct = new Intl.NumberFormat('en-US', {style: 'percent', maximumFractionDigits: 1})
const compact = new Intl.NumberFormat('en-US', {notation: 'compact'})
const usd = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const ICON_R = 10
const ICON_VB = 24
const ICON_CENTER = 12
const ICON_SW = 2

function Ring(props: {percent: number}): JSX.Element {
  const circ = 2 * Math.PI * ICON_R
  return (
    <svg
      class="pw-ctx-ring"
      width="16"
      height="16"
      viewBox={`0 0 ${ICON_VB} ${ICON_VB}`}
      role="img"
      aria-label="Model context usage"
    >
      <circle cx={ICON_CENTER} cy={ICON_CENTER} r={ICON_R} fill="none" stroke="currentColor" opacity="0.25" stroke-width={ICON_SW} />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        r={ICON_R}
        fill="none"
        stroke="currentColor"
        opacity="0.7"
        stroke-width={ICON_SW}
        stroke-linecap="round"
        stroke-dasharray={`${circ} ${circ}`}
        stroke-dashoffset={circ * (1 - props.percent)}
        style={{transform: 'rotate(-90deg)', 'transform-origin': 'center'}}
      />
    </svg>
  )
}

function UsageRow(props: {label: string; tokens?: number}): JSX.Element {
  return (
    <Show when={props.tokens}>
      <div class="pw-ctx-row">
        <span class="pw-ctx-row-label">{props.label}</span>
        <span class="pw-ctx-row-val">{compact.format(props.tokens ?? 0)}</span>
      </div>
    </Show>
  )
}

// Per-session top-bar tracker. Hidden until the first snapshot with token data. Shows a
// percentage ring when the context window is known, else a compact token count.
export function ContextTracker(props: {usage: UsageSnapshot | null}): JSX.Element {
  const used = () => (props.usage ? contextUsedTokens(props.usage) : undefined)
  const maxTokens = () => props.usage?.contextWindow
  const percent = () => {
    const u = used()
    const m = maxTokens()
    return u !== undefined && m ? u / m : undefined
  }
  const hasData = () => used() !== undefined || props.usage?.outputTokens !== undefined

  return (
    <Show when={props.usage && hasData()}>
      <HoverCard
        label="Model context usage"
        class="pw-ctx-card"
        trigger={
          <button type="button" class="pw-ctx-trigger">
            <Show
              when={percent() !== undefined}
              fallback={<span class="pw-ctx-pct">{compact.format(used() ?? props.usage?.outputTokens ?? 0)}</span>}
            >
              <span class="pw-ctx-pct">{pct.format(percent() ?? 0)}</span>
              <Ring percent={percent() ?? 0} />
            </Show>
          </button>
        }
      >
        <Show when={percent() !== undefined}>
          <div class="pw-ctx-head">
            <div class="pw-ctx-head-row">
              <span>{pct.format(percent() ?? 0)}</span>
              <span class="pw-ctx-head-tokens">
                {compact.format(used() ?? 0)} / {compact.format(maxTokens() ?? 0)}
              </span>
            </div>
            <div
              class="pw-ctx-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((percent() ?? 0) * 100)}
            >
              <div class="pw-ctx-bar-fill" style={{width: `${Math.min(100, (percent() ?? 0) * 100)}%`}} />
            </div>
          </div>
        </Show>
        <div class="pw-ctx-body">
          <UsageRow label="Input" tokens={props.usage?.inputTokens} />
          <UsageRow label="Output" tokens={props.usage?.outputTokens} />
          <UsageRow label="Cache" tokens={props.usage?.cacheReadTokens} />
          <UsageRow label="Reasoning" tokens={props.usage?.reasoningTokens} />
        </div>
        <Show when={props.usage?.totalCostUsd !== undefined || props.usage?.numTurns !== undefined}>
          <div class="pw-ctx-foot">
            <Show when={props.usage?.totalCostUsd !== undefined}>
              <div class="pw-ctx-row">
                <span class="pw-ctx-row-label">Total cost</span>
                <span>{usd.format(props.usage?.totalCostUsd ?? 0)}</span>
              </div>
            </Show>
            <Show when={props.usage?.numTurns !== undefined}>
              <div class="pw-ctx-row">
                <span class="pw-ctx-row-label">Turns</span>
                <span>{props.usage?.numTurns}</span>
              </div>
            </Show>
          </div>
        </Show>
      </HoverCard>
    </Show>
  )
}
```

- [ ] **Step 2: Add styles**

Append to `packages/widget/src/styles.css`:

```css
/* ── Context tracker: top-bar usage ring + hover popover. ───────────────────── */
.pw-hovercard {
  display: inline-flex;
}
.pw-hovercard-anchor {
  display: inline-flex;
}
.pw-hovercard-content {
  /* pw-popover already gives top-layer fixed positioning + chrome; JS sets left/top. */
  width: 240px;
  padding: 0;
}
.pw-ctx-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--pw-text-2);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 8px;
  font: inherit;
}
.pw-ctx-trigger:hover {
  color: var(--pw-text-hi);
  background: var(--pw-fill-soft);
}
.pw-ctx-pct {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.pw-ctx-ring {
  display: block;
}
.pw-ctx-head {
  padding: 12px;
  border-bottom: 1px solid var(--pw-line-soft);
}
.pw-ctx-head-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 8px;
}
.pw-ctx-head-tokens {
  font-family: var(--pw-font-mono, ui-monospace, monospace);
  color: var(--pw-text-2);
}
.pw-ctx-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--pw-fill-soft);
  overflow: hidden;
}
.pw-ctx-bar-fill {
  height: 100%;
  background: var(--pw-accent);
}
.pw-ctx-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pw-ctx-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.pw-ctx-row-label {
  color: var(--pw-text-2);
}
.pw-ctx-foot {
  padding: 12px;
  border-top: 1px solid var(--pw-line-soft);
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--pw-panel-sunk);
}
```

- [ ] **Step 3: Typecheck the widget package**

Run: `pnpm turbo run typecheck --filter=@aidx/widget`
Expected: success. (If `--pw-accent`/`--pw-font-mono` are undefined, the CSS fallbacks/`currentColor` still render; no typecheck impact.)

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/context-tracker.tsx packages/widget/src/styles.css
git commit -m "feat(widget): ContextTracker component + styles"
```

---

## Task 6: Wire ChatPanel

**Files:**
- Modify: `packages/widget/src/chat-panel.tsx`

- [ ] **Step 1: Import the usage types**

In `packages/widget/src/chat-panel.tsx`, change the protocol-ui import line to also pull usage types. Replace:

```ts
import {AIDX_UI_EVENT, UiSpecSchema, type UiSpec} from '@aidx/protocol/ui-types'
```

with:

```ts
import {AIDX_UI_EVENT, UiSpecSchema, type UiSpec} from '@aidx/protocol/ui-types'
import {AIDX_USAGE_EVENT, UsageSnapshotSchema, type UsageSnapshot} from '@aidx/protocol/usage-types'
```

- [ ] **Step 2: Add the prop**

Add to the `ChatPanel` props object type (after `composerActions?: …`):

```ts
  // Reports the session's latest usage snapshot, so the shell can render a context tracker.
  onUsageChange?: (usage: UsageSnapshot | null) => void
```

- [ ] **Step 3: Add the usage signal + custom-event branch**

After the `const [genUi, setGenUi] = createSignal<UiSpec[]>([])` line, add:

```ts
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
```

Replace the `onAidxUi` handler so it also handles usage. Change its signature/body from:

```ts
  const onAidxUi = (eventType: string, data: unknown) => {
    if (eventType !== AIDX_UI_EVENT) return
```

to:

```ts
  const onAidxUi = (eventType: string, data: unknown) => {
    if (eventType === AIDX_USAGE_EVENT) {
      const parsed = UsageSnapshotSchema.safeParse(data)
      if (parsed.success) setUsage((prev) => ({...prev, ...parsed.data}))
      return
    }
    if (eventType !== AIDX_UI_EVENT) return
```

(The rest of the handler body is unchanged.)

- [ ] **Step 4: Report usage up**

After the existing `createEffect(() => props.onWorkingChange?.(isThinking() || isStreaming()))`, add:

```ts
  // Surface the latest usage snapshot for the shell's context tracker.
  createEffect(() => props.onUsageChange?.(usage()))
```

- [ ] **Step 5: Pass it through chatPanelDef**

In `chatPanelDef`, add `onUsageChange={ctx.onUsageChange}` to the `<ChatPanel .../>` props (after `onWorkingChange={ctx.onWorkingChange}`).

- [ ] **Step 6: Typecheck**

Run: `pnpm turbo run typecheck --filter=@aidx/widget`
Expected: FAIL — `ctx.onUsageChange` does not exist on `PanelContext` yet (fixed in Task 7). This confirms the wiring is connected; proceed to Task 7 before committing.

- [ ] **Step 7: Commit (after Task 7 typecheck passes)**

This task commits together with Task 7 (the `PanelContext` change they share). See Task 7 Step 5.

---

## Task 7: Wire the modal shell

**Files:**
- Modify: `packages/widget/src/widget-shell.tsx`

- [ ] **Step 1: Import the tracker + type**

At the top of `packages/widget/src/widget-shell.tsx`, add:

```ts
import {ContextTracker} from './context-tracker.js'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'
```

- [ ] **Step 2: Extend PanelContext**

In the `PanelContext` type, add after `onWorkingChange: …`:

```ts
  // The content reports its latest model-usage snapshot, for the top-bar context tracker.
  onUsageChange: (usage: UsageSnapshot | null) => void
```

- [ ] **Step 3: Provide usage in ModalLayout**

In `ModalLayout`, after `const [working, setWorking] = createSignal(false)`, add:

```ts
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
```

Update the `props.panel.create({…})` call to pass the reporter (add after `onWorkingChange: setWorking,`):

```ts
    onUsageChange: setUsage,
```

- [ ] **Step 4: Render the tracker in the header**

In `ModalLayout`'s `<header class="pw-chat-head">`, insert the tracker between the title span and the close button:

```tsx
          <span class="pw-chat-title">{props.panel.title}</span>
          <ContextTracker usage={usage()} />
          <button type="button" class="pw-chat-close" aria-label="Close chat" onClick={closePanel}>
```

- [ ] **Step 5: Typecheck the whole widget + commit Tasks 6 + 7**

Run: `pnpm turbo run typecheck --filter=@aidx/widget`
Expected: success (the `QuickTerminalLayout.addPane` call to `props.panel.create` now lacks `onUsageChange` — if typecheck flags it, that is fixed in Task 8; if it passes because the missing property is caught only there, proceed to Task 8 and commit after).

> Note: `PanelContext.onUsageChange` is required, so `quick-terminal.tsx`'s `create({…})` call will fail typecheck until Task 8. Do Task 8, then run the typecheck below and commit all three together.

Run: `pnpm turbo run typecheck --filter=@aidx/widget` (after Task 8)
Expected: success.

```bash
git add packages/widget/src/chat-panel.tsx packages/widget/src/widget-shell.tsx packages/widget/src/quick-terminal.tsx
git commit -m "feat(widget): render ContextTracker in chat modal + quick-terminal panes"
```

---

## Task 8: Wire quick-terminal panes

**Files:**
- Modify: `packages/widget/src/quick-terminal.tsx`

- [ ] **Step 1: Import the tracker + type**

At the top of `packages/widget/src/quick-terminal.tsx`, add:

```ts
import {ContextTracker} from './context-tracker.js'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'
```

- [ ] **Step 2: Carry usage on each pane**

Change the `Pane` type to hold a usage accessor:

```ts
type Pane = {id: number; content: JSX.Element; usage: () => UsageSnapshot | null}
```

- [ ] **Step 3: Create a per-pane usage signal in addPane**

In `addPane`, replace the body up to `setPanes(...)` with:

```ts
  const addPane = () => {
    const id = ++seq
    const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
    // Each pane is its own session; it's the focused one that takes composer focus + hydrates.
    const content = props.panel.create({
      active: () => props.open() && focused() === id,
      onWorkingChange: () => {},
      onUsageChange: setUsage,
      composerActions: props.composerActions,
    })
    setPanes((ps) => [...ps, {id, content, usage}])
    focusPane(id)
  }
```

- [ ] **Step 4: Render the tracker in the pane bar**

In the pane bar markup, insert the tracker after the session name span:

```tsx
                <div class="pw-qt-pane-bar">
                  <span class="pw-qt-pane-dot" aria-hidden="true" />
                  <span class="pw-qt-pane-name">session-{pane.id}</span>
                  <ContextTracker usage={pane.usage()} />
                  <button
                    type="button"
                    class="pw-qt-pane-x"
                    aria-label="Close pane"
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm turbo run typecheck --filter=@aidx/widget`
Expected: success.

Commit happens with Tasks 6 + 7 (shared `PanelContext` change) — see Task 7 Step 5.

---

## Task 9: Browser IT — tracker renders from a streamed usage event

**Files:**
- Modify: `packages/widget/test/widget.it.test.ts`

- [ ] **Step 1: Import the helper + inject a usage event into the scripted stream**

In `packages/widget/test/widget.it.test.ts`, add to the protocol import line:

```ts
import {aguiUsageFor} from '@aidx/protocol/usage-types'
```

In `chatScript()`, add a usage CUSTOM event after the assistant text END and before the approval card:

```ts
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'm1'}
  yield aguiUsageFor({
    modelId: 'claude-opus-4-8[1m]',
    contextWindow: 1000000,
    inputTokens: 18151,
    cacheReadTokens: 15832,
    cacheWriteTokens: 1912,
    outputTokens: 19,
    totalCostUsd: 0.118,
    numTurns: 1,
  })
```

(`contextUsedTokens` = 18151 + 15832 + 1912 = 35,895 → 35,895 / 1,000,000 ≈ **3.6%**.)

- [ ] **Step 2: Write the failing test**

Add a new `it(...)` inside the `describe('aidx widget (it) …')` block:

```ts
  it('renders the context tracker from a streamed aidx-usage event and shows the breakdown on hover', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    const fab = page.getByRole('button', {name: 'Open aidx chat'})
    await fab.waitFor({state: 'visible'})
    await fab.click()
    const composer = page.getByLabel('Message the aidx agent')
    await composer.fill('do something')
    await composer.press('Enter')
    await page.getByText(ASSISTANT_TEXT).waitFor({state: 'visible'})

    // The streamed usage snapshot drives the ring: 35,895 / 1,000,000 ≈ 3.6%.
    const trigger = page.locator('.pw-ctx-trigger')
    await trigger.waitFor({state: 'visible'})
    await page.getByText('3.6%').first().waitFor({state: 'visible'})

    // Hovering opens the top-layer popover with the cost footer.
    await trigger.hover()
    await page.getByText('Total cost').waitFor({state: 'visible'})
    const footText = await page.locator('.pw-ctx-foot').textContent()
    expect(footText).toContain('$0.12')
    await page.close()
  })
```

(Uses the file's existing vitest `expect` on a string plus Playwright `waitFor` — matching the other tests; no Playwright web-first matchers, which are not available here.)

- [ ] **Step 3: Build the widget bundle (the IT loads dist/aidx-widget.global.js)**

Run: `pnpm turbo run build --filter=@aidx/widget`
Expected: success; `packages/widget/dist/aidx-widget.global.js` is rebuilt with the tracker.

- [ ] **Step 4: Run the IT**

Run: `pnpm --filter @aidx/widget exec vitest run test/widget.it.test.ts -t "context tracker"`
Expected: PASS. (If Playwright Chromium is missing, run `pnpm --filter @aidx/widget exec playwright install chromium` first.)

- [ ] **Step 5: Run the full widget IT to confirm no regression**

Run: `pnpm --filter @aidx/widget exec vitest run test/widget.it.test.ts`
Expected: PASS — the added usage event does not disturb the existing approval-gate test.

- [ ] **Step 6: Commit**

```bash
git add packages/widget/test/widget.it.test.ts
git commit -m "test(widget): IT for context tracker rendering + hover breakdown"
```

---

## Task 10: Full verification

- [ ] **Step 1: Build everything**

Run: `pnpm turbo run build`
Expected: success across all packages.

- [ ] **Step 2: Typecheck + lint + test**

Run: `pnpm turbo run typecheck && pnpm turbo run lint && pnpm turbo run test`
Expected: all pass.

- [ ] **Step 3: Format**

Run: `pnpm format`
Expected: files formatted; review and commit any changes.

```bash
git add -A
git commit -m "chore: oxfmt context-tracker changes" || echo "nothing to format"
```

---

## Degradation note (verified by design, not a dedicated IT)

The IT covers the full claude path (window known → ring + cost). The window-less path
(codex / unknown model → compact token count, no ring, no cost/turns rows) is guaranteed by
`ContextTracker`'s `Show when={percent() !== undefined}` fallback and the per-field `Show`
guards, plus `contextUsedTokens`' undefined handling (unit-tested in Task 1). A second
streamed-stream route was deliberately not added to keep the IT harness single-stream; if a
regression in the fallback is suspected later, add a `/__no-window` fixture mirroring Task 9.

## Out of scope (from spec)

- Live-only: snapshots are not replayed on resume (tracker empty until next turn).
- No per-token cost rows: only claude's session `total_cost_usd`.
- gemini-cli / opencode / pi stay stubs (emit nothing → tracker hidden).
