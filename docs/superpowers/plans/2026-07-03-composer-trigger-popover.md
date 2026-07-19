# Composer Trigger Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inline `/` command menu and `@` mention menu in the chat composer — assistant-ui's TriggerPopover architecture ported to Solid in `@conciv/ui-kit-chat`, fed end to end by the harness's real command list and the registered tool list.

**Architecture:** Headless compound primitives (`Composer.TriggerPopoverRoot` → `Composer.TriggerPopover` + behavior child + list sub-primitives) backed by one Solid context model (`createTriggerPopoverModel`). Server side: a `slashCommands` harness capability (claude `live` via SDK `supportedCommands()`), `GET /api/chat/commands` + `GET /api/chat/tools` core routes, widget wires both triggers with grouped flat lists.

**Tech Stack:** Solid, Ark-free primitives, zod v4, h3, @anthropic-ai/claude-agent-sdk, Storybook play tests, vitest (node project), Playwright widget ITs.

**Spec:** `docs/superpowers/specs/2026-07-03-composer-trigger-popover-design.md`. Reference source: `/Users/dev/Public/web/assistant-ui/packages/react/src/primitives/composer/trigger/`.

## Global Constraints

- ZERO code comments; no `else` (early returns/ternaries); functions, never classes; no IIFE; no `any`/casts; no non-null assertion `x!` (narrow with `??`/guards/`?.`).
- No barrel files; import directly from source modules with `.js` suffix.
- No abbreviated identifiers; spell names out.
- Tests: native assertions (getByRole/getByText/toBeVisible/aria), no `data-testid`, no jsdom, no mocks/stubs — real browser, real HTTP servers.
- Never add an npm dependency (nothing new is needed; everything used already exists in the workspace).
- Build/typecheck via turbo from repo root: `pnpm turbo typecheck --filter <pkg>`; widget ITs need `@conciv/core` + widget dist rebuilt first.
- Commit with pathspec always: `git commit -m "…" -- <paths>` (parallel sessions share this worktree). Run from `/Users/dev/Public/web/aidx`.
- Do not run Storybook vitest tests while a `storybook dev` process is running (shared cache corruption). Check `pgrep -f "storybook dev"` first.
- v0: break APIs freely, update all call sites, no back-compat shims.

---

### Task 1: Trigger types, `detectTrigger`, `defaultDirectiveFormatter`

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/types.ts`
- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/detect-trigger.ts`
- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/directive-formatter.ts`
- Test: `packages/ui-kit-chat/test/detect-trigger.test.ts`
- Test: `packages/ui-kit-chat/test/directive-formatter.test.ts`

**Interfaces:**

- Produces: `TriggerItem`, `TriggerCategory`, `TriggerAdapter`, `DirectiveFormatter`, `DirectiveSegment`, `TriggerBehavior`, `TriggerKeyEvent`, `SelectItemOverride` (types.ts); `detectTrigger(text, triggerChar, cursorPosition): {query: string; offset: number} | null`; `defaultDirectiveFormatter: DirectiveFormatter`.

- [ ] **Step 1: Write failing tests**

`packages/ui-kit-chat/test/detect-trigger.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {detectTrigger} from '../src/primitives/composer/trigger/detect-trigger.js'

describe('detectTrigger', () => {
  it('detects a trigger at text start', () => {
    expect(detectTrigger('/comp', '/', 5)).toEqual({query: 'comp', offset: 0})
  })
  it('detects a trigger after whitespace', () => {
    expect(detectTrigger('hello @cl', '@', 9)).toEqual({query: 'cl', offset: 6})
  })
  it('returns null when the trigger is mid-word', () => {
    expect(detectTrigger('path/to', '/', 7)).toBeNull()
  })
  it('returns null when whitespace sits between trigger and cursor', () => {
    expect(detectTrigger('/cmd arg', '/', 8)).toBeNull()
  })
  it('only considers text before the cursor', () => {
    expect(detectTrigger('/cmd', '/', 2)).toEqual({query: 'c', offset: 0})
  })
  it('returns null without a trigger char', () => {
    expect(detectTrigger('plain text', '/', 10)).toBeNull()
  })
})
```

`packages/ui-kit-chat/test/directive-formatter.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {defaultDirectiveFormatter} from '../src/primitives/composer/trigger/directive-formatter.js'

