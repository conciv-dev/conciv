# Composer Actions Collapse & Refresh Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturated composer button row with compound `ComposerActions.*` primitives whose host coordinator collapses lower-priority actions into one shared overflow menu by measured width, and extract the session refresh affordance out of the composer into per-surface chrome.

**Architecture:** New `ComposerActions` compound components (Root/Button/DropdownItem/Inline) live in `@conciv/extension`. A host-side `ComposerActionsHost` (provider + shared Ark `Menu.Root`) wraps the composer toolbar row as a logical Solid ancestor of both built-in actions and `ExtensionSurface name="composer"`. Overflow-menu ordering is real DOM order: the host renders one group node per registered root sorted by priority, and each `DropdownItem` portals into its own root's group node (never CSS `order`). Fit is pure arithmetic over a constant slot width and passive resize observers. Refresh becomes a `RefreshButton` reading a refresh handle that `ChatPane` registers into `PaneContext`.

**Tech Stack:** SolidJS, Ark UI Menu (zag), UnoCSS utility classes, vitest browser (Playwright/Chromium), oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-08-16-composer-actions-collapse-design.md`

**Review inputs folded in:** codex plan review (`/tmp/codex-plan-review.md`) + frontend review — all HIGH/CRITICAL findings addressed inline below.

## Global Constraints

- Functions only, no classes, no IIFEs, ZERO code comments (lint deletes them) — including in test code.
- Strict TS: no `any`, no `as` casts, no non-null assertions, `noUncheckedIndexedAccess`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Solid: `splitProps` (never destructure props), `@solid-primitives` over raw observer glue, no hooks inside JSX attributes, register context state synchronously in component bodies (NOT `onMount`) with `onCleanup` — `Suspense`/lazy boundaries make mount-order assumptions fragile.
- Widget UI tests: REAL Chromium (vitest browser), never jsdom. Web-first assertions only; no `poll`, no `querySelector`, no rect measurement, no sleeps, no test-ids. Locate by role/name. Assert `aria-disabled`/`toBeDisabled()`, never zag styling hooks like `data-disabled`.
- Whiteboard package suite NEVER runs locally: whiteboard gates are typecheck + build + lint only.
- Package test gates finish with `pnpm turbo run test --filter=<pkg>` (bare filter, NEVER trailing `...`); focused `pnpm vitest run` is for red/green iteration only.
- New UnoCSS classes need scanner coverage AND an embed rebuild (`pnpm turbo run build --filter=@conciv/embed`).
- Commit with pathspec; run `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` before each commit (JSON runtime errors non-blocking). `fallow dead-code --trace` runs BEFORE deleting an export, not after.
- **Dependency gate:** Task 2 adds `@solid-primitives/resize-observer` to `@conciv/extension` (already used by ui-kit-chat). This dependency addition has been approved by the user for this plan; add exactly this package, nothing else, no version pinning beyond the workspace convention.

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
- Create: `packages/extension/src/composer-actions-fit.ts`
- Test: `packages/extension/test/composer-actions-fit.test.ts`

**Interfaces:**
- Produces: `computeVisibleAutoCount(input: FitInput): number`, `type FitInput`, constants `ACTION_SLOT_PX`, `REGION_GAP_PX`, `FIT_HYSTERESIS_PX`. Task 2 consumes all of these.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {ACTION_SLOT_PX, FIT_HYSTERESIS_PX, REGION_GAP_PX, computeVisibleAutoCount} from '../src/composer-actions-fit.js'

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
  base.leadingWidth + base.trailingWidth + 2 * REGION_GAP_PX + ACTION_SLOT_PX + base.pinnedCount * ACTION_SLOT_PX + autoSlots * ACTION_SLOT_PX

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

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/composer-actions-fit.test.ts` (cwd `packages/extension`) — FAIL, module not found.
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
    input.leadingWidth + input.trailingWidth + 2 * input.regionGapPx + input.slotWidth + input.pinnedCount * input.slotWidth
  const budget = input.rowWidth - reserved
  const fits = Math.max(0, Math.min(input.autoCount, Math.floor(budget / input.slotWidth)))
  if (input.previousCount === null || fits <= input.previousCount) return fits
  if (budget < fits * input.slotWidth + input.hysteresisPx) return input.previousCount
  return fits
}
```

- [ ] **Step 4: Green + package gate** — focused run passes, then `pnpm turbo run test --filter=@conciv/extension`.
- [ ] **Step 5: Commit** (`feat(extension): composer actions fit arithmetic`, pathspec `packages/extension`).

---

### Task 2: `ComposerActions` primitives + host coordinator

**Files:**
- Create: `packages/extension/src/composer-actions.tsx`
- Modify: `packages/extension/src/index.ts` (export `ComposerActions`), `packages/extension/src/host.ts` (export `ComposerActionsHost`), `packages/extension/package.json` (add `@solid-primitives/resize-observer` — approved, see Global Constraints), `packages/embed/uno.config.ts` + `apps/conciv/uno.config.ts` (add `../extension/src/**/*.{ts,tsx}` — relative to each config — to the scanned globs; without this the new utility classes never reach the built CSS)

**Interfaces:**
- Consumes: Task 1's `computeVisibleAutoCount` + constants; `Menu`, `TooltipIconButton`, `TooltipIconButtonSlot` from `@conciv/ui-kit-system` (first RUNTIME import of ui-kit-system in this package — manifest dep already present); `createResizeObserver` from `@solid-primitives/resize-observer`.
- Produces (extension-author surface, from `@conciv/extension`):
  - `ComposerActions.Root(props: {id: string; priority?: number; disabled?: () => boolean; children: JSX.Element})` — `disabled` is THE single reactive source; both renderings consume it (spec requirement; per-child disabled props do not exist).
  - `ComposerActions.Button(props: {visible?: 'auto' | 'always'; tooltip: string; onClick: () => void; busy?: boolean; class?: string; variant?: 'ghost' | 'solid'; children: JSX.Element})` — `busy` renders `aria-busy` + progress styling, it does NOT disable.
  - `ComposerActions.DropdownItem(props: {value: string; label: string; onSelect: () => void; children?: JSX.Element})`
  - `ComposerActions.Inline(props: {children: JSX.Element})` — renders children only while the root is inline; counts as the root's button for fit purposes (the `asChild` escape for controls that are themselves triggers).
- Produces (host surface, from `@conciv/extension/host`):
  - `ComposerActionsHost(props: {leading?: JSX.Element; trailing: JSX.Element; triggerContent: JSX.Element; children: JSX.Element})` — no icon-library dependency in this package; the app passes the ellipsis icon via `triggerContent`.

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

- Store: `createStore<Registration[]>([])`. `Root` registers **synchronously in its component body** (`createUniqueId()` key), `onCleanup` unregisters. `priority`/`disabled` changes tracked with a `createEffect` that calls `update` (Solid props are getters; no stale metadata).
- Duplicate `id`: the LAST registration with that id is the active one — `active(key)` returns false for earlier holders, whose Roots render nothing (inline and menu). Warn unconditionally with `console.warn` once per collision.
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
- **Menu ordering is DOM order, never CSS `order`:** inside `Menu.Content` the host renders `<For each={sortedActiveRoots()}>{(entry) => <div data-composer-action-group ref={(el) => setGroupEl(entry.key, el)} />}</For>` sorted priority desc then registration order. Each `DropdownItem` portals into ITS root's group node via `coordinator.groupMount(root.key)`. Visual order = DOM order = zag keyboard order; a root's items stay contiguous. `Menu.Content` keeps its default classes — no `flex` (its base is `hidden data-[state=open]:block`; adding `flex` creates a display conflict).
- Trigger slot (always occupies one slot):

```tsx
<Show when={anyCollapsed()} fallback={<span aria-hidden="true" class="size-8.5 shrink-0 invisible" />}>
  <TooltipIconButtonSlot tooltip="More composer actions" class={TRIGGER_CLASS}>
    {(buttonProps) => (
      <Menu.Trigger asChild={(triggerProps) => <button {...buttonProps()} {...triggerProps()}>{props.triggerContent}</button>} />
    )}
  </TooltipIconButtonSlot>
