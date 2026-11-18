import type {RpcClient, SettingsScope} from '@conciv/contract'
import type {AsyncStorage, SyncStorage} from '@solid-primitives/storage'
import type {StoreType} from '@conciv/plugin/experimental'
import type {StandardSchemaV1} from '@standard-schema/spec'
import {createSignal, getOwner, onCleanup, untrack, type Accessor} from 'solid-js'
import {createStore, type SetStoreFunction, type Store} from 'solid-js/store'
import {persistStore} from './persist'
import {canWriteBackHydration} from './persist-machine'
import {
  canEvict,
  INITIAL_LOCAL_STORAGE_STATE,
  isStorageNoticePending,
  transitionLocalStorage,
  type LocalStorageEvent,
} from './storage-machine'
import {assertStoreDefinition, assertStoreWrite, withInitial, type Encode} from './schema'
import {settingsStorage} from './settings-storage'

type InitType = Promise<string | null> | string | null

type PersistedWithReady<T> = [
  Store<T>,
  SetStoreFunction<T>,
  InitType,
  Accessor<boolean> & {promise: undefined | Promise<unknown>},
]

type BrowserTarget = {
  kind: 'browser'
  storage: string
  copyFrom?: readonly CopyFrom[]
  key: string
}

type EngineTarget = {
  kind: 'engine'
  scope: SettingsScope
  namespace: string
  copyFrom?: readonly CopyFrom[]
  key: string
}

type PersistTarget = BrowserTarget | EngineTarget

type PickPart = (value: unknown) => unknown

export type CopyFrom = {key: string; pick?: PickPart}

type LocalStorageView = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => boolean
  removeItem: (key: string) => void
}

type Normalize = (raw: string) => string | undefined

type Backing = {
  storage: SyncStorage | AsyncStorage
  save: (key: string, value: string) => Promise<void>
}

const PLUGIN_STORAGE = 'plugins'

const GLOBAL_STORAGE = 'conciv.global'

const PROJECT_STORAGE = 'conciv.project'

const LOCAL_PREFIXES = [`${GLOBAL_STORAGE}:`, `${PROJECT_STORAGE}.`]

const [localStorageState, setLocalStorageState] = createSignal(INITIAL_LOCAL_STORAGE_STATE)

function dispatchLocalStorage(event: LocalStorageEvent) {
  setLocalStorageState((state) => transitionLocalStorage(state, event))
}

export function localStorageNoticePending() {
  return isStorageNoticePending(localStorageState())
}

export function acknowledgeLocalStorageNotice() {
  dispatchLocalStorage({type: 'notice.shown'})
}

const CACHE_MAX_ENTRIES = 500

const CACHE_MAX_BYTES = 8 * 1024 * 1024

type CacheEntry = {value: string; bytes: number}

const cache = new Map<string, CacheEntry>()

const cacheTotal = {bytes: 0}

function cacheDelete(key: string) {
  const entry = cache.get(key)

  if (!entry) return
  cacheTotal.bytes -= entry.bytes
  cache.delete(key)
}

function cachePrune() {
  for (;;) {
    if (cache.size <= CACHE_MAX_ENTRIES && cacheTotal.bytes <= CACHE_MAX_BYTES) return
    const oldest = cache.keys().next()

    if (oldest.done) return
    cacheDelete(oldest.value)
  }
}

function cacheSet(key: string, value: string) {
  const bytes = value.length * 2

  if (bytes > CACHE_MAX_BYTES) {
    cacheDelete(key)

    return
  }

  const entry = cache.get(key)

  if (entry) cacheTotal.bytes -= entry.bytes
  cache.delete(key)
  cache.set(key, {value, bytes})
  cacheTotal.bytes += bytes
  cachePrune()
}

function cacheGet(key: string) {
  const entry = cache.get(key)

  if (!entry) return
  cache.delete(key)
  cache.set(key, entry)

  return entry.value
}

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED', 'QUOTA_EXCEEDED_ERR'])

function quota(error: unknown) {
  if (error instanceof DOMException) return QUOTA_NAMES.has(error.name) || error.code === 22 || error.code === 1014

  if (!(error instanceof Error)) return false

  return QUOTA_NAMES.has(error.name) || /quota/i.test(error.name) || /quota/i.test(error.message)
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
    cacheSet(key, value)

    return true
  } catch (error) {
    if (!quota(error) || !canEvict(untrack(localStorageState), Date.now())) {
      console.error(`[persistence] write failed for ${key}`, error)
      dispatchLocalStorage({type: 'write.failed'})

      return false
    }
  }

  if (evict(localStorage, key, value)) {
    dispatchLocalStorage({type: 'eviction.succeeded'})

    return true
  }

  console.error(`[persistence] write failed for ${key}: this browser's storage is full`)
  dispatchLocalStorage({type: 'eviction.failed', now: Date.now()})

  return false
}