describe('defaultDirectiveFormatter', () => {
  it('serializes with name attribute when id differs from label', () => {
    expect(defaultDirectiveFormatter.serialize({id: 'u1', type: 'user', label: 'Ada'})).toBe(':user[Ada]{name=u1}')
  })
  it('omits name attribute when id equals label', () => {
    expect(defaultDirectiveFormatter.serialize({id: 'Ada', type: 'user', label: 'Ada'})).toBe(':user[Ada]')
  })
  it('round-trips serialize then parse', () => {
    const text = `before ${defaultDirectiveFormatter.serialize({id: 'u1', type: 'user', label: 'Ada'})} after`
    expect(defaultDirectiveFormatter.parse(text)).toEqual([
      {kind: 'text', text: 'before '},
      {kind: 'mention', type: 'user', label: 'Ada', id: 'u1'},
      {kind: 'text', text: ' after'},
    ])
  })
  it('parses plain text as a single segment', () => {
    expect(defaultDirectiveFormatter.parse('no directives')).toEqual([{kind: 'text', text: 'no directives'}])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @conciv/ui-kit-chat exec vitest run --project ui-kit-chat test/detect-trigger.test.ts test/directive-formatter.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`packages/ui-kit-chat/src/primitives/composer/trigger/types.ts`:

```ts
export type TriggerItem = {
  id: string
  type: string
  label: string
  description?: string
  metadata?: Record<string, unknown>
}

export type TriggerCategory = {id: string; label: string}

export type TriggerAdapter = {
  categories(): readonly TriggerCategory[]
  categoryItems(categoryId: string): readonly TriggerItem[]
  search?(query: string): readonly TriggerItem[]
}

export type DirectiveSegment = {kind: 'text'; text: string} | {kind: 'mention'; type: string; label: string; id: string}

export type DirectiveFormatter = {
  serialize(item: TriggerItem): string
  parse(text: string): readonly DirectiveSegment[]
}

export type TriggerBehavior =
  | {kind: 'directive'; formatter: () => DirectiveFormatter; onInserted?: (item: TriggerItem) => void}
  | {
      kind: 'action'
      formatter: () => DirectiveFormatter
      onExecute: (item: TriggerItem) => void
      removeOnExecute?: () => boolean
    }

export type TriggerKeyEvent = {readonly key: string; readonly shiftKey: boolean; preventDefault(): void}

export type SelectItemOverride = (item: TriggerItem) => boolean
```

(`TriggerBehavior.formatter` is an accessor so behavior children can hand the model live prop reads — Solid props are reactive proxies.)

`packages/ui-kit-chat/src/primitives/composer/trigger/detect-trigger.ts` — port of assistant-ui `detectTrigger.ts`:

```ts
const WHITESPACE = /\s/u

export function detectTrigger(
  text: string,
  triggerChar: string,
  cursorPosition: number,
): {query: string; offset: number} | null {
  const upToCursor = text.slice(0, cursorPosition)
  for (let i = upToCursor.length - 1; i >= 0; i--) {
    const char = upToCursor[i] ?? ''
    if (WHITESPACE.test(char)) return null
    if (!upToCursor.startsWith(triggerChar, i)) continue
    if (i > 0 && !WHITESPACE.test(upToCursor[i - 1] ?? '')) continue
    return {query: upToCursor.slice(i + triggerChar.length), offset: i}
  }
  return null
}
```

`packages/ui-kit-chat/src/primitives/composer/trigger/directive-formatter.ts` — port of assistant-ui `directive-formatter.ts`:

```ts
import type {DirectiveFormatter, DirectiveSegment, TriggerItem} from './types.js'

const DIRECTIVE = /:([\w-]{1,64})\[([^\]\n]{1,1024})\](?:\{name=([^}\n]{1,1024})\})?/gu

export const defaultDirectiveFormatter: DirectiveFormatter = {
  serialize(item: TriggerItem): string {
    const attrs = item.id !== item.label ? `{name=${item.id}}` : ''
    return `:${item.type}[${item.label}]${attrs}`
  },
  parse(text: string): DirectiveSegment[] {
    const segments: DirectiveSegment[] = []
    let lastIndex = 0
    for (const match of text.matchAll(DIRECTIVE)) {
      if (match.index > lastIndex) segments.push({kind: 'text', text: text.slice(lastIndex, match.index)})
      const label = match[2] ?? ''
      segments.push({kind: 'mention', type: match[1] ?? '', label, id: match[3] ?? label})
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) segments.push({kind: 'text', text: text.slice(lastIndex)})
    return segments
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Same command as Step 2. Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit-chat/src/primitives/composer/trigger packages/ui-kit-chat/test/detect-trigger.test.ts packages/ui-kit-chat/test/directive-formatter.test.ts
git commit -m "feat(ui-kit-chat): trigger popover types, detectTrigger, default directive formatter" -- packages/ui-kit-chat
```

---

### Task 2: `createTriggerPopoverModel`

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover-model.ts`
- Test: `packages/ui-kit-chat/test/trigger-popover-model.test.ts`

**Interfaces:**

- Consumes: Task 1 types, `detectTrigger`.
- Produces:

```ts
type TriggerPopoverModelOptions = {
  char: string
  adapter: () => TriggerAdapter | undefined
  isLoading: () => boolean
  text: Accessor<string>
  setText: (value: string) => void
}
type TriggerPopoverScope = {
  char: string
  popoverId: string
  open: Accessor<boolean>
  query: Accessor<string>
  categories: Accessor<readonly TriggerCategory[]>
  items: Accessor<readonly TriggerItem[]>
  activeCategoryId: Accessor<string | null>
  isSearchMode: Accessor<boolean>
  isLoading: Accessor<boolean>
  highlightedIndex: Accessor<number>
  highlightedItemId: Accessor<string | undefined>
  hasBehavior: Accessor<boolean>
  selectCategory(categoryId: string): void
  goBack(): void
  selectItem(item: TriggerItem): void
  close(): void
  highlightIndex(index: number): void
  handleKeyDown(event: TriggerKeyEvent): boolean
  setCursorPosition(position: number): void
  registerBehavior(behavior: TriggerBehavior): () => void
  registerSelectItemOverride(fn: SelectItemOverride): () => void
}
createTriggerPopoverModel(options: TriggerPopoverModelOptions): TriggerPopoverScope
```

- [ ] **Step 1: Write failing tests** — pure reactivity, node project, `createRoot`:

`packages/ui-kit-chat/test/trigger-popover-model.test.ts`:

```ts
import {createRoot, createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {createTriggerPopoverModel} from '../src/primitives/composer/trigger/trigger-popover-model.js'
import type {TriggerAdapter, TriggerItem} from '../src/primitives/composer/trigger/types.js'
import {defaultDirectiveFormatter} from '../src/primitives/composer/trigger/directive-formatter.js'

const ITEMS: TriggerItem[] = [
  {id: 'compact', type: 'command', label: '/compact', description: 'Compact the context'},
  {id: 'usage', type: 'command', label: '/usage'},
]
const flatAdapter: TriggerAdapter = {
  categories: () => [],
  categoryItems: () => [],
  search: (query) => ITEMS.filter((item) => item.id.includes(query)),
}
const categorizedAdapter: TriggerAdapter = {
  categories: () => [{id: 'general', label: 'General'}],
  categoryItems: (categoryId) => (categoryId === 'general' ? ITEMS : []),
}

function setup(adapter: TriggerAdapter, initial = '') {
  return createRoot((dispose) => {
    const [text, setText] = createSignal(initial)
    const model = createTriggerPopoverModel({
      char: '/',
      adapter: () => adapter,
      isLoading: () => false,
      text,
      setText,
    })
    return {model, text, setText, dispose}
  })
}

const keyEvent = (key: string, shiftKey = false) => ({key, shiftKey, preventDefault: () => {}})

describe('createTriggerPopoverModel', () => {
  it('stays closed without a registered behavior', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(false)
    dispose()
  })

  it('opens on trigger detection once a behavior registers, search mode for flat adapters', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(true)
    expect(model.isSearchMode()).toBe(true)
    expect(model.items().map((item) => item.id)).toEqual(['compact'])
    dispose()
  })

  it('shows categories at top level and drills in', () => {
    const {model, setText, dispose} = setup(categorizedAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    expect(model.categories().map((category) => category.id)).toEqual(['general'])
    model.selectCategory('general')
    expect(model.items()).toHaveLength(2)
    model.goBack()
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })

  it('keyboard: arrows cycle with wraparound, Enter selects, Escape closes', () => {
    const {model, text, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({
      kind: 'directive',
      formatter: () => ({serialize: (item) => `/${item.id}`, parse: (value) => [{kind: 'text', text: value}]}),
    })
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('ArrowDown'))).toBe(true)
    expect(model.highlightedIndex()).toBe(1)
    model.handleKeyDown(keyEvent('ArrowDown'))
    expect(model.highlightedIndex()).toBe(0)
    model.handleKeyDown(keyEvent('ArrowUp'))
    expect(model.highlightedIndex()).toBe(1)
    model.handleKeyDown(keyEvent('ArrowUp'))
    model.handleKeyDown(keyEvent('Enter'))
    expect(text()).toBe('/compact ')
    dispose()
  })

  it('Shift+Enter is not consumed', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('Enter', true))).toBe(false)
    dispose()
  })

  it('Backspace with empty query inside a category goes back and is consumed', () => {
    const {model, setText, dispose} = setup(categorizedAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    model.selectCategory('general')
    expect(model.handleKeyDown(keyEvent('Backspace'))).toBe(true)
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })

  it('action behavior with removeOnExecute strips the trigger text and fires onExecute', () => {
    const {model, text, setText, dispose} = setup(flatAdapter, 'hi /com')
    const executed: string[] = []
    model.registerBehavior({
      kind: 'action',
      formatter: () => defaultDirectiveFormatter,
      onExecute: (item) => executed.push(item.id),
      removeOnExecute: () => true,
    })
    setText('hi /com')
    model.setCursorPosition(7)
    model.selectItem(model.items()[0] ?? ITEMS[0] ?? {id: '', type: '', label: ''})
    expect(executed).toEqual(['compact'])
    expect(text()).toBe('hi ')
    dispose()
  })

  it('close moves the cursor before the trigger so detection deactivates', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    model.close()
    expect(model.open()).toBe(false)
    dispose()
  })

  it('select-item override intercepts insertion', () => {
    const {model, text, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    const seen: string[] = []
    model.registerSelectItemOverride((item) => {
      seen.push(item.id)
      return true
    })
    setText('/co')
    model.setCursorPosition(3)
    model.selectItem(ITEMS[0] ?? {id: '', type: '', label: ''})
    expect(seen).toEqual(['compact'])
    expect(text()).toBe('/co')
    dispose()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @conciv/ui-kit-chat exec vitest run --project ui-kit-chat test/trigger-popover-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover-model.ts`:

```ts
import {createEffect, createMemo, createSignal, createUniqueId, on, type Accessor} from 'solid-js'
import {detectTrigger} from './detect-trigger.js'
import type {
  SelectItemOverride,
  TriggerAdapter,
  TriggerBehavior,
  TriggerCategory,
  TriggerItem,
  TriggerKeyEvent,
} from './types.js'

export type TriggerPopoverModelOptions = {
  char: string
  adapter: () => TriggerAdapter | undefined
  isLoading: () => boolean
  text: Accessor<string>
  setText: (value: string) => void
}

export type TriggerPopoverScope = {
  char: string
  popoverId: string
  open: Accessor<boolean>
  query: Accessor<string>
  categories: Accessor<readonly TriggerCategory[]>
  items: Accessor<readonly TriggerItem[]>
  activeCategoryId: Accessor<string | null>
  isSearchMode: Accessor<boolean>
  isLoading: Accessor<boolean>
  highlightedIndex: Accessor<number>
  highlightedItemId: Accessor<string | undefined>
  hasBehavior: Accessor<boolean>
  selectCategory(categoryId: string): void
  goBack(): void
  selectItem(item: TriggerItem): void
  close(): void
  highlightIndex(index: number): void
  handleKeyDown(event: TriggerKeyEvent): boolean
  setCursorPosition(position: number): void
  registerBehavior(behavior: TriggerBehavior): () => void
  registerSelectItemOverride(fn: SelectItemOverride): () => void
}

function matchesQuery(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

export function createTriggerPopoverModel(options: TriggerPopoverModelOptions): TriggerPopoverScope {
  const popoverId = createUniqueId()
  const [cursorPosition, setCursorPosition] = createSignal(options.text().length)
  const [behavior, setBehavior] = createSignal<TriggerBehavior | null>(null)
  const [activeCategoryId, setActiveCategoryId] = createSignal<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)
  let override: SelectItemOverride | null = null

  const trigger = createMemo(() => {
    const position = Math.min(cursorPosition(), options.text().length)
    return detectTrigger(options.text(), options.char, position)
  })
  const query = () => trigger()?.query ?? ''
  const open = createMemo(() => trigger() !== null && options.adapter() !== undefined && behavior() !== null)

  createEffect(on(open, (isOpen) => (isOpen ? undefined : setActiveCategoryId(null))))

  const allCategories = createMemo<readonly TriggerCategory[]>(() => {
    const adapter = options.adapter()
    return open() && adapter ? adapter.categories() : []
  })
  const effectiveCategoryId = () => (open() ? activeCategoryId() : null)
  const categoryItems = createMemo<readonly TriggerItem[]>(() => {
    const adapter = options.adapter()
    const categoryId = effectiveCategoryId()
    return adapter && categoryId ? adapter.categoryItems(categoryId) : []
  })
  const searchResults = createMemo<readonly TriggerItem[] | null>(() => {
    const adapter = options.adapter()
    if (!open() || !adapter || effectiveCategoryId()) return null
    if (!query() && allCategories().length > 0) return null
    if (adapter.search) return adapter.search(query())
    const lower = query().toLowerCase()
    return allCategories().flatMap((category) =>
      adapter.categoryItems(category.id).filter((item) => matchesQuery(item, lower)),
    )
  })
  const isSearchMode = () => searchResults() !== null
  const categories = createMemo(() => {
    if (isSearchMode()) return []
    if (!query()) return allCategories()
    const lower = query().toLowerCase()
    return allCategories().filter((category) => category.label.toLowerCase().includes(lower))
  })
  const items = createMemo(() => {
    const results = searchResults()
    if (results) return results
    if (!query()) return categoryItems()
    const lower = query().toLowerCase()
    return categoryItems().filter((item) => matchesQuery(item, lower))
  })
  const navigableList = createMemo<readonly (TriggerCategory | TriggerItem)[]>(() => {
    const results = searchResults()
    if (results) return results
    return effectiveCategoryId() ? items() : categories()
  })

  createEffect(on([navigableList, isSearchMode, () => activeCategoryId()], () => setHighlightedIndex(0)))

  const goBack = () => setActiveCategoryId(null)
  const afterSelect = () => goBack()

  const selectItem = (item: TriggerItem) => {
    const detected = trigger()
    const active = behavior()
    if (!detected || !active) return
    if (override?.(item)) {
      afterSelect()
      return
    }
    const current = options.text()
    const before = current.slice(0, detected.offset)
    const after = current.slice(detected.offset + options.char.length + detected.query.length)
    const padded = after.startsWith(' ') ? after : ` ${after}`
    const insertDirective = () => options.setText(before + active.formatter().serialize(item) + padded)
    if (active.kind === 'directive') {
      insertDirective()
      active.onInserted?.(item)
      afterSelect()
      return
    }
    const remove = active.removeOnExecute?.() ?? false
    if (remove) options.setText(before + (after.startsWith(' ') ? after.slice(1) : after))
    if (!remove) insertDirective()
    active.onExecute(item)
    afterSelect()
  }

  const close = () => {
    afterSelect()
    const detected = trigger()
    if (detected) setCursorPosition(detected.offset)
  }

  const isTriggerItem = (entry: TriggerCategory | TriggerItem): entry is TriggerItem => 'type' in entry

  const handleKeyDown = (event: TriggerKeyEvent): boolean => {
    if (!open()) return false
    const list = navigableList()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((previous) => (list.length === 0 ? 0 : previous < list.length - 1 ? previous + 1 : 0))
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((previous) => (list.length === 0 ? 0 : previous > 0 ? previous - 1 : list.length - 1))
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (event.shiftKey) return false
      event.preventDefault()
      const entry = list[highlightedIndex()]
      if (!entry) return true
      if (isTriggerItem(entry)) selectItem(entry)
      if (!isTriggerItem(entry)) setActiveCategoryId(entry.id)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    if (event.key === 'Backspace' && activeCategoryId() && query() === '') {
      event.preventDefault()
      goBack()
      return true
    }
    return false
  }

  const highlightedItemId = () => {
    const entry = navigableList()[highlightedIndex()]
    return open() && entry ? `${popoverId}-option-${entry.id}` : undefined
  }

  return {
    char: options.char,
    popoverId,
    open,
    query,
    categories,
    items,
    activeCategoryId: effectiveCategoryId,
    isSearchMode,
    isLoading: () => options.isLoading(),
    highlightedIndex,
    highlightedItemId,
    hasBehavior: () => behavior() !== null,
    selectCategory: (categoryId) => setActiveCategoryId(categoryId),
    goBack,
    selectItem,
    close,
    highlightIndex: (index) => {
      if (index < 0 || index >= navigableList().length) return
      setHighlightedIndex(index)
    },
    handleKeyDown,
    setCursorPosition,
    registerBehavior: (next) => {
      setBehavior(() => next)
      return () => setBehavior((current) => (current === next ? null : current))
    },
    registerSelectItemOverride: (fn) => {
      override = fn
      return () => {
        if (override === fn) override = null
      }
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Same command. Expected: PASS (9 tests). Also run: `pnpm turbo typecheck --filter @conciv/ui-kit-chat` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover-model.ts packages/ui-kit-chat/test/trigger-popover-model.test.ts
git commit -m "feat(ui-kit-chat): trigger popover context model (detection, navigation, keyboard, selection)" -- packages/ui-kit-chat
```

---

### Task 3: Compound components + `Composer.Input` integration + exports

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover.tsx`
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer.tsx` (delete old `TriggerPopover` + `trailingTrigger`; extend `Input`; attach new statics)
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx` (delete `TriggerItem` type + `triggerItems` member)
- Modify: `packages/ui-kit-chat/src/index.tsx` (new exports, drop old `TriggerItem` export)
- Delete: `packages/ui-kit-chat/src/primitives/composer/trigger-popover.stories.tsx`

**Interfaces:**

- Consumes: `createTriggerPopoverModel`, `TriggerPopoverScope` (Task 2), `useComposer` (`text()`/`setText`), `Primitive`.
- Produces (all attached to the `Composer` compound and exported from index):
  - `Composer.TriggerPopoverRoot(props: ParentProps)`
  - `Composer.TriggerPopover(props: {char: string; adapter?: TriggerAdapter; isLoading?: boolean} & JSX.HTMLAttributes<HTMLDivElement>)` with statics `.Directive(props: {formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void})` and `.Action(props: {formatter?: DirectiveFormatter; onExecute: (item: TriggerItem) => void; removeOnExecute?: boolean})`
  - `Composer.TriggerPopoverCategories(props: {children: (categories: Accessor<readonly TriggerCategory[]>) => JSX.Element} & div props)`
  - `Composer.TriggerPopoverCategoryItem(props: {categoryId: string} & button props)`
  - `Composer.TriggerPopoverItems(props: {children: (items: Accessor<readonly TriggerItem[]>) => JSX.Element} & div props)`
  - `Composer.TriggerPopoverItem(props: {item: TriggerItem; index?: number} & button props)`
  - `Composer.TriggerPopoverBack(props: button props)`
  - `useTriggerPopoverScope(): TriggerPopoverScope` (for the styled layer)
  - Root context: `useTriggerPopoverRootOptional(): {register(scope: TriggerPopoverScope): () => void; triggers: Accessor<readonly TriggerPopoverScope[]>; activeAria: Accessor<{popoverId: string; highlightedItemId: string | undefined} | null>} | undefined`

- [ ] **Step 1: Write the component file** `packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover.tsx`:

```tsx
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {isDev} from 'solid-js/web'
import {useComposer} from '../../../store/chat-context.js'
import {Primitive} from '../../util/primitive.js'
import {defaultDirectiveFormatter} from './directive-formatter.js'
import {createTriggerPopoverModel, type TriggerPopoverScope} from './trigger-popover-model.js'
import type {DirectiveFormatter, TriggerAdapter, TriggerCategory, TriggerItem} from './types.js'

type ActiveAria = {popoverId: string; highlightedItemId: string | undefined}

type RootContextValue = {
  register(scope: TriggerPopoverScope): () => void
  triggers: Accessor<readonly TriggerPopoverScope[]>
  activeAria: Accessor<ActiveAria | null>
}

const RootContext = createContext<RootContextValue>()

export function useTriggerPopoverRootOptional(): RootContextValue | undefined {
  return useContext(RootContext)
}

const ScopeContext = createContext<TriggerPopoverScope>()

export function useTriggerPopoverScope(): TriggerPopoverScope {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('TriggerPopover.* must be used within a Composer.TriggerPopover')
  return scope
}

function warnOnCollision(existing: readonly TriggerPopoverScope[], char: string): void {
  if (!isDev) return
  for (const scope of existing) {
    if (scope.char === char) console.warn(`[ui-kit-chat] Duplicate TriggerPopover for char "${char}".`)
    if (scope.char !== char && (char.startsWith(scope.char) || scope.char.startsWith(char)))
      console.warn(`[ui-kit-chat] Trigger prefix collision between "${scope.char}" and "${char}".`)
  }
}

function Root(props: ParentProps): JSX.Element {
  const [triggers, setTriggers] = createSignal<readonly TriggerPopoverScope[]>([])
  const activeAria = createMemo<ActiveAria | null>(() => {
    const openScope = triggers().find((scope) => scope.open())
    return openScope ? {popoverId: openScope.popoverId, highlightedItemId: openScope.highlightedItemId()} : null
  })
  const value: RootContextValue = {
    register: (scope) => {
      warnOnCollision(triggers(), scope.char)
      setTriggers((previous) => [...previous, scope])
      return () => setTriggers((previous) => previous.filter((entry) => entry !== scope))
    },
    triggers,
    activeAria,
  }
  return <RootContext.Provider value={value}>{props.children}</RootContext.Provider>
}

type TriggerPopoverProps = JSX.HTMLAttributes<HTMLDivElement> & {
  char: string
  adapter?: TriggerAdapter
  isLoading?: boolean
}

function TriggerPopoverComponent(props: TriggerPopoverProps): JSX.Element {
  const composer = useComposer()
  const root = useContext(RootContext)
  if (!root) throw new Error('Composer.TriggerPopover must be used within a Composer.TriggerPopoverRoot')
  const [local, rest] = splitProps(props, ['char', 'adapter', 'isLoading', 'children'])
  const scope = createTriggerPopoverModel({
    char: local.char,
    adapter: () => local.adapter,
    isLoading: () => local.isLoading ?? false,
    text: composer.text,
    setText: composer.setText,
  })
  onCleanup(root.register(scope))
  return (
    <ScopeContext.Provider value={scope}>
      <Show when={scope.open()} fallback={local.children}>
        <Primitive.div
          role="listbox"
          id={scope.popoverId}
          aria-label="Suggestions"
          aria-activedescendant={scope.highlightedItemId()}
          data-state="open"
          {...rest}
        >
          {local.children}
        </Primitive.div>
      </Show>
    </ScopeContext.Provider>
  )
}

function Directive(props: {formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}): JSX.Element {
  const scope = useTriggerPopoverScope()
  onCleanup(
    scope.registerBehavior({
      kind: 'directive',
      formatter: () => props.formatter ?? defaultDirectiveFormatter,
      onInserted: (item) => props.onInserted?.(item),
    }),
  )
  return <></>
}

function Action(props: {
  formatter?: DirectiveFormatter
  onExecute: (item: TriggerItem) => void
  removeOnExecute?: boolean
}): JSX.Element {
  const scope = useTriggerPopoverScope()
  onCleanup(
    scope.registerBehavior({
      kind: 'action',
      formatter: () => props.formatter ?? defaultDirectiveFormatter,
      onExecute: (item) => props.onExecute(item),
      removeOnExecute: () => props.removeOnExecute ?? false,
    }),
  )
  return <></>
}

type CategoriesProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (categories: Accessor<readonly TriggerCategory[]>) => JSX.Element
}

function Categories(props: CategoriesProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['children'])
  const visible = () => scope.open() && !scope.activeCategoryId() && !scope.isSearchMode()
  return (
    <Show when={visible()}>
      <Primitive.div role="group" aria-label="Categories" {...rest}>
        {local.children(scope.categories)}
      </Primitive.div>
    </Show>
  )
}

type CategoryItemProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {categoryId: string}

function CategoryItem(props: CategoryItemProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['categoryId', 'onClick', 'onMouseMove'])
  const index = () => scope.categories().findIndex((category) => category.id === local.categoryId)
  const highlighted = () => !scope.isSearchMode() && !scope.activeCategoryId() && index() === scope.highlightedIndex()
  return (
    <Primitive.button
      type="button"
      role="option"
      id={`${scope.popoverId}-option-${local.categoryId}`}
      aria-selected={highlighted()}
      data-highlighted={highlighted() ? '' : undefined}
      onClick={(event) => {
        if (typeof local.onClick === 'function') local.onClick(event)
        scope.selectCategory(local.categoryId)
      }}
      onMouseMove={(event) => {
        if (typeof local.onMouseMove === 'function') local.onMouseMove(event)
        scope.highlightIndex(index())
      }}
      {...rest}
    />
  )
}

type ItemsProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (items: Accessor<readonly TriggerItem[]>) => JSX.Element
}

function Items(props: ItemsProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['children'])
  const visible = () => scope.open() && (scope.activeCategoryId() !== null || scope.isSearchMode())
  return (
    <Show when={visible()}>
      <Primitive.div role="group" aria-label="Items" {...rest}>
        {local.children(scope.items)}
      </Primitive.div>
    </Show>
  )
}

type ItemProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {item: TriggerItem; index?: number}

function Item(props: ItemProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['item', 'index', 'onClick', 'onMouseMove'])
  const index = () => local.index ?? scope.items().findIndex((entry) => entry.id === local.item.id)
  const highlighted = () =>
    (scope.isSearchMode() || scope.activeCategoryId() !== null) && index() === scope.highlightedIndex()
  return (
    <Primitive.button
      type="button"
      role="option"
      id={`${scope.popoverId}-option-${local.item.id}`}
      aria-selected={highlighted()}
      data-highlighted={highlighted() ? '' : undefined}
      onClick={(event) => {
        if (typeof local.onClick === 'function') local.onClick(event)
        scope.selectItem(local.item)
      }}
      onMouseMove={(event) => {
        if (typeof local.onMouseMove === 'function') local.onMouseMove(event)
        scope.highlightIndex(index())
      }}
      {...rest}
    />
  )
}

function Back(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['onClick'])
  const visible = () => scope.open() && scope.activeCategoryId() !== null && !scope.isSearchMode()
  return (
    <Show when={visible()}>
      <Primitive.button
        type="button"
        onClick={(event) => {
          if (typeof local.onClick === 'function') local.onClick(event)
          scope.goBack()
        }}
        {...rest}
      />
    </Show>
  )
}

export const TriggerPopover = Object.assign(TriggerPopoverComponent, {Directive, Action})
export const TriggerPopoverRoot = Root
export const TriggerPopoverCategories = Categories
export const TriggerPopoverCategoryItem = CategoryItem
export const TriggerPopoverItems = Items
export const TriggerPopoverItem = Item
export const TriggerPopoverBack = Back
```

- [ ] **Step 2: Wire into `composer.tsx`**

Delete `trailingTrigger` and the old `TriggerPopover` function (lines 317-350) and the `handlers.triggerItems` usage. In `Input`, add root integration. Modified `onKeyDown` and new cursor/ARIA wiring inside `Input` (imports: add `useTriggerPopoverRootOptional` and the new components from `./trigger/trigger-popover.js`):

```tsx
const triggerRoot = useTriggerPopoverRootOptional()
const openTrigger = () => triggerRoot?.triggers().find((scope) => scope.open())
const syncCursor = (target: HTMLTextAreaElement) => {
  const triggers = triggerRoot?.triggers() ?? []
  for (const scope of triggers) scope.setCursorPosition(target.selectionStart ?? target.value.length)
}
const onKeyDown = (event: KeyboardEvent & {currentTarget: HTMLTextAreaElement; target: Element}) => {
  if (typeof local.onKeyDown === 'function') local.onKeyDown(event)
  const active = openTrigger()
  if (active?.handleKeyDown(event)) return
  const mode = local.submitMode ?? 'enter'
  if ((local.cancelOnEscape ?? true) && event.key === 'Escape' && composer.canCancel()) {
    event.preventDefault()
    composer.cancel()
    return
  }
  if (event.key !== 'Enter' || event.isComposing) return
  const wantsSubmit = mode === 'enter' ? !event.shiftKey : mode === 'ctrlEnter' ? event.ctrlKey || event.metaKey : false
  if (!wantsSubmit) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}
```

And on the `<TextArea>` element add (keeping existing props):

```tsx
      onInput={(event) => {
        composer.setText(event.currentTarget.value)
        syncCursor(event.currentTarget)
      }}
      onKeyUp={(event) => syncCursor(event.currentTarget)}
      onClick={(event) => syncCursor(event.currentTarget)}
      aria-haspopup={triggerRoot?.activeAria() ? 'listbox' : undefined}
      aria-expanded={triggerRoot?.activeAria() ? true : undefined}
      aria-controls={triggerRoot?.activeAria()?.popoverId}
      aria-activedescendant={triggerRoot?.activeAria()?.highlightedItemId}
```

Attach the compound members at the bottom of `composer.tsx`, replacing the old `TriggerPopover` entry:

```ts
export const Composer = Object.assign(Root, {
  Root,
  Input,
  Send,
  Cancel,
  AddAttachment,
  Attachments,
  AttachmentDropzone,
  If,
  Quote,
  QuoteDismiss,
  Dictate,
  StopDictation,
  DictationTranscript,
  TriggerPopoverRoot,
  TriggerPopover,
  TriggerPopoverCategories,
  TriggerPopoverCategoryItem,
  TriggerPopoverItems,
  TriggerPopoverItem,
  TriggerPopoverBack,
  Queue,
})
```

- [ ] **Step 3: Clean `composer-handlers.tsx` and `index.tsx`**

`composer-handlers.tsx`: delete `export type TriggerItem = …` and the `triggerItems?: …` member. Delete `packages/ui-kit-chat/src/primitives/composer/trigger-popover.stories.tsx` (old stub story).

`index.tsx`: in the composer-handlers export block drop `type TriggerItem`; add:

```ts
export {useTriggerPopoverScope, useTriggerPopoverRootOptional} from './primitives/composer/trigger/trigger-popover.js'
export type {TriggerPopoverScope} from './primitives/composer/trigger/trigger-popover-model.js'
export {defaultDirectiveFormatter} from './primitives/composer/trigger/directive-formatter.js'
export {detectTrigger} from './primitives/composer/trigger/detect-trigger.js'
export type {
  TriggerItem,
  TriggerCategory,
  TriggerAdapter,
  DirectiveFormatter,
  DirectiveSegment,
  TriggerBehavior,
  TriggerKeyEvent,
  SelectItemOverride,
} from './primitives/composer/trigger/types.js'
```

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck --filter @conciv/ui-kit-chat` — expected clean. Run: `rg -n "triggerItems|trailingTrigger" packages/` — expected no hits.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit-chat/src
git commit -m "feat(ui-kit-chat): compound TriggerPopover primitives + composer input combobox integration" -- packages/ui-kit-chat
```

---

### Task 4: Storybook play stories for the primitives

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover.stories.tsx`

**Interfaces:**

- Consumes: everything from Task 3, `ChatProvider` + `storyConnection` (`src/store/story-connection.ts` — same setup as `composer.stories.tsx`).

- [ ] **Step 1: Write the stories with play tests**

```tsx
import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor, fn} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {For} from 'solid-js'
import {ChatProvider} from '../../../store/chat-context.js'
import {storyConnection} from '../../../store/story-connection.js'
import {Composer} from '../composer.js'
import type {TriggerAdapter, TriggerItem} from './types.js'

const meta: Meta = {title: 'primitives/Composer/TriggerPopover'}
export default meta
type Story = StoryObj

const COMMANDS: TriggerItem[] = [
  {id: 'compact', type: 'command', label: '/compact', description: 'Compact the conversation'},
  {id: 'usage', type: 'command', label: '/usage', description: 'Show token usage'},
  {id: 'help', type: 'command', label: '/help'},
]

const flatAdapter: TriggerAdapter = {
  categories: () => [],
  categoryItems: () => [],
  search: (query) => COMMANDS.filter((item) => item.id.includes(query.toLowerCase())),
}

const categorizedAdapter: TriggerAdapter = {
  categories: () => [
    {id: 'session', label: 'Session'},
    {id: 'context', label: 'Context'},
  ],
  categoryItems: (categoryId) =>
    categoryId === 'session' ? [COMMANDS[2] ?? COMMANDS[0] ?? {id: '', type: '', label: ''}] : COMMANDS.slice(0, 2),
}

function App(props: {adapter: TriggerAdapter; onExecute?: (item: TriggerItem) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  const slashFormatter = {
    serialize: (item: TriggerItem) => `/${item.id}`,
    parse: (text: string) => [{kind: 'text' as const, text}],
  }
  return (
    <ChatProvider chat={chat}>
      <Composer.TriggerPopoverRoot>
        <Composer.Root class="flex flex-col gap-1 relative">
          <Composer.Input aria-label="Message" placeholder="Type / for commands" />
          <Composer.TriggerPopover char="/" adapter={props.adapter} class="border flex flex-col">
            {props.onExecute ? (
              <Composer.TriggerPopover.Action formatter={slashFormatter} onExecute={props.onExecute} removeOnExecute />
            ) : (
              <Composer.TriggerPopover.Directive formatter={slashFormatter} />
            )}
            <Composer.TriggerPopoverCategories>
              {(categories) => (
                <For each={categories()}>
                  {(category) => (
                    <Composer.TriggerPopoverCategoryItem categoryId={category.id}>
                      {category.label}
                    </Composer.TriggerPopoverCategoryItem>
                  )}
                </For>
              )}
            </Composer.TriggerPopoverCategories>
            <Composer.TriggerPopoverItems>
              {(items) => (
                <For each={items()}>
                  {(item, index) => (
                    <Composer.TriggerPopoverItem item={item} index={index()}>
                      {item.label}
                    </Composer.TriggerPopoverItem>
                  )}
                </For>
              )}
            </Composer.TriggerPopoverItems>
            <Composer.TriggerPopoverBack>Back</Composer.TriggerPopoverBack>
          </Composer.TriggerPopover>
        </Composer.Root>
      </Composer.TriggerPopoverRoot>
    </ChatProvider>
  )
}

export const OpensAndFilters: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/us')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/usage'})).toBeVisible())
    await expect(canvas.queryByRole('option', {name: '/compact'})).toBeNull()
    await expect(input).toHaveAttribute('aria-expanded', 'true')
  },
}

export const KeyboardSelect: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('/usage '))
    await expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

export const EscapeCloses: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/co')
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).toBeNull())
    await expect(input).not.toHaveAttribute('aria-expanded')
  },
}