</Show>
```

`TRIGGER_CLASS` is defined locally in `composer-actions.tsx` on the `TooltipIconButton` ghost variant sizing (`'size-8.5'`) — `GHOST` from pane-composer is app-private and must not be referenced.

- `anyCollapsed()` = any active root with `itemCount > 0` not inline.
- **Menu-open collapse race:** control the menu (`Menu.Root open={menuOpen()} onOpenChange={...}` or `Menu.Context` api). A `createEffect` watching `anyCollapsed()`: on transition to false while open, close the menu and move focus to the trigger's nearest surviving focusable — the first inline action button if one exists, else the composer input (host prop `onOverflowDismissed?: () => void` lets the app focus the input). Without this, expanding while the menu is open strands focus on `<body>`.
- `Button`: sets `hasButton` + pinned via `root.update` synchronously, `onCleanup` resets `hasButton: false`. Renders `<Show when={root.inline()}>` → `TooltipIconButton` with `class`/`variant` passthrough, `aria-busy={props.busy}`, `disabled={root.disabled()}`.
- `Inline`: same registration behavior as `Button` (`hasButton: true`, never pinned unless later needed), renders children when `root.inline()`.
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

- [ ] **Step 1: Add the dependency** — `@solid-primitives/resize-observer` to `packages/extension/package.json` (match the version ui-kit-chat uses), `pnpm install`.
- [ ] **Step 2: Write `composer-actions.tsx` per the contract; export `ComposerActions` from `index.ts`, `ComposerActionsHost` from `host.ts`; extend both uno configs.**
- [ ] **Step 3: Gates** — `pnpm turbo run build --filter=@conciv/extension && pnpm turbo run typecheck --filter=@conciv/extension && pnpm turbo run test --filter=@conciv/extension`, then the bundling guard NOW (not Task 8): `pnpm turbo run build --filter=@conciv/embed` and `pnpm turbo run test --filter=@conciv/embed` (mount-externals test must stay green — the extension contract now carries runtime Ark/tooltip imports).
- [ ] **Step 4: Commit** (`feat(extension): ComposerActions compound primitives with overflow coordinator`, pathspec `packages/extension packages/embed apps/conciv/uno.config.ts pnpm-lock.yaml`).

---

### Task 3: Wire the coordinator into `PaneComposer`, migrate built-ins

**Files:**
- Modify: `apps/conciv/src/pane/pane-composer.tsx`, `apps/conciv/src/composer/actions.tsx`, `apps/conciv/src/pane/chat-pane.tsx`
- Modify: `apps/conciv/test/helpers/pane-harness.tsx` (width control)
- Test: `apps/conciv/test/composer-overflow.browser.test.tsx` (new)

**Interfaces:**
- Consumes: `ComposerActionsHost` from `@conciv/extension/host`, `ComposerActions` from `@conciv/extension`.
- Produces: toolbar row contract — leading = attachment button; managed = built-ins + `ExtensionSurface name="composer"`; trailing = `trailingExtras` (model selector, in its own `Suspense`) + refresh + send/cancel; trigger named `'More composer actions'`. Harness API: `mountPane(options & {width?: number})` returning `{setWidth(px: number): void}` alongside its existing returns (drives a reactive style width on the harness wrapper — the `w-100` hardcode becomes the 400px default).

**pane-composer.tsx** — replace the row div; REFRESH STAYS HERE UNTIL TASK 7 (do not delete it in this task):

```tsx
<ComposerActionsHost
  triggerContent={<Ellipsis class="size-5 block" aria-hidden="true" />}
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

