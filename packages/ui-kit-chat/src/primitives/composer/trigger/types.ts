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