export const CategoriesDrillAndBack: Story = {
  render: () => <App adapter={categorizedAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Session'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: 'Session'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/help'})).toBeVisible())
    await userEvent.keyboard('{Backspace}')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Context'})).toBeVisible())
  },
}

export const ActionExecutes: Story = {
  render: function Render() {
    const onExecute = fn()
    return <App adapter={flatAdapter} onExecute={onExecute} />
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, 'hi /comp')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: '/compact'}))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('hi '))
  },
}
```

(If `toHaveAttribute` matcher naming differs in this Storybook version, mirror assertions used by existing stories in the package.)

- [ ] **Step 2: Run and verify pass**

First: `pgrep -f "storybook dev"` — must be empty (do not run alongside a live Storybook). Then:
Run: `pnpm --filter @conciv/ui-kit-chat exec vitest run --project storybook -t TriggerPopover`
Expected: PASS (5 stories).

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit-chat/src/primitives/composer/trigger/trigger-popover.stories.tsx
git commit -m "test(ui-kit-chat): trigger popover storybook play coverage (keyboard, drill, action)" -- packages/ui-kit-chat
```

---

### Task 5: Adapter factories

**Files:**

- Create: `packages/ui-kit-chat/src/behaviors/create-slash-command-adapter.ts`
- Create: `packages/ui-kit-chat/src/behaviors/create-mention-adapter.ts`
- Modify: `packages/ui-kit-chat/src/index.tsx`
- Test: `packages/ui-kit-chat/test/trigger-adapters.test.ts`