`TrailingControls` (refresh + send) is UNCHANGED in this task. `PaneComposerProps` gains `trailingExtras?: JSX.Element`; `chat-pane.tsx` moves `<SessionModelSelector sessionId={sessionId} />` out of children into `trailingExtras`. The slot-sized Suspense fallback keeps the trailing observer from jumping while models load.

**actions.tsx** — the app component keeps its exported name; the primitives are imported under a non-colliding alias:

```tsx
import {ComposerActions as Action} from '@conciv/extension'
```

(`ComposerActions` the app component at line 39 stays exported — chat-pane imports it by that name.)

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

Grab keeps its ACT/busyClass styling contract and is NOT disabled while picking (`busy` only) — behavior preserved. Launch is coordinator-registered from day one via `Inline` so the fit budget counts it (its dropdown flattening lands in Task 4).

**pane-harness.tsx**: `w-100` becomes `style={{width: \`${width()}px\`}}` with `width` a signal defaulting to 400; `mountPane` accepts `width?` and returns `setWidth`. Before writing tests, verify with the fit constants that at 400px every built-in stays inline (leading 34 + 2 gaps + trigger 38 + grab 38 + 3 autos 114 + trailing ≈ 110 ≈ 342 < 400) so the neighbor suites (launch-menu, launch-actions, model-selector, chat-pane) keep their inline-button locators working; if the real trailing cluster measures wider, raise the harness default so they do, and say so in the commit.

