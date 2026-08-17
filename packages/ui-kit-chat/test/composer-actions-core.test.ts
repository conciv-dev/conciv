import {createRoot} from 'solid-js'
import {createStore} from 'solid-js/store'
import {expect, it} from 'vitest'
import {
  createActionsCoordinator,
  type ActionSource,
  type RegionWidths,
} from '../src/primitives/composer/composer-actions-core.js'

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

function menuEntry(label: string) {
  return {key: label, label: () => label, icon: () => null, onSelect: () => undefined}
}

function widthsOf(row: number): RegionWidths {
  const [widths] = createStore<RegionWidths>({row, leading: 0, trailing: 0})
  return widths
}

it('keeps every registered action inline when the row is wide', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX)})
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
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX), maxInlineAuto: () => 0})
    coordinator.register(buttonSource('kept', 30))
    const disposeTransient = createRoot((disposeInner) => {
      coordinator.register(buttonSource('transient', 20))
      return disposeInner
    })

    expect(coordinator.menuActions().map((action) => action.priority())).toEqual([30, 20])

    disposeTransient()

    expect(coordinator.menuActions().map((action) => action.priority())).toEqual([30])
    dispose()
  })
})

it('orders overflow actions by priority regardless of registration order', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX), maxInlineAuto: () => 0})
    coordinator.register(buttonSource('low', 5))
    coordinator.register(buttonSource('high', 50))
    coordinator.register(buttonSource('middle', 20))

    const labels = coordinator.menuActions().flatMap((action) => action.menuContent().map((item) => item.key))

    expect(labels).toEqual(['high', 'middle', 'low'])
    dispose()
  })
})

it('keeps pinned actions inline while every auto action collapses', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(NARROW_ROW_PX)})
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
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX), maxInlineAuto: () => 1})
    const first = coordinator.register(buttonSource('first', 30))
    const second = coordinator.register(buttonSource('second', 20))

    expect(coordinator.isInline(first)).toBe(true)
    expect(coordinator.isInline(second)).toBe(false)
    dispose()
  })
})

it('charges the leading and trailing regions against the fit budget', () => {
  createRoot((dispose) => {
    const [widths, setWidths] = createStore<RegionWidths>({row: 220, leading: 0, trailing: 0})
    const coordinator = createActionsCoordinator({widths})
    const first = coordinator.register(buttonSource('first', 30))
    const second = coordinator.register(buttonSource('second', 20))
    expect(coordinator.isInline(second)).toBe(true)

    setWidths({leading: 60, trailing: 60})

    expect(coordinator.isInline(first)).toBe(true)
    expect(coordinator.isInline(second)).toBe(false)
    dispose()
  })
})

it('never lists an action without menu content in the overflow menu', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX), maxInlineAuto: () => 0})
    const inlineOnly = coordinator.register(source({priority: () => 10}))

    expect(coordinator.isInline(inlineOnly)).toBe(false)
    expect(coordinator.menuActions()).toEqual([])
    expect(coordinator.anyCollapsed()).toBe(false)
    dispose()
  })
})

it('keeps an action with no inline rendering out of the fit and always in the menu', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX)})
    const button = coordinator.register(buttonSource('button', 30))
    const menuOnly = coordinator.register(
      source({
        priority: () => 10,
        inlineContent: () => false,
        menuContent: () => [menuEntry('only')],
      }),
    )

    expect(coordinator.isInline(button)).toBe(true)
    expect(coordinator.isInline(menuOnly)).toBe(false)
    expect(coordinator.menuActions().map((action) => action.key)).toEqual([menuOnly])
    dispose()
  })
})

it('carries a paired action on its own claims and keeps every claim scoped to that action', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(NARROW_ROW_PX)})
    coordinator.register(buttonSource('pinned', 40, {pinned: () => true}))
    const first = coordinator.registerPaired({priority: () => 30, pinned: () => false, disabled: () => false})
    const second = coordinator.registerPaired({priority: () => 20, pinned: () => false, disabled: () => false})
    first.registerMenuEntry(menuEntry('first one'))
    first.registerMenuEntry(menuEntry('first two'))
    second.registerMenuEntry(menuEntry('second one'))

    const menu = coordinator.menuActions().map((action) => action.menuContent().map((item) => item.key))

    expect(menu).toEqual([['first one', 'first two'], ['second one']])
    expect(first.isInline()).toBe(false)
    dispose()
  })
})

it('keeps a paired action out of the fit until one of its children claims inline rendering', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX), maxInlineAuto: () => 1})
    const claimed = coordinator.registerPaired({priority: () => 30, pinned: () => false, disabled: () => false})
    const unclaimed = coordinator.registerPaired({priority: () => 20, pinned: () => false, disabled: () => false})
    claimed.registerMenuEntry(menuEntry('claimed item'))
    unclaimed.registerMenuEntry(menuEntry('unclaimed item'))

    expect(claimed.isInline()).toBe(false)

    claimed.claimInline()

    expect(claimed.isInline()).toBe(true)
    expect(unclaimed.isInline()).toBe(false)
    dispose()
  })
})

it('keeps a paired action inline while any of its two inline claims is still live', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX)})
    const paired = coordinator.registerPaired({priority: () => 30, pinned: () => false, disabled: () => false})
    paired.registerMenuEntry(menuEntry('paired item'))

    const disposeFirstClaim = createRoot((disposeInner) => {
      paired.claimInline()
      return disposeInner
    })
    const disposeSecondClaim = createRoot((disposeInner) => {
      paired.claimInline()
      return disposeInner
    })

    expect(paired.isInline()).toBe(true)

    disposeFirstClaim()

    expect(paired.isInline()).toBe(true)
    expect(coordinator.menuActions()).toEqual([])

    disposeSecondClaim()

    expect(paired.isInline()).toBe(false)
    expect(coordinator.menuActions().map((action) => action.menuContent().map((item) => item.key))).toEqual([
      ['paired item'],
    ])
    dispose()
  })
})

it('lets the later slot registration override an earlier one for the same slot', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX)})
    coordinator.registerSlot({slot: 'trigger', render: () => 'first trigger'})
    const disposeSecond = createRoot((disposeInner) => {
      coordinator.registerSlot({slot: 'trigger', render: () => 'second trigger'})
      return disposeInner
    })

    expect(coordinator.slotRender('trigger')?.()).toBe('second trigger')

    disposeSecond()

    expect(coordinator.slotRender('trigger')?.()).toBe('first trigger')
    dispose()
  })
})

it('renders a registered slot through the coordinator and forgets it when its owner disposes', () => {
  createRoot((dispose) => {
    const coordinator = createActionsCoordinator({widths: widthsOf(WIDE_ROW_PX)})
    coordinator.registerSlot({slot: 'leading', render: () => 'leading content'})
    const disposeTrailing = createRoot((disposeInner) => {
      coordinator.registerSlot({slot: 'trailing', render: () => 'trailing content'})
      return disposeInner
    })

    expect(coordinator.slotRender('leading')?.()).toBe('leading content')
    expect(coordinator.slotRender('trailing')?.()).toBe('trailing content')
    expect(coordinator.slotRender('trigger')).toBeUndefined()

    disposeTrailing()

    expect(coordinator.slotRender('trailing')).toBeUndefined()
    dispose()
  })
})
