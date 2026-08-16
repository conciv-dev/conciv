# Composer Actions Collapse & Refresh Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturated composer button row with compound `ComposerActions.*` primitives whose host coordinator collapses lower-priority actions into one shared overflow menu by measured width, and extract the session refresh affordance out of the composer into per-surface chrome.

**Architecture:** New `ComposerActions` compound components (Root/Button/DropdownItem/Inline) live in `@conciv/ui-kit-chat` under `src/primitives/composer/` — the package that already owns the composer primitives. EVERY consumer (apps/conciv, extension clients, testkit, scaffold templates, docs) imports them from `@conciv/ui-kit-chat`, the same way extensions import `TooltipIconButton` from `@conciv/ui-kit-system` today. `@conciv/extension` is NOT touched by UI work — it stays a lean contract package (its only edits in this plan are scaffold-template STRINGS in Task 5). A host-side `ComposerActionsHost` (provider + shared Ark `Menu.Root`) wraps the composer toolbar row as a logical Solid ancestor of both built-in actions and `ExtensionSurface name="composer"`. Overflow-menu ordering is real DOM order: the host renders one group node per registered root sorted by priority, and each `DropdownItem` portals into its own root's group node (never CSS `order`). Fit is pure arithmetic over a constant slot width and passive resize observers. Refresh becomes a `RefreshButton` reading a refresh handle that `ChatPane` registers into `PaneContext`.

**Tech Stack:** SolidJS, Ark UI Menu (zag), UnoCSS utility classes, vitest browser (Playwright/Chromium), storybook (consolidated `apps/storybook`), oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-08-16-composer-actions-collapse-design.md` (placement decision supersedes the spec's `@conciv/extension` export-surface line — recorded deviation, user-directed)

**Review inputs folded in:** codex plan review + Fable frontend review — all HIGH/CRITICAL findings addressed inline below.

## Global Constraints

- Functions only, no classes, no IIFEs, ZERO code comments (lint deletes them) — including in test code.
- Strict TS: no `any`, no `as` casts, no non-null assertions, `noUncheckedIndexedAccess`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Solid: `splitProps` (never destructure props), `@solid-primitives` over raw observer glue, no hooks inside JSX attributes, register context state synchronously in component bodies (NOT `onMount`) with `onCleanup`.
- NO hand-rolled components: every interactive element composes ui-kit primitives (`TooltipIconButton`/`TooltipIconButtonSlot`, `Menu.*` from `@conciv/ui-kit-system`). Raw elements allowed only for layout scaffolding (measurement wrappers, group nodes, invisible placeholder span).
- `ComposerActions` imports come from `@conciv/ui-kit-chat` EVERYWHERE. Adoption check at the end of every task that adds a consumer: `grep -rn "ComposerActions" --include="*.tsx" --include="*.ts" apps packages | grep "from '@conciv/extension'"` must return nothing.
- Widget UI tests: REAL Chromium (vitest browser), never jsdom. Web-first assertions only; no `poll`, no `querySelector`, no rect measurement, no sleeps, no test-ids. Locate by role/name. Assert `aria-disabled`/`toBeDisabled()`, never zag styling hooks.
- Whiteboard package suite NEVER runs locally: whiteboard gates are typecheck + build + lint only.
- Package test gates finish with `pnpm turbo run test --filter=<pkg>` (bare filter, NEVER trailing `...`); focused `pnpm vitest run` is for red/green iteration only.
- ui-kit-chat vitest projects: node project runs `test/**/*.test.ts`, browser project runs `test/**/*.browser.test.tsx` — name new files accordingly.
- New UnoCSS classes: `packages/ui-kit-chat/src` is already scanned by the embed uno config — no config change needed; embed rebuild (`pnpm turbo run build --filter=@conciv/embed`) still required before widget ITs.
- Commit with pathspec; run `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` before each commit (JSON runtime errors non-blocking). `fallow dead-code --trace` runs BEFORE deleting an export, not after.
- No new dependencies: `@solid-primitives/resize-observer` is ALREADY a ui-kit-chat dependency.
- All UI copy sentence-case (`'More composer actions'`).

## Layout constants (used across tasks)

Action buttons are `size-8.5` (34px) in a `gap-1` (4px) row. Slot = width + one gap; the budget additionally charges one region gap on each side of the managed region:

```ts
export const ACTION_SLOT_PX = 38
export const REGION_GAP_PX = 4
export const FIT_HYSTERESIS_PX = 24
```

The overflow trigger permanently occupies one slot (visibility-hidden placeholder when nothing is collapsed), so trigger appearance never feeds back into the fit input.

---

### Task 1: Fit arithmetic (pure function)

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/composer-actions-fit.ts`
- Test: `packages/ui-kit-chat/test/composer-actions-fit.test.ts` (node project)

