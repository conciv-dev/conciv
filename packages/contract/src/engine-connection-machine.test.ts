import {describe, expect, it} from 'vitest'
import {
  createConnectionState,
  defaultEngineConnectionTimings,
  reconnectDelay,
  REVOKED_SOCKET_CLOSE_CODE,
  transitionConnection,
  type ConnectionEvent,
} from './engine-connection-machine.js'

describe('the connection machine', () => {
  const timings = {
    ...defaultEngineConnectionTimings,
    reconnectMinDelayMs: 100,
    reconnectMaxDelayMs: 300,
    reconnectDelayGrowth: 2,
  }

  it('a page with no login is untrusted, a login trusts it, and a refused login revokes it', () => {
    const start = createConnectionState(undefined)
    expect(start).toMatchObject({trust: 'checking', socket: 'closed'})

    const untrusted = transitionConnection(start, {type: 'trust-refused', token: ''})
    expect(untrusted.effects).toEqual([
      {type: 'forget-token', token: ''},
      {type: 'publish', signal: {type: 'status', status: 'untrusted', previous: 'checking'}},
    ])

    const trusted = transitionConnection(untrusted.state, {type: 'trusted', token: 'token-a'})
    expect(trusted.effects).toEqual([
      {type: 'store-token', token: 'token-a'},
      {type: 'publish', signal: {type: 'status', status: 'trusted', previous: 'untrusted'}},
    ])

    const lateRefusal = transitionConnection(trusted.state, {type: 'unauthorized', token: 'token-old'})
    expect(lateRefusal).toEqual({state: trusted.state, effects: []})

    const revoked = transitionConnection(trusted.state, {type: 'unauthorized', token: 'token-a'})
    expect(revoked.effects).toEqual([
      {type: 'forget-token', token: 'token-a'},
      {type: 'publish', signal: {type: 'status', status: 'revoked', previous: 'trusted'}},
    ])
    expect(revoked.state).toMatchObject({trust: 'revoked', token: undefined})
  })

  it.each([
    [0, 0],
    [1, 100],
    [2, 200],
    [3, 300],
    [8, 300],
  ])('after %i failed tries the next try waits %i ms', (retries, delayMs) => {
    expect(reconnectDelay(retries, timings)).toBe(delayMs)
  })

  it('a socket that keeps closing waits longer each time and starts over once it stayed open', () => {
    const called = transitionConnection(createConnectionState('token-a', timings), {type: 'call-started'})
    expect(called.effects).toEqual([{type: 'schedule-retry', attempt: 1, delayMs: 0}])

    const connecting = transitionConnection(called.state, {type: 'retry-due', attempt: 1})
    expect(connecting.effects).toEqual([{type: 'open-socket', attempt: 1}])

    const firstClose = transitionConnection(connecting.state, {type: 'socket-closed', attempt: 1, code: 1006})
    expect(firstClose.effects).toEqual([
      {type: 'schedule-retry', attempt: 2, delayMs: 100},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])

    const secondConnecting = transitionConnection(firstClose.state, {type: 'retry-due', attempt: 2})
    const secondClose = transitionConnection(secondConnecting.state, {type: 'socket-closed', attempt: 2, code: 1006})
    expect(secondClose.effects).toEqual([
      {type: 'schedule-retry', attempt: 3, delayMs: 200},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])

    const thirdConnecting = transitionConnection(secondClose.state, {type: 'retry-due', attempt: 3})
    const opened = transitionConnection(thirdConnecting.state, {type: 'socket-opened', attempt: 3})
    expect(opened.effects).toEqual([
      {type: 'send-trust-frame', token: 'token-a'},
      {type: 'schedule-uptime', attempt: 3},
      {type: 'publish', signal: {type: 'reachable', reachable: true}},
    ])

    const stayedOpen = transitionConnection(opened.state, {type: 'uptime-reached', attempt: 3})
    expect(stayedOpen.effects).toEqual([])

    const closedAfterUptime = transitionConnection(stayedOpen.state, {type: 'socket-closed', attempt: 3, code: 1006})
    expect(closedAfterUptime.effects).toEqual([
      {type: 'schedule-retry', attempt: 4, delayMs: 100},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])
  })

  it('Retry from unreachable starts the wait over, drops an attempt that hangs and checks trust again', () => {
    const failing: ConnectionEvent[] = [
      {type: 'call-started'},
      {type: 'retry-due', attempt: 1},
      {type: 'socket-opened', attempt: 1},
      {type: 'trust-unanswered'},
      {type: 'socket-closed', attempt: 1, code: 1006},
      {type: 'retry-due', attempt: 2},
      {type: 'socket-closed', attempt: 2, code: 1006},
    ]
    const waiting = failing.reduce(
      (state, event) => transitionConnection(state, event).state,
      createConnectionState(undefined, timings),
    )
    expect(waiting).toMatchObject({trust: 'unreachable', socket: 'waiting', attempt: 3})

    const retried = transitionConnection(waiting, {type: 'reset-requested'})
    expect(retried.effects).toEqual([])

    const connecting = transitionConnection(retried.state, {type: 'retry-due', attempt: 3})
    const closed = transitionConnection(connecting.state, {type: 'socket-closed', attempt: 3, code: 1006})
    expect(closed.effects).toEqual([
      {type: 'schedule-retry', attempt: 4, delayMs: 0},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])

    const hanging = transitionConnection(closed.state, {type: 'retry-due', attempt: 4})
    const retriedWhileHanging = transitionConnection(hanging.state, {type: 'reset-requested'})
    expect(retriedWhileHanging.effects).toEqual([
      {type: 'close-socket'},
      {type: 'schedule-retry', attempt: 5, delayMs: 0},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])

    const reconnecting = transitionConnection(retriedWhileHanging.state, {type: 'retry-due', attempt: 5})
    const reopened = transitionConnection(reconnecting.state, {type: 'socket-opened', attempt: 5})
    expect(reopened.effects).toEqual([
      {type: 'send-trust-frame', token: ''},
      {type: 'schedule-uptime', attempt: 5},
      {type: 'publish', signal: {type: 'reachable', reachable: true}},
      {type: 'ask-trust'},
    ])
  })

  it('a socket closed for a revoked login is not opened again and the page is revoked', () => {
    const toTrusted: ConnectionEvent[] = [
      {type: 'call-started'},
      {type: 'retry-due', attempt: 1},
      {type: 'socket-opened', attempt: 1},
      {type: 'trusted', token: 'token-a'},
    ]
    const trusted = toTrusted.reduce(
      (state, event) => transitionConnection(state, event).state,
      createConnectionState(undefined, timings),
    )

    const closed = transitionConnection(trusted, {type: 'socket-closed', attempt: 1, code: REVOKED_SOCKET_CLOSE_CODE})
    expect(closed.effects).toEqual([
      {type: 'forget-token', token: 'token-a'},
      {type: 'publish', signal: {type: 'status', status: 'revoked', previous: 'trusted'}},
      {type: 'close-peer'},
    ])
    expect(closed.state).toMatchObject({socket: 'closed', trust: 'revoked', token: undefined})
  })

  it("a stalled socket is closed and opened again and the old socket's events are ignored", () => {
    const toOpen: ConnectionEvent[] = [
      {type: 'call-started'},
      {type: 'retry-due', attempt: 1},
      {type: 'socket-opened', attempt: 1},
    ]
    const open = toOpen.reduce(
      (state, event) => transitionConnection(state, event).state,
      createConnectionState('token-a', timings),
    )

    const stalled = transitionConnection(open, {type: 'stalled'})
    expect(stalled.effects).toEqual([
      {type: 'close-socket'},
      {type: 'schedule-retry', attempt: 2, delayMs: 0},
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ])
    expect(transitionConnection(stalled.state, {type: 'stalled'})).toEqual({state: stalled.state, effects: []})

    expect(transitionConnection(stalled.state, {type: 'socket-opened', attempt: 1})).toEqual({
      state: stalled.state,
      effects: [],
    })
    expect(transitionConnection(stalled.state, {type: 'socket-closed', attempt: 1, code: 1006})).toEqual({
      state: stalled.state,
      effects: [],
    })
    expect(transitionConnection(stalled.state, {type: 'retry-due', attempt: 1})).toEqual({
      state: stalled.state,
      effects: [],
    })
    expect(transitionConnection(stalled.state, {type: 'uptime-reached', attempt: 1})).toEqual({
      state: stalled.state,
      effects: [],
    })

    expect(transitionConnection(stalled.state, {type: 'retry-due', attempt: 2}).effects).toEqual([
      {type: 'open-socket', attempt: 2},
    ])
  })

  it('a trust check with no answer turns unreachable and the next open asks again', () => {
    const toOpen: ConnectionEvent[] = [
      {type: 'call-started'},
      {type: 'retry-due', attempt: 1},
      {type: 'socket-opened', attempt: 1},
    ]
    const open = toOpen.reduce(
      (state, event) => transitionConnection(state, event).state,
      createConnectionState(undefined, timings),
    )

    const unanswered = transitionConnection(open, {type: 'trust-unanswered'})
    expect(unanswered.effects).toEqual([
      {type: 'publish', signal: {type: 'status', status: 'unreachable', previous: 'checking'}},
    ])

    const closed = transitionConnection(unanswered.state, {type: 'socket-closed', attempt: 1, code: 1006})
    const connecting = transitionConnection(closed.state, {type: 'retry-due', attempt: 2})
    const reopened = transitionConnection(connecting.state, {type: 'socket-opened', attempt: 2})
    expect(reopened.effects).toEqual([
      {type: 'send-trust-frame', token: ''},
      {type: 'schedule-uptime', attempt: 2},
      {type: 'publish', signal: {type: 'reachable', reachable: true}},
      {type: 'ask-trust'},
    ])

    const trusted = transitionConnection(reopened.state, {type: 'trusted', token: 'token-a'})
    expect(trusted.effects).toEqual([
      {type: 'store-token', token: 'token-a'},
      {type: 'publish', signal: {type: 'status', status: 'trusted', previous: 'unreachable'}},
    ])
    expect(transitionConnection(trusted.state, {type: 'trust-unanswered'})).toEqual({
      state: trusted.state,
      effects: [],
    })
  })
})