**Interfaces:**

- Produces:
  - `SlashCommandDef = {id: string; label?: string; description?: string; icon?: string; execute(): void}`
  - `createSlashCommandAdapter(options: {commands: Accessor<readonly SlashCommandDef[]>; removeOnExecute?: boolean}): {adapter: TriggerAdapter; action: {onExecute: (item: TriggerItem) => void; removeOnExecute?: boolean}}`
  - `createMentionAdapter(options: {items?: Accessor<readonly TriggerItem[]>; categories?: Accessor<readonly {category: TriggerCategory; items: readonly TriggerItem[]}[]>; formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}): {adapter: TriggerAdapter; directive: {formatter: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}}`

- [ ] **Step 1: Write failing tests** `packages/ui-kit-chat/test/trigger-adapters.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {createSlashCommandAdapter} from '../src/behaviors/create-slash-command-adapter.js'
import {createMentionAdapter} from '../src/behaviors/create-mention-adapter.js'

describe('createSlashCommandAdapter', () => {
  it('searches id, label, and description; executes by id; keeps items serializable', () => {
    const ran: string[] = []
    const {adapter, action} = createSlashCommandAdapter({
      commands: () => [
        {id: 'summarize', description: 'Summarize the thread', execute: () => ran.push('summarize')},
        {id: 'translate', label: '/translate', execute: () => ran.push('translate')},
      ],
      removeOnExecute: true,
    })
    expect(adapter.categories()).toEqual([])
    const results = adapter.search?.('summ') ?? []
    expect(results.map((item) => item.id)).toEqual(['summarize'])
    expect(results[0]).not.toHaveProperty('execute')
    action.onExecute({id: 'translate', type: 'command', label: '/translate'})
    expect(ran).toEqual(['translate'])
    expect(action.removeOnExecute).toBe(true)
  })
})

describe('createMentionAdapter', () => {
  it('serves flat items via search and categories via drill-in', () => {
    const {adapter, directive} = createMentionAdapter({
      categories: () => [
        {
          category: {id: 'tools', label: 'Tools'},
          items: [{id: 'page.read', type: 'tool', label: 'page.read'}],
        },
      ],
    })
    expect(adapter.categories().map((category) => category.id)).toEqual(['tools'])
    expect(adapter.categoryItems('tools').map((item) => item.id)).toEqual(['page.read'])
    expect(adapter.search?.('page').map((item) => item.id)).toEqual(['page.read'])
    expect(directive.formatter.serialize({id: 'page.read', type: 'tool', label: 'page.read'})).toBe(':tool[page.read]')
  })
})
```