**Interfaces:**

- Produces: `computeVisibleAutoCount(input: FitInput): number`, `type FitInput`, constants `ACTION_SLOT_PX`, `REGION_GAP_PX`, `FIT_HYSTERESIS_PX`. Task 2 consumes all of these.

The implementation and test bodies were already written and verified green on this branch's earlier revision (commit `7b550c1b`, since reset out of `packages/extension`) — recreate them VERBATIM at the new paths, only the test's import path changes:

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {
  ACTION_SLOT_PX,
  computeVisibleAutoCount,
  FIT_HYSTERESIS_PX,
  REGION_GAP_PX,
} from '../src/primitives/composer/composer-actions-fit.js'

const base = {
  slotWidth: ACTION_SLOT_PX,
  regionGapPx: REGION_GAP_PX,
  hysteresisPx: FIT_HYSTERESIS_PX,
  leadingWidth: 34,
  trailingWidth: 120,
  pinnedCount: 1,
  autoCount: 4,
  previousCount: null,
}

const used = (autoSlots: number): number =>
  base.leadingWidth +
  base.trailingWidth +
  2 * REGION_GAP_PX +
  ACTION_SLOT_PX +
  base.pinnedCount * ACTION_SLOT_PX +
  autoSlots * ACTION_SLOT_PX

describe('computeVisibleAutoCount', () => {
  it('shows every auto action when the budget covers them', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(4) + 40})).toBe(4)
  })

  it('clamps to the available whole slots', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + 10})).toBe(2)
  })

  it('never returns a negative count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 100})).toBe(0)
  })

  it('never exceeds the registered auto count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 5000})).toBe(4)
  })

  it('shrinks immediately when the row narrows', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(1) + 2, previousCount: 4})).toBe(1)
  })

  it('expands only once the budget clears the hysteresis margin', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + 4, previousCount: 1})).toBe(1)
    expect(computeVisibleAutoCount({...base, rowWidth: used(2) + FIT_HYSTERESIS_PX, previousCount: 1})).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/composer-actions-fit.test.ts` (cwd `packages/ui-kit-chat`) — FAIL, module not found.
- [ ] **Step 3: Implement**

```ts
export const ACTION_SLOT_PX = 38
export const REGION_GAP_PX = 4
export const FIT_HYSTERESIS_PX = 24

export type FitInput = {
  rowWidth: number
  leadingWidth: number
  trailingWidth: number
  slotWidth: number
  regionGapPx: number
  pinnedCount: number
  autoCount: number
  previousCount: number | null
  hysteresisPx: number
}

export function computeVisibleAutoCount(input: FitInput): number {
  const reserved =
    input.leadingWidth +
    input.trailingWidth +
    2 * input.regionGapPx +
    input.slotWidth +
    input.pinnedCount * input.slotWidth
  const budget = input.rowWidth - reserved
  const fits = Math.max(0, Math.min(input.autoCount, Math.floor(budget / input.slotWidth)))
  if (input.previousCount === null || fits <= input.previousCount) return fits
  if (budget < fits * input.slotWidth + input.hysteresisPx) return input.previousCount
  return fits
}
```

- [ ] **Step 4: Green + package gate** — focused run passes, then `pnpm turbo run test --filter=@conciv/ui-kit-chat`.
- [ ] **Step 5: Commit** (`feat(ui-kit-chat): composer actions fit arithmetic`, pathspec `packages/ui-kit-chat`).

---

### Task 2: `ComposerActions` primitives + host coordinator

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/composer-actions.tsx`
- Modify: `packages/ui-kit-chat/src/index.tsx` (export `ComposerActions` and `ComposerActionsHost` alongside the existing `ComposerPrimitive` exports)
- Test: `packages/ui-kit-chat/test/composer-actions.browser.test.tsx` (component-level, in-package browser project)

**Interfaces:**

