import {createEffect, createMemo, createSignal, type Accessor} from 'solid-js'
import type {TriggerAdapter, TriggerCategory, TriggerEntry, TriggerItem} from './types.js'

function matchesQuery(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

function fallbackSearch(
  adapter: TriggerAdapter,
  categories: readonly TriggerCategory[],
  query: string,
): readonly TriggerItem[] {
  const lower = query.toLowerCase()
  return categories.flatMap((category) =>
    adapter.categoryItems(category.id).filter((item) => matchesQuery(item, lower)),
  )
}

function searchFor(adapter: TriggerAdapter, query: string, categories: readonly TriggerCategory[]) {
  return adapter.search?.(query) ?? fallbackSearch(adapter, categories, query)
}

function showsCategories(open: boolean, categoryId: string | null, query: string, count: number): boolean {
  return !open || categoryId !== null || (query === '' && count > 0)
}

export type TriggerNavigation = {
  categories: Accessor<readonly TriggerCategory[]>
  items: Accessor<readonly TriggerItem[]>
  isSearchMode: Accessor<boolean>
  activeCategoryId: Accessor<string | null>
  navigableList: Accessor<readonly TriggerEntry[]>
  selectCategory: (categoryId: string) => void
  goBack: () => void
}

export function createTriggerNavigation(options: {
  adapter: Accessor<TriggerAdapter | undefined>
  query: Accessor<string>
  open: Accessor<boolean>
}): TriggerNavigation {
  const [activeCategoryId, setActiveCategoryId] = createSignal<string | null>(null)

  createEffect(() => {
    if (!options.open()) setActiveCategoryId(null)
  })

  const categories = createMemo<readonly TriggerCategory[]>(() => {
    const adapter = options.adapter()
    if (!options.open() || !adapter) return []
    return adapter.categories()
  })

  const openCategoryId = () => (options.open() ? activeCategoryId() : null)

  const allItems = createMemo<readonly TriggerItem[]>(() => {
    const adapter = options.adapter()
    const categoryId = openCategoryId()
    if (!categoryId || !adapter) return []
    return adapter.categoryItems(categoryId)
  })

  const searchResults = createMemo<readonly TriggerItem[] | null>(() => {
    const adapter = options.adapter()
    if (!adapter || showsCategories(options.open(), openCategoryId(), options.query(), categories().length)) return null
    return searchFor(adapter, options.query(), categories())
  })

  const isSearchMode = () => searchResults() !== null

  const filteredCategories = createMemo<readonly TriggerCategory[]>(() => {
    if (isSearchMode()) return []
    if (!options.query()) return categories()
    const lower = options.query().toLowerCase()
    return categories().filter((category) => category.label.toLowerCase().includes(lower))
  })

  const filteredItems = createMemo<readonly TriggerItem[]>(() => {
    if (isSearchMode()) return searchResults() ?? []
    if (!options.query()) return allItems()
    const lower = options.query().toLowerCase()
    return allItems().filter((item) => matchesQuery(item, lower))
  })

  const navigableList = createMemo<readonly TriggerEntry[]>(() => {
    if (isSearchMode()) return searchResults() ?? []
    if (openCategoryId()) return filteredItems()
    return filteredCategories()
  })

  return {
    categories: filteredCategories,
    items: filteredItems,
    isSearchMode,
    activeCategoryId: openCategoryId,
    navigableList,
    selectCategory: (categoryId) => setActiveCategoryId(categoryId),
    goBack: () => setActiveCategoryId(null),
  }
}
