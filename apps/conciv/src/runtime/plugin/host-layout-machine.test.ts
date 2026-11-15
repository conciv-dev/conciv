import {expect, test} from 'vitest'
import {
  createMobileViewState,
  MOBILE_VIEW_PENDING_TTL_MS,
  selectMobileView,
  transitionMobileView,
  type MobileViewEvent,
  type MobileViewState,
} from './host-layout-machine'

const s = 'server\nses_a'

function fold<S, E, X>(transition: (state: S, event: E) => {state: S; effects: readonly X[]}, initial: S) {
  const machine = {state: initial}
  const effects: X[] = []

  const dispatch = (event: E) => {
    const next = transition(machine.state, event)

    machine.state = next.state
    effects.push(...next.effects)

    return next
  }

  return {machine, effects, dispatch}
}

const mobile = () => fold<MobileViewState, MobileViewEvent, unknown>(transitionMobileView, createMobileViewState())

test('a pending narrow-screen view expires, and a visit to another session drops it', () => {
  const expired = mobile()

  expired.dispatch({type: 'select', session: s, view: 'file:files', routed: undefined})
  expired.dispatch({type: 'expire', attempt: 1})
  expired.dispatch({type: 'route.changed', routed: s})
  expect(selectMobileView(expired.machine.state, s)).toBe('session')
  expect(expired.effects).toEqual([{type: 'schedule.expire', attempt: 1, timeoutMs: MOBILE_VIEW_PENDING_TTL_MS}])

  const elsewhere = mobile()

  elsewhere.dispatch({type: 'select', session: s, view: 'file:files', routed: undefined})
  elsewhere.dispatch({type: 'route.changed', routed: 'server\nses_b'})
  elsewhere.dispatch({type: 'route.changed', routed: s})
  expect(selectMobileView(elsewhere.machine.state, s)).toBe('session')
})

test('a pending view becomes the view of the visit that routes its session, until the next visit', () => {
  const run = mobile()

  run.dispatch({type: 'select', session: s, view: 'file:files', routed: undefined})
  run.dispatch({type: 'route.changed', routed: s})
  const active = run.machine.state

  expect(selectMobileView(active, s)).toBe('file:files')
  expect(run.dispatch({type: 'expire', attempt: 1}).state).toBe(active)
  run.dispatch({type: 'route.changed', routed: undefined})
  expect(selectMobileView(run.machine.state, s)).toBe('session')
  expect(run.effects).toEqual([
    {type: 'schedule.expire', attempt: 1, timeoutMs: MOBILE_VIEW_PENDING_TTL_MS},
    {type: 'cancel.expire'},
  ])
})

test("disposing cancels a pending view's timer", () => {
  const run = mobile()

  run.dispatch({type: 'select', session: s, view: 'file:files', routed: undefined})
  run.dispatch({type: 'disposed'})
  const disposed = run.machine.state

  expect(run.dispatch({type: 'route.changed', routed: s}).state).toBe(disposed)
  expect(run.effects.at(-1)).toEqual({type: 'cancel.expire'})
})
