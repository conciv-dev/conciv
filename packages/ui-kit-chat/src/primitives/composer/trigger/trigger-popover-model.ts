import {createMemo, type Accessor} from 'solid-js'
import {createTriggerDetectionResource} from './trigger-detection-resource.js'
import {createTriggerKeyboardResource} from './trigger-keyboard-resource.js'
import {createTriggerNavigationResource} from './trigger-navigation-resource.js'
import {createTriggerSelectionResource} from './trigger-selection-resource.js'
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
  behavior: () => TriggerBehavior | undefined
  isLoading: () => boolean
  popoverId: string
  text: Accessor<string>
  setText(value: string): void
}

export type TriggerPopoverScope = {
  char: string
  popoverId: string
  open: Accessor<boolean>
  query: Accessor<string>
  activeCategoryId: Accessor<string | null>
  categories: Accessor<readonly TriggerCategory[]>
  items: Accessor<readonly TriggerItem[]>
  highlightedIndex: Accessor<number>
  isSearchMode: Accessor<boolean>
  isLoading: Accessor<boolean>
  highlightedItemId: Accessor<string | undefined>
  selectCategory(categoryId: string): void
  goBack(): void
  selectItem(item: TriggerItem): void
  close(): void
  highlightIndex(index: number): void
  handleKeyDown(event: TriggerKeyEvent): boolean
  setCursorPosition(position: number): void
  registerSelectItemOverride(fn: SelectItemOverride): () => void
}

export function createTriggerPopoverModel(options: TriggerPopoverModelOptions): TriggerPopoverScope {
  const detection = createTriggerDetectionResource({text: options.text, triggerChar: options.char})

  const open = createMemo(
    () => detection.trigger() !== null && options.adapter() !== undefined && options.behavior() !== undefined,
  )

  const navigation = createTriggerNavigationResource({adapter: options.adapter, query: detection.query, open})

  const onSelected = () => navigation.goBack()

  const selection = createTriggerSelectionResource({
    behavior: options.behavior,
    trigger: detection.trigger,
    triggerChar: options.char,
    text: options.text,
    setText: options.setText,
    setCursorPosition: detection.setCursorPosition,
    onSelected,
  })

  const keyboard = createTriggerKeyboardResource({
    navigableList: navigation.navigableList,
    isSearchMode: navigation.isSearchMode,
    activeCategoryId: navigation.activeCategoryId,
    query: detection.query,
    popoverId: options.popoverId,
    open,
    selectItem: selection.selectItem,
    selectCategory: navigation.selectCategory,
    goBack: navigation.goBack,
    close: selection.close,
  })

  return {
    char: options.char,
    popoverId: options.popoverId,
    open,
    query: detection.query,
    activeCategoryId: navigation.activeCategoryId,
    categories: navigation.categories,
    items: navigation.items,
    highlightedIndex: keyboard.highlightedIndex,
    isSearchMode: navigation.isSearchMode,
    isLoading: () => options.isLoading(),
    highlightedItemId: keyboard.highlightedItemId,
    selectCategory: navigation.selectCategory,
    goBack: navigation.goBack,
    selectItem: selection.selectItem,
    close: selection.close,
    highlightIndex: keyboard.highlightIndex,
    handleKeyDown: keyboard.handleKeyDown,
    setCursorPosition: detection.setCursorPosition,
    registerSelectItemOverride: selection.registerSelectItemOverride,
  }
}
