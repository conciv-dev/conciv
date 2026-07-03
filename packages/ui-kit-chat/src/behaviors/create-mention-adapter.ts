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
