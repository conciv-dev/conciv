import {describe, expect, test} from 'vitest'
import {
  canWriteBackHydration,
  createPersistStoreState,
  isPersistReady,
  needsPersistFlush,
  transitionPersistStore,
  type PersistStoreEffect,
  type PersistStoreEvent,
  type PersistStoreState,
} from './persist-machine'
import {
  canEvict,
  INITIAL_LOCAL_STORAGE_STATE,
  isStorageNoticePending,
  transitionLocalStorage,
  type LocalStorageEvent,
} from './storage-machine'

const zero = JSON.stringify({count: 0})

const stored = JSON.stringify({count: 5})

const remote = JSON.stringify({count: 9})

const edited = JSON.stringify({count: 3})

function replay(state: PersistStoreState, events: PersistStoreEvent[]) {
  return events.reduce<{state: PersistStoreState; effects: PersistStoreEffect[]}>(
    (result, event) => {
      const next = transitionPersistStore(result.state, event)

      return {state: next.state, effects: [...result.effects, ...next.effects]}
    },
    {state, effects: []},
  )
}

const loading = () => createPersistStoreState({async: true}).state

describe('persist store machine', () => {
  test('starts hydrating for an async load and clean, hydrated, for a sync one', () => {
    expect(loading()).toEqual({status: 'hydrating', edit: undefined})
    expect(isPersistReady(loading())).toBe(false)
    expect(createPersistStoreState({raw: stored})).toEqual({
      state: {status: 'clean', last: stored},
      effects: [{type: 'hydrate', raw: stored}],
    })
    expect(createPersistStoreState({raw: null})).toEqual({state: {status: 'clean', last: undefined}, effects: []})
  })

  test('a value another window writes during the load wins over the older load', () => {
    const received = transitionPersistStore(loading(), {type: 'remote.received', raw: remote})
    expect(received).toEqual({state: {status: 'clean', last: remote}, effects: [{type: 'hydrate', raw: remote}]})
    expect(isPersistReady(received.state)).toBe(true)

    const late = transitionPersistStore(received.state, {type: 'init.resolved', raw: stored})
    expect(late.state).toBe(received.state)
    expect(late.effects).toEqual([])
  })

  test('a no-op edit during the load adopts the stored value instead of overwriting it', () => {
    const result = replay(loading(), [
      {type: 'edited', baseline: zero},
      {type: 'init.resolved', raw: stored},
      {type: 'flushed', serialized: zero},
    ])

    expect(result.state).toEqual({status: 'clean', last: stored})
    expect(result.effects).toEqual([{type: 'schedule-save'}, {type: 'hydrate', raw: stored}])
  })

  test('a no-op edit during the load adopts a newer remote value over the stored one', () => {
    const result = replay(loading(), [
      {type: 'edited', baseline: zero},
      {type: 'remote.received', raw: remote},
      {type: 'init.resolved', raw: stored},
      {type: 'flushed', serialized: zero},
    ])

    expect(result.state).toEqual({status: 'clean', last: remote})
    expect(result.effects).toEqual([{type: 'schedule-save'}, {type: 'hydrate', raw: remote}])
  })

  test('a no-op edit flushed before the load keeps waiting for it', () => {
    const result = replay(loading(), [
      {type: 'edited', baseline: zero},
      {type: 'flushed', serialized: zero},
      {type: 'init.resolved', raw: stored},
    ])

    expect(result.state).toEqual({status: 'clean', last: stored})
    expect(result.effects).toEqual([{type: 'schedule-save'}, {type: 'hydrate', raw: stored}])
  })

  test('a real edit saved before the load ends hydration, so the late load and its write-back are dropped', () => {
    const saved = replay(loading(), [
      {type: 'edited', baseline: zero},
      {type: 'flushed', serialized: edited},
    ])

    expect(saved.state).toEqual({
      status: 'clean',
      last: edited,
      writing: {type: 'save', serialized: edited, fallback: undefined},
    })
    expect(saved.effects).toEqual([{type: 'schedule-save'}, {type: 'save', serialized: edited, fallback: undefined}])

    expect(canWriteBackHydration(saved.state)).toBe(false)

    const late = transitionPersistStore(saved.state, {type: 'init.resolved', raw: stored})
    expect(late.state).toBe(saved.state)
  })

  test('a real edit made during the load wins over the stored and remote values', () => {
    const result = replay(loading(), [
      {type: 'edited', baseline: zero},
      {type: 'remote.received', raw: remote},
      {type: 'init.resolved', raw: stored},
      {type: 'flushed', serialized: edited},
    ])

    expect(result.state).toEqual({
      status: 'clean',
      last: edited,
      writing: {type: 'save', serialized: edited, fallback: stored},
    })
    expect(result.effects.at(-1)).toEqual({type: 'save', serialized: edited, fallback: stored})
  })

  test('a failed write rolls `last` back so the same value is written again', () => {
    const saved = replay({status: 'clean', last: stored, writing: undefined}, [
      {type: 'edited', baseline: undefined},
      {type: 'flushed', serialized: edited},
    ])

    expect(saved.effects.at(-1)).toEqual({type: 'save', serialized: edited, fallback: stored})

    const save = saved.state.status === 'clean' ? saved.state.writing : undefined
    if (!save) throw new Error('the flush started no write')
    const failed = transitionPersistStore(saved.state, {type: 'write.failed', save})
    expect(failed.state).toEqual({status: 'clean', last: stored, writing: undefined})

    const retried = replay(failed.state, [
      {type: 'edited', baseline: undefined},
      {type: 'flushed', serialized: edited},
    ])

    expect(retried.effects.at(-1)).toEqual({type: 'save', serialized: edited, fallback: stored})
  })

  test('a failed write that a newer value superseded is ignored', () => {
    const state: PersistStoreState = {status: 'clean', last: remote, writing: undefined}
    const result = transitionPersistStore(state, {
      type: 'write.failed',
      save: {type: 'save', serialized: edited, fallback: stored},
    })
    expect(result.state).toBe(state)
  })

  test('a failed load settles readiness with or without an edit', () => {
    const failed = transitionPersistStore(loading(), {type: 'init.failed'})
    expect(failed.state).toEqual({status: 'clean', last: undefined})
    expect(isPersistReady(failed.state)).toBe(true)

    const edit = replay(loading(), [{type: 'edited', baseline: zero}, {type: 'init.failed'}])
    expect(edit.state).toEqual({status: 'dirty', last: undefined, remote: undefined, baseline: zero})
    expect(needsPersistFlush(edit.state)).toBe(true)
  })

  test('disposal saves a real edit once, never hydrates, and ignores every later event', () => {
    const dirty: PersistStoreState = {
      status: 'dirty',
      last: stored,
      remote: undefined,
      baseline: undefined,
      writing: undefined,
    }
    const disposed = transitionPersistStore(dirty, {type: 'disposed', serialized: edited})
    expect(disposed).toEqual({
      state: {status: 'disposed'},
      effects: [{type: 'save', serialized: edited, fallback: stored}],
    })

    const held: PersistStoreState = {status: 'dirty', last: stored, remote, baseline: undefined, writing: undefined}
    expect(transitionPersistStore(held, {type: 'disposed', serialized: stored}).effects).toEqual([])

    const events: PersistStoreEvent[] = [
      {type: 'init.resolved', raw: stored},
      {type: 'remote.received', raw: remote},
      {type: 'edited', baseline: undefined},
      {type: 'flushed', serialized: edited},
    ]

    events.forEach((event) => expect(transitionPersistStore(disposed.state, event).state).toBe(disposed.state))
  })

  test('events that do not apply return the same state', () => {
    const clean: PersistStoreState = {status: 'clean', last: stored, writing: undefined}
    expect(transitionPersistStore(clean, {type: 'remote.received', raw: stored}).state).toBe(clean)
    expect(transitionPersistStore(clean, {type: 'flushed', serialized: edited}).state).toBe(clean)

    const dirty: PersistStoreState = {status: 'dirty', last: stored, remote, baseline: undefined, writing: undefined}
    expect(transitionPersistStore(dirty, {type: 'edited', baseline: undefined}).state).toBe(dirty)
    expect(transitionPersistStore(dirty, {type: 'remote.received', raw: remote}).state).toBe(dirty)
    expect(transitionPersistStore(loading(), {type: 'flushed', serialized: edited}).effects).toEqual([])
  })
})