- Consumes: Task 1's `computeVisibleAutoCount` + constants; `Menu`, `TooltipIconButton`, `TooltipIconButtonSlot` from `@conciv/ui-kit-system`; `createResizeObserver` from `@solid-primitives/resize-observer` (existing dep).
- Produces (from `@conciv/ui-kit-chat`):
  - `ComposerActions.Root(props: {id: string; priority?: number; disabled?: () => boolean; children: JSX.Element})` — `disabled` is THE single reactive source; both renderings consume it. No per-child disabled props.
  - `ComposerActions.Button(props: {visible?: 'auto' | 'always'; tooltip: string; onClick: () => void; busy?: boolean; class?: string; variant?: 'ghost' | 'solid'; children: JSX.Element})` — `busy` renders `aria-busy` + progress styling, never disables.
  - `ComposerActions.DropdownItem(props: {value: string; label: string; onSelect: () => void; children?: JSX.Element})`
  - `ComposerActions.Inline(props: {children: JSX.Element})` — renders children only while the root is inline; counts as the root's button for fit purposes (escape hatch for controls that are themselves triggers, e.g. the launch menu).
  - `ComposerActionsHost(props: {leading?: JSX.Element; trailing: JSX.Element; triggerContent: JSX.Element; onOverflowDismissed?: () => void; children: JSX.Element})`.

**Implementation contract (settled types — write exactly these):**

```tsx
type Registration = {
  key: string
  id: string
  priority: number
  pinned: boolean
  hasButton: boolean
  itemCount: number
  disabled: () => boolean
}

type Coordinator = {
  register: (entry: Registration) => void
  update: (key: string, patch: Partial<Omit<Registration, 'key'>>) => void
  unregister: (key: string) => void
  active: (key: string) => boolean
  inline: (key: string) => boolean
  groupMount: (key: string) => HTMLElement | undefined
}

type RootState = {
  key: string
  id: string
  priority: number
  disabled: () => boolean
  inline: () => boolean
  update: (patch: Partial<Omit<Registration, 'key' | 'id'>>) => void
}
```

Coordinator rules (inside `ComposerActionsHost`):

- Store: `createStore<Registration[]>([])`. `Root` registers **synchronously in its component body** (`createUniqueId()` key), `onCleanup` unregisters. `priority`/`disabled` changes tracked with a `createEffect` calling `update` (Solid props are getters; no stale metadata).
- Duplicate `id`: LAST registration with that id is active — `active(key)` false for earlier holders, whose Roots render nothing anywhere. `console.warn` once per collision, unconditional.
- Widths: `createResizeObserver` on three refs — outer row, leading wrapper, trailing wrapper. Wrappers carry `class="empty:hidden flex gap-1 items-center"` so an empty region costs nothing.
- Count memo — hysteresis via the memo's OWN previous value, no extra signal:

```tsx
const visibleAutoCount = createMemo<number | null>(
  (previous) =>
    computeVisibleAutoCount({
      rowWidth: rowWidth(),
      leadingWidth: leadingWidth(),
      trailingWidth: trailingWidth(),
      slotWidth: ACTION_SLOT_PX,
      regionGapPx: REGION_GAP_PX,
      pinnedCount: pinnedCount(),
      autoCount: autoCount(),
      previousCount: previous,
      hysteresisPx: FIT_HYSTERESIS_PX,
    }),
  null,
)
```

- `inline(key)`: pinned actives with a button always inline; auto actives with a button sorted priority desc then registration order, first `visibleAutoCount()` inline.
- **Menu ordering is DOM order, never CSS `order`:** inside `Menu.Content` the host renders `<For each={sortedActiveRoots()}>{(entry) => <div ref={(el) => setGroupEl(entry.key, el)} />}</For>` sorted priority desc then registration order. Each `DropdownItem` portals into ITS root's group node via `coordinator.groupMount(root.key)`. Visual order = DOM order = zag keyboard order; a root's items stay contiguous. `Menu.Content` keeps its default classes — no `flex` (its base is `hidden data-[state=open]:block`; adding `flex` creates a display conflict).
- Trigger slot (always occupies one slot):

```tsx
<Show when={anyCollapsed()} fallback={<span aria-hidden="true" class="size-8.5 shrink-0 invisible" />}>
  <TooltipIconButtonSlot tooltip="More composer actions" class={TRIGGER_CLASS}>
    {(buttonProps) => (
      <Menu.Trigger
        asChild={(triggerProps) => (
          <button {...buttonProps()} {...triggerProps()}>
            {props.triggerContent}
          </button>
        )}
      />
    )}
  </TooltipIconButtonSlot>
</Show>
```

