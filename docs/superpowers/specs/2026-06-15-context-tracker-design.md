# Context Tracker — Design Spec

- Date: 2026-06-15
- Status: Draft (awaiting review)
- Topic: Per-session model context/usage tracker in the widget top bar (chat modal + quick terminal)

## Goal

Show a live "context tracker" in the top bar of every agent session: a circular
percentage ring (context window occupancy) with a hover/focus popover breaking down
tokens (input / output / cache / reasoning), cumulative session cost, and turn count.

Ported in spirit from `vercel/ai-elements` `context.tsx`, adapted to SolidJS and the
widget's `pw-*` CSS (no React, no shadcn, no `tokenlens`).

The design's center of gravity is a **small, pure harness API** so adding usage support to
a new harness is one testable function — no stream plumbing.

## Background (verified, not assumed)

Probed a real `claude -p "hi" --output-format stream-json --verbose` (claude 2.1.177):

- `assistant` events carry `message.model` and `message.usage`:
  `{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens}`.
  These arrive per turn and drive the ring mid-stream.
- `result` events carry `total_cost_usd`, `num_turns`, and a `modelUsage` map keyed by
  model id, each entry with `{contextWindow, costUSD, inputTokens, outputTokens,
cacheReadInputTokens, cacheCreationInputTokens, maxOutputTokens}`.

So **the context window is emitted by the stream** (e.g. `claude-opus-4-8[1m]` →
`contextWindow: 1000000`). No hardcoded model→window table is needed. Harnesses that do
not emit a window (codex today) simply omit it and the ring degrades to a token count.

Today `claude/decode.ts` and `codex/decode.ts` translate their CLI events into AG-UI
`StreamChunk`s via the shared `runAgui` spine and drop all usage. `gemini-cli`, `opencode`,
and `pi` are capability-only stubs. There is already a CUSTOM-event side channel
(`aguiCustomFor` → `CONCIV_UI_EVENT` → `useChat({onCustomEvent})`) used by generative UI; the
usage tracker reuses that exact pattern with a new event name.

## Architecture

```
claude/codex CLI stdout (NDJSON)
        │
        ▼
  runAgui spine  ──step(event)──▶  content StreamChunks (text/tool/…)   [unchanged]
        │
        └──extractUsage(event)──▶ Partial<UsageSnapshot>
                  │ merge last-wins into running snapshot
                  │ emit on change
                  ▼
        aguiUsageFor(snapshot)  ─▶  CUSTOM StreamChunk {name: "conciv-usage"}
                  │ (SSE transport, same as conciv-ui)
                  ▼
  ChatPanel.onCustomEvent ─▶ usage signal ─▶ onUsageChange(snapshot)
                  │
                  ├─ ModalLayout  → <ContextTracker> in pw-chat-head
                  └─ QuickTerminal → <ContextTracker> per pane in pw-qt-pane-bar
```

Usage is **per session** (each `ChatPanel` owns one `useChat`). Data is **live-only**: it is
not replayed on resume, so a reopened session shows an empty tracker until its next turn.

## Interfaces

### 1. Protocol — `packages/protocol/src/usage-types.ts` (new)

The wire contract. Mirrors `ui-types.ts` (`CONCIV_UI_EVENT` / `aguiCustomFor`).

```ts
import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// A normalized, harness-agnostic snapshot of a session's model usage. Every field is
// optional: a harness reports only what its CLI exposes, and the widget degrades per
// missing field. Values are ABSOLUTE (the current state), not deltas — the latest
// snapshot fully describes the session, so merging is last-wins per field.
export const UsageSnapshotSchema = z.object({
  // Model label as reported by the CLI, e.g. "claude-opus-4-8[1m]". Display only.
  modelId: z.string().optional(),
  // Max context window for the active model, in tokens, when the CLI reports it.
  // Absent → the ring degrades to a raw token count (no percentage).
  contextWindow: z.number().int().nonnegative().optional(),
  // Latest turn's prompt + generation breakdown (absolute, for the active turn).
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  // Cumulative session figures.
  totalCostUsd: z.number().nonnegative().optional(),
  numTurns: z.number().int().nonnegative().optional(),
})
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

// The CUSTOM event name the widget listens for via useChat({onCustomEvent}).
export const CONCIV_USAGE_EVENT = 'conciv-usage'

// Wrap a snapshot as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiUsageFor(snapshot: UsageSnapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_USAGE_EVENT, value: snapshot}
}

// Occupancy = the prompt actually resident in the window this turn (input + cache).
// Output is generation, not occupancy, so it is excluded from the ring (shown in the
// breakdown). Returns undefined when no token data is present.
export function contextUsedTokens(s: UsageSnapshot): number | undefined {
  const parts = [s.inputTokens, s.cacheReadTokens, s.cacheWriteTokens]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}
```