- [ ] **Step 2: Run to verify failure** — same vitest command pattern; expected module-not-found.

- [ ] **Step 3: Implement**

`packages/ui-kit-chat/src/behaviors/create-slash-command-adapter.ts`:

```ts
import type {Accessor} from 'solid-js'
import type {TriggerAdapter, TriggerItem} from '../primitives/composer/trigger/types.js'

export type SlashCommandDef = {
  id: string
  label?: string
  description?: string
  icon?: string
  execute(): void
}

function toItem(command: SlashCommandDef): TriggerItem {
  return {
    id: command.id,
    type: 'command',
    label: command.label ?? `/${command.id}`,
    ...(command.description === undefined ? {} : {description: command.description}),
    ...(command.icon === undefined ? {} : {metadata: {icon: command.icon}}),
  }
}

function matches(command: SlashCommandDef, lower: string): boolean {
  if (!lower) return true
  return (
    command.id.toLowerCase().includes(lower) ||
    (command.label?.toLowerCase().includes(lower) ?? false) ||
    (command.description?.toLowerCase().includes(lower) ?? false)
  )
}

export function createSlashCommandAdapter(options: {
  commands: Accessor<readonly SlashCommandDef[]>
  removeOnExecute?: boolean
}): {adapter: TriggerAdapter; action: {onExecute: (item: TriggerItem) => void; removeOnExecute?: boolean}} {
  const adapter: TriggerAdapter = {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => {
      const lower = query.toLowerCase()
      return options
        .commands()
        .filter((command) => matches(command, lower))
        .map(toItem)
    },
  }
  const action = {
    onExecute: (item: TriggerItem) =>
      options
        .commands()
        .find((command) => command.id === item.id)
        ?.execute(),
    ...(options.removeOnExecute === undefined ? {} : {removeOnExecute: options.removeOnExecute}),
  }
  return {adapter, action}
}
```

`packages/ui-kit-chat/src/behaviors/create-mention-adapter.ts`:

