import {createEffect, createSignal, on, type Accessor} from 'solid-js'
import {commitEntry, type TriggerEntry, type TriggerItem, type TriggerKeyEvent} from './types.js'

export type TriggerKeyboard = {
  highlightedIndex: Accessor<number>
  highlightedItemId: Accessor<string | undefined>
  highlightedEntryId: Accessor<string | undefined>
  highlightIndex: (index: number) => void
  handleKeyDown: (event: TriggerKeyEvent) => boolean
}

function step(previous: number, length: number, delta: number): number {
  if (length === 0) return 0
  return (previous + delta + length) % length
}

function arrowDelta(key: string): number {
  if (key === 'ArrowDown') return 1
  if (key === 'ArrowUp') return -1
  return 0
}

function commits(event: TriggerKeyEvent): boolean {
  return (event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey
}

export function createTriggerKeyboard(options: {
  navigableList: Accessor<readonly TriggerEntry[]>
  isSearchMode: Accessor<boolean>
  activeCategoryId: Accessor<string | null>
  query: Accessor<string>
  popoverId: string
  open: Accessor<boolean>
  selectItem: (item: TriggerItem) => void
  selectCategory: (categoryId: string) => void
  goBack: () => void
}): TriggerKeyboard {
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

  createEffect(on(options.navigableList, () => setHighlightedIndex(0)))
  createEffect(on([options.isSearchMode, options.activeCategoryId], () => setHighlightedIndex(0)))

  const highlightIndex = (index: number) => {
    if (index < 0 || index >= options.navigableList().length) return
    if (index === highlightedIndex()) return
    setHighlightedIndex(index)
  }

  const commitHighlighted = (event: TriggerKeyEvent): boolean => {
    const entry = options.navigableList()[highlightedIndex()]
    if (!entry) return false
    event.preventDefault()
    commitEntry(entry, options.selectItem, options.selectCategory)
    return true
  }

  const stepHighlight = (event: TriggerKeyEvent, delta: number): true => {
    event.preventDefault()
    setHighlightedIndex((previous) => step(previous, options.navigableList().length, delta))
    return true
  }

  const leavesCategory = (event: TriggerKeyEvent): boolean =>
    event.key === 'Backspace' && options.activeCategoryId() !== null && options.query() === ''

  const leaveCategory = (event: TriggerKeyEvent): boolean => {
    if (!leavesCategory(event)) return false
    event.preventDefault()
    options.goBack()
    return true
  }

  const applyKey = (event: TriggerKeyEvent): boolean => {
    const delta = arrowDelta(event.key)
    if (delta !== 0) return stepHighlight(event, delta)
    if (commits(event)) return commitHighlighted(event)
    return leaveCategory(event)
  }

  const handleKeyDown = (event: TriggerKeyEvent): boolean => (options.open() ? applyKey(event) : false)

  const highlightedEntryId = () => {
    const entry = options.navigableList()[highlightedIndex()]
    return options.open() && entry ? entry.id : undefined
  }

  const highlightedItemId = () => {
    const entryId = highlightedEntryId()
    return entryId === undefined ? undefined : `${options.popoverId}-option-${entryId}`
  }

  return {highlightedIndex, highlightedItemId, highlightedEntryId, highlightIndex, handleKeyDown}
}