Add `"./usage-types"` to `packages/protocol/package.json` `exports`.

### 2. Harness — the extractor API (`packages/harness/src/_shared/agui.ts`)

This is the **API a new harness implements**. One pure function. No `StreamChunk`, no event
name, no merge or emit logic — the spine owns all of that.

```ts
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

// Optional per-harness usage mapping. PURE: decode one already-validated event into the
// usage fields it carries (absolute values), or null when the event carries none. The
// shared spine merges successive partials (last-wins per defined field) and emits an
// `conciv-usage` CUSTOM chunk whenever the merged snapshot changes. A harness that omits
// this emits no usage at all — the widget tracker stays hidden, degrading cleanly.
export type UsageExtractor<E> = (event: E) => Partial<UsageSnapshot> | null
```

`runAgui` gains an optional final parameter and, when present, runs the extractor after the
content `step` on each event:

```ts
export async function* runAgui<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  opts: HarnessDecodeOpts,
  step: Step<E>,
  extractUsage?: UsageExtractor<E>,
): AsyncGenerator<StreamChunk> {
  // …existing lifecycle: RUN_STARTED, line loop, step(event) → chunks…
  let usage: UsageSnapshot = {}
  for await (const line of lines) {
    const event = parseJsonLine(line, schema)
    if (event === null) continue
    yield* step(event, {mint, onSessionId: opts.onSessionId})
    if (extractUsage) {
      const delta = extractUsage(event)
      if (delta) {
        const next = {...usage, ...definedOnly(delta)} // last-wins per defined field
        if (!sameUsage(usage, next)) {
          usage = next
          yield aguiUsageFor(usage)
        }
      }
    }
  }
  // …RUN_FINISHED…
}
```

Helpers (private to the spine): `definedOnly(delta)` strips `undefined` keys so a partial
never clobbers a known field with a blank; `sameUsage(a, b)` is a shallow per-field equality
check so we emit only when something changed (per assistant message / result, not per token).

### 3a. Component mapping — what the ai-elements reference actually needs

`vercel/ai-elements` `context.tsx` is a React component built on three shadcn/Radix
primitives plus `tokenlens`. Each maps to a concrete piece here. We have NO Kobalte /
floating-ui / corvu dependency, and the widget's house pattern for floating UI is the
native **HTML Popover API** (top layer, escapes `overflow`) + a JS-computed `fixed`
position — the same approach the existing `.pw-popover` CSS and `resize.ts` /
`draggable-position.ts` / `pip.ts` primitives use. So:

| ai-elements piece                                                   | Behavior to preserve                                                                                                                                                                                          | Our implementation                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `HoverCard` / `HoverCardTrigger` / `HoverCardContent` (Radix)       | open on pointer-enter AND keyboard focus; stay open while pointer bridges trigger→content; close on leave-of-both / blur / Escape; `openDelay`/`closeDelay`; floating placement with viewport flip; top layer | NEW headless primitive `createHoverCard` (`hover-card.ts`) + native Popover API                                         |
| `Progress` (Radix)                                                  | `role="progressbar"`, `aria-valuenow/min/max`, indicator scaled to value                                                                                                                                      | inline `pw-ctx-bar` / `pw-ctx-bar-fill` divs                                                                            |
| `Button variant="ghost"` (shadcn)                                   | styled, `type="button"`, focusable                                                                                                                                                                            | inline `<button class="pw-ctx-trigger">`                                                                                |
| `ContextIcon` (SVG ring)                                            | stroke-dash arc = used fraction                                                                                                                                                                               | ported verbatim (math below)                                                                                            |
| `createContext` fan-out (`Context` + 9 sub-exports sharing context) | section structure                                                                                                                                                                                             | collapses to ONE Solid `ContextTracker(props:{usage})`; sub-rows are internal helpers (Solid prop drilling, no context) |
| `tokenlens` `getUsage` (per-row $)                                  | per-token cost                                                                                                                                                                                                | DROPPED — claude reports a session total only; no new dep                                                               |