```ts
import type {Accessor} from 'solid-js'
import {defaultDirectiveFormatter} from '../primitives/composer/trigger/directive-formatter.js'
import type {
  DirectiveFormatter,
  TriggerAdapter,
  TriggerCategory,
  TriggerItem,
} from '../primitives/composer/trigger/types.js'

export type MentionCategorySource = {category: TriggerCategory; items: readonly TriggerItem[]}

function matches(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

export function createMentionAdapter(options: {
  items?: Accessor<readonly TriggerItem[]>
  categories?: Accessor<readonly MentionCategorySource[]>
  formatter?: DirectiveFormatter
  onInserted?: (item: TriggerItem) => void
}): {adapter: TriggerAdapter; directive: {formatter: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}} {
  const allItems = () => [
    ...(options.items?.() ?? []),
    ...(options.categories?.() ?? []).flatMap((source) => source.items),
  ]
  const adapter: TriggerAdapter = {
    categories: () => (options.categories?.() ?? []).map((source) => source.category),
    categoryItems: (categoryId) =>
      (options.categories?.() ?? []).find((source) => source.category.id === categoryId)?.items ?? [],
    search: (query) => {
      const lower = query.toLowerCase()
      return allItems().filter((item) => matches(item, lower))
    },
  }
  const directive = {
    formatter: options.formatter ?? defaultDirectiveFormatter,
    ...(options.onInserted === undefined ? {} : {onInserted: options.onInserted}),
  }
  return {adapter, directive}
}
```

Add to `index.tsx`:

```ts
export {createSlashCommandAdapter, type SlashCommandDef} from './behaviors/create-slash-command-adapter.js'
export {createMentionAdapter, type MentionCategorySource} from './behaviors/create-mention-adapter.js'
```

- [ ] **Step 4: Run to verify pass** + `pnpm turbo typecheck --filter @conciv/ui-kit-chat`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit-chat/src/behaviors packages/ui-kit-chat/src/index.tsx packages/ui-kit-chat/test/trigger-adapters.test.ts
git commit -m "feat(ui-kit-chat): slash command + mention adapter factories" -- packages/ui-kit-chat
```

---

### Task 6: Protocol schemas + api-client routes

**Files:**

- Modify: `packages/protocol/src/chat-types.ts`
- Modify: `packages/api-client/src/api-client.ts`

**Interfaces:**

- Produces: `ChatCommandSchema`, `ChatCommandsSchema`, `ChatCommand`, `ChatCommands`, `ChatToolSchema`, `ChatToolsSchema`, `ChatTool`, `ChatTools` (protocol); `client.commands()`, `client.tools()` (api-client).

- [ ] **Step 1: Add schemas** to `packages/protocol/src/chat-types.ts` (next to `ChatModelsSchema`):

```ts
export const ChatCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  argumentHint: z.string().optional(),
  source: z.enum(['harness', 'mcp', 'plugin']),
})
export const ChatCommandsSchema = z.object({commands: z.array(ChatCommandSchema)})
export type ChatCommand = z.infer<typeof ChatCommandSchema>
export type ChatCommands = z.infer<typeof ChatCommandsSchema>

export const ChatToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  extension: z.string().optional(),
})
export const ChatToolsSchema = z.object({tools: z.array(ChatToolSchema)})
export type ChatTool = z.infer<typeof ChatToolSchema>
export type ChatTools = z.infer<typeof ChatToolsSchema>
```

- [ ] **Step 2: Add api-client routes** in `packages/api-client/src/api-client.ts` — import `ChatCommandsSchema, ChatToolsSchema` and add after `models`:

```ts
    commands: t.route({method: 'GET', path: '/api/chat/commands', response: ChatCommandsSchema}),
    tools: t.route({method: 'GET', path: '/api/chat/tools', response: ChatToolsSchema}),
```

- [ ] **Step 3: Verify** — `pnpm turbo typecheck --filter @conciv/protocol --filter @conciv/api-client`. Expected clean.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/chat-types.ts packages/api-client/src/api-client.ts
git commit -m "feat(protocol,api-client): chat commands + tools schemas and routes" -- packages/protocol packages/api-client
```

---

### Task 7: Harness contract — `slashCommands` capability

**Files:**

- Modify: `packages/protocol/src/harness-types.ts`
- Modify: `packages/harness/src/claude/index.ts` (CLI variant → `'none'`; SDK variant left for Task 8, set `'none'` for now to keep typecheck green)
- Modify: `packages/harness/src/codex/index.ts`, `packages/harness/src/gemini-cli/index.ts`, `packages/harness/src/opencode/index.ts`, `packages/harness/src/pi/index.ts` (all `'none'`)

**Interfaces:**

- Produces (in `harness-types.ts`):

```ts
export type HarnessCommand = {name: string; description?: string; argumentHint?: string}
export type HarnessCommandsContext = {cwd: string; sessionId?: string; mcpUrl?: string}
export type HarnessCommands = (ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>
```

- [ ] **Step 1: Extend types**

Add to `HarnessCapabilities`:

```ts
slashCommands: 'live' | 'files' | 'none'
```

Add the three type aliases above near `HarnessModels`. Extend the `HarnessAdapter` intersection with a third discriminated arm:

```ts
export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {compaction: true}; buildCompactArgs: HarnessArgsBuilder}
    | {capabilities: HarnessCapabilities & {compaction: false}; buildCompactArgs?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {slashCommands: 'live' | 'files'}; commands: HarnessCommands}
    | {capabilities: HarnessCapabilities & {slashCommands: 'none'}; commands?: undefined}
  )
```

- [ ] **Step 2: Add `slashCommands: 'none'`** to every adapter's `capabilities` (codex, gemini-cli, opencode, pi, and both claude variants in `makeClaudeAdapter`).

- [ ] **Step 3: Verify** — `pnpm turbo typecheck --filter @conciv/protocol --filter @conciv/harness`. Expected clean (the union forces every adapter to declare the capability — a missing entry is a compile error, which is the test).

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/harness-types.ts packages/harness/src
git commit -m "feat(harness): slashCommands capability + commands contract, none on all adapters" -- packages/protocol packages/harness
```

---

### Task 8: Claude SDK `live` commands

**Files:**

- Modify: `packages/harness/src/claude/sdk.ts`
- Modify: `packages/harness/src/claude/index.ts` (SDK variant → `slashCommands: 'live'`, `commands: claudeSdkCommands`)
- Test: extend the existing harness test file that covers `sdk.ts` (locate with `rg -l "__sdkStats" packages/harness` — if none exists, create `packages/harness/test/claude-sdk-commands.test.ts` following the package's existing test conventions)

**Interfaces:**

- Consumes: `sessions` map, `makeInputQueue`, `query` (all already in `sdk.ts`); `HarnessCommand`, `HarnessCommandsContext` from Task 7.
- Produces: `claudeSdkCommands(ctx: HarnessCommandsContext): Promise<HarnessCommand[]>`, `__commandsCacheSet(cwd: string, commands: HarnessCommand[]): void` (test hook, same convention as `__sdkStats`).

- [ ] **Step 1: Implement in `sdk.ts`**

```ts
import type {SlashCommand} from '@anthropic-ai/claude-agent-sdk'
import type {HarnessCommand, HarnessCommandsContext} from '@conciv/protocol/harness-types'

const commandsByCwd = new Map<string, HarnessCommand[]>()

function toHarnessCommand(command: SlashCommand): HarnessCommand {
  return {
    name: command.name,
    description: command.description,
    ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
  }
}

export function __commandsCacheSet(cwd: string, commands: HarnessCommand[]): void {
  commandsByCwd.set(cwd, commands)
}

async function probeCommands(ctx: HarnessCommandsContext): Promise<SlashCommand[]> {
  const input = makeInputQueue()
  const options: Options = {cwd: ctx.cwd, permissionMode: 'acceptEdits'}
  if (ctx.mcpUrl) options.mcpServers = mcpServerConfig(ctx.mcpUrl, ctx.sessionId)
  if (CONCIV_PLUGIN_DIR) options.plugins = [{type: 'local', path: CONCIV_PLUGIN_DIR}]
  const probe = query({prompt: input.stream, options})
  try {
    return await probe.supportedCommands()
  } finally {
    input.end()
    void probe.interrupt().catch(() => {})
  }
}

export async function claudeSdkCommands(ctx: HarnessCommandsContext): Promise<HarnessCommand[]> {
  const warm = ctx.sessionId ? sessions.get(ctx.sessionId) : undefined
  const usable = warm && warm.cwd === ctx.cwd ? warm : undefined
  if (usable) {
    const commands = (await usable.query.supportedCommands()).map(toHarnessCommand)
    commandsByCwd.set(ctx.cwd, commands)
    return commands
  }
  const cached = commandsByCwd.get(ctx.cwd)
  if (cached) return cached
  const commands = (await probeCommands(ctx)).map(toHarnessCommand)
  commandsByCwd.set(ctx.cwd, commands)
  return commands
}
```

In `turnMessages`, intercept the `commands_changed` push before yielding (SDK guidance: replace the cached list):

```ts
const value: SDKMessage = res.value
if (value.type === 'system' && 'subtype' in value && value.subtype === 'commands_changed')
  commandsByCwd.set(ws.cwd, value.commands.map(toHarnessCommand))
