# Composer Actions Collapse & Refresh Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturated composer button row with compound `ComposerActions.*` primitives whose host coordinator collapses lower-priority actions into one shared overflow menu by measured width, and extract the session refresh affordance out of the composer into per-surface chrome.

**Architecture:** New `ComposerActions` compound components (Root/Button/DropdownItem) live in `@conciv/extension` (which already depends on `@conciv/ui-kit-system` for `TooltipIconButton`/`Menu`). A host-side `ComposerActionsProvider` + shared Ark `Menu.Root` wrap the composer toolbar row as logical Solid ancestors of both built-in actions and `ExtensionSurface name="composer"`. Fit is pure arithmetic over a constant slot width and two passive ResizeObservers. Refresh becomes a `RefreshButton` reading a refresh handle that `ChatPane` registers into `PaneContext` — one mechanism serving panel header, quick per-pane bar, and pip chrome.

**Tech Stack:** SolidJS, Ark UI Menu (zag), UnoCSS utility classes, vitest browser (Playwright/Chromium), oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-08-16-composer-actions-collapse-design.md`

## Global Constraints

- Functions only, no classes, no IIFEs, ZERO code comments (lint deletes them).
- Strict TS: no `any`, no `as` casts, no non-null assertions, `noUncheckedIndexedAccess`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Solid: use `splitProps` (never destructure props), `@solid-primitives` over raw signal glue, no hooks inside JSX attributes, `Show`/`For` over ternaries.
- Every Solid package `vitest.config.ts` pins `test: {environment: 'node'}`.
- Widget UI tests run in REAL Chromium (vitest browser), never jsdom. Web-first assertions only: no `poll`, no `querySelector`, no rect measurement, no sleeps, no test-ids. Locate by role/name.
- Never `newContext()` in widget ITs — `browser.newPage()` pattern; these tests use `@vitest/browser` page/userEvent.
- Whiteboard package test suite NEVER runs locally — local gates for whiteboard changes: typecheck/build/lint only.
- Package test gates: `pnpm turbo run test --filter=<pkg>` (bare filter — NEVER trailing `...`).
- New UnoCSS utility classes in ui-kit src need an embed rebuild to appear: `pnpm turbo run build --filter=@conciv/embed`.
- Commit with pathspec (`git commit -- <paths>`); run `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` before each commit (JSON runtime errors non-blocking).
- All UI copy sentence-case, matches existing tone (`'More composer actions'`).

## Layout constants (used across tasks)

Action buttons are `size-8.5` (2.125rem = 34px) with row `gap-1` (4px):

```ts
export const ACTION_SLOT_PX = 38
export const FIT_HYSTERESIS_PX = 24
```

The overflow trigger permanently occupies one slot in the row (visibility-hidden when no item is collapsed), so the arithmetic never feeds back into itself.

---

### Task 1: Fit arithmetic (pure function)

**Files:**
- Create: `packages/extension/src/composer-actions-fit.ts`
- Test: `packages/extension/test/composer-actions-fit.test.ts`

**Interfaces:**
- Produces: `computeVisibleAutoCount(input: FitInput): number`, `type FitInput`, constants `ACTION_SLOT_PX`, `FIT_HYSTERESIS_PX`. Task 2 consumes all of these.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {ACTION_SLOT_PX, FIT_HYSTERESIS_PX, computeVisibleAutoCount} from '../src/composer-actions-fit.js'

const base = {
  slotWidth: ACTION_SLOT_PX,
  hysteresisPx: FIT_HYSTERESIS_PX,
  leadingWidth: 38,
  trailingWidth: 120,
  pinnedCount: 1,
  autoCount: 4,
  previousCount: null,
}

describe('computeVisibleAutoCount', () => {
  it('shows every auto action when the budget covers them', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 600})).toBe(4)
  })

  it('clamps to the available whole slots', () => {
    const rowWidth = 38 + 120 + 38 + 38 + 2 * 38 + 10
    expect(computeVisibleAutoCount({...base, rowWidth})).toBe(2)
  })

  it('never returns a negative count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 100})).toBe(0)
  })

  it('never exceeds the registered auto count', () => {
    expect(computeVisibleAutoCount({...base, rowWidth: 5000})).toBe(4)
  })

  it('shrinks immediately when the row narrows', () => {
    const rowWidth = 38 + 120 + 38 + 38 + 38
    expect(computeVisibleAutoCount({...base, rowWidth, previousCount: 4})).toBe(1)
  })

  it('expands only once the budget clears the hysteresis margin', () => {
    const exact = 38 + 120 + 38 + 38 + 2 * 38
    expect(computeVisibleAutoCount({...base, rowWidth: exact + 4, previousCount: 1})).toBe(1)
    expect(computeVisibleAutoCount({...base, rowWidth: exact + FIT_HYSTERESIS_PX, previousCount: 1})).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/composer-actions-fit.test.ts` (cwd `packages/extension`)
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export const ACTION_SLOT_PX = 38
export const FIT_HYSTERESIS_PX = 24

