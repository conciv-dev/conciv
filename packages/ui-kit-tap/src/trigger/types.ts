export type TriggerItem = {
  id: string
  type: string
  label: string
  description?: string
  group?: string
  metadata?: Record<string, unknown>
}

export type TriggerCategory = {id: string; label: string; description?: string}

export type TriggerEntry = TriggerCategory | TriggerItem

export type TriggerAdapter = {
  categories(): readonly TriggerCategory[]
  categoryItems(categoryId: string): readonly TriggerItem[]
  search?(query: string): readonly TriggerItem[]
}

export type TriggerKeyEvent = {readonly key: string; readonly shiftKey: boolean; preventDefault(): void}

export function isTriggerItem(entry: TriggerEntry): entry is TriggerItem {
  return 'type' in entry
}

export function commitEntry(
  entry: TriggerEntry,
  select: (item: TriggerItem) => void,
  drillInto: (categoryId: string) => void,
): void {
  if (isTriggerItem(entry)) select(entry)
  if (!isTriggerItem(entry)) drillInto(entry.id)
}