yield value
```

(Adjust narrowing to the actual `SDKCommandsChangedMessage` union member; it is part of `SDKMessage` in sdk.d.ts — verify with `rg "commands_changed" node_modules/.pnpm/*claude-agent-sdk*/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`.)

In `claude/index.ts` SDK branch: `slashCommands: 'live'` in capabilities and `commands: claudeSdkCommands` on the adapter. CLI branch keeps `'none'`.

- [ ] **Step 2: Test**

Cache behavior is testable without spawning: seed via `__commandsCacheSet`, call `claudeSdkCommands({cwd})`, expect the seeded list back without a spawn (assert `__sdkStats().spawned` unchanged). Mapping (`toHarnessCommand` via the cache round-trip) covered by the same test. The probe path spawns a real CLI — cover it in the package's IT suite only if a claude-authenticated IT already exists (`rg -l "supportedModels|query\(" packages/harness/test packages/it 2>/dev/null`); otherwise it is exercised by the example app and the widget e2e chain.

```ts
import {describe, expect, it} from 'vitest'
import {claudeSdkCommands, __commandsCacheSet, __sdkStats} from '../src/claude/sdk.js'

describe('claudeSdkCommands', () => {
  it('serves the per-cwd cache without spawning', async () => {
    __commandsCacheSet('/tmp/fake-project', [{name: 'compact', description: 'Compact the context'}])
    const before = __sdkStats().spawned
    const commands = await claudeSdkCommands({cwd: '/tmp/fake-project'})
    expect(commands).toEqual([{name: 'compact', description: 'Compact the context'}])
    expect(__sdkStats().spawned).toBe(before)
  })
})
```

- [ ] **Step 3: Verify** — run the harness test suite (`pnpm --filter @conciv/harness test` or the package's script) + `pnpm turbo typecheck --filter @conciv/harness`.

- [ ] **Step 4: Commit**

```bash
git add packages/harness/src/claude packages/harness/test
git commit -m "feat(harness): claude live slash commands via SDK supportedCommands + commands_changed cache" -- packages/harness
```

---

### Task 9: Core routes `/api/chat/commands` + `/api/chat/tools`

**Files:**

- Modify: `packages/core/src/api/chat/session.ts` (commands route, next to the models route)
- Create: `packages/core/src/api/chat/tools-route.ts`
- Modify: `packages/core/src/app.ts` (collect tool list with extension names; register tools route)
- Test: follow core's existing route-test convention (`rg -l "api/chat/models|registerChatRoutes" packages/core/test packages/it` to locate; add cases beside them)

**Interfaces:**

- Consumes: `HarnessCommands` (Task 7), `ChatCommand`/`ChatTool` (Task 6), `deps.harness`, `sessionIdFromHeaders`, request `origin` (same derivation the turn route uses for `mcpUrl`).
- Produces: `GET /api/chat/commands` → `ChatCommands`; `GET /api/chat/tools` → `ChatTools`; `registerToolsRoute(app: H3, tools: ChatTool[]): void`.

- [ ] **Step 1: Commands route** in `session.ts` (mirroring the models route; reuse the same origin helper the file/module already uses — check how `turn.ts` computes `origin` and mirror it):

```ts
app.get('/api/chat/commands', async (event): Promise<ChatCommands> => {
  if (!deps.harness.commands) return {commands: []}
  const sessionId = sessionIdFromHeaders(event.req.headers) ?? undefined
  const origin = requestOrigin(event)
  const mcpUrl = deps.harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined
  const list = await deps.harness.commands({cwd: deps.cwd, sessionId, mcpUrl})
  return {
    commands: list.map((command) => ({
      name: command.name,
      description: command.description ?? '',
      ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
      source: commandSource(command.name),
    })),
  }
})
```

with

```ts
function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}
```

(`requestOrigin` — extract/reuse the exact origin derivation from `turn.ts:100`'s surrounding code rather than reimplementing.)

- [ ] **Step 2: Tools route** `packages/core/src/api/chat/tools-route.ts`:

```ts
import type {H3} from 'h3'
import type {ChatTools, ChatTool} from '@conciv/protocol/chat-types'

export function registerToolsRoute(app: H3, tools: ChatTool[]): void {
  app.get('/api/chat/tools', (): ChatTools => ({tools}))
}
```

In `app.ts`, extend the `mounted` mapping to carry the extension name and build the list (conciv tools enumerated via `concivTools(makeCtx-shape)` — import `concivTools` from `@conciv/tools` and reuse the same ctx factory passed to `registerMcpRoutes`, with an empty sessionId):

```ts
const toolList: ChatTool[] = [
  ...concivTools(makeToolCtx('')).map((tool) => ({name: tool.name, description: tool.description})),
  ...mounted.flatMap((entry) =>
    entry.tools.map((tool) => ({name: tool.name, description: tool.description, extension: entry.extensionName})),
  ),
]
registerToolsRoute(app, toolList)
```

(where `makeToolCtx` is the existing inline ctx factory hoisted to a named function, and each `mounted` entry gains `extensionName: extension.name`.)

- [ ] **Step 3: Tests** — real h3 app + fetch, minimal real adapters (this is a real `HarnessAdapter` object, not a mock of one): one with `slashCommands: 'live'` + `commands: async () => [{name: 'compact', description: 'Compact'}, {name: 'mcp__conciv__snapshot', description: 'Snap'}, {name: 'conciv:extensions', description: 'Skill'}]`, one with `'none'`. Assert source derivation (`harness`/`mcp`/`plugin`), empty list for `'none'`, and `/api/chat/tools` payload. Place beside core's existing route tests, matching their app-construction helper.

- [ ] **Step 4: Verify** — core test suite + `pnpm turbo typecheck --filter @conciv/core`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): /api/chat/commands + /api/chat/tools routes" -- packages/core
```

---

### Task 10: Extension `commands` seam (type only)

**Files:**

- Modify: `packages/extension/src/types.ts`, `packages/extension/src/define-extension.ts`

**Interfaces:**

- Produces: `ExtensionCommand = {name: string; description: string; argumentHint?: string; prompt(args: string): string}`; `ExtensionMeta.commands?: readonly ExtensionCommand[]` carried onto the builder (`builder.commands = meta.commands`), collected by nothing yet.

- [ ] **Step 1: Add the type** to `types.ts`:

```ts
export type ExtensionCommand = {
  name: string
  description: string
  argumentHint?: string
  prompt(args: string): string
}
```

Add `commands?: readonly ExtensionCommand[]` to `ExtensionMeta` and `ExtensionBuilder` in `define-extension.ts`, and `commands: meta.commands` in the builder literal.

- [ ] **Step 2: Verify** — `pnpm turbo typecheck --filter @conciv/extension`. Commit:

```bash
git add packages/extension/src
git commit -m "feat(extension): reserve typed commands leaf on defineExtension" -- packages/extension
```

---

### Task 11: Widget wiring — `/` commands + `@` mentions

**Files:**

- Create: `packages/widget/src/chat/trigger-menus.tsx`
- Modify: `packages/widget/src/chat/chat-panel.tsx`
- Modify: `packages/ui-kit-chat/src/styled/composer.tsx` (add `popover?: JSX.Element` slot + `relative` on Root)

**Interfaces:**

- Consumes: `client.commands()` / `client.tools()` (Task 6), Composer trigger compound (Task 3), `createResource`.
- Produces: `TriggerMenus(props: {client: SessionClient; active: () => boolean}): JSX.Element` rendering both `<Composer.TriggerPopover>` declarations; `slashFormatter`, `mentionFormatter` (module-local); chat-panel wraps its tree in `Composer.TriggerPopoverRoot` and passes `<TriggerMenus …/>` via the styled Composer `popover` slot.

- [ ] **Step 1: Styled composer slot** — in `packages/ui-kit-chat/src/styled/composer.tsx` add `popover?: JSX.Element` to `ComposerProps`, change Root class to `"flex flex-col gap-1.5 relative"`, render `{props.popover}` as the first child of `ComposerPrimitive.Root`.

- [ ] **Step 2: `trigger-menus.tsx`**

```tsx
import {createMemo, createResource, For, Show, type JSX} from 'solid-js'
import {
  Composer as ComposerPrimitive,
  type TriggerAdapter,
  type TriggerItem,
  type DirectiveFormatter,
} from '@conciv/ui-kit-chat'
import type {SessionClient} from '@conciv/api-client'
import type {ChatCommand, ChatTool} from '@conciv/protocol/chat-types'

const PANEL =
  'absolute bottom-full start-0 z-50 mb-2 w-72 max-h-64 overflow-y-auto rounded-pw-md border border-pw-line bg-pw-panel shadow-lg flex flex-col py-1'
const OPTION =
  'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-start [border:none] bg-transparent cursor-pointer text-pw-text data-[highlighted]:bg-pw-fill-strong'
const GROUP_HEADER =
  'px-3 pt-2 pb-1 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase] text-pw-text-3'

const slashFormatter: DirectiveFormatter = {
  serialize: (item) => `/${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}
