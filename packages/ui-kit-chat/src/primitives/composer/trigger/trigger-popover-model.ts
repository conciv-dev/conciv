import {createSignal, type Accessor} from 'solid-js'
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

function isTriggerItem(entry: TriggerCategory | TriggerItem): entry is TriggerItem {
  return 'type' in entry
}

let popoverCount = 0

export function createTriggerPopoverModel(options: TriggerPopoverModelOptions): TriggerPopoverScope {
  popoverCount += 1
  const popoverId = `trigger-popover-${popoverCount}`
  const [cursorPosition, setCursorPosition] = createSignal(options.text().length)
  const [behavior, setBehavior] = createSignal<TriggerBehavior | null>(null)
  const [activeCategory, setActiveCategory] = createSignal<{offset: number; id: string} | null>(null)
  const [highlight, setHighlight] = createSignal<{key: string; index: number}>({key: '', index: 0})
  let override: SelectItemOverride | null = null

  const trigger = () => {
    const position = Math.min(cursorPosition(), options.text().length)
    return detectTrigger(options.text(), options.char, position)
  }
  const query = () => trigger()?.query ?? ''
  const open = () => trigger() !== null && options.adapter() !== undefined && behavior() !== null

  const effectiveCategoryId = () => {
    const detected = trigger()
    const current = activeCategory()
    return open() && detected && current && current.offset === detected.offset ? current.id : null
  }
  const allCategories = () => {
    const adapter = options.adapter()
    return open() && adapter ? adapter.categories() : []
  }
  const categoryItems = () => {
    const adapter = options.adapter()
    const categoryId = effectiveCategoryId()
    return adapter && categoryId ? adapter.categoryItems(categoryId) : []
  }
  const searchResults = (): readonly TriggerItem[] | null => {
    const adapter = options.adapter()
    if (!open() || !adapter || effectiveCategoryId()) return null
    if (!query() && allCategories().length > 0) return null
    if (adapter.search) return adapter.search(query())
    const lower = query().toLowerCase()
    return allCategories().flatMap((category) =>
      adapter.categoryItems(category.id).filter((item) => matchesQuery(item, lower)),
    )
  }
  const isSearchMode = () => searchResults() !== null
  const categories = () => {
    if (isSearchMode()) return []
    if (!query()) return allCategories()
    const lower = query().toLowerCase()
    return allCategories().filter((category) => category.label.toLowerCase().includes(lower))
  }
  const items = () => {
    const results = searchResults()
    if (results) return results
    if (!query()) return categoryItems()
    const lower = query().toLowerCase()
    return categoryItems().filter((item) => matchesQuery(item, lower))
  }
  const navigableList = (): readonly (TriggerCategory | TriggerItem)[] => {
    const results = searchResults()
    if (results) return results
    return effectiveCategoryId() ? items() : categories()
  }

  const highlightKey = () => `${effectiveCategoryId() ?? ''}|${isSearchMode()}|${query()}`
  const highlightedIndex = () => {
    const current = highlight()
    return current.key === highlightKey() ? current.index : 0
  }
  const moveHighlight = (index: number) => setHighlight({key: highlightKey(), index})

  const goBack = () => setActiveCategory(null)
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

  const handleKeyDown = (event: TriggerKeyEvent): boolean => {
    if (!open()) return false
    const list = navigableList()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveHighlight(list.length === 0 ? 0 : highlightedIndex() < list.length - 1 ? highlightedIndex() + 1 : 0)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveHighlight(list.length === 0 ? 0 : highlightedIndex() > 0 ? highlightedIndex() - 1 : list.length - 1)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (event.shiftKey) return false
      event.preventDefault()
      const entry = list[highlightedIndex()]
      if (!entry) return true
      if (isTriggerItem(entry)) selectItem(entry)
      if (!isTriggerItem(entry)) selectCategory(entry.id)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    if (event.key === 'Backspace' && effectiveCategoryId() && query() === '') {
      event.preventDefault()
      goBack()
      return true
    }
    return false
  }

  const selectCategory = (categoryId: string) => {
    const detected = trigger()
    if (detected) setActiveCategory({offset: detected.offset, id: categoryId})
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
    selectCategory,
    goBack,
    selectItem,
    close,
    highlightIndex: (index) => {
      if (index < 0 || index >= navigableList().length) return
      moveHighlight(index)
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