function evict(storage: Storage, keep: string, value: string) {
  const items = Array.from({length: storage.length}, (_, index) => storage.key(index))
    .filter(
      (name): name is string =>
        name !== null && (name === keep || LOCAL_PREFIXES.some((prefix) => name.startsWith(prefix))),
    )
    .flatMap((name) => {
      const stored = storage.getItem(name)

      return stored === null ? [] : [{key: name, value: stored}]
    })
    .toSorted((a, b) => Number(b.key === keep) - Number(a.key === keep) || b.value.length - a.value.length)

  const removed: typeof items = []

  for (const item of items) {
    storage.removeItem(item.key)
    removed.push(item)

    try {
      storage.setItem(keep, value)
      removed.forEach((entry) => cacheDelete(entry.key))
      cacheSet(keep, value)

      return true
    } catch (error) {
      if (!quota(error)) break
    }
  }

  removed.forEach((entry) => {
    try {
      storage.setItem(entry.key, entry.value)
    } catch (error) {
      console.error(`[persistence] could not put back ${entry.key}`, error)
    }
  })

  return false
}

function readStored(name: string) {
  try {
    return localStorage.getItem(name)
  } catch (error) {
    console.error(`[persistence] read failed for ${name}`, error)

    return null
  }
}

function localStorageView(prefix: string): LocalStorageView {
  const item = (key: string) => `${prefix}:${key}`

  return {
    getItem: (key) => {
      const name = item(key)
      const stored = readStored(name)

      if (stored === null) return cacheGet(name) ?? null
      cacheSet(name, stored)

      return stored
    },
    setItem: (key, value) => write(item(key), value),
    removeItem: (key) => {
      const name = item(key)
      cacheDelete(name)

      try {
        localStorage.removeItem(name)
      } catch (error) {
        console.error(`[persistence] remove failed for ${name}`, error)
      }
    },
  }
}

function checksum(content: string): string | undefined {
  if (!content) return
  const hash = Array.from({length: content.length}, (_, index) => content.charCodeAt(index)).reduce(
    (sum, code) => Math.imul(sum ^ code, 0x01000193),
    0x811c9dc5,
  )

  return (hash >>> 0).toString(36)
}

function projectStorage(directory: string) {
  const head = (directory.slice(0, 12) || 'project').replace(/[^a-zA-Z0-9._-]/g, '-')

  return `${PROJECT_STORAGE}.${head}.${checksum(directory) ?? '0'}`
}

function readCurrent(input: {storage: LocalStorageView; key: string; normalize: Normalize}) {
  const raw = input.storage.getItem(input.key)

  if (raw === null) return
  const next = input.normalize(raw)

  if (next === undefined) {
    input.storage.removeItem(input.key)

    return null
  }

  if (raw !== next) input.storage.setItem(input.key, next)

  return next
}

async function readCurrentAsync(input: {
  storage: AsyncStorage
  key: string
  normalize: Normalize
  canCommit: () => boolean
}) {
  const raw = await input.storage.getItem(input.key)

  if (raw === null) return
  const next = input.normalize(raw)

  if (next === undefined) {
    if (input.canCommit()) await input.storage.removeItem(input.key).catch(() => undefined)

    return null
  }

  if (raw !== next && input.canCommit()) await input.storage.setItem(input.key, next)

  return next
}

type RelocationSource<S> = {storage: S; key?: string; pick?: PickPart}

function decodeJson(raw: string): {readonly value: unknown} | undefined {
  try {
    return {value: JSON.parse(raw)}
  } catch {
    return undefined
  }
}

function pickRaw(raw: string | null, pick: PickPart | undefined) {
  if (raw === null || !pick) return raw
  const value = decodeJson(raw)

  if (value === undefined) return null
  const picked = pick(value.value)

  return picked === undefined ? null : JSON.stringify(picked)
}

function relocateStoredValue(input: {
  current: LocalStorageView
  sources: RelocationSource<LocalStorageView>[]
  key: string
  normalize: Normalize
}) {
  for (const source of input.sources) {
    const key = source.key ?? input.key
    const raw = pickRaw(source.storage.getItem(key), source.pick)

    if (raw === null) continue

    const next = input.normalize(raw)

    if (next === undefined) {
      if (!source.pick) source.storage.removeItem(key)
      continue
    }

    if (input.current.setItem(input.key, next) && !source.pick) source.storage.removeItem(key)

    return next
  }

  return null
}

async function removeAsync(storage: AsyncStorage, key: string) {
  try {
    await storage.removeItem(key)
  } catch {}
}

async function relocateStoredValueAsync(input: {
  current: AsyncStorage
  sources: RelocationSource<AsyncStorage>[]
  key: string
  normalize: Normalize
  canCommit: () => boolean
}) {
  for (const source of input.sources) {
    const key = source.key ?? input.key
    const raw = pickRaw(await source.storage.getItem(key), source.pick)

    if (raw === null) continue

    const next = input.normalize(raw)

    if (next === undefined) {
      if (!source.pick) await removeAsync(source.storage, key)
      continue
    }

    if (input.canCommit()) await input.current.setItem(input.key, next)

    if (!source.pick) await source.storage.removeItem(key)

    return next
  }

  return null
}

