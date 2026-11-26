import {describe, expect, it} from 'vitest'
import {reconcilePagePermissions, selectTarget} from '../../src/machine.js'

describe('a page that opens is offered to the agent', () => {
  it('grants the page permissions while a tab is open and takes them back when none is', () => {
    const disconnected =
      '[page.disconnected] No page is open in this session. Ask the user to open the page with the conciv panel and wait for it to connect. Then call page.tabs.list({}). Repeating page actions while disconnected will not help.'
    expect(reconcilePagePermissions(undefined, true)).toEqual([
      {action: 'page', resource: '*', effect: 'allow'},
      {action: 'skill', resource: 'page', effect: 'allow'},
    ])
    expect(reconcilePagePermissions(reconcilePagePermissions(undefined, true), true)).toBeUndefined()
    expect(reconcilePagePermissions(reconcilePagePermissions(undefined, true), false)).toEqual([])
    expect(selectTarget({tabs: [], focusedTabId: null}, undefined)).toMatchObject({
      ok: false,
      error: {message: disconnected},
    })
  })
})

describe('with several tabs open, a call goes to the tab the user focused last', () => {
  it('serves the focused tab, a named tab, refuses an unknown tab and falls back when the focused tab closes', () => {
    const checkout = {
      id: 'tab_11111111-1111-4111-8111-111111111111',
      url: 'http://localhost:3000/checkout',
      title: 'Checkout',
      focused: true,
      visible: true,
    }

    const cart = {
      id: 'tab_22222222-2222-4222-8222-222222222222',
      url: 'http://localhost:3000/cart',
      title: 'Cart',
      focused: false,
      visible: true,
    }
    const opened = {tabs: [checkout, cart], focusedTabId: checkout.id}

    expect(selectTarget(opened, undefined)).toEqual({ok: true, tab: checkout})
    expect(selectTarget(opened, cart.id)).toEqual({ok: true, tab: cart})
    expect(selectTarget(opened, 'tab_33333333-3333-4333-8333-333333333333')).toMatchObject({
      ok: false,
      error: {
        message:
          '[page.tab_unavailable] This tab is closed or does not belong to this session. Call page.tabs.list({}) and use an exact returned tabId, or omit tabId for the tab the user focused last. Never substitute an element ref for tabId.',
      },
    })
    expect(selectTarget({tabs: [cart], focusedTabId: null}, undefined)).toEqual({ok: true, tab: cart})
  })
})
