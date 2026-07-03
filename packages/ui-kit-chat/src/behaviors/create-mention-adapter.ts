import type {Component} from 'solid-js'
import {defaultDirectiveFormatter} from '../primitives/composer/trigger/directive-formatter.js'
import type {
  DirectiveFormatter,
  TriggerAdapter,
  TriggerCategory,
  TriggerItem,
} from '../primitives/composer/trigger/types.js'

export type IconComponent = Component<{class?: string}>

export type Mention = {
  readonly id: string
  readonly type: string
  readonly label: string
  readonly description?: string
  readonly icon?: string
  readonly metadata?: Record<string, unknown>
}

export type MentionCategory = {
  readonly id: string
  readonly label: string
  readonly items: readonly Mention[]
}

export type ModelContextTool = {readonly name: string; readonly description?: string}

export type ModelContextToolsOptions = {
  readonly category?: {readonly id: string; readonly label: string}
  readonly formatLabel?: (toolName: string) => string
  readonly icon?: string
}

export type MentionAdapterOptions = {
  readonly items?: readonly Mention[]
  readonly categories?: readonly MentionCategory[]
  readonly modelContextTools?: readonly ModelContextTool[]
  readonly includeModelContextTools?: boolean | ModelContextToolsOptions
  readonly formatter?: DirectiveFormatter
  readonly onInserted?: (item: TriggerItem) => void
  readonly iconMap?: Record<string, IconComponent>
  readonly fallbackIcon?: IconComponent
}

export type MentionDirective = {
  readonly formatter: DirectiveFormatter
  readonly onInserted?: ((item: TriggerItem) => void) | undefined
}

export function createMentionAdapter(options?: MentionAdapterOptions): {
  adapter: TriggerAdapter
  directive: MentionDirective
  iconMap?: Record<string, IconComponent>
  fallbackIcon?: IconComponent
} {
  const items = options?.items
  const categories = options?.categories
  const includeTools = options?.includeModelContextTools ?? (!items && !categories)
  const toolsConfig = typeof includeTools === 'object' ? includeTools : undefined
  const wantsTools = includeTools !== false

  const getModelContextTools = (): TriggerItem[] => {
    if (!wantsTools) return []
    const tools = options?.modelContextTools ?? []
    const formatLabel = toolsConfig?.formatLabel
    const defaultIcon = toolsConfig?.icon
    return tools.map((tool) =>
      toTriggerItem({
        id: tool.name,
        type: 'tool',
        label: formatLabel ? formatLabel(tool.name) : tool.name,
        ...(tool.description === undefined ? {} : {description: tool.description}),
        ...(defaultIcon === undefined ? {} : {icon: defaultIcon}),
      }),
    )
  }

  const adapter = buildAdapter({categories, items, wantsTools, toolsConfig, getModelContextTools})

  const directive: MentionDirective = {
    formatter: options?.formatter ?? defaultDirectiveFormatter,
    ...(options?.onInserted ? {onInserted: options.onInserted} : {}),
  }

  return {
    adapter,
    directive,
    ...(options?.iconMap ? {iconMap: options.iconMap} : {}),
    ...(options?.fallbackIcon ? {fallbackIcon: options.fallbackIcon} : {}),
  }
}

function buildAdapter(args: {
  categories: readonly MentionCategory[] | undefined
  items: readonly Mention[] | undefined
  wantsTools: boolean
  toolsConfig: ModelContextToolsOptions | undefined
  getModelContextTools(): TriggerItem[]
}): TriggerAdapter {
  const {categories, items, wantsTools, toolsConfig, getModelContextTools} = args

  if (categories && categories.length > 0) {
    const groups = categories.map((category) => ({
      id: category.id,
      label: category.label,
      items: category.items.map(toTriggerItem),
    }))

    const toolItems = getModelContextTools()
    const toolCategory =
      wantsTools && toolItems.length > 0
        ? {
            id: toolsConfig?.category?.id ?? 'tools',
            label: toolsConfig?.category?.label ?? 'Tools',
            items: toolItems,
          }
        : null
    const allGroups = toolCategory ? [...groups, toolCategory] : groups

    return {
      categories: () => allGroups.map(({id, label}) => ({id, label})),
      categoryItems: (id) => allGroups.find((group) => group.id === id)?.items ?? [],
      search: (query) => {
        const lower = query.toLowerCase()
        return allGroups.flatMap((group) => group.items).filter((item) => matchesQuery(item, lower))
      },
    }
  }

  const flatItems = (items ?? []).map(toTriggerItem)
  const getFlatPool = (): TriggerItem[] => {
    if (!wantsTools) return flatItems
    const seen = new Set(flatItems.map((item) => item.id))
    return [...flatItems, ...getModelContextTools().filter((tool) => !seen.has(tool.id))]
  }

  return {
    categories: (): readonly TriggerCategory[] => [],
    categoryItems: () => [],
    search: (query) => {
      const lower = query.toLowerCase()
      return getFlatPool().filter((item) => matchesQuery(item, lower))
    },
  }
}

function toTriggerItem(mention: Mention): TriggerItem {
  const metadata = mention.icon !== undefined ? {...mention.metadata, icon: mention.icon} : mention.metadata
  return {
    id: mention.id,
    type: mention.type,
    label: mention.label,
    ...(mention.description !== undefined ? {description: mention.description} : {}),
    ...(metadata !== undefined ? {metadata} : {}),
  }
}

function matchesQuery(item: TriggerItem, lower: string): boolean {
  if (!lower) return true
  if (item.id.toLowerCase().includes(lower)) return true
  if (item.label.toLowerCase().includes(lower)) return true
  if (item.description?.toLowerCase().includes(lower)) return true
  return false
}
