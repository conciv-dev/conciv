import {createRoot, createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {createTriggerPopoverModel} from '../src/primitives/composer/trigger/trigger-popover-model.js'
import type {TriggerAdapter, TriggerItem} from '../src/primitives/composer/trigger/types.js'
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
    const model = createTriggerPopoverModel({
      char: '/',
      adapter: () => adapter,
      isLoading: () => false,
      text,
      setText,
    })
    return {model, text, setText, dispose}
  })
}

const keyEvent = (key: string, shiftKey = false) => ({key, shiftKey, preventDefault: () => {}})

describe('createTriggerPopoverModel', () => {
  it('stays closed without a registered behavior', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(false)
    dispose()
  })

  it('opens on trigger detection once a behavior registers, search mode for flat adapters', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    expect(model.open()).toBe(true)
    expect(model.isSearchMode()).toBe(true)
    expect(model.items().map((item) => item.id)).toEqual(['compact'])
    dispose()
  })

  it('shows categories at top level and drills in', () => {
    const {model, setText, dispose} = setup(categorizedAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
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
    const {model, text, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({
      kind: 'directive',
      formatter: () => ({serialize: (item) => `/${item.id}`, parse: (value) => [{kind: 'text', text: value}]}),
    })
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('ArrowDown'))).toBe(true)
    expect(model.highlightedIndex()).toBe(1)
    model.handleKeyDown(keyEvent('ArrowDown'))
    expect(model.highlightedIndex()).toBe(0)
    model.handleKeyDown(keyEvent('ArrowUp'))
    expect(model.highlightedIndex()).toBe(1)
    model.handleKeyDown(keyEvent('ArrowUp'))
    model.handleKeyDown(keyEvent('Enter'))
    expect(text()).toBe('/compact ')
    dispose()
  })

  it('Shift+Enter is not consumed', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    expect(model.handleKeyDown(keyEvent('Enter', true))).toBe(false)
    dispose()
  })

  it('Backspace with empty query inside a category goes back and is consumed', () => {
    const {model, setText, dispose} = setup(categorizedAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/')
    model.setCursorPosition(1)
    model.selectCategory('general')
    expect(model.handleKeyDown(keyEvent('Backspace'))).toBe(true)
    expect(model.activeCategoryId()).toBeNull()
    dispose()
  })

  it('action behavior with removeOnExecute strips the trigger text and fires onExecute', () => {
    const {model, text, setText, dispose} = setup(flatAdapter, 'hi /com')
    const executed: string[] = []
    model.registerBehavior({
      kind: 'action',
      formatter: () => defaultDirectiveFormatter,
      onExecute: (item) => executed.push(item.id),
      removeOnExecute: () => true,
    })
    setText('hi /com')
    model.setCursorPosition(7)
    model.selectItem(FIRST)
    expect(executed).toEqual(['compact'])
    expect(text()).toBe('hi ')
    dispose()
  })

  it('close moves the cursor before the trigger so detection deactivates', () => {
    const {model, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
    setText('/co')
    model.setCursorPosition(3)
    model.close()
    expect(model.open()).toBe(false)
    dispose()
  })

  it('select-item override intercepts insertion', () => {
    const {model, text, setText, dispose} = setup(flatAdapter)
    model.registerBehavior({kind: 'directive', formatter: () => defaultDirectiveFormatter})
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
})
