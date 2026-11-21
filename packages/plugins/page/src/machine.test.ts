import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {
  createConnectionState,
  reconcilePagePermissions,
  selectAttachedSessions,
  selectTabs,
  selectTarget,
  transitionConnection,
  type ConnectionEvent,
} from './machine.js'

const sessionId = SessionId.parse('conciv_checkout')

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

const disconnected =
  '[page.disconnected] No page is open in this session. Ask the user to open the page with the conciv panel and wait for it to connect. Then call page.tabs.list({}). Repeating page actions while disconnected will not help.'

describe('a page that attaches is offered to the agent', () => {
  it('grants the page permissions, tells the page it is attached and serves calls on its tab', () => {
    const started = transitionConnection(createConnectionState(), {
      type: 'attach.started',
      sessionId,
      attempt: 1,
      connectionId: 'checkout',
    })
    expect(started.effects).toEqual([{type: 'sync-permissions', sessionId, attempt: 2, allow: true}])
    expect(selectTarget(started.state, sessionId, undefined)).toMatchObject({
      ok: false,
      error: {
        message:
          '[page.disconnected] The page is still connecting to this session; no action ran. Call page.tabs.list({}) once it finishes connecting.',
      },
    })
    expect(reconcilePagePermissions(undefined, true)).toEqual([
      {action: 'page', resource: '*', effect: 'allow'},
      {action: 'skill', resource: 'page', effect: 'allow'},
    ])

    const synced = transitionConnection(started.state, {type: 'permissions.synced', sessionId, attempt: 2})
    expect(synced.effects).toEqual([
      {type: 'emit-control', control: {type: 'attached', connectionId: 'checkout', version: 1}},
    ])

    const updated = transitionConnection(synced.state, {
      type: 'state.updated',
      sessionId,
      connectionId: 'checkout',
      tab: checkout,
    })
    expect(selectTabs(updated.state, sessionId)).toEqual({tabs: [checkout], focusedTabId: checkout.id})
    expect(selectAttachedSessions(updated.state)).toEqual([sessionId])
    expect(selectTarget(updated.state, sessionId, undefined)).toEqual({
      ok: true,
      connectionId: 'checkout',
      attempt: 1,
      tab: checkout,
    })
  })
})

describe('a permission sync that times out closes the page', () => {
  it('warns, closes the attachment as unavailable, takes the permissions back and refuses page calls', () => {
    const started = transitionConnection(createConnectionState(), {
      type: 'attach.started',
      sessionId,
      attempt: 1,
      connectionId: 'checkout',
    })

    const timedOut = transitionConnection(started.state, {type: 'permissions.timed-out', sessionId, attempt: 2})
    expect(timedOut.effects).toEqual([
      {type: 'warn', message: 'Page permission grant timed out', error: undefined},
      {type: 'close-attachment', attempt: 1, outcome: 'unavailable'},
      {type: 'sync-permissions', sessionId, attempt: 3, allow: false},
    ])
    expect(reconcilePagePermissions(reconcilePagePermissions(undefined, true), false)).toEqual([])
    expect(selectTarget(timedOut.state, sessionId, undefined)).toMatchObject({
      ok: false,
      error: {message: disconnected},
    })
    expect(selectTabs(timedOut.state, sessionId)).toEqual({tabs: [], focusedTabId: null})
  })
})

describe('with several tabs open, a call goes to the tab the user focused last', () => {
  it('serves the focused tab, a named tab, refuses an unknown tab and falls back when the focused tab closes', () => {
    const steps: ConnectionEvent[] = [
      {type: 'attach.started', sessionId, attempt: 1, connectionId: 'checkout'},
      {type: 'permissions.synced', sessionId, attempt: 2},
      {type: 'attach.started', sessionId, attempt: 3, connectionId: 'cart'},
      {type: 'state.updated', sessionId, connectionId: 'checkout', tab: checkout},
      {type: 'state.updated', sessionId, connectionId: 'cart', tab: cart},
    ]
    const opened = steps.reduce((state, event) => transitionConnection(state, event).state, createConnectionState())

    expect(selectTabs(opened, sessionId)).toEqual({tabs: [checkout, cart], focusedTabId: checkout.id})
    expect(selectTarget(opened, sessionId, undefined)).toMatchObject({ok: true, connectionId: 'checkout'})
    expect(selectTarget(opened, sessionId, cart.id)).toMatchObject({ok: true, connectionId: 'cart', tab: cart})
    expect(selectTarget(opened, sessionId, 'tab_33333333-3333-4333-8333-333333333333')).toMatchObject({
      ok: false,
      error: {
        message:
          '[page.tab_unavailable] This tab is closed or does not belong to this session. Call page.tabs.list({}) and use an exact returned tabId, or omit tabId for the tab the user focused last. Never substitute an element ref for tabId.',
      },
    })

    const closed = transitionConnection(opened, {type: 'attach.closed', sessionId, attempt: 1})
    expect(closed.effects).toEqual([{type: 'close-attachment', attempt: 1, outcome: 'closed'}])
    expect(selectTabs(closed.state, sessionId)).toEqual({tabs: [cart], focusedTabId: null})
    expect(selectTarget(closed.state, sessionId, undefined)).toMatchObject({ok: true, connectionId: 'cart', tab: cart})
  })
})

describe('deleting the session lets go of its page', () => {
  it('closes every tab and refuses page calls afterwards', () => {
    const steps: ConnectionEvent[] = [
      {type: 'attach.started', sessionId, attempt: 1, connectionId: 'checkout'},
      {type: 'permissions.synced', sessionId, attempt: 2},
      {type: 'state.updated', sessionId, connectionId: 'checkout', tab: checkout},
    ]
    const opened = steps.reduce((state, event) => transitionConnection(state, event).state, createConnectionState())

    const deleted = transitionConnection(opened, {type: 'session.deleted', sessionId})
    expect(deleted.effects).toEqual([{type: 'close-attachment', attempt: 1, outcome: 'closed'}])
    expect(selectAttachedSessions(deleted.state)).toEqual([])
    expect(selectTarget(deleted.state, sessionId, undefined)).toMatchObject({ok: false, error: {message: disconnected}})
  })
})

describe('closing the page of a session that is being deleted', () => {
  it('takes the permissions back and stays quiet when the session is already gone', () => {
    const steps: ConnectionEvent[] = [
      {type: 'attach.started', sessionId, attempt: 1, connectionId: 'checkout'},
      {type: 'permissions.synced', sessionId, attempt: 2},
    ]
    const opened = steps.reduce((state, event) => transitionConnection(state, event).state, createConnectionState())

    const closed = transitionConnection(opened, {type: 'attach.closed', sessionId, attempt: 1})
    expect(closed.effects).toEqual([
      {type: 'close-attachment', attempt: 1, outcome: 'closed'},
      {type: 'sync-permissions', sessionId, attempt: 3, allow: false},
    ])

    const deleted = transitionConnection(closed.state, {type: 'session.deleted', sessionId})
    expect(deleted.effects).toEqual([])

    const failed = transitionConnection(deleted.state, {
      type: 'permissions.failed',
      sessionId,
      attempt: 3,
      error: {_tag: 'Session.NotFoundError', sessionId},
    })
    expect(failed.effects).toEqual([])
    expect(selectAttachedSessions(failed.state)).toEqual([])
  })
})