const mentionFormatter: DirectiveFormatter = {
  serialize: (item) => `@${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}

const SOURCE_LABEL: Record<ChatCommand['source'], string> = {harness: 'Commands', mcp: 'MCP', plugin: 'Plugins'}

function commandItem(command: ChatCommand): TriggerItem {
  return {
    id: command.name,
    type: 'command',
    label: `/${command.name}`,
    description: command.description,
    metadata: {source: command.source, ...(command.argumentHint ? {argumentHint: command.argumentHint} : {})},
  }
}

function toolItem(tool: ChatTool): TriggerItem {
  return {
    id: tool.name,
    type: 'tool',
    label: `@${tool.name}`,
    description: tool.description,
    metadata: {group: tool.extension ?? 'Tools'},
  }
}

function matches(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

function groupedAdapter(items: () => readonly TriggerItem[]): TriggerAdapter {
  return {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => {
      const lower = query.toLowerCase()
      return items().filter((item) => matches(item, lower))
    },
  }
}

function groupOf(item: TriggerItem): string {
  const source = item.metadata?.source
  if (typeof source === 'string') return SOURCE_LABEL[source as ChatCommand['source']] ?? source
  const group = item.metadata?.group
  return typeof group === 'string' ? group : ''
}

function GroupedList(props: {items: readonly TriggerItem[]}): JSX.Element {
  return (
    <For each={props.items}>
      {(item, index) => (
        <>
          <Show when={index() === 0 || groupOf(item) !== groupOf(props.items[index() - 1] ?? item)}>
            <div class={GROUP_HEADER}>{groupOf(item)}</div>
          </Show>
          <ComposerPrimitive.TriggerPopoverItem item={item} index={index()} class={OPTION}>
            <span class="text-[0.8125rem] font-medium">{item.label}</span>
            <Show when={item.description}>
              <span class="text-[0.75rem] text-pw-text-3 leading-tight">{item.description}</span>
            </Show>
          </ComposerPrimitive.TriggerPopoverItem>
        </>
      )}
    </For>
  )
}

export function TriggerMenus(props: {
  client: SessionClient
  active: () => boolean
  turnCount: () => number
}): JSX.Element {
  const [commands] = createResource(
    () => (props.active() ? props.turnCount() : null),
    async () => (await props.client.commands()).commands,
  )
  const [tools] = createResource(
    () => props.active(),
    async () => (await props.client.tools()).tools,
  )
  const commandItems = createMemo(() => {
    const bySource = (commands() ?? []).map(commandItem)
    return [...bySource].sort((a, b) => groupOf(a).localeCompare(groupOf(b)))
  })
  const toolItems = createMemo(() => (tools() ?? []).map(toolItem).sort((a, b) => groupOf(a).localeCompare(groupOf(b))))
  return (
    <>
      <Show when={commandItems().length > 0}>
        <ComposerPrimitive.TriggerPopover char="/" adapter={groupedAdapter(commandItems)} class={PANEL}>
          <ComposerPrimitive.TriggerPopover.Directive formatter={slashFormatter} />
          <ComposerPrimitive.TriggerPopoverItems class="flex flex-col">
            {(items) => <GroupedList items={items() as TriggerItem[]} />}
          </ComposerPrimitive.TriggerPopoverItems>
        </ComposerPrimitive.TriggerPopover>
      </Show>
      <Show when={toolItems().length > 0}>
        <ComposerPrimitive.TriggerPopover char="@" adapter={groupedAdapter(toolItems)} class={PANEL}>
          <ComposerPrimitive.TriggerPopover.Directive formatter={mentionFormatter} />
          <ComposerPrimitive.TriggerPopoverItems class="flex flex-col">
            {(items) => <GroupedList items={items() as TriggerItem[]} />}
          </ComposerPrimitive.TriggerPopoverItems>
        </ComposerPrimitive.TriggerPopover>
      </Show>
    </>
  )
}
```

(No casts allowed — type the render-fn parameter properly: `(items: Accessor<readonly TriggerItem[]>) => <GroupedList items={items()} />`. Fix during implementation; the `as` above is illustrative shorthand and MUST NOT survive.)

- [ ] **Step 3: Chat panel wiring** — in `chat-panel.tsx`:
  - Wrap the returned tree (inside `ChatProvider`) with `<ComposerPrimitive.TriggerPopoverRoot>…</ComposerPrimitive.TriggerPopoverRoot>` (import the compound as `Composer` is already imported — use `ComposerPrimitive` from `@conciv/ui-kit-chat`).
  - Track completed turns for refetch: `const turnCount = () => chat.messages().length` is sufficient (message count changes when a turn lands; resource re-runs, hitting the server cache updated by `commands_changed`).
  - Pass `popover={<TriggerMenus client={client} active={() => props.active ?? true} turnCount={turnCount} />}` to the styled `<Composer …>`.

- [ ] **Step 4: Verify** — `pnpm turbo typecheck --filter @conciv/widget --filter @conciv/ui-kit-chat`, then `pnpm turbo build --filter @conciv/widget` (widget e2e needs the fresh bundle). Widget change = browser hard-reload in the dev app; core/harness changes require restarting `pnpm dev` when eyeballing.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src packages/ui-kit-chat/src/styled/composer.tsx
git commit -m "feat(widget): / command and @ mention trigger menus in the composer" -- packages/widget packages/ui-kit-chat
```

---

### Task 12: Widget e2e ITs

**Files:**

- Create: `packages/widget/test/trigger-menu.it.test.ts` (follow `widget.it.test.ts` conventions: same fixture server bootstrap, `browser.newPage()` never `newContext()`, `domcontentloaded` never `networkidle`)
- Modify: the shared IT fixture server only if route registration is centralized there (check `widget.it.test.ts:217` server handler; add `/api/chat/commands` + `/api/chat/tools` responses in the new test's own server if each test owns its server)

**Interfaces:**

- Consumes: built `packages/widget/dist/conciv-widget.global.js` (rebuild first), `it-fixture.ts` helpers, Task 11 UI.

- [ ] **Step 1: Write the test.** Server serves:

```ts
const COMMANDS = {
  commands: [
    {name: 'compact', description: 'Compact the conversation', source: 'harness'},
    {name: 'mcp__conciv__snapshot', description: 'Capture the board', source: 'mcp'},
  ],
}
const TOOLS = {tools: [{name: 'page.read', description: 'Read the page DOM'}]}
```

plus whatever `widget.it.test.ts`'s server already stubs for boot (`/api/chat/session`, `/api/chat/models`, …) — copy its handler skeleton and add the two routes; record `POST /api/chat` bodies into a `posts: string[]` array via `readBody`.

Test cases (locators must pierce the widget shadow root — use `[aria-label]`/text/css, not `getByRole`, per the effects-shadow rule; check how existing widget ITs locate the composer input and reuse that exact approach):

```ts
test('slash menu lists grouped commands and inserts on selection', async () => {
  const input = page.locator('[aria-label="Message the conciv agent"]')
  await input.click()
  await input.type('/comp')
  const option = page.locator('[role="option"]', {hasText: '/compact'})
  await expect.poll(() => option.count()).toBe(1)
  await option.click()
  await expect.poll(() => input.inputValue()).toBe('/compact ')
  await input.type('focus on auth')
  await input.press('Enter')
  await expect.poll(() => posts.some((body) => body.includes('/compact focus on auth'))).toBe(true)
})

test('mcp commands appear under their own group header', async () => {
  const input = page.locator('[aria-label="Message the conciv agent"]')
  await input.click()
  await input.type('/snap')
  await expect.poll(() => page.locator('[role="option"]', {hasText: '/mcp__conciv__snapshot'}).count()).toBe(1)
  await expect.poll(() => page.getByText('MCP', {exact: true}).count()).toBe(1)
})

test('mention menu inserts tool reference', async () => {
  const input = page.locator('[aria-label="Message the conciv agent"]')
  await input.click()
  await input.type('@page')
  const option = page.locator('[role="option"]', {hasText: '@page.read'})
  await expect.poll(() => option.count()).toBe(1)
  await input.press('Enter')
  await expect.poll(() => input.inputValue()).toBe('@page.read ')
})

test('escape closes; empty command list never opens', async () => {
  const input = page.locator('[aria-label="Message the conciv agent"]')
  await input.click()
  await input.type('/co')
  await expect.poll(() => page.locator('[role="listbox"]').count()).toBe(1)
  await input.press('Escape')
  await expect.poll(() => page.locator('[role="listbox"]').count()).toBe(0)
})
```

(Playwright CSS locators pierce open shadow roots; `inputValue` works on the shadow textarea. For the empty-list case spin a second server variant returning `{commands: []}` and assert typing `/` yields zero listboxes.)

- [ ] **Step 2: Rebuild + run**

```bash
pnpm turbo build --filter @conciv/widget
pnpm --filter @conciv/widget exec vitest run test/trigger-menu.it.test.ts
```

Expected: PASS (4+ tests).

- [ ] **Step 3: Commit**

```bash
git add packages/widget/test
git commit -m "test(widget): e2e trigger menu ITs (slash insert+submit, groups, mention, escape/empty)" -- packages/widget
```

---

### Task 13: Full verification sweep

- [ ] **Step 1:** `pnpm turbo build typecheck lint --filter @conciv/ui-kit-chat --filter @conciv/protocol --filter @conciv/api-client --filter @conciv/harness --filter @conciv/core --filter @conciv/extension --filter @conciv/widget` — all green.
- [ ] **Step 2:** Full test run for touched packages (`pnpm --filter … test` each; storybook project included for ui-kit-chat — check `pgrep -f "storybook dev"` first).
- [ ] **Step 3:** Live check in the example app (`apps/examples/*` with `pnpm dev` restarted since harness/core changed): type `/` — real claude command list appears (built-ins + skills + `mcp__conciv__*`); pick `/compact`, submit, confirm the agent runs it. Type `@` — conciv + extension tools listed. No tests added to the example app.
- [ ] **Step 4:** Commit any straggler fixes with pathspec; report results.
