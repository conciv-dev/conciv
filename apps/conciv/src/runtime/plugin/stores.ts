import {
  batch,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  getOwner,
  on,
  onCleanup,
  untrack,
  type Accessor,
  type Owner,
} from 'solid-js'
import {produce, reconcile, type SetStoreFunction} from 'solid-js/store'
import type {Mutable, Persisted, SessionRef, StoreFrom} from '@conciv/plugin/experimental'
import {Persist, type CopyFrom} from '../persistence/storage'
import {
  createSessionStoreState,
  selectSessionStoreEntry,
  transitionSessionStore,
  type SessionStoreEvent,
} from './session-store-machine'
import {
  createDeferredStoreState,
  createStoreLoadState,
  selectStoreReady,
  transitionDeferredStore,
  transitionStoreLoad,
  type DeferredStoreEvent,
  type StoreLoadEvent,
  type StoreWrite,
} from './store-machine'

const loads = new WeakMap<object, Promise<void>>()

export function storeName(plugin: string, key: string) {
  return `plugin.${plugin}.${key}`
}

export function globalStoreTarget(
  plugin: string,
  key: string,
  from: StoreFrom | readonly StoreFrom[] | undefined,
  scope: 'global' | 'project',
) {
  return {
    ...Persist[scope](storeName(plugin, key)),
    copyFrom: storeImports(from),
  }
}

export function storeImports(from: StoreFrom | readonly StoreFrom[] | undefined): CopyFrom[] {
  return [from ?? []].flat().map((item) => copySpec(item))
}

function copySpec(from: StoreFrom): CopyFrom {
  return typeof from === 'string' ? {key: from} : from
}

export function persistedHandle<T extends object>(input: {
  readonly store: T
  readonly set: SetStoreFunction<T>
  readonly init: Promise<unknown> | undefined
}) {
  const [loadState, setLoadState] = createSignal(createStoreLoadState<T>(input.init !== undefined))
  const settled = input.init && Promise.withResolvers<void>()

  void settled?.promise.catch(() => undefined)

  const apply = (write: StoreWrite<T>) => {
    if (write.kind === 'set') return input.set(reconcile(write.value))
    input.set(
      produce((draft) => {
        const returned = write.mutate(draft as Mutable<T>)

        if (returned !== undefined)
          throw new Error('Persisted.update must not return a value. Use set(next) to replace the value.')
      }),
    )
  }

  const dispatch = (event: StoreLoadEvent<T>) => {
    const next = transitionStoreLoad(untrack(loadState), event)

    setLoadState(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === 'reject') {
        if (effect.log) console.error('[plugin storage] Load failed', effect.cause)

        return settled?.reject(effect.cause)
      }

      if (!effect.hydrated) return effect.writes.forEach(apply)

      const applied = effect.writes.map((write) => Promise.try(() => apply(write)))
      applied.forEach(
        (write) => void write.catch((cause: unknown) => console.error('[plugin storage] Queued write failed', cause)),
      )
      void Promise.all(applied).then(
        () => settled?.resolve(),
        (cause: unknown) => settled?.reject(cause),
      )
    })
  }

  void input.init?.then(
    () => batch(() => dispatch({type: 'loaded'})),
    (cause: unknown) => dispatch({type: 'failed', cause}),
  )

  if (getOwner()) onCleanup(() => dispatch({type: 'disposed'}))

  const handle: Persisted<T> = {
    get value() {
      return selectStoreReady(loadState()) ? input.store : undefined
    },
    ready: () => selectStoreReady(loadState()),
    update: (mutate) => dispatch({type: 'write', write: {kind: 'update', mutate}}),
    set: (next) => dispatch({type: 'write', write: {kind: 'set', value: next}}),
  }

  if (settled) loads.set(handle, settled.promise)

  return handle
}

export function whenLoaded<T>(handle: Persisted<T>) {
  return loads.get(handle) ?? Promise.resolve()
}

export function deferredHandle<T>(store: Accessor<Persisted<T> | undefined>): Persisted<T> {
  const machine = {state: createDeferredStoreState<Persisted<T>, T>()}

  const dispatch = (event: DeferredStoreEvent<Persisted<T>, T>) => {
    const next = transitionDeferredStore(machine.state, event)

    machine.state = next.state
    next.effects.forEach((effect) =>
      untrack(() => {
        if (effect.type === 'forward') return forward(effect.handle, effect.write)

        effect.writes.forEach(
          (write) =>
            void Promise.try(() => forward(effect.handle, write)).catch((cause: unknown) =>
              console.error('[plugin storage] Queued write failed', cause),
            ),
        )
      }),
    )
  }

  createRenderEffect(() => dispatch({type: 'sync', handle: store()}))

  if (getOwner()) onCleanup(() => dispatch({type: 'disposed'}))

  const write = (value: StoreWrite<T>) => {
    dispatch({type: 'sync', handle: untrack(store)})
    dispatch({type: 'write', write: value})
  }

  return {
    get value() {
      return store()?.value
    },
    ready: () => store()?.ready() ?? false,
    update: (mutate) => write({kind: 'update', mutate}),
    set: (next) => write({kind: 'set', value: next}),
  }
}

function forward<T>(handle: Persisted<T>, write: StoreWrite<T>) {
  if (write.kind === 'set') return handle.set(write.value)
  handle.update(write.mutate)
}

export function locatedHandle<T>(session: SessionRef, open: () => Persisted<T>) {
  const directory = createMemo(() => session.location?.directory)

  return deferredHandle(createMemo(on(directory, (value) => (value === undefined ? undefined : open()))))
}

export function createSessionStore<T extends object>(input: {
  readonly open: (session: SessionRef) => Persisted<T>
  readonly owner: Owner | null
  readonly sessions: {list(): readonly SessionRef[]; current(): SessionRef | undefined}
}) {
  type Opened = {readonly handle: Persisted<T>; readonly dispose: () => void}

  const machine = {state: createSessionStoreState<Opened>()}

  const dispatch = (event: SessionStoreEvent<Opened>) => {
    const next = transitionSessionStore(machine.state, event)

    machine.state = next.state
    next.effects.forEach((effect) => effect.value.dispose())
  }

  createRenderEffect(() => {
    const listed = new Set(input.sessions.list().map((session) => session.key))
    const routed = input.sessions.current()?.key

    untrack(() => dispatch({type: 'sync', listed, routed}))
  })

  const create = (session: SessionRef) => {
    const current = () => input.sessions.list().find((item) => item.key === session.key) ?? session

    const ref: SessionRef = {
      key: session.key,
      id: session.id,
      get tab() {
        return current().tab
      },
      get server() {
        return current().server
      },
      get pending() {
        return current().pending
      },
      get location() {
        return current().location
      },
    }

    return createRoot((dispose) => ({handle: locatedHandle(ref, () => input.open(ref)), dispose}), input.owner)
  }

  return {
    get(session: SessionRef): Persisted<T> {
      const existing = selectSessionStoreEntry(machine.state, session.key)

      if (existing) return existing.handle

      if (machine.state.status === 'disposed')
        return {value: undefined, ready: () => false, update: () => undefined, set: () => undefined}
      const created = create(session)

      dispatch({
        type: 'opened',
        key: session.key,
        value: created,
        listed: untrack(input.sessions.list).some((item) => item.key === session.key),
        routed: untrack(input.sessions.current)?.key,
      })

      return created.handle
    },
    dispose: () => dispatch({type: 'disposed'}),
  }
}
