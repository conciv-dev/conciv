import type {RpcClient, SettingsScope} from '@conciv/contract'
import type {AsyncStorage} from '@solid-primitives/storage'
import type {StandardSchemaV1} from '@standard-schema/spec'
import {onCleanup, type Accessor} from 'solid-js'
import {createStore, type SetStoreFunction, type Store} from 'solid-js/store'
import {persistStore} from './persist'
import {canWriteBackHydration} from './persist-machine'
import {assertStoreDefinition, assertStoreWrite, withInitial, type Encode} from './schema'
import {settingsStorage, settingsSync} from './settings-storage'

type InitType = Promise<string | null> | string | null

type PersistedWithReady<T> = [
  Store<T>,
  SetStoreFunction<T>,
  InitType,
  Accessor<boolean> & {promise: undefined | Promise<unknown>},
]

type PersistTarget = {
  sync?: boolean
  scope: SettingsScope
  namespace: string
  copyFrom?: readonly CopyFrom[]
  key: string
}

type PickPart = (value: unknown) => unknown

export type CopyFrom = {key: string; pick?: PickPart}

const PLUGIN_STORAGE = 'plugins'

async function readCurrentAsync(input: {
  storage: AsyncStorage
  key: string
  normalize: (raw: string) => string | undefined
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

async function removeAsync(storage: AsyncStorage, key: string) {
  try {
    await storage.removeItem(key)
  } catch {}
}

async function relocateStoredValueAsync(input: {
  current: AsyncStorage
  sources: RelocationSource<AsyncStorage>[]
  key: string
  normalize: (raw: string) => string | undefined
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
    return {scope: 'global', namespace: PLUGIN_STORAGE, key}
  },
  project(key: string): PersistTarget {
    return {scope: 'project', namespace: PLUGIN_STORAGE, key}
  },
  session(session: string, key: string): PersistTarget {
    return {scope: 'project', namespace: PLUGIN_STORAGE, key: `session:${session}:${key}`}
  },
}

export function removePersisted(
  target: Pick<PersistTarget, 'scope' | 'namespace' | 'copyFrom' | 'key'>,
  rpc: RpcClient,
) {
  const storage = settingsStorage(rpc, target)
  const failed = (key: string) => (error: unknown) => console.error(`[persistence] remove failed for ${key}`, error)

  const copies = target.copyFrom ?? []

  if (copies.some((copy) => copy.pick)) void storage.setItem(target.key, 'null').catch(failed(target.key))
  else void storage.removeItem(target.key).catch(failed(target.key))
  copies.forEach((copy) => {
    if (copy.pick) return
    void storage.removeItem(copy.key).catch(failed(copy.key))
  })
}

export function persisted<S extends StandardSchemaV1<unknown, object>>(
  target: PersistTarget,
  schema: S,
  initial: NoInfer<StandardSchemaV1.InferOutput<S>>,
  rpc: RpcClient,
  encode?: Encode<S>,
): PersistedWithReady<StandardSchemaV1.InferOutput<S>> {
  const config = target
  const name = config.key
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
  const canCommit = () => canWriteBackHydration(persist.state())

  const current = settingsStorage(rpc, config)

  const relocationSources: RelocationSource<AsyncStorage>[] = (config.copyFrom ?? []).map((copy) => ({
    storage: current,
    key: copy.key,
    pick: copy.pick,
  }))

  const storage: AsyncStorage = {
    getItem: async (key) => {
      const value = await readCurrentAsync({storage: current, key, normalize, canCommit})

      if (value !== undefined) return value

      return relocateStoredValueAsync({
        current,
        sources: relocationSources,
        key,
        normalize,
        canCommit,
      })
    },
    setItem: async (key, value) => {
      await current.setItem(key, value)
    },
    removeItem: async (key) => {
      await current.removeItem(key)
    },
  }

  const channel = config.sync ? new AbortController() : undefined

  if (channel) onCleanup(() => channel.abort())

  const persist = persistStore({
    store: store[0],
    setStore: store[1],
    name: config.key,
    storage,
    serialize,
    deserialize: (raw) => restore(JSON.parse(raw)),
    write: async (value, serialized) => {
      assertStoreWrite(name, schema, value, encode)
      await storage.setItem(name, serialized)
    },
    sync: channel ? settingsSync(rpc, config, channel.signal) : undefined,
  })

  return [
    store[0],
    persist.setStore,
    persist.init,
    Object.assign(persist.ready, {promise: persist.init instanceof Promise ? persist.init : undefined}),
  ]
}
