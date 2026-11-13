import type {AsyncStorage, PersistenceSyncAPI, SyncStorage} from '@solid-primitives/storage'
import {batch, createMemo, createSignal, getOwner, onCleanup, untrack} from 'solid-js'
import {reconcile, type SetStoreFunction, type Store} from 'solid-js/store'
import {
  createPersistStoreState,
  isPersistReady,
  needsPersistFlush,
  transitionPersistStore,
  type PersistStoreEffect,
  type PersistStoreEvent,
} from './persist-machine'

const persistSaveDelay = 100

const pending = new Set<() => void>()

const EDITED: PersistStoreEvent = Object.freeze({type: 'edited', baseline: undefined})

export function flushPersisted() {
  for (const save of [...pending]) save()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersisted()
  })
  window.addEventListener('pagehide', flushPersisted)
}

export function persistStore<T extends object>(input: {
  store: Store<T>
  setStore: SetStoreFunction<T>
  name: string
  storage: SyncStorage | AsyncStorage
  serialize: (value: T) => string
  deserialize: (raw: string) => T
  sync?: PersistenceSyncAPI
  delay?: number
  write?: (value: T, serialized: string) => Promise<void>
}) {
  const delay = input.delay ?? persistSaveDelay
  const init = input.storage.getItem(input.name)
  const initial = createPersistStoreState(init instanceof Promise ? {async: true} : {raw: init})
  const [persistState, setPersistState] = createSignal(initial.state)
  let timer: ReturnType<typeof setTimeout> | undefined

  const stopSave = () => {
    clearTimeout(timer)
    timer = undefined
    pending.delete(flush)
  }

  const dispatch = (event: PersistStoreEvent) => {
    const prev = untrack(persistState)
    const next = transitionPersistStore(prev, event)

    if (next.state === prev && next.effects.length === 0) return

    batch(() => {
      setPersistState(next.state)
      next.effects.forEach(run)
    })
  }

  const run = (effect: PersistStoreEffect) => {
    if (effect.type === 'hydrate') return input.setStore(reconcile(input.deserialize(effect.raw)))

    if (effect.type === 'schedule-save') {
      pending.add(flush)
      timer ??= setTimeout(flush, delay)

      return
    }

    input.sync?.[1](input.name, effect.serialized)
    const failed = () => dispatch({type: 'write.failed', attempted: effect.serialized, fallback: effect.fallback})

    const result: unknown = input.write
      ? input.write(input.store, effect.serialized)
      : input.storage.setItem(input.name, effect.serialized)

    if (result === false) return failed()

    if (result instanceof Promise) {
      result.catch((error) => {
        console.error(`[persistence] write failed for ${input.name}`, error)
        failed()
      })
    }
  }

  const flush = () => {
    stopSave()

    if (!needsPersistFlush(untrack(persistState))) return
    dispatch({type: 'flushed', serialized: untrack(() => input.serialize(input.store))})
  }

  const apply = input.setStore as unknown as (...values: unknown[]) => void

  const setStore = ((...values: unknown[]) => {
    const current = untrack(persistState)

    const baseline =
      current.status === 'hydrating' && !current.edit ? untrack(() => input.serialize(input.store)) : undefined

    apply(...values)

    dispatch(baseline === undefined ? EDITED : {type: 'edited', baseline})
  }) as unknown as SetStoreFunction<T>

  initial.effects.forEach(run)

  if (init instanceof Promise) {
    void init.then(
      (raw) => dispatch({type: 'init.resolved', raw}),
      () => dispatch({type: 'init.failed'}),
    )
  }

  input.sync?.[0]((data) => {
    if (data.key !== input.name || (data.url ?? location.href) !== location.href) return

    if (!data.newValue) return
    dispatch({type: 'remote.received', raw: data.newValue})
  })

  if (getOwner()) {
    onCleanup(() => {
      const serialized = needsPersistFlush(untrack(persistState))
        ? untrack(() => input.serialize(input.store))
        : undefined

      stopSave()
      dispatch({type: 'disposed', serialized})
    })
  }

  const ready = createMemo(() => isPersistReady(persistState()))

  return {setStore, init, flush, state: persistState, ready}
}