### 3b. HoverCard component — `packages/widget/src/hover-card.tsx` (new)

The missing piece, and a **reusable component** (we have none — the `.pw-popover` CSS is
orphaned, no JS popover exists). CSS alone is insufficient: top-layer toggling
(`showPopover`/`hidePopover`) and viewport-aware positioning require JS. It renders the
trigger inline and the content in the top layer via the native Popover API, and
encapsulates the full Radix-HoverCard interaction internally (refs + effects + timers).
Generic enough to reuse beyond the tracker.

```tsx
import type {JSX} from 'solid-js'

// Hover/focus-triggered popover. The trigger renders inline; the content renders in the
// top layer (popover="manual") so it escapes the header's overflow and sits above the
// panel and FAB. Opens on pointer-enter OR keyboard focus of the trigger, stays open
// while the pointer bridges trigger→content, closes on pointer-leave of BOTH / blur /
// Escape. Position is computed under the trigger (flips above when there's no room below)
// and recomputed on scroll/resize while open.
export function HoverCard(props: {
  trigger: JSX.Element // always-visible anchor (e.g. the ring button)
  children: JSX.Element // popover content
  openDelay?: number // default 0   (reference uses 0)
  closeDelay?: number // default 120 (reference uses 0; small bridge so crossing the
  //              gap to the card doesn't flicker-close)
  sideOffset?: number // default 6
  class?: string // extra class merged onto the content element
  label?: string // aria-label for the trigger wrapper
}): JSX.Element
```

Internal behavior (the "all the features" bar):

- **Open**: trigger `pointerenter` or `focusin` → after `openDelay`, `open=true`, the
  content's `.showPopover()`, then position.
- **Bridge**: `pointerleave` on the trigger or the content starts a `closeDelay` timer;
  `pointerenter` on either cancels it — closes only when the pointer is over neither,
  replicating Radix's grace bridge so the user can move onto the card to read/select.
- **Close**: timer fires, or `focusout` leaves both, or `Escape` keydown → `open=false`,
  `.hidePopover()`.
- **Position**: on open and on `scroll`/`resize` while open, read the trigger's
  `getBoundingClientRect()` and set the content's fixed `left`/`top` below it with
  `sideOffset`, flipping above on viewport-bottom overflow. Listeners attach on open and
  detach on close; an `onCleanup` removes any stragglers on unmount.
- **a11y**: trigger wrapper gets `aria-expanded` + `aria-label={label}`. The content is an
  informational, non-modal card (Radix hover-card semantics) — no `role`, no focus trap,
  not announced; it stays readable in browse mode.
- **Internals**: wraps the trigger in a `<span class="pw-hovercard-anchor">` (the ref it
  measures + attaches trigger listeners to) and renders the content `<div popover="manual"
class="pw-popover …">`. Reuses the existing `pw-popover` / `pw-pop-in` styles.

### 3c. Widget component — `packages/widget/src/context-tracker.tsx` (new)

```ts
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

// The top-bar context tracker for one session. Renders nothing until the first snapshot
// arrives. When contextWindow is known it shows a percentage ring; otherwise a raw token
// count. Uses the <HoverCard> component for the breakdown popover. One flat component —
// the reference's 10 context-sharing exports collapse here since data is a single prop.
export function ContextTracker(props: {usage: UsageSnapshot | null}): JSX.Element
```