const replayStorage = (events: readonly LocalStorageEvent[]) =>
  events.reduce(transitionLocalStorage, INITIAL_LOCAL_STORAGE_STATE)

const evictionFailed: LocalStorageEvent = {type: 'eviction.failed', now: 0}

describe('localStorage machine', () => {
  test('a failed eviction waits out a cooldown instead of disabling storage', () => {
    const state = replayStorage([{type: 'eviction.failed', now: 1_000}])
    expect(state.eviction).toEqual({status: 'cooldown', failures: 1, retryAt: 6_000})
    expect(canEvict(state, 5_999)).toBe(false)
    expect(canEvict(state, 6_000)).toBe(true)
  })

  test('the cooldown doubles with each failed eviction up to a minute, and a success resets it', () => {
    const retries = [1, 2, 3, 4, 5, 6].map((count) => replayStorage(Array.from({length: count}, () => evictionFailed)))

    expect(retries.map((state) => (state.eviction.status === 'cooldown' ? state.eviction.retryAt : 0))).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ])

    const recovered = transitionLocalStorage(replayStorage(Array.from({length: 6}, () => evictionFailed)), {
      type: 'eviction.succeeded',
    })
    expect(recovered.eviction).toEqual({status: 'ready'})
    expect(canEvict(recovered, 0)).toBe(true)
    expect(transitionLocalStorage(recovered, evictionFailed).eviction).toEqual({
      status: 'cooldown',
      failures: 1,
      retryAt: 5_000,
    })
  })

  test('the first failed write asks for the notice once per page', () => {
    const failed = replayStorage([{type: 'write.failed'}])
    expect(isStorageNoticePending(failed)).toBe(true)
    expect(failed.eviction).toBe(INITIAL_LOCAL_STORAGE_STATE.eviction)

    const shown = transitionLocalStorage(failed, {type: 'notice.shown'})
    expect(isStorageNoticePending(shown)).toBe(false)
    expect(transitionLocalStorage(shown, {type: 'write.failed'})).toBe(shown)
    expect(isStorageNoticePending(transitionLocalStorage(shown, evictionFailed))).toBe(false)
  })

  test('events that change nothing return the same state', () => {
    expect(transitionLocalStorage(INITIAL_LOCAL_STORAGE_STATE, {type: 'eviction.succeeded'})).toBe(
      INITIAL_LOCAL_STORAGE_STATE,
    )
    expect(transitionLocalStorage(INITIAL_LOCAL_STORAGE_STATE, {type: 'notice.shown'})).toBe(
      INITIAL_LOCAL_STORAGE_STATE,
    )

    const pending = replayStorage([{type: 'write.failed'}])
    expect(transitionLocalStorage(pending, {type: 'write.failed'})).toBe(pending)
  })
})
