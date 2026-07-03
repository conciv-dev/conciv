import {createEffect, createMemo, createSignal, type Accessor} from 'solid-js'
import type {TriggerAdapter, TriggerCategory, TriggerItem} from './types.js'

function matchesQuery(item: TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  )
}

export type TriggerNavigationResource = {
  categories: Accessor<readonly TriggerCategory[]>
  items: Accessor<readonly TriggerItem[]>
  isSearchMode: Accessor<boolean>
  activeCategoryId: Accessor<string | null>
  navigableList: Accessor<readonly (TriggerCategory | TriggerItem)[]>
  selectCategory(categoryId: string): void
  goBack(): void
}

export function createTriggerNavigationResource(options: {
  adapter: () => TriggerAdapter | undefined
  query: Accessor<string>
  open: Accessor<boolean>
}): TriggerNavigationResource {
  const [activeCategoryId, setActiveCategoryId] = createSignal<string | null>(null)

  createEffect(() => {
    if (!options.open()) setActiveCategoryId(null)
  })

  const categories = createMemo<readonly TriggerCategory[]>(() => {
    const adapter = options.adapter()
    if (!options.open() || !adapter) return []
    return adapter.categories()
  })

  const effectiveActiveCategoryId = () => (options.open() ? activeCategoryId() : null)

  const allItems = createMemo<readonly TriggerItem[]>(() => {
    const adapter = options.adapter()
    const categoryId = effectiveActiveCategoryId()
    if (!categoryId || !adapter) return []
    return adapter.categoryItems(categoryId)
  })

  const searchResults = createMemo<readonly TriggerItem[] | null>(() => {
    const adapter = options.adapter()
    if (!options.open() || !adapter || effectiveActiveCategoryId()) return null
    if (!options.query() && categories().length > 0) return null
    if (adapter.search) return adapter.search(options.query())

    const lower = options.query().toLowerCase()
    return categories().flatMap((category) =>
      adapter.categoryItems(category.id).filter((item) => matchesQuery(item, lower)),
    )
  })

  const isSearchMode = () => searchResults() !== null

  const filteredCategories = createMemo(() => {
    if (isSearchMode()) return []
    if (!options.query()) return categories()
    const lower = options.query().toLowerCase()
    return categories().filter((category) => category.label.toLowerCase().includes(lower))
  })

  const filteredItems = createMemo(() => {
    if (isSearchMode()) return searchResults() ?? []
    if (!options.query()) return allItems()
    const lower = options.query().toLowerCase()
    return allItems().filter((item) => matchesQuery(item, lower))
  })

  const navigableList = createMemo<readonly (TriggerCategory | TriggerItem)[]>(() => {
    if (isSearchMode()) return searchResults() ?? []
    if (effectiveActiveCategoryId()) return filteredItems()
    return filteredCategories()
  })

  return {
    categories: filteredCategories,
    items: filteredItems,
    isSearchMode,
    activeCategoryId: effectiveActiveCategoryId,
    navigableList,
    selectCategory: (categoryId) => setActiveCategoryId(categoryId),
    goBack: () => setActiveCategoryId(null),
  }
}
