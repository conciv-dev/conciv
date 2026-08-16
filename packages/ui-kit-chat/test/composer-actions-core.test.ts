import {createRoot} from 'solid-js'
import {expect, it} from 'vitest'
import {createActionsCoordinator, type ActionSource} from '../src/primitives/composer/composer-actions-core.js'

const WIDE_ROW_PX = 600
const NARROW_ROW_PX = 120

function source(overrides: Partial<ActionSource>): ActionSource {
  return {
    priority: () => 0,
    pinned: () => false,
    disabled: () => false,
    inlineContent: () => true,
    menuContent: () => [],
    ...overrides,
  }
}

function buttonSource(label: string, priority: number, overrides: Partial<ActionSource> = {}): ActionSource {
  return source({
    priority: () => priority,
    menuContent: () => [{key: label, label: () => label, icon: () => null, onSelect: () => undefined}],
    ...overrides,
  })
}

it('keeps every registered action inline when the row is wide', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({})
    coordinator.setRowWidth(WIDE_ROW_PX)
    const first = coordinator.register(buttonSource('first', 30))
    const second = coordinator.register(buttonSource('second', 20))

    expect(coordinator.isInline(first)).toBe(true)
    expect(coordinator.isInline(second)).toBe(true)
    expect(coordinator.anyCollapsed()).toBe(false)
    dispose()
  })
})

it('drops an action out of the coordinator when its owner disposes', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({maxInlineAuto: () => 0})
    coordinator.setRowWidth(WIDE_ROW_PX)
    coordinator.register(buttonSource('kept', 30))
    const disposeTransient = createRoot((disposeInner) => {
      coordinator.register(buttonSource('transient', 20))
      return disposeInner
    })

    expect(coordinator.menuActions().map((entry) => entry.priority())).toEqual([30, 20])

    disposeTransient()

    expect(coordinator.menuActions().map((entry) => entry.priority())).toEqual([30])
    dispose()
  })
})

it('orders overflow actions by priority regardless of registration order', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({maxInlineAuto: () => 0})
    coordinator.setRowWidth(WIDE_ROW_PX)
    coordinator.register(buttonSource('low', 5))
    coordinator.register(buttonSource('high', 50))
    coordinator.register(buttonSource('middle', 20))

    const labels = coordinator.menuActions().flatMap((entry) => entry.menuContent().map((item) => item.key))

    expect(labels).toEqual(['high', 'middle', 'low'])
    dispose()
  })
})

it('keeps pinned actions inline while every auto action collapses', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({})
    coordinator.setRowWidth(NARROW_ROW_PX)
    const pinned = coordinator.register(buttonSource('pinned', 40, {pinned: () => true}))
    const auto = coordinator.register(buttonSource('auto', 30))

    expect(coordinator.isInline(pinned)).toBe(true)
    expect(coordinator.isInline(auto)).toBe(false)
    expect(coordinator.anyCollapsed()).toBe(true)
    dispose()
  })
})

it('caps how many auto actions stay inline even when the row has room', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({maxInlineAuto: () => 1})
    coordinator.setRowWidth(WIDE_ROW_PX)
    const first = coordinator.register(buttonSource('first', 30))
    const second = coordinator.register(buttonSource('second', 20))

    expect(coordinator.isInline(first)).toBe(true)
    expect(coordinator.isInline(second)).toBe(false)
    dispose()
  })
})

it('charges the leading and trailing regions against the fit budget', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({})
    coordinator.setRowWidth(220)
    const first = coordinator.register(buttonSource('first', 30))
    const second = coordinator.register(buttonSource('second', 20))
    expect(coordinator.isInline(second)).toBe(true)

    coordinator.setLeadingWidth(60)
    coordinator.setTrailingWidth(60)

    expect(coordinator.isInline(first)).toBe(true)
    expect(coordinator.isInline(second)).toBe(false)
    dispose()
  })
})

it('never lists an action without menu content in the overflow menu', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({maxInlineAuto: () => 0})
    coordinator.setRowWidth(WIDE_ROW_PX)
    const inlineOnly = coordinator.register(source({priority: () => 10}))

    expect(coordinator.isInline(inlineOnly)).toBe(false)
    expect(coordinator.menuActions()).toEqual([])
    expect(coordinator.anyCollapsed()).toBe(false)
    dispose()
  })
})

it('keeps an action with no inline rendering out of the fit and always in the menu', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({})
    coordinator.setRowWidth(WIDE_ROW_PX)
    const button = coordinator.register(buttonSource('button', 30))
    const menuOnly = coordinator.register(
      source({
        priority: () => 10,
        inlineContent: () => false,
        menuContent: () => [{key: 'only', label: () => 'only', icon: () => null, onSelect: () => undefined}],
      }),
    )

    expect(coordinator.isInline(button)).toBe(true)
    expect(coordinator.isInline(menuOnly)).toBe(false)
    expect(coordinator.menuActions().map((entry) => entry.key)).toEqual([menuOnly])
    dispose()
  })
})
