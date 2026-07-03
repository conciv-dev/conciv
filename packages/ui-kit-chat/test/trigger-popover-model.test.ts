import {createRoot, createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {createTriggerPopoverModel} from '../src/primitives/composer/trigger/trigger-popover-model.js'
import type {TriggerAdapter, TriggerBehavior, TriggerItem} from '../src/primitives/composer/trigger/types.js'
import {defaultDirectiveFormatter} from '../src/primitives/composer/trigger/directive-formatter.js'

const FIRST: TriggerItem = {id: 'compact', type: 'command', label: '/compact', description: 'Compact the context'}
const ITEMS: TriggerItem[] = [FIRST, {id: 'usage', type: 'command', label: '/usage'}]
const flatAdapter: TriggerAdapter = {
  categories: () => [],
  categoryItems: () => [],
  search: (query) => ITEMS.filter((item) => item.id.includes(query)),
}
const categorizedAdapter: TriggerAdapter = {
  categories: () => [{id: 'general', label: 'General'}],
  categoryItems: (categoryId) => (categoryId === 'general' ? ITEMS : []),
}

function setup(adapter: TriggerAdapter, initial = '') {
  return createRoot((dispose) => {
    const [text, setText] = createSignal(initial)
    const [behavior, setBehavior] = createSignal<TriggerBehavior | undefined>(undefined)
    const model = createTriggerPopoverModel({
      char: '/',
      adapter: () => adapter,
      behavior,
      isLoading: () => false,
      popoverId: 'test-popover',
      text,
      setText,
    })
    return {model, text, setText, setBehavior, dispose}
  })
}

const keyEvent = (key: string, shiftKey = false) => ({key, shiftKey, preventDefault: () => {}})

describe('createTriggerPopoverModel', () => {
  it('stays closed without a behavior', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(false)
    dispose()
  })

  it('opens on trigger detection once a behavior is present, search mode for flat adapters', () => {
    const {model, setText, setBehavior, dispose} = setup(flatAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(true)
    expect(model.isSearchMode()).toBe(true)
    expect(model.items().map((item) => item.id)).toEqual(['compact'])
    dispose()
  })

  it('shows categories at top level and drills in', () => {
    const {model, setText, setBehavior, dispose} = setup(categorizedAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    expect(model.categories().map((category) => category.id)).toEqual(['general'])
    model.selectCategory('general')
    expect(model.items()).toHaveLength(2)
    model.goBack()
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })

  it('keyboard: arrows cycle with wraparound, Enter selects', () => {
    const {model, text, setText, setBehavior, dispose} = setup(flatAdapter)
    setBehavior({
      kind: 'directive',
      formatter: {serialize: (item) => `/${item.id}`, parse: (value) => [{kind: 'text', text: value}]},
    })
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('ArrowDown'))).toBe(true)
    expect(model.highlightedIndex()).toBe(1)
    expect(model.highlightedItemId()).toBe('test-popover-option-usage')
    model.handleKeyDown(keyEvent('ArrowDown'))
    expect(model.highlightedIndex()).toBe(0)
    model.handleKeyDown(keyEvent('ArrowUp'))
    expect(model.highlightedIndex()).toBe(1)
    model.handleKeyDown(keyEvent('ArrowUp'))
    model.handleKeyDown(keyEvent('Enter'))
    expect(text()).toBe('/compact ')
    expect(model.open()).toBe(false)
    dispose()
  })

  it('Tab selects like Enter; Shift variants are not consumed', () => {
    const {model, text, setText, setBehavior, dispose} = setup(flatAdapter)
    setBehavior({
      kind: 'directive',
      formatter: {serialize: (item) => `/${item.id}`, parse: (value) => [{kind: 'text', text: value}]},
    })
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('Enter', true))).toBe(false)
    expect(model.handleKeyDown(keyEvent('Tab', true))).toBe(false)
    expect(model.handleKeyDown(keyEvent('Tab'))).toBe(true)
    expect(text()).toBe('/compact ')
    dispose()
  })

  it('Backspace with empty query inside a category goes back and is consumed', () => {
    const {model, setText, setBehavior, dispose} = setup(categorizedAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    model.selectCategory('general')
    expect(model.handleKeyDown(keyEvent('Backspace'))).toBe(true)
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })

  it('keyboard Enter on a highlighted category drills in', () => {
    const {model, setText, setBehavior, dispose} = setup(categorizedAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    model.handleKeyDown(keyEvent('Enter'))
    expect(model.activeCategoryId()).toBe('general')
    expect(model.items()).toHaveLength(2)
    dispose()
  })

  it('action behavior with removeOnExecute strips the trigger text and fires onExecute', () => {
    const {model, text, setText, setBehavior, dispose} = setup(flatAdapter, 'hi /com')
    const executed: string[] = []
    setBehavior({
      kind: 'action',
      formatter: defaultDirectiveFormatter,
      onExecute: (item) => executed.push(item.id),
      removeOnExecute: true,
    })
    setText('hi /com')
    model.setCursorPosition(7)
    model.selectItem(FIRST)
    expect(executed).toEqual(['compact'])
    expect(text()).toBe('hi ')
    dispose()
  })

  it('action behavior without removeOnExecute leaves an audit chip and fires onExecute', () => {
    const {model, text, setText, setBehavior, dispose} = setup(flatAdapter)
    const executed: string[] = []
    setBehavior({
      kind: 'action',
      formatter: {serialize: (item) => `/${item.id}`, parse: (value) => [{kind: 'text', text: value}]},
      onExecute: (item) => executed.push(item.id),
    })
    setText('/com')
    model.setCursorPosition(4)
    model.selectItem(FIRST)
    expect(executed).toEqual(['compact'])
    expect(text()).toBe('/compact ')
    dispose()
  })

  it('close moves the cursor before the trigger so detection deactivates', () => {
    const {model, setText, setBehavior, dispose} = setup(flatAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    model.close()
    expect(model.open()).toBe(false)
    dispose()
  })

  it('select-item override intercepts insertion', () => {
    const {model, text, setText, setBehavior, dispose} = setup(flatAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    const seen: string[] = []
    model.registerSelectItemOverride((item) => {
      seen.push(item.id)
      return true
    })
    setText('/co')
    model.setCursorPosition(3)
    model.selectItem(FIRST)
    expect(seen).toEqual(['compact'])
    expect(text()).toBe('/co')
    dispose()
  })

  it('closing resets the active category', () => {
    const {model, setText, setBehavior, dispose} = setup(categorizedAdapter)
    setBehavior({kind: 'directive', formatter: defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    model.selectCategory('general')
    expect(model.activeCategoryId()).toBe('general')
    setText('')
    model.setCursorPosition(0)
    expect(model.open()).toBe(false)
    setText('/')
    model.setCursorPosition(1)
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })
})