`TRIGGER_CLASS` is a local constant on the `TooltipIconButton` ghost variant sizing (`'size-8.5'`); `triggerContent` keeps icon choice with the app (no lucide import here — this package's public API stays icon-agnostic like the rest of its primitives).

- `anyCollapsed()` = any active root with `itemCount > 0` not inline.
- **Menu-open collapse race:** control the menu (`Menu.Root open={menuOpen()} onOpenChange={...}`). A `createEffect` watching `anyCollapsed()`: on transition to false while open, close the menu and call `props.onOverflowDismissed` (app focuses the composer input); default focus target is the first inline action button.
- `Button`: sets `hasButton` + pinned via `root.update` synchronously, `onCleanup` resets `hasButton: false`. Renders `<Show when={root.inline()}>` → `TooltipIconButton` with `class`/`variant` passthrough, `aria-busy={props.busy}`, `disabled={root.disabled()}`.
- `Inline`: same registration as `Button` (never pinned), renders children when `root.inline()`.
- `DropdownItem`: `root.update` increments `itemCount` synchronously, `onCleanup` decrements. Renders

```tsx
<Show when={!root.inline() && coordinator.active(root.key) && coordinator.groupMount(root.key)}>
  {(mount) => (
    <Portal mount={mount()}>
      <Menu.Item value={`${root.id}:${props.value}`} disabled={root.disabled()} onSelect={() => props.onSelect()}>
        {props.children}
        {props.label}
      </Menu.Item>
    </Portal>
  )}
</Show>
```

- Root outside a coordinator: renders nothing.
- Row JSX: `Menu.Root` wraps `div class="pt-0.5 flex gap-1 items-center"` containing leading wrapper, `{props.children}`, trigger slot, trailing wrapper (`ml-auto` + `empty:hidden`), then `Menu.Positioner > Menu.Content` with the group `For`.

**Component-level browser tests** (`composer-actions.browser.test.tsx`, in-package — mount `ComposerActionsHost` directly with synthetic roots in a width-controlled container, following the package's existing browser-test mounting pattern):

- wide: all buttons inline, no trigger; narrow: low-priority roots collapse, trigger appears with `aria-haspopup`/`aria-expanded`, items fire `onSelect` and the menu closes.
- pinned root stays inline at any width; button-only root hidden when collapsed; item-only root menu-only; multi-item root's items contiguous in priority order.
- Root `disabled` accessor disables inline button AND menu item (`aria-disabled`), item not invocable.
- duplicate id: only last root renders.
- widening while menu open closes it without stranding focus (assert menu hidden + `onOverflowDismissed` observable effect).
- keyboard: Enter opens, ArrowDown highlights, Escape closes and returns focus to trigger.

- [ ] **Step 1: Write the failing browser tests.**
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/composer-actions.browser.test.tsx` (cwd `packages/ui-kit-chat`).
- [ ] **Step 3: Implement `composer-actions.tsx` per the contract; export from `index.tsx`.**
- [ ] **Step 4: Gates** — focused browser suite green, then `pnpm turbo run typecheck --filter=@conciv/ui-kit-chat && pnpm turbo run build --filter=@conciv/ui-kit-chat && pnpm turbo run test --filter=@conciv/ui-kit-chat`, then the bundling guard: `pnpm turbo run build --filter=@conciv/embed && pnpm turbo run test --filter=@conciv/embed` (mount-externals stays green).
- [ ] **Step 5: Commit** (`feat(ui-kit-chat): ComposerActions compound primitives with overflow coordinator`, pathspec `packages/ui-kit-chat`).

---

### Task 2b: Storybook coverage

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/composer-actions.stories.tsx` (`apps/storybook` already globs `packages/ui-kit-chat/src/**/*.stories.*` — zero config)

**Stories (rich, following `packages/ui-kit-system/src/menu.stories.tsx` conventions):**

- `AllInline` — wide fixed-width host, five mixed roots.
- `Collapsed` — narrow host, pinned + overflow trigger visible.
- `PinnedOnly` — `visible="always"` alongside collapsing autos.
- `MenuOnlyRoot` — item-only root.
- `MultiItemRoot` — launch-style root with conditional item set.
- `DisabledRoot` — disabled accessor live-toggled via story control.
- `ResizablePlayground` — host inside a CSS `resize: horizontal` container for manual dragging.
- Play functions (storybook vitest) on `Collapsed`, `DisabledRoot`, `MultiItemRoot`: open menu, assert menuitems by role/name, assert `aria-disabled`, select fires.

- [ ] **Step 1: Write stories + play functions.**
- [ ] **Step 2: Gate** — the storybook test gate for this package's stories (`pnpm turbo run test --filter=conciv-storybook` — confirm the app's real package name from `apps/storybook/package.json`).
- [ ] **Step 3: Commit** (`feat(ui-kit-chat): ComposerActions stories`, pathspec `packages/ui-kit-chat apps/storybook`).

---

### Task 3: Wire the coordinator into `PaneComposer`, migrate built-ins

**Files:**

- Modify: `apps/conciv/src/pane/pane-composer.tsx`, `apps/conciv/src/composer/actions.tsx`, `apps/conciv/src/pane/chat-pane.tsx`
- Modify: `apps/conciv/test/helpers/pane-harness.tsx` (width control)
- Test: `apps/conciv/test/composer-overflow.browser.test.tsx` (new — app-level wiring: built-ins + extension surface through the real pane)

**Interfaces:**

- Consumes: `ComposerActionsHost`, `ComposerActions` from `@conciv/ui-kit-chat` (import alias `ComposerActions as Action` in `actions.tsx` — the app component of the same name keeps its export).
- Produces: toolbar row contract — leading = attachment button; managed = built-ins + `ExtensionSurface name="composer"`; trailing = `trailingExtras` (model selector, own `Suspense` with slot-sized fallback) + refresh + send/cancel; trigger named `'More composer actions'`. Harness API: `mountPane(options & {width?: number})` returning `setWidth(px: number)` (reactive style width; `w-100` hardcode becomes the 400px default).

**pane-composer.tsx** — REFRESH STAYS UNTIL TASK 7 (`TrailingControls` unchanged in this task):

```tsx
<ComposerActionsHost
  triggerContent={<Ellipsis class="size-5 block" aria-hidden="true" />}
  onOverflowDismissed={() => focusComposerInput()}
  leading={
    <Show when={props.attachmentAdapter}>
      <ComposerPrimitive.AddAttachment class={GHOST}>
        <Paperclip size={16} aria-hidden="true" />
      </ComposerPrimitive.AddAttachment>
    </Show>
  }
  trailing={
    <>
      <Suspense fallback={<span class="size-8.5 shrink-0" />}>{props.trailingExtras}</Suspense>
      <Show when={props.busy} fallback={<TrailingControls />}>
        {props.busy}
      </Show>
    </>
  }
>
  {props.children}
</ComposerActionsHost>
```

(`focusComposerInput` = whatever handle the composer input adapter already exposes — reuse `onInputReady`'s handle, don't invent focus plumbing.) `PaneComposerProps` gains `trailingExtras?: JSX.Element`; `chat-pane.tsx` moves `<SessionModelSelector sessionId={sessionId} />` into it.

**actions.tsx** — built-ins on the primitives (grab pinned, launch coordinator-registered via `Inline` from day one so the fit budget counts it):

```tsx
<Action.Root id="conciv.grab" priority={40} disabled={grabDisabled}>
  <Action.Button
    visible="always"
    tooltip={grabDisabled() ? 'Nothing on this screen to select' : 'Select an element from the page'}
    busy={picking()}
    class={busyClass(picking())}
    onClick={() => void pick()}
  >
    <Crosshair class="size-5 block" />
  </Action.Button>
</Action.Root>
<Action.Root id="conciv.new-session" priority={30}>
  <Action.Button tooltip="Start a new session" class={ACT} onClick={() => props.onNewSession()}>
    <SquarePen class="size-5 block" />
  </Action.Button>
  <Action.DropdownItem value="new" label="Start a new session" onSelect={() => props.onNewSession()}>
    <SquarePen class="size-4 block" aria-hidden="true" />
  </Action.DropdownItem>
</Action.Root>
<Action.Root id="conciv.compact" priority={20} disabled={() => props.compacting}>
  <Action.Button tooltip="Compress the conversation" class={busyClass(props.compacting)} onClick={() => props.onCompact()}>
    <FoldVertical class="size-5 block" />
  </Action.Button>
  <Action.DropdownItem value="compact" label="Compress the conversation" onSelect={() => props.onCompact()}>
    <FoldVertical class="size-4 block" aria-hidden="true" />
  </Action.DropdownItem>
</Action.Root>
<Show when={meta.data === undefined || meta.data.harness.canLaunch}>
  <Action.Root id="conciv.launch" priority={10}>
    <Action.Inline>
      <LaunchMenu ... (existing props unchanged) />
    </Action.Inline>
  </Action.Root>
</Show>
```

Grab keeps ACT/busyClass styling and is NOT disabled while picking (`busy` only).

**pane-harness.tsx**: `w-100` → `style={{width: \`${width()}px\`}}`, signal default 400; `mountPane`accepts`width?`, returns `setWidth`. Verify with the fit constants that 400px keeps every built-in inline (≈342px used) so neighbor suites keep their inline locators; raise the default if the real trailing cluster measures wider, and say so in the commit.

**App-level tests** (`composer-overflow.browser.test.tsx`) — wiring-focused (primitives' own behavior is covered in-package by Task 2):

- wide: all built-ins inline, no trigger.
- narrow: grab pinned inline, new-session/compact collapsed into the menu, menu item fires the real action (assert via harness fixture callbacks: `expectNewSessionRequested`).
- disabled compacting root not invocable from menu (`aria-disabled`, `expectNoCompactRequested`).
- resize back and forth settles; expanding with menu open closes it.
- (keyboard lifecycle already covered in-package; don't duplicate here.)

- [ ] **Step 1: Write failing tests** (harness options `compacting`, `expectNewSessionRequested`, `expectNoCompactRequested` wired to fixture callbacks — extend harness options, never app state).
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/composer-overflow.browser.test.tsx` (cwd `apps/conciv`).
- [ ] **Step 3: Implement pane-composer + actions migration + harness width control.**
- [ ] **Step 4: Run new suite AND neighbors** — `pnpm vitest run test/composer-overflow.browser.test.tsx test/chat-pane.browser.test.tsx test/launch-menu.browser.test.tsx test/launch-actions.browser.test.tsx test/model-selector.browser.test.tsx` — PASS (refresh untouched, its tests stay green).
- [ ] **Step 5: Package gate + adoption grep + commit** (`feat(conciv): collapse composer actions into overflow menu`, pathspec `apps/conciv`).

---

### Task 4: Launch menu flattening (multi-item root)

**Files:**

- Modify: `apps/conciv/src/composer/launch-menu.tsx`, `apps/conciv/src/composer/actions.tsx`
- Test: extend `apps/conciv/test/launch-menu.browser.test.tsx`

`LaunchMenu` owns both renderings — the `Action.Root id="conciv.launch"` moves from `actions.tsx` into `LaunchMenu` itself (`actions.tsx` renders bare `<LaunchMenu .../>`):

```tsx
<Action.Root id="conciv.launch" priority={10} disabled={() => local.pending === true}>
  <Action.Inline>{existing Menu.Root block, unchanged}</Action.Inline>
  <Show
    when={local.failed === true}
    fallback={
      <>
        <Action.DropdownItem value="open" label={`Open in ${local.harnessName}`} onSelect={() => local.onOpen()}>
          <SquareTerminal class="size-4 block" aria-hidden="true" />
        </Action.DropdownItem>
        <Action.DropdownItem value="copy" label="Copy command" onSelect={() => local.onCopy()}>
          <ClipboardCopy class="size-4 block" aria-hidden="true" />
        </Action.DropdownItem>
      </>
    }
  >
    <Action.DropdownItem
      value="retry"
      label={`${optionsUnavailable(local.harnessName)} — ${RETRY_LABEL}`}
      onSelect={() => local.onRetry?.()}
    >
      <RotateCw class="size-4 block" aria-hidden="true" />
    </Action.DropdownItem>
  </Show>
</Action.Root>
```

- [ ] **Step 1: Failing tests** — narrow: `Open in <harness>` + `Copy command` menuitems contiguous in the shared menu; failure state shows the retry item instead. Wide: existing launch tests unchanged.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run launch + overflow + chat-pane suites; package gate.**
- [ ] **Step 5: Commit** (`feat(conciv): launch menu flattens into composer overflow`, pathspec `apps/conciv`).

---

### Task 5: Migrate extension clients, scaffolds, authoring docs

**Files:**

- Modify: `packages/extensions/whiteboard/src/client.tsx`, `packages/extensions/tanstack/src/client.tsx` (both add `import {ComposerActions} from '@conciv/ui-kit-chat'` — check each package.json declares `@conciv/ui-kit-chat`; add the workspace dep if absent, it's an internal workspace ref, not a new third-party dep)
- Modify (TEMPLATE STRINGS ONLY — no runtime code in this package): `packages/extension/src/catalog.ts` (`composer-action` + `full` templates now emit `import {ComposerActions} from '@conciv/ui-kit-chat'` examples; composer slot description names the primitives), `packages/extension/test/catalog.test.ts` (assertions match new verbatim strings)
- Modify: `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md`, `apps/site/content/docs/extending/widget-ui.mdx`

Whiteboard composer branch:

```tsx
<Show when={slot === 'composer'}>
  <ComposerActions.Root id="whiteboard.canvas" priority={20}>
    <ComposerActions.Button tooltip="Open the whiteboard canvas" onClick={() => toggle()}>
      <Presentation />
    </ComposerActions.Button>
    <ComposerActions.DropdownItem value="open" label="Open the whiteboard canvas" onSelect={() => toggle()}>
      <Presentation />
    </ComposerActions.DropdownItem>
  </ComposerActions.Root>
  <ComposerActions.Root id="whiteboard.comment" priority={19}>
    <ComposerActions.Button tooltip="Comment on an element" onClick={() => void pickComment()}>
      <MessageSquarePlus />
    </ComposerActions.Button>
    <ComposerActions.DropdownItem value="comment" label="Comment on an element" onSelect={() => void pickComment()}>
      <MessageSquarePlus />
    </ComposerActions.DropdownItem>
  </ComposerActions.Root>
</Show>
```

Tanstack: same transform. No authoring surface anywhere still demonstrates a raw composer button.

- [ ] **Step 1: Update `catalog.test.ts` expectations (failing)** — `pnpm vitest run test/catalog.test.ts` (cwd `packages/extension`) — FAIL.
- [ ] **Step 2: Apply all migrations.**
- [ ] **Step 3: Gates** — `pnpm turbo run test --filter=@conciv/extension`; tanstack package gate; whiteboard typecheck + build + lint ONLY; adoption grep.
- [ ] **Step 4: Commit** (`feat(extensions): author composer buttons through ComposerActions`, pathspec touched packages + site docs).

---

### Task 6: Extension-testkit host support + fixture

**Files:**

- Modify: `packages/extension-testkit/src/host/host-runtime.tsx` (wrap the composer-slot mount in `ComposerActionsHost` — testkit already depends on `@conciv/ui-kit-chat` — inside a width-controllable container with a labeled width control), `packages/extension-testkit/fixtures/ping/client.tsx` (fixture gains a `ComposerActions` root: Button + two DropdownItems)
- Test: new `packages/extension-testkit/test/composer-actions.it.test.ts` following the existing `test/*.it.test.ts` + `fixtureHost` pattern (NOT `e2e/` — that holds websocket/RPC probes)

- [ ] **Step 1: Failing test** — wide host: fixture button inline; narrow (set via the labeled width control with `userEvent`): button gone, `More composer actions` opens, both fixture items present and fire (assert via the fixture's observable effect).
- [ ] **Step 2: Implement host wrap + width control + fixture root.**
- [ ] **Step 3: Run** — `pnpm turbo run test --filter=@conciv/extension-testkit`.
- [ ] **Step 4: Commit** (`feat(extension-testkit): host composer actions coordinator`, pathspec `packages/extension-testkit`).

---

### Task 7: Extract refresh from the composer

**Files:**

- Modify (delete): `packages/ui-kit-chat/src/primitives/composer/composer.tsx` (`Refresh` + export), `composer-handlers.tsx` (`onRefresh`), refresh-specific tests in `packages/ui-kit-chat/test/composer-completion.browser.test.tsx` (deleted, not rewired)
- Modify: `apps/conciv/src/app/pane-context.ts`, `apps/conciv/src/app/pane-provider.tsx`, `apps/conciv/src/routes/panel.$sessionId.tsx` (context value + header button), `apps/conciv/src/pane/chat-pane.tsx` (register handle, drop `onRefresh`), `apps/conciv/src/pane/pane-composer.tsx` (delete `TrailingControls`, trailing keeps only `ComposerSendControl`), `apps/conciv/src/routes/quick.tsx` (LIFT `PaneProvider` to wrap the whole `data-pw-qt-pane` div — the session bar sits outside it and `usePane()` would throw; button goes in that bar), `apps/conciv/src/routes/pip.$sessionId.tsx` (slim `flex justify-end px-2 pt-1` row above `ChatPane`)
- Modify: `apps/conciv/test/helpers/pane-harness.tsx` (THIRD `PaneContextValue` construction site — gains the signal pair; harness view renders `<RefreshButton />` alongside `ChatPane`)
- Create: `apps/conciv/src/shell/refresh-button.tsx`
- Test: `apps/conciv/test/chat-pane.browser.test.tsx` (two refresh tests rewired against the harness-mounted `RefreshButton`), `apps/conciv/test/quick-refresh.browser.test.tsx` (quick per-pane presence + disabled-while-streaming) + pip presence in the pip suite if one exists (else cover pip mounting in quick-refresh file via its route scaffolding)

**Interfaces:**

- `type RefreshHandle = {run: () => void; busy: () => boolean}` in `pane-context.ts`; `PaneContextValue` gains `refresh: Accessor<RefreshHandle | null>`, `registerRefresh: (handle: RefreshHandle | null) => void`. ALL THREE construction sites get `const [refreshHandle, setRefreshHandle] = createSignal<RefreshHandle | null>(null)`.
- `chat-pane.tsx` registers in the component body: `pane.registerRefresh({run: () => chat.refresh(), busy: () => chatBusy(chat)})` + `onCleanup(() => pane.registerRefresh(null))` (`chatBusy` exported from `@conciv/ui-kit-chat`).
- `refresh-button.tsx`:

```tsx
import {Show, type JSX} from 'solid-js'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {usePane} from '../app/pane-context.js'

export function RefreshButton(props: {class?: string}): JSX.Element {
  const pane = usePane()
  return (
    <Show when={pane.refresh()}>
      {(handle) => (
        <TooltipIconButton
          tooltip="Refresh the conversation"
          class={props.class}
          disabled={handle().busy()}
          onClick={() => handle().run()}
        >
          <RefreshCw class="size-[1em] block" aria-hidden="true" />
        </TooltipIconButton>
      )}
    </Show>
  )
}
```

Placements: panel header right cluster before the close button (`CLOSE` class); quick per-pane session bar (inside the lifted provider); pip chrome row.

- [ ] **Step 1: Fallow trace BEFORE deleting** — `pnpm exec fallow dead-code --trace 'packages/ui-kit-chat/src/primitives/composer/composer.tsx:Refresh'` — confirm consumers are exactly `PaneComposer` + the ui-kit tests slated for deletion.
- [ ] **Step 2: Rewire tests (FAIL first)** — refresh tests target the harness-mounted `RefreshButton` (role button `'Refresh the conversation'`, `toBeDisabled()` while streaming); quick/pip presence tests.
- [ ] **Step 3: Implement — deletions, context handle, `RefreshButton`, three placements, quick provider lift, harness update.**
- [ ] **Step 4: Run** — `pnpm turbo run test --filter=@conciv/ui-kit-chat`, then `pnpm vitest run test/chat-pane.browser.test.tsx test/composer-overflow.browser.test.tsx test/quick-refresh.browser.test.tsx` (cwd `apps/conciv`), then the app package gate.
- [ ] **Step 5: Commit** (`feat(conciv): session refresh moves to pane chrome, out of the composer`, pathspec `packages/ui-kit-chat apps/conciv`).

---

### Task 8: Full gates + changeset

**Files:**

- Create: `.changeset/composer-actions-collapse.md`

- [ ] **Step 1: Changeset**

```md
---
'@conciv/ui-kit-chat': patch
---

Composer actions collapse into a shared overflow menu; extensions author buttons through ComposerActions.Root/Button/DropdownItem/Inline from @conciv/ui-kit-chat. Session refresh moved out of the composer into pane chrome.
```

- [ ] **Step 2: Coverage check** — `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main`.
- [ ] **Step 3: Final gates** — `pnpm turbo run build --filter=@conciv/embed`, `pnpm typecheck && pnpm test:affected`, `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.
- [ ] **Step 4: Commit** (`chore: changeset for composer actions collapse`, pathspec `.changeset`).

---

## Self-Review Notes

- Placement: `@conciv/ui-kit-chat` per user direction (2026-08-16) — supersedes the spec's `@conciv/extension` export-surface line. `packages/extension` sees template-string edits only (Task 5).
- Spec deviations recorded: (a) `RefreshButton` reads `PaneContext` on every surface — quick's bar and panel header both sit above `ChatProvider`; quick's `PaneProvider` lifted per-pane. (b) Menu ordering = per-root group nodes in host DOM order — zag walks DOM order; CSS `order` desyncs keyboard from visuals. (c) Placement change above.
- Root-level `disabled: () => boolean` is the ONLY disabled mechanism; `Button.busy` styling-only.
- Type names consistent: `FitInput`, `Registration`, `Coordinator`, `RootState`, `RefreshHandle`, `ComposerActionsHost`, `ComposerActions.{Root,Button,DropdownItem,Inline}`.
