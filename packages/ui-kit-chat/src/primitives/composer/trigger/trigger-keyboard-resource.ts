import {createEffect, createSignal, on, type Accessor} from 'solid-js'
import type {TriggerCategory, TriggerItem, TriggerKeyEvent} from './types.js'

function isTriggerItem(entry: TriggerCategory | TriggerItem): entry is TriggerItem {
  return 'type' in entry
}

export type TriggerKeyboardResource = {
  highlightedIndex: Accessor<number>
  highlightedItemId: Accessor<string | undefined>
  highlightIndex(index: number): void
  handleKeyDown(event: TriggerKeyEvent): boolean
}

export function createTriggerKeyboardResource(options: {
  navigableList: Accessor<readonly (TriggerCategory | TriggerItem)[]>
  isSearchMode: Accessor<boolean>
  activeCategoryId: Accessor<string | null>
  query: Accessor<string>
  popoverId: string
  open: Accessor<boolean>
  selectItem(item: TriggerItem): void
  selectCategory(categoryId: string): void
  goBack(): void
  close(): void
}): TriggerKeyboardResource {
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  createEffect(on(options.navigableList, () => setHighlightedIndex(0)))
  createEffect(on([options.isSearchMode, options.activeCategoryId], () => setHighlightedIndex(0)))

  const highlightIndex = (index: number) => {
    if (index < 0 || index >= options.navigableList().length) return
    if (index === highlightedIndex()) return
    setHighlightedIndex(index)
  }

  const handleKeyDown = (event: TriggerKeyEvent): boolean => {
    if (!options.open()) return false

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        setHighlightedIndex((previous) => {
          const length = options.navigableList().length
          if (length === 0) return 0
          return previous < length - 1 ? previous + 1 : 0
        })
        return true
      }
      case 'ArrowUp': {
        event.preventDefault()
        setHighlightedIndex((previous) => {
          const length = options.navigableList().length
          if (length === 0) return 0
          return previous > 0 ? previous - 1 : length - 1
        })
        return true
      }
      case 'Enter':
      case 'Tab': {
        if (event.shiftKey) return false
        event.preventDefault()
        const entry = options.navigableList()[highlightedIndex()]
        if (!entry) return true

        if (isTriggerItem(entry)) options.selectItem(entry)
        if (!isTriggerItem(entry)) options.selectCategory(entry.id)
        return true
      }
      case 'Escape': {
        event.preventDefault()
        options.close()
        return true
      }
      case 'Backspace': {
        if (options.activeCategoryId() && options.query() === '') {
          event.preventDefault()
          options.goBack()
          return true
        }
        return false
      }
      default:
        return false
    }
  }

  const highlightedItemId = () => {
    const entry = options.navigableList()[highlightedIndex()]
    return options.open() && entry ? `${options.popoverId}-option-${entry.id}` : undefined
  }

  return {highlightedIndex, highlightedItemId, highlightIndex, handleKeyDown}
}