- [ ] **Step 1: Write the failing browser tests** (`composer-overflow.browser.test.tsx`, using the harness + kit helpers exactly as `chat-pane.browser.test.tsx` does):

```tsx
test('wide panel keeps every action inline with no overflow trigger', async () => {
  await mountPane({width: 720})
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Compress the conversation'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'More composer actions'})).not.toBeInTheDocument()
})

test('narrow panel collapses auto actions and keeps the pinned grab inline', async () => {
  await mountPane({width: 320})
  await expect.element(page.getByRole('button', {name: 'Select an element from the page'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).not.toBeInTheDocument()
  const trigger = page.getByRole('button', {name: 'More composer actions'})
  await expect.element(trigger).toHaveAttribute('aria-haspopup', 'menu')
  await trigger.click()
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByRole('menuitem', {name: 'Start a new session'})).toBeVisible()
})

test('an overflow item fires its action and the menu closes', async () => {
  const pane = await mountPane({width: 320})
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: 'Start a new session'}).click()
  await expect.element(page.getByRole('menu')).not.toBeVisible()
  await pane.expectNewSessionRequested()
})

test('keyboard lifecycle on the trigger', async () => {
  await mountPane({width: 320})
  const trigger = page.getByRole('button', {name: 'More composer actions'})
  await trigger.element().focus()
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('menu')).toBeVisible()
  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('menu')).not.toBeVisible()
  await expect.element(trigger).toHaveFocus()
})

test('a disabled root cannot be invoked from the menu', async () => {
  const pane = await mountPane({width: 320, compacting: true})
  await page.getByRole('button', {name: 'More composer actions'}).click()
  const item = page.getByRole('menuitem', {name: 'Compress the conversation'})
  await expect.element(item).toHaveAttribute('aria-disabled', 'true')
  await item.click({force: true})
  await pane.expectNoCompactRequested()
})

test('expanding while the menu is open closes it without stranding focus', async () => {
  const pane = await mountPane({width: 320})
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await pane.setWidth(720)
  await expect.element(page.getByRole('menu')).not.toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
})

test('repeated resize across the threshold settles without flapping', async () => {
  const pane = await mountPane({width: 720})
  for (const width of [320, 720, 320, 720, 320]) pane.setWidth(width)
  await expect.element(page.getByRole('button', {name: 'More composer actions'})).toBeVisible()
  pane.setWidth(720)
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
})
```