export const Persist = {
  global(key: string): PersistTarget {
    return {kind: 'browser', storage: GLOBAL_STORAGE, key}
  },
  project(directory: string, key: string): PersistTarget {
    return {kind: 'browser', storage: projectStorage(directory), key}
  },
  server(key: string): PersistTarget {
    return {kind: 'engine', scope: 'project', namespace: PLUGIN_STORAGE, key}
  },
  session(session: string, key: string): PersistTarget {
    return {kind: 'engine', scope: 'project', namespace: PLUGIN_STORAGE, key: `session:${session}:${key}`}
  },
}

function browserBacking(target: BrowserTarget, normalize: Normalize): Backing {
  const current = localStorageView(target.storage)

  const sources: RelocationSource<LocalStorageView>[] = (target.copyFrom ?? []).map((copy) => ({
    storage: current,
    key: copy.key,
    pick: copy.pick,
  }))

  return {
    storage: {
      getItem: (key) => {
        const value = readCurrent({storage: current, key, normalize})

        if (value !== undefined) return value

        return relocateStoredValue({current, sources, key, normalize})
      },
      setItem: (key, value) => {
        current.setItem(key, value)
      },
      removeItem: (key) => current.removeItem(key),
    },
    save: async (key, value) => {
      if (!current.setItem(key, value)) throw new Error(`${key} could not be stored in this browser`)
    },
  }
}

function engineBacking(target: EngineTarget, rpc: RpcClient, normalize: Normalize, canCommit: () => boolean): Backing {
  const reading = new AbortController()

  if (getOwner()) onCleanup(() => reading.abort())

  const current = settingsStorage(rpc, target, reading.signal)

  const sources: RelocationSource<AsyncStorage>[] = (target.copyFrom ?? []).map((copy) => ({
    storage: current,
    key: copy.key,
    pick: copy.pick,
  }))

  return {
    storage: {
      getItem: async (key) => {
        const value = await readCurrentAsync({storage: current, key, normalize, canCommit})

        if (value !== undefined) return value

        return relocateStoredValueAsync({current, sources, key, normalize, canCommit})
      },
      setItem: async (key, value) => {
        await current.setItem(key, value)
      },
      removeItem: async (key) => {
        await current.removeItem(key)
      },
    },
    save: async (key, value) => {
      await current.setItem(key, value)
    },
  }
}

function removeFrom(
  storage: Pick<LocalStorageView | AsyncStorage, 'setItem' | 'removeItem'>,
  target: PersistTarget,
  failed: (key: string) => (error: unknown) => void,
) {
  const remove = (key: string) => Promise.try(() => storage.removeItem(key)).catch(failed(key))
  const copies = target.copyFrom ?? []

  if (copies.some((copy) => copy.pick))
    void Promise.try(() => storage.setItem(target.key, 'null')).catch(failed(target.key))
  else void remove(target.key)
  copies.forEach((copy) => {
    if (copy.pick) return
    void remove(copy.key)
  })
}

export function removePersisted(target: PersistTarget, rpc: RpcClient) {
  const failed = (key: string) => (error: unknown) => console.error(`[persistence] remove failed for ${key}`, error)

  if (target.kind === 'browser') return removeFrom(localStorageView(target.storage), target, failed)

  removeFrom(settingsStorage(rpc, target), target, failed)
}

export function persisted<S extends StandardSchemaV1<unknown, object>>(
  target: PersistTarget,
  schema: S,
  initial: NoInfer<StandardSchemaV1.InferOutput<S>>,
  rpc: RpcClient,
  encode?: Encode<S>,
): PersistedWithReady<StoreType<S>> {
  const name = target.key
  assertStoreDefinition(name, schema, initial, encode)
  const restore = withInitial(name, schema, initial, encode)

  const decode = (raw: string) => {
    const value = decodeJson(raw)

    if (value !== undefined) return {value: restore(value.value)}
  }

  const serialize = (value: StandardSchemaV1.InferOutput<S>) => JSON.stringify(encode ? encode(value) : value)

  const normalize = (raw: string) => {
    const value = decode(raw)

    if (value !== undefined) return serialize(value.value)
  }

  const store = createStore<StandardSchemaV1.InferOutput<S>>(restore(encode ? encode(initial) : initial))
  const canCommit = (): boolean => canWriteBackHydration(persist.state())

  const backing: Backing =
    target.kind === 'browser' ? browserBacking(target, normalize) : engineBacking(target, rpc, normalize, canCommit)

  const persist = persistStore({
    store: store[0],
    setStore: store[1],
    name,
    storage: backing.storage,
    serialize,
    deserialize: (raw) => restore(JSON.parse(raw)),
    write: async (value, serialized) => {
      assertStoreWrite(name, schema, value, encode)
      await backing.save(name, serialized)
    },
  })

  return [
    store[0],
    persist.setStore,
    persist.init,
    Object.assign(persist.ready, {promise: persist.init instanceof Promise ? persist.init : undefined}),
  ]
}