export type FitInput = {
  rowWidth: number
  leadingWidth: number
  trailingWidth: number
  slotWidth: number
  pinnedCount: number
  autoCount: number
  previousCount: number | null
  hysteresisPx: number
}

export function computeVisibleAutoCount(input: FitInput): number {
  const triggerWidth = input.slotWidth
  const budget =
    input.rowWidth - input.leadingWidth - input.trailingWidth - triggerWidth - input.pinnedCount * input.slotWidth
  const fits = Math.max(0, Math.min(input.autoCount, Math.floor(budget / input.slotWidth)))
  if (input.previousCount === null || fits <= input.previousCount) return fits
  if (budget < fits * input.slotWidth + input.hysteresisPx) return input.previousCount
  return fits
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/composer-actions-fit.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/composer-actions-fit.ts packages/extension/test/composer-actions-fit.test.ts
git commit -m "feat(extension): composer actions fit arithmetic" -- packages/extension
```

---

### Task 2: `ComposerActions` primitives + host coordinator

**Files:**
- Create: `packages/extension/src/composer-actions.tsx`
- Modify: `packages/extension/src/index.tsx` (export `ComposerActions`), `packages/extension/src/host.ts` (export `ComposerActionsHost`)

**Interfaces:**
- Consumes: Task 1's `computeVisibleAutoCount`, `ACTION_SLOT_PX`, `FIT_HYSTERESIS_PX`; `Menu`, `TooltipIconButton` from `@conciv/ui-kit-system`.
- Produces (extension-author surface, exported from `@conciv/extension`):
  - `ComposerActions.Root(props: {id: string; priority?: number; children: JSX.Element})`
  - `ComposerActions.Button(props: {visible?: 'auto' | 'always'; tooltip: string; onClick: () => void; disabled?: boolean; children: JSX.Element})`
  - `ComposerActions.DropdownItem(props: {value: string; label: string; onSelect: () => void; disabled?: boolean; children?: JSX.Element})`
- Produces (host surface, exported from `@conciv/extension/host`):
  - `ComposerActionsHost(props: {leading?: JSX.Element; trailing: JSX.Element; children: JSX.Element})` — renders the toolbar row: leading region, managed children, permanent trigger slot, trailing region; owns provider, shared `Menu.Root`, both observers.

**Implementation shape (write exactly this structure):**

```tsx
import {For, Show, createContext, createMemo, createSignal, createUniqueId, onCleanup, onMount, splitProps, useContext, type Accessor, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {createStore, produce} from 'solid-js/store'
import Ellipsis from 'lucide-solid/icons/ellipsis'
import {Menu, TooltipIconButton, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {ACTION_SLOT_PX, FIT_HYSTERESIS_PX, computeVisibleAutoCount} from './composer-actions-fit.js'

type Registration = {key: string; id: string; priority: number; pinned: boolean; hasButton: boolean}

type Coordinator = {
  register: (entry: Registration) => void
  update: (key: string, patch: Partial<Registration>) => void
  unregister: (key: string) => void
  inlineKeys: Accessor<ReadonlySet<string>>
  menuMount: Accessor<HTMLElement | undefined>
}

const CoordinatorContext = createContext<Coordinator>()
type RootState = {key: string; id: string; priority: number; inline: Accessor<boolean>; setPinned: (pinned: boolean) => void; setHasButton: (has: boolean) => void}
const RootContext = createContext<RootState>()
```

Coordinator internals (inside `ComposerActionsHost`):

- `const [entries, setEntries] = createStore<Registration[]>([])`; register appends, update patches by key, unregister filters. Duplicate `id`: `console.warn` in dev, keep both entries keyed by `key` (unique per mount) so last mount wins visually.
- `const [rowWidth, setRowWidth] = createSignal(0)` etc. for leading/trailing wrappers; one `ResizeObserver` per element via `createEffect` + `onCleanup` (same pattern as `useSizeHandle`).
- `const [previous, setPrevious] = createSignal<number | null>(null)`; `visibleAutoCount` memo calls `computeVisibleAutoCount` with `pinnedCount = entries pinned+hasButton count`, `autoCount = entries auto+hasButton count`, then `setPrevious`.
- `inlineKeys` memo: all pinned keys, plus the first `visibleAutoCount()` auto entries sorted by priority desc then insertion order.
- Row JSX: `Menu.Root` (from ui-kit-system, `positioning={{placement: 'top-end'}}`) wrapping the whole row `div.pt-0.5.flex.gap-1.items-center`; inside: leading wrapper div (observer target), `{props.children}`, trigger slot, trailing wrapper div with `ml-auto` (observer target). Trigger slot:

```tsx
<Show when={anyCollapsed()} fallback={<span aria-hidden="true" class="size-8.5 shrink-0 invisible" />}>
  <TooltipIconButtonSlot tooltip="More composer actions" class={GHOST}>
    {(buttonProps) => (
      <Menu.Trigger asChild={(triggerProps) => (
        <button {...buttonProps()} {...triggerProps()}>
          <Ellipsis class="size-5 block" aria-hidden="true" />
        </button>
      )} />
    )}
  </TooltipIconButtonSlot>
</Show>
<Menu.Positioner>
  <Menu.Content aria-label="More composer actions" class="flex flex-col" ref={setMenuMount} />
</Menu.Positioner>
```

`anyCollapsed()` = any entry with `hasDropdownItems` not in `inlineKeys()` — track item counts per key in the store (`items: number`, incremented/decremented by `DropdownItem` mount/cleanup through `RootContext`).

Component behavior:

- `Root`: `createUniqueId()` key; registers on mount, unregisters on cleanup; provides `RootContext` with `inline: () => coordinator.inlineKeys().has(key)`. Outside a coordinator (`useContext` undefined): render nothing (`<Show when={coordinator}>`).
- `Button`: on mount `root.setHasButton(true)` and `root.setPinned(props.visible === 'always')`; renders `<Show when={root.inline()}>` → `TooltipIconButton` with `class="size-8.5"`, `tooltip`, `onClick`, `disabled`.
- `DropdownItem`: increments the root's item count on mount; renders

```tsx
<Show when={!root.inline() && coordinator.menuMount()}>
  {(mount) => (
    <Portal mount={mount()}>
      <Menu.Item value={`${root.id}:${props.value}`} disabled={props.disabled} onSelect={() => props.onSelect()} style={{order: String(-root.priority)}}>
        {props.children}
        {props.label}
      </Menu.Item>
    </Portal>
  )}
</Show>
```

Menu ordering uses flex `order: -priority` on the flex-col content (portal insertion order is mount order, which is not priority order).

- [ ] **Step 1: Write `composer-actions.tsx` per the shape above; export `ComposerActions = {Root, Button, DropdownItem}` from `index.tsx` and `ComposerActionsHost` from `host.ts`**
- [ ] **Step 2: Typecheck + build gate**

Run: `pnpm turbo run build --filter=@conciv/extension && pnpm turbo run typecheck --filter=@conciv/extension`
Expected: green. (Behavior coverage lands in Task 3's browser tests — primitives have no browser harness in this package.)

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src
git commit -m "feat(extension): ComposerActions compound primitives with overflow coordinator" -- packages/extension
```

---

### Task 3: Wire the coordinator into `PaneComposer`, migrate grab/new-session/compact

**Files:**
- Modify: `apps/conciv/src/pane/pane-composer.tsx` (toolbar row becomes `ComposerActionsHost`), `apps/conciv/src/composer/actions.tsx` (grab/new-session/compact on new primitives)
- Test: `apps/conciv/test/composer-overflow.browser.test.tsx` (new)

**Interfaces:**
- Consumes: `ComposerActionsHost` from `@conciv/extension/host`, `ComposerActions` from `@conciv/extension`.
- Produces: the toolbar row DOM contract every later task tests against — leading = attachment button, managed = built-ins + `ExtensionSurface name="composer"`, trailing = model selector + send/cancel; trigger named `'More composer actions'`.

**pane-composer.tsx** — replace the row `div` (currently lines 127-139) with:

```tsx
<ComposerActionsHost
  leading={
    <Show when={props.attachmentAdapter}>
      <ComposerPrimitive.AddAttachment class={GHOST}>
        <Paperclip size={16} aria-hidden="true" />
      </ComposerPrimitive.AddAttachment>
    </Show>
  }
  trailing={
    <Show when={props.busy} fallback={<ComposerSendControl />}>
      {props.busy}
    </Show>
  }
>
  {props.children}
</ComposerActionsHost>
```

`TrailingControls` loses the refresh slot in Task 7; until then keep `ComposerSendControl` only here and leave `TrailingControls` unused-free by deleting it in this task (send control is the only survivor; refresh temporarily stays where it is — do NOT touch it in this task). The model selector stays in `props.children` order-wise? No — move `SessionModelSelector` into `trailing` at the `chat-pane.tsx` call site: pass it via a new `PaneComposerProps.trailingExtras?: JSX.Element` rendered before the send control inside `trailing`. Keep the change minimal: `chat-pane.tsx` renders `<SessionModelSelector>` through that prop instead of as a child.

**actions.tsx** — each button becomes a `Root`:

```tsx
<ComposerActions.Root id="conciv.grab" priority={40}>
  <ComposerActions.Button
    visible="always"
    tooltip={grabDisabled() ? 'Nothing on this screen to select' : 'Select an element from the page'}
    disabled={grabDisabled() || picking()}
    onClick={() => void pick()}
  >
    <Crosshair class="size-5 block" />
  </ComposerActions.Button>
</ComposerActions.Root>
<ComposerActions.Root id="conciv.new-session" priority={30}>
  <ComposerActions.Button tooltip="Start a new session" onClick={() => props.onNewSession()}>
    <SquarePen class="size-5 block" />
  </ComposerActions.Button>
  <ComposerActions.DropdownItem value="new" label="Start a new session" onSelect={() => props.onNewSession()}>
    <SquarePen class="size-4 block" aria-hidden="true" />
  </ComposerActions.DropdownItem>
</ComposerActions.Root>
<ComposerActions.Root id="conciv.compact" priority={20}>
  <ComposerActions.Button tooltip="Compress the conversation" disabled={props.compacting} onClick={() => props.onCompact()}>
    <FoldVertical class="size-5 block" />
  </ComposerActions.Button>
  <ComposerActions.DropdownItem value="compact" label="Compress the conversation" disabled={props.compacting} onSelect={() => props.onCompact()}>
    <FoldVertical class="size-4 block" aria-hidden="true" />
  </ComposerActions.DropdownItem>
</ComposerActions.Root>
```

(Launch menu migrates in Task 4 — leave `LaunchMenu` rendered as-is inside the managed region for now.)

- [ ] **Step 1: Write the failing browser test** (`composer-overflow.browser.test.tsx`, modeled on `chat-pane.browser.test.tsx` setup — same kit/mount helpers). Assertions:

```tsx
test('wide panel keeps every action inline with no overflow trigger', async () => {
  await mountPaneAtWidth(720)
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Compress the conversation'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'More composer actions'})).not.toBeInTheDocument()
})

test('narrow panel collapses auto actions into the overflow menu and keeps the pinned grab inline', async () => {
  await mountPaneAtWidth(360)
  await expect.element(page.getByRole('button', {name: 'Select an element from the page'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).not.toBeInTheDocument()
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await expect.element(page.getByRole('menuitem', {name: 'Start a new session'})).toBeVisible()
})

test('overflow menu items fire the same action', async () => {
  await mountPaneAtWidth(360)
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: 'Start a new session'}).click()
  // assert the same observable outcome the existing new-session test asserts (navigation/session creation via the kit)
})

test('keyboard lifecycle: open with keyboard, arrow to an item, Escape returns focus to the trigger', async () => {
  await mountPaneAtWidth(360)
  const trigger = page.getByRole('button', {name: 'More composer actions'})
  await trigger.click()
  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('menu')).not.toBeVisible()
  await expect.element(trigger).toHaveFocus()
})

test('disabled root is disabled in both renderings', async () => {
  // mount with compacting=true fixture state
  await mountPaneAtWidth(360)
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).toHaveAttribute('data-disabled')
})

test('repeated resize across the collapse threshold settles without flapping', async () => {
  const pane = await mountPaneAtWidth(720)
  for (const width of [360, 720, 360, 720, 360]) await pane.setWidth(width)
  await expect.element(page.getByRole('button', {name: 'More composer actions'})).toBeVisible()
  await pane.setWidth(720)
  await expect.element(page.getByRole('button', {name: 'Start a new session'})).toBeVisible()
})
```

`mountPaneAtWidth` = existing pane mount helper wrapped in a fixed-width container div whose width the test controls through a style on the mount host (setting a container style is state the TEST owns, not app state — allowed).

- [ ] **Step 2: Run to verify the new tests fail** — `pnpm vitest run test/composer-overflow.browser.test.tsx` (cwd `apps/conciv`).
- [ ] **Step 3: Implement pane-composer + actions migration per the code above.**
- [ ] **Step 4: Run the new suite AND the neighbors** — `pnpm vitest run test/composer-overflow.browser.test.tsx test/chat-pane.browser.test.tsx test/launch-menu.browser.test.tsx test/model-selector.browser.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/conciv/src apps/conciv/test/composer-overflow.browser.test.tsx
git commit -m "feat(conciv): collapse composer actions into overflow menu" -- apps/conciv
```

---

### Task 4: Migrate the launch menu (multi-item root)

**Files:**
- Modify: `apps/conciv/src/composer/launch-menu.tsx`, `apps/conciv/src/composer/actions.tsx`
- Test: extend `apps/conciv/test/launch-menu.browser.test.tsx`

**Interfaces:**
- Consumes: `ComposerActions` multi-`DropdownItem` support from Task 2.
- Produces: `LaunchMenu` keeps its exported props signature unchanged; gains collapsed rendering.

`LaunchMenu` wraps itself in a `Root`; inline rendering is today's nested `Menu.Root` trigger placed inside `ComposerActions.Button`'s slot — use a `Button`-less root plus explicit inline JSX? No: keep it simple and faithful to the primitives — `Root id="conciv.launch" priority={10}` containing:

- Inline: today's entire `Menu.Root` block wrapped in `<Show when={rootInline()}>` — expose this via a new primitive `ComposerActions.Inline(props: {children})` (added in this task to `composer-actions.tsx`: registers `hasButton` on the root, marks nothing pinned, renders children when inline). This is the `asChild` escape the spec's open item names.
- Collapsed: the same conditional item set as `DropdownItem`s:

```tsx
<Show when={local.failed === true} fallback={
  <>
    <ComposerActions.DropdownItem value="open" label={`Open in ${local.harnessName}`} onSelect={() => local.onOpen()}>
      <SquareTerminal class="size-4 block" aria-hidden="true" />
    </ComposerActions.DropdownItem>
    <ComposerActions.DropdownItem value="copy" label="Copy command" onSelect={() => local.onCopy()}>
      <ClipboardCopy class="size-4 block" aria-hidden="true" />
    </ComposerActions.DropdownItem>
  </>
}>
  <ComposerActions.DropdownItem value="retry" label={`${optionsUnavailable(local.harnessName)} — ${RETRY_LABEL}`} onSelect={() => local.onRetry?.()}>
    <RotateCw class="size-4 block" aria-hidden="true" />
  </ComposerActions.DropdownItem>
</Show>
```

- [ ] **Step 1: Write failing test additions** — narrow pane: launch items appear flattened in the shared overflow menu (`menuitem` named `Open in <harness>`, `Copy command`); wide pane: launch trigger behaves exactly as the existing tests assert.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Add `ComposerActions.Inline` to `packages/extension/src/composer-actions.tsx`; migrate `LaunchMenu`.**
- [ ] **Step 4: Run** `pnpm vitest run test/launch-menu.browser.test.tsx test/launch-actions.browser.test.tsx test/composer-overflow.browser.test.tsx` — PASS.
- [ ] **Step 5: Commit** (`feat(conciv): launch menu flattens into composer overflow`, pathspec `packages/extension apps/conciv`).

---

### Task 5: Migrate extension clients, scaffolds, and authoring docs

**Files:**
- Modify: `packages/extensions/whiteboard/src/client.tsx`, `packages/extensions/tanstack/src/client.tsx`, `packages/extension/src/catalog.ts` (both `composer-action` and `full` templates + the composer slot description string), `packages/extension/test/catalog.test.ts`, `packages/harness/plugins/claude/skills/conciv-extensions/SKILL.md`, `apps/site/content/docs/extending/widget-ui.mdx`

**Interfaces:**
- Consumes: `ComposerActions` from `@conciv/extension`.
- Produces: no authoring surface anywhere still demonstrates a raw composer button.

Whiteboard `Component` becomes:

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

Tanstack client: same mechanical transform for its composer-gated buttons. Scaffold templates (`composer-action`, `full`) rewritten to author through `ComposerActions.Root/Button/DropdownItem`; composer slot catalog description updated to name the primitives; `catalog.test.ts` assertions updated to match verbatim template text. SKILL.md and `widget-ui.mdx` sections showing raw buttons rewritten around the same example.

- [ ] **Step 1: Update `catalog.test.ts` expectations first (failing), run** `pnpm vitest run test/catalog.test.ts` (cwd `packages/extension`) — FAIL.
- [ ] **Step 2: Apply all migrations.**
- [ ] **Step 3: Gates** — `pnpm turbo run test --filter=@conciv/extension`, `pnpm turbo run test --filter=@conciv/extension-tanstack`, and for whiteboard typecheck/build/lint ONLY (suite is CI-only): `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard && pnpm turbo run build --filter=@conciv/extension-whiteboard`. (Use the actual package names from each `package.json`.)
- [ ] **Step 4: Commit** (`feat(extensions): author composer buttons through ComposerActions`, pathspec the touched packages + site docs).

---

### Task 6: Extension-testkit host support + fixture

**Files:**
- Modify: `packages/extension-testkit/src/host/host-runtime.tsx` (wrap the composer-slot mount in `ComposerActionsHost` inside a width-controllable container)
- Test: the testkit's existing e2e app gains a fixture extension using Button + two DropdownItems (`packages/extension-testkit/e2e` — follow the existing fixture registration pattern there)

**Interfaces:**
- Consumes: `ComposerActionsHost` from `@conciv/extension/host`.
- Produces: testkit hosts render extension `ComposerActions` exactly like the real app (coordinator + shared menu present).

- [ ] **Step 1: Add a failing e2e asserting the fixture's button renders inline in a wide host and its items reach the shared overflow menu in a narrow host** (drive width through the testkit host page's own controls, same locator discipline as Task 3).
- [ ] **Step 2: Wrap the testkit composer mount in `ComposerActionsHost` (trailing can be an empty fragment).**
- [ ] **Step 3: Run the testkit suite** — `pnpm turbo run test --filter=@conciv/extension-testkit` — PASS.
- [ ] **Step 4: Commit** (`feat(extension-testkit): host composer actions coordinator`, pathspec `packages/extension-testkit`).

---

### Task 7: Extract refresh from the composer

**Files:**
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer.tsx` (delete the `Refresh` action button + its export), `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx` (delete `onRefresh`), `packages/ui-kit-chat/test/composer-completion.browser.test.tsx` (delete refresh-specific tests)
- Modify: `apps/conciv/src/app/pane-context.ts` + `apps/conciv/src/app/pane-provider.tsx` + `apps/conciv/src/routes/panel.$sessionId.tsx` (add refresh handle to `PaneContextValue`), `apps/conciv/src/pane/chat-pane.tsx` (register the handle, drop `onRefresh`), `apps/conciv/src/pane/pane-composer.tsx` (drop the refresh button)
- Create: `apps/conciv/src/shell/refresh-button.tsx`
- Modify: `apps/conciv/src/routes/panel.$sessionId.tsx` (header right cluster), `apps/conciv/src/routes/quick.tsx` (per-pane bar next to the pane's `SessionSelector`), `apps/conciv/src/routes/pip.$sessionId.tsx` (slim chrome row above `ChatPane`)
- Test: `apps/conciv/test/chat-pane.browser.test.tsx` (rewire the two refresh tests to the header button)

**Interfaces:**
- Produces: `PaneContextValue` gains `refresh: Accessor<RefreshHandle | null>` and `registerRefresh: (handle: RefreshHandle | null) => void` where `type RefreshHandle = {run: () => void; busy: () => boolean}`. `RefreshButton(props: {class?: string})` renders nothing while the handle is null.

`pane-context.ts` additions and both `PaneContextValue` construction sites (`pane-provider.tsx`, `panel.$sessionId.tsx`):

```tsx
const [refreshHandle, setRefreshHandle] = createSignal<RefreshHandle | null>(null)
```

spread into the value as `refresh: refreshHandle, registerRefresh: setRefreshHandle`.

`chat-pane.tsx`: replace the `onRefresh` handler entry with registration:

```tsx
onMount(() => {
  pane.registerRefresh({run: () => chat.refresh(), busy: () => chatBusy(chat)})
  onCleanup(() => pane.registerRefresh(null))
})
```

(`chatBusy` is exported by `@conciv/ui-kit-chat` — verify the export; if module-private, expose it or derive busy from the same chat state the deleted primitive used.)

`refresh-button.tsx`:

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

Placements: panel header — before the close button (`panel.$sessionId.tsx` right cluster, reuse `CLOSE` class); quick — inside each pane's session bar (the `SessionSelector` row); pip — a `flex justify-end px-2 pt-1` row above `ChatPane`.

- [ ] **Step 1: Rewrite the two refresh tests in `chat-pane.browser.test.tsx` against the header/pane-bar button (locator unchanged: role button name `'Refresh the conversation'`), run — FAIL.**
- [ ] **Step 2: Delete `Refresh` from ui-kit-chat composer + `onRefresh` from handlers + their ui-kit tests; implement PaneContext handle, `RefreshButton`, three placements.**
- [ ] **Step 3: Run** `pnpm turbo run test --filter=@conciv/ui-kit-chat` and `pnpm vitest run test/chat-pane.browser.test.tsx test/composer-overflow.browser.test.tsx` (cwd `apps/conciv`) — PASS.
- [ ] **Step 4: Fallow check for the deleted export** — `pnpm exec fallow dead-code --trace 'packages/ui-kit-chat/src/primitives/composer/composer.tsx:Refresh'` should report no remaining consumers before deletion lands.
- [ ] **Step 5: Commit** (`feat(conciv): session refresh moves to pane chrome, out of the composer`, pathspec `packages/ui-kit-chat apps/conciv`).

---

### Task 8: Full gates, changeset, embed rebuild

**Files:**
- Create: `.changeset/composer-actions-collapse.md`

- [ ] **Step 1: Changeset**

```md
---
'@conciv/extension': patch
---

Composer actions collapse into a shared overflow menu; extensions author buttons through ComposerActions.Root/Button/DropdownItem. Session refresh moved out of the composer into pane chrome.
```

- [ ] **Step 2: Verify changeset coverage** — `pnpm exec conciv-publish check-changesets --require-coverage --base origin/main`.
- [ ] **Step 3: Embed rebuild + full gates** — `pnpm turbo run build --filter=@conciv/embed`, then `pnpm typecheck && pnpm test:affected`, then `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.
- [ ] **Step 4: Commit** (`chore: changeset for composer actions collapse`, pathspec `.changeset`).

---

## Self-Review Notes

- Spec §1 primitives → Tasks 1-2 (+`Inline` added in Task 4 per the spec's open item). §2 coordinator → Task 2-3. §3 built-ins + migration surfaces → Tasks 3-5. §4 refresh → Task 7. Testing section → Tasks 3, 4, 6, 7. Changeset/gates → Task 8.
- Deviation from spec, intentional: `RefreshButton` reads the handle from `PaneContext` on every surface (instead of `useChatContext` + a panel-only relay) because in quick mode and the panel the chrome sits above `ChatProvider`; one mechanism, three placements.
- Type names consistent across tasks: `FitInput`, `Registration`, `RefreshHandle`, `ComposerActionsHost`, `ComposerActions.{Root,Button,DropdownItem,Inline}`.