`expectNewSessionRequested` / `expectNoCompactRequested` / `compacting` are harness options wired to the same fixture callbacks the existing suite passes to `ChatPane`/`PaneProvider` — extend the harness options, not app state.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run test/composer-overflow.browser.test.tsx` (cwd `apps/conciv`).
- [ ] **Step 3: Implement pane-composer + actions migration + harness width control per the blocks above.**
- [ ] **Step 4: Run the new suite AND neighbors** — `pnpm vitest run test/composer-overflow.browser.test.tsx test/chat-pane.browser.test.tsx test/launch-menu.browser.test.tsx test/launch-actions.browser.test.tsx test/model-selector.browser.test.tsx` — PASS (refresh tests still pass: refresh is untouched).
- [ ] **Step 5: Package gate + commit** — `pnpm turbo run test --filter=@conciv/conciv` (use the app's real package name from `apps/conciv/package.json`), then commit (`feat(conciv): collapse composer actions into overflow menu`, pathspec `apps/conciv`).

---

### Task 4: Launch menu flattening (multi-item root)

**Files:**
- Modify: `apps/conciv/src/composer/launch-menu.tsx`
- Test: extend `apps/conciv/test/launch-menu.browser.test.tsx`

**Interfaces:**
- Consumes: `Action.Inline` + multi-`DropdownItem` from Task 2/3; `LaunchMenu` props signature unchanged.

`LaunchMenu` gains collapsed items as siblings of the `Inline` block inside the Task 3 `Action.Root id="conciv.launch"` (move the `Root` wrapper from `actions.tsx` into `LaunchMenu` itself so the component owns both renderings; `actions.tsx` then renders bare `<LaunchMenu .../>`):

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

- [ ] **Step 1: Failing tests** — narrow pane: `menuitem` named `Open in <harness>` and `Copy command` inside the shared overflow menu, contiguous; failure state shows the retry item instead. Wide pane: existing launch tests unchanged.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** launch + overflow + chat-pane suites — PASS; package gate.
- [ ] **Step 5: Commit** (`feat(conciv): launch menu flattens into composer overflow`, pathspec `apps/conciv`).

---

### Task 5: Migrate extension clients, scaffolds, authoring docs

**Files:**
- Modify: `packages/extensions/whiteboard/src/client.tsx`, `packages/extensions/tanstack/src/client.tsx`, `packages/extension/src/catalog.ts` (`composer-action` AND `full` templates + the composer slot description), `packages/extension/test/catalog.test.ts`, `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md`, `apps/site/content/docs/extending/widget-ui.mdx`

**Interfaces:** no authoring surface anywhere still demonstrates a raw composer button.

Whiteboard `Component` composer branch:

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

Tanstack client: same transform. Templates/docs rewritten around the same example (scaffold templates must compile under the scaffold test's assertions — update `catalog.test.ts` expectations to the new verbatim template strings).

- [ ] **Step 1: Update `catalog.test.ts` expectations (failing)** — `pnpm vitest run test/catalog.test.ts` (cwd `packages/extension`) — FAIL.
- [ ] **Step 2: Apply all migrations.**
- [ ] **Step 3: Gates** — `pnpm turbo run test --filter=@conciv/extension`; tanstack package gate (its real name from `package.json`); whiteboard: `pnpm turbo run typecheck --filter=<whiteboard-pkg> && pnpm turbo run build --filter=<whiteboard-pkg> && pnpm turbo run lint --filter=<whiteboard-pkg>` (suite is CI-only — lint IS part of the local gate).
- [ ] **Step 4: Commit** (`feat(extensions): author composer buttons through ComposerActions`, pathspec touched packages + site docs).

---

### Task 6: Extension-testkit host support + fixture

**Files:**
- Modify: `packages/extension-testkit/src/host/host-runtime.tsx` (wrap the composer-slot mount in `ComposerActionsHost` inside a width-controllable container with an accessible width control), `packages/extension-testkit/fixtures/ping/client.tsx` (fixture gains a `ComposerActions` root: Button + two DropdownItems)
- Test: new `packages/extension-testkit/test/composer-actions.it.test.ts` following the existing `test/*.it.test.ts` + `fixtureHost` pattern (NOT `e2e/` — that directory holds websocket/RPC probes)

**Interfaces:** testkit hosts render extension `ComposerActions` with a real coordinator + shared menu, width driven through a labeled control on the host page (a range/number input the test sets via `userEvent` — no DOM measurement).

- [ ] **Step 1: Failing test** — wide host: fixture button visible inline; narrow host (set via the width control): button gone, `More composer actions` opens, both fixture items present and fire (assert via the fixture's observable effect, same pattern the ping fixture already uses).
- [ ] **Step 2: Implement host wrap + width control + fixture root.**
- [ ] **Step 3: Run** — `pnpm turbo run test --filter=@conciv/extension-testkit` — PASS.
- [ ] **Step 4: Commit** (`feat(extension-testkit): host composer actions coordinator`, pathspec `packages/extension-testkit`).

---

### Task 7: Extract refresh from the composer

**Files:**
- Modify (delete): `packages/ui-kit-chat/src/primitives/composer/composer.tsx` (`Refresh` action button + export), `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx` (`onRefresh`), refresh-specific tests in `packages/ui-kit-chat/test/composer-completion.browser.test.tsx` (deleted, not rewired)
- Modify: `apps/conciv/src/app/pane-context.ts`, `apps/conciv/src/app/pane-provider.tsx`, `apps/conciv/src/routes/panel.$sessionId.tsx` (context value + header button), `apps/conciv/src/pane/chat-pane.tsx` (register handle, drop `onRefresh`), `apps/conciv/src/pane/pane-composer.tsx` (delete `TrailingControls`, trailing keeps only `ComposerSendControl`), `apps/conciv/src/routes/quick.tsx` (LIFT `PaneProvider` to wrap the whole `data-pw-qt-pane` div — the session bar currently sits outside it and `usePane()` would throw; button goes in that bar), `apps/conciv/src/routes/pip.$sessionId.tsx` (slim `flex justify-end px-2 pt-1` row above `ChatPane`)
- Modify: `apps/conciv/test/helpers/pane-harness.tsx` (THIRD `PaneContextValue` construction site — gains the signal pair; harness view renders `<RefreshButton />` alongside `ChatPane` so the suite has a target)
- Create: `apps/conciv/src/shell/refresh-button.tsx`
- Test: `apps/conciv/test/chat-pane.browser.test.tsx` (two refresh tests rewired against the harness-mounted `RefreshButton`), plus presence tests for the quick per-pane bar and pip chrome in those routes' existing suites (create `apps/conciv/test/quick-refresh.browser.test.tsx` / extend the pip suite if none exists — assert role button `'Refresh the conversation'` renders and is disabled while streaming, using each route's existing test scaffolding)

**Interfaces:**
- `type RefreshHandle = {run: () => void; busy: () => boolean}` in `pane-context.ts`.
- `PaneContextValue` gains `refresh: Accessor<RefreshHandle | null>` and `registerRefresh: (handle: RefreshHandle | null) => void`. ALL THREE construction sites updated (pane-provider.tsx, panel.$sessionId.tsx, pane-harness.tsx), each via:

```tsx
const [refreshHandle, setRefreshHandle] = createSignal<RefreshHandle | null>(null)
```

- `chat-pane.tsx` registers in the component body:

```tsx
pane.registerRefresh({run: () => chat.refresh(), busy: () => chatBusy(chat)})
onCleanup(() => pane.registerRefresh(null))
```

(`chatBusy` is exported from `@conciv/ui-kit-chat` — `src/index.tsx:49`.)

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
- [ ] **Step 2: Rewire the two refresh tests in `chat-pane.browser.test.tsx` to the harness-mounted `RefreshButton` (same role/name locator; disabled-while-streaming asserted with `toBeDisabled()`), add the quick/pip presence tests — run, FAIL.**
- [ ] **Step 3: Implement — deletions, context handle, `RefreshButton`, three placements, quick provider lift, harness update.**
- [ ] **Step 4: Run** — `pnpm turbo run test --filter=@conciv/ui-kit-chat`, then `pnpm vitest run test/chat-pane.browser.test.tsx test/composer-overflow.browser.test.tsx test/quick-refresh.browser.test.tsx` (cwd `apps/conciv`), then the app package gate — PASS.
- [ ] **Step 5: Commit** (`feat(conciv): session refresh moves to pane chrome, out of the composer`, pathspec `packages/ui-kit-chat apps/conciv`).

---

### Task 8: Full gates + changeset

**Files:**
- Create: `.changeset/composer-actions-collapse.md`

- [ ] **Step 1: Changeset**

```md
---
'@conciv/extension': patch
---

Composer actions collapse into a shared overflow menu; extensions author buttons through ComposerActions.Root/Button/DropdownItem/Inline. Session refresh moved out of the composer into pane chrome.
```

- [ ] **Step 2: Coverage check** — `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main`.
- [ ] **Step 3: Final gates** — `pnpm turbo run build --filter=@conciv/embed`, `pnpm typecheck && pnpm test:affected`, `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.
- [ ] **Step 4: Commit** (`chore: changeset for composer actions collapse`, pathspec `.changeset`).

---

## Self-Review Notes

- Spec §1 → Tasks 1-2 (`Inline` lands in Task 2, used from Task 3 so launch is fit-counted from the first integration commit). §2 → Task 2-3. §3 → Tasks 3-5. §4 → Task 7. Testing → Tasks 3, 4, 6, 7. Gates → Task 8 (embed/mount-externals guard pulled forward into Task 2).
- Spec deviations, both intentional and recorded: (a) `RefreshButton` reads `PaneContext` on every surface instead of chat-context + panel-only relay — quick's bar and the panel header both sit above `ChatProvider`; quick's `PaneProvider` is lifted to make that true per-pane. (b) Menu ordering implemented as per-root group nodes in host-rendered DOM order, not portal order + CSS — zag walks DOM order, CSS `order` would desync keyboard from visuals.
- Root-level `disabled: () => boolean` is the ONLY disabled mechanism (spec requirement restored); `Button.busy` is styling-only.
- Type names consistent: `FitInput`, `Registration`, `Coordinator`, `RootState`, `RefreshHandle`, `ComposerActionsHost`, `ComposerActions.{Root,Button,DropdownItem,Inline}`.
- Entry file is `packages/extension/src/index.ts` (no `.tsx` rename needed — the file only re-exports).
