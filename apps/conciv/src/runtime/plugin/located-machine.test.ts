import {expect, test} from 'vitest'
import {
  createLocatedWritesState,
  LOCATED_WRITE_MAX_QUEUE,
  LOCATED_WRITE_TTL_MS,
  selectLocatedDraining,
  selectLocatedWaitingKeys,
  transitionLocatedWrites,
  type LocatedWritesEffect,
  type LocatedWritesEvent,
} from './located-machine'

function harness() {
  const log: string[] = []
  const timers: LocatedWritesEffect[] = []
  const machine = {state: createLocatedWritesState()}

  const dispatch = (event: LocatedWritesEvent) => {
    const next = transitionLocatedWrites(machine.state, event)

    machine.state = next.state
    next.effects.forEach((effect) => {
      if (effect.type === 'run') return effect.run()

      if (effect.type === 'drain') {
        while (selectLocatedDraining(machine.state, effect.key)) dispatch({type: 'drain.next', key: effect.key})

        return
      }

      timers.push(effect)
    })

    return next
  }

  const write = (key: string, located: boolean, name: string, then?: () => void) =>
    dispatch({
      type: 'write',
      key,
      located,
      run: () => {
        log.push(name)
        then?.()
      },
    })

  return {machine, log, timers, dispatch, write}
}

test('a located write runs after the writes held for its session before the watcher drains them', () => {
  const run = harness()

  run.write('s1', false, 'open')
  run.write('s1', true, 'close')

  expect(run.log).toEqual(['open', 'close'])
  expect(selectLocatedWaitingKeys(run.machine.state)).toEqual([])
})

test("a write made by a held write joins the end of its session's queue", () => {
  const run = harness()

  run.write('s1', false, 'A', () => run.write('s1', true, 'nested'))
  run.write('s1', false, 'B')
  run.write('s2', false, 'other')
  run.dispatch({type: 'drain.start', key: 's1'})

  expect(run.log).toEqual(['A', 'B', 'nested'])
  expect(selectLocatedWaitingKeys(run.machine.state)).toEqual(['s2'])
})

test('a held write expires after the TTL and never runs', () => {
  const run = harness()
  const id = run.machine.state.status === 'active' ? run.machine.state.nextId + 1 : 0

  run.write('s1', false, 'open')
  run.dispatch({type: 'expire', id})
  run.dispatch({type: 'drain.start', key: 's1'})

  expect(run.timers).toEqual([{type: 'schedule.expire', id, timeoutMs: LOCATED_WRITE_TTL_MS}])
  expect(run.log).toEqual([])
})

test("a full queue drops its oldest write and that write's timer", () => {
  const run = harness()

  Array.from({length: LOCATED_WRITE_MAX_QUEUE + 1}, (_, index) => run.write('s1', false, `w${index}`))
  run.dispatch({type: 'drain.start', key: 's1'})

  expect(run.log).toHaveLength(LOCATED_WRITE_MAX_QUEUE)
  expect(run.log[0]).toBe('w1')
  expect(run.timers).toContainEqual({type: 'cancel.expire', ids: [1]})
})

test("disposing cancels every held write's timer, and later writes never run", () => {
  const run = harness()

  run.write('s1', false, 'A')
  run.write('s2', false, 'B')
  run.dispatch({type: 'disposed'})
  const disposed = run.machine.state

  expect(run.write('s1', true, 'late').state).toBe(disposed)
  expect(run.timers.at(-1)).toEqual({type: 'cancel.expire', ids: [1, 2]})
  expect(run.log).toEqual([])
})

test('a located write with nothing held runs at once without a new state', () => {
  const run = harness()
  const before = run.machine.state
  const next = run.write('s1', true, 'now')

  expect(next.state).toBe(before)
  expect(run.log).toEqual(['now'])
})