Structure (mirrors the reference's sections, all features kept):

- **Trigger** (`pw-ctx-trigger`, the ghost button): `%` label
  (`Intl.NumberFormat` percent, 1 fraction digit) + the ring SVG. When `contextWindow` is
  absent, shows a compact token count (`Intl.NumberFormat` `notation:'compact'`) and no ring.
  Hidden entirely (returns `null`) until the first snapshot with any token data.
- **Ring SVG** (`ContextIcon`): ported verbatim —
  `circumference = 2π·r`, `usedPercent = contextUsedTokens(usage) / contextWindow`,
  `dashOffset = circumference·(1 − usedPercent)`, base circle at 0.25 opacity + arc at 0.7,
  rotated −90°. Uses `currentColor`.
- **Popover content** (the `<HoverCard>` children; the component owns `popover="manual"` + positioning):
  - _Header_ (`pw-ctx-head`): `%` + `used / window` (both compact), then a Progress bar
    (`pw-ctx-bar` track + `pw-ctx-bar-fill` indicator scaled to `usedPercent·100`,
    `role="progressbar"` `aria-valuenow/min/max`). Header hidden when `contextWindow` absent.
  - _Body_ (`pw-ctx-body`): Input / Output / Cache / Reasoning rows. Each row =
    `<UsageRow label tokens>` and renders only when that field is present and non-zero
    (matches the reference's per-row `if (!tokens) return null`). Compact token counts,
    **no per-row $**.
  - _Footer_ (`pw-ctx-foot`): `Total cost` (`totalCostUsd` as USD currency) and a turns
    line (`numTurns`). Each renders only when present. This is the budget / session-length
    surface the request asked for.
- **Classes**: `pw-ctx-*` added to `styles.css`, matching the existing dark popover tokens
  (`--pw-panel`, `--pw-line`, `--pw-text-*`), reusing the `pw-pop-in` animation.

### 4. Widget wiring — panel context extension

`packages/widget/src/widget-shell.tsx`, `PanelContext` gains a reporter mirroring
`onWorkingChange`:

```ts
export type PanelContext = {
  active: () => boolean
  onWorkingChange: (working: boolean) => void
  onUsageChange: (usage: UsageSnapshot | null) => void // NEW
  composerActions: () => ComposerActionDef[]
}
```

`ChatPanel` (`chat-panel.tsx`) gains `onUsageChange?` prop, a `usage` signal, a branch in its
existing `onCustomEvent` handler, and a reporting effect:

```ts
const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
const onCustom = (eventType: string, data: unknown) => {
  if (eventType === CONCIV_UI_EVENT) return onConcivUi(data)
  if (eventType === CONCIV_USAGE_EVENT) {
    const parsed = UsageSnapshotSchema.safeParse(data)
    if (parsed.success) setUsage((prev) => ({...prev, ...parsed.data}))
  }
}
createEffect(() => props.onUsageChange?.(usage()))
```

- `ModalLayout` holds its own `usage` signal (fed via the `onUsageChange` it passes to
  `create`) and renders `<ContextTracker usage={usage()} />` in `pw-chat-head`, next to the
  title.
- `QuickTerminalLayout`: each `Pane` gets its own `usage` signal; `addPane` passes
  `onUsageChange: setUsage` into `create`, stores the accessor on the pane, and renders
  `<ContextTracker usage={pane.usage()} />` in that pane's `pw-qt-pane-bar` (per session,
  matching the data model).

## Harness implementations

### claude — `packages/harness/src/claude/decode.ts`

Usage sub-schemas validated locally (same `safeParse` style as `TextBlock` etc.), so the
top-level `ClaudeEventSchema` stays lean:

```ts
const ClaudeUsage = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .loose()

const ClaudeModelUsage = z.object({contextWindow: z.number().optional(), costUSD: z.number().optional()}).loose()

function claudeUsage(e: ClaudeEvent): Partial<UsageSnapshot> | null {
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
    // modelUsage is keyed BY model id (e.g. "claude-opus-4-8[1m]"); a turn has one entry.
    // pickModelUsage returns {modelId: <key>, entry: <value>} for the sole/first key, or null.
    const picked = pickModelUsage(e.modelUsage)
    const win = picked ? ClaudeModelUsage.safeParse(picked.entry) : undefined
    return {
      modelId: picked?.modelId,
      contextWindow: win?.success ? win.data.contextWindow : undefined,
      totalCostUsd: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : undefined,
      numTurns: typeof e.num_turns === 'number' ? e.num_turns : undefined,
    }
  }
  return null
}

export function claudeToAguiEvents(lines, opts) {
  return runAgui(lines, ClaudeEventSchema, opts, claudeStep, claudeUsage)
}
```

`ClaudeEventSchema` extends (still `.loose()`) with optional `total_cost_usd`, `num_turns`,
`modelUsage` (`z.record(z.string(), z.unknown())`), and `message.{model,usage}`.

### codex — `packages/harness/src/codex/decode.ts`

```ts
const CodexUsage = z.object({input_tokens: z.number().optional(), output_tokens: z.number().optional()}).loose()

function codexUsage(e: CodexEvent): Partial<UsageSnapshot> | null {
  if (e.type !== 'turn.completed') return null
  const u = CodexUsage.safeParse(e.usage)
  if (!u.success) return null
  return {inputTokens: u.data.input_tokens, outputTokens: u.data.output_tokens}
}

export function codexToAguiEvents(lines, opts) {
  return runAgui(lines, CodexEventSchema, opts, codexStep, codexUsage)
}
```

No `contextWindow`/cost → ring degrades to a token count, cost/turns rows hidden.

### Adding a new harness (the whole point)

1. Write `xUsage(event): Partial<UsageSnapshot> | null` — a pure map from the harness's
   events to the normalized fields it exposes. Return `null` for events with no usage.
2. Pass it as the 5th arg to `runAgui` in that harness's decoder.

That is the entire surface. No CUSTOM-event name, no merge bookkeeping, no widget change.
A harness that maps nothing (the gemini/opencode/pi stubs) emits no usage and the tracker
stays hidden — zero-config graceful degradation.

## Degradation matrix

| Harness exposes      | Tracker behavior                                |
| -------------------- | ----------------------------------------------- |
| nothing (stubs)      | Hidden (no snapshot ever arrives).              |
| tokens, no window    | Compact token count, no ring percentage.        |
| tokens + window      | Full percentage ring.                           |
| + total cost / turns | Cost + turns rows appear in the popover footer. |
| no reasoning/cache   | Those breakdown rows are omitted.               |

Every field is independently optional; nothing throws on absence.

## Testing

- **Node unit (`packages/harness/test`)**: extend `claude-decode` / `codex-decode` tests to
  feed an `assistant` + `result` (claude) / `turn.completed` (codex) line sequence and
  assert the emitted `conciv-usage` CUSTOM chunk(s) carry the normalized fields, including
  last-wins merge and "emit only on change". Pure extractor functions are unit-tested
  directly.
- **Widget IT (real browser, `browser.newPage()` per project convention; no jsdom)**:
  mirror the existing `aguiCustomFor` injection test — stream an `aguiUsageFor(...)` event
  and assert the ring renders, the percentage matches, and the popover shows the breakdown.
  A second case streams a window-less snapshot and asserts the token-count fallback.
- **HoverCard IT (real browser)**: hover the trigger → content gains `:popover-open` and is
  positioned; move pointer onto the content → stays open (bridge); move off / press Escape →
  closes. Keyboard focus on the trigger also opens it.

## Out of scope / limitations

- **Live-only**: snapshots are not persisted, so resume shows an empty tracker until the
  next turn. (Possible follow-up: persist the last snapshot per session id.)
- **No per-token cost rows**: only claude's session `total_cost_usd` is shown; per-row USD
  (as `tokenlens` does) is dropped — no new dependency.
- gemini-cli / opencode / pi stay stubs; they inherit graceful hiding for free.
- No history/sparkline of usage over time; single current snapshot only.

## File manifest

| File                                      | Change                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/protocol/src/usage-types.ts`    | NEW — schema, event name, `aguiUsageFor`, `contextUsedTokens`                     |
| `packages/protocol/package.json`          | add `./usage-types` export                                                        |
| `packages/harness/src/_shared/agui.ts`    | `UsageExtractor` type, `runAgui` 5th param, merge/emit helpers                    |
| `packages/harness/src/claude/decode.ts`   | schema extend + `claudeUsage` extractor                                           |
| `packages/harness/src/codex/decode.ts`    | schema extend + `codexUsage` extractor                                            |
| `packages/widget/src/hover-card.tsx`      | NEW — reusable `HoverCard` popover component (top-layer, hover+focus, positioned) |
| `packages/widget/src/context-tracker.tsx` | NEW — Solid `ContextTracker` component (uses `HoverCard`)                         |
| `packages/widget/src/chat-panel.tsx`      | usage signal, `onCustomEvent` branch, `onUsageChange` prop                        |
| `packages/widget/src/widget-shell.tsx`    | `PanelContext.onUsageChange`, render in `pw-chat-head`                            |
| `packages/widget/src/quick-terminal.tsx`  | per-pane usage signal, render in `pw-qt-pane-bar`                                 |
| `packages/widget/src/styles.css`          | `pw-ctx-*` styles                                                                 |
| `packages/harness/test/*-decode.test.ts`  | usage extraction unit tests                                                       |
| `packages/widget/test/widget.it.test.ts`  | usage tracker IT                                                                  |
