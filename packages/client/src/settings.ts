import {createDefu} from 'defu'
import {z} from 'zod'
import type {RpcClient} from './rpc-client.js'
import type {SettingsScope, SettingsSnapshot} from '@conciv/protocol'

export type SettingsStore<T extends object = Record<string, unknown>> = {
  get: <K extends keyof T>(key: K) => Promise<T[K] | undefined>
  set: <K extends keyof T>(key: K, value: T[K]) => Promise<void>
  delete: <K extends keyof T>(key: K) => Promise<void>
  all: () => Promise<Readonly<T>>
  onChange: (fn: (value: Readonly<T>) => void) => Promise<() => void>
}

export type Settings<T extends object = Record<string, unknown>> = {
  global: SettingsStore<T>
  project: SettingsStore<T>
}

export type SettingsState = {
  read: () => Promise<SettingsSnapshot>
  set: (key: string, value: unknown) => Promise<SettingsSnapshot>
  delete: (key: string) => Promise<SettingsSnapshot>
  subscribe: (listener: (snapshot: SettingsSnapshot) => void) => Promise<() => void>
}

export function createSettingsStore<T extends object>(store: () => Promise<SettingsState>): SettingsStore<T> {
  const settings = z.custom<T>((value) => typeof value === 'object' && value !== null)
  return {
    get: async (key) => {
      const value = settings.parse((await (await store()).read()).value)
      return Object.hasOwn(value, key) ? value[key] : undefined
    },
    set: async (key, value) => {
      await (await store()).set(String(key), value)
    },
    delete: async (key) => {
      await (await store()).delete(String(key))
    },
    all: async () => settings.parse((await (await store()).read()).value),
    onChange: async (fn) => (await store()).subscribe((snapshot) => fn(settings.parse(snapshot.value))),
  }
}

const projectOverGlobal = createDefu((object: Record<PropertyKey, unknown>, key, value) => {
  if (!Array.isArray(value)) return false
  object[key] = value
  return true
})

export function mergeSettings(
  project: Record<string, unknown>,
  global: Record<string, unknown>,
): Record<string, unknown> {
  return projectOverGlobal(project, global)
}

export function createClientSettings<T extends object = Record<string, unknown>>(
  rpc: RpcClient,
  namespace: string,
  signal?: AbortSignal,
): Settings<T> {
  return {
    global: createSettingsStore<T>(mirroredState(rpc, {scope: 'global', namespace}, signal)),
    project: createSettingsStore<T>(mirroredState(rpc, {scope: 'project', namespace}, signal)),
  }
}

type SettingsTarget = {scope: SettingsScope; namespace: string}

function mirroredState(
  rpc: RpcClient,
  target: SettingsTarget,
  signal: AbortSignal | undefined,
): () => Promise<SettingsState> {
  const listeners = new Set<(snapshot: SettingsSnapshot) => void>()
  const mirror: {latest: SettingsSnapshot; following?: Promise<SettingsState>; queue: Promise<unknown>} = {
    latest: {generation: '', version: 0, value: {}},
    queue: Promise.resolve(),
  }
  const accept = (snapshot: SettingsSnapshot): SettingsSnapshot => {
    if (snapshot.generation === mirror.latest.generation && snapshot.version <= mirror.latest.version)
      return mirror.latest
    mirror.latest = snapshot
    listeners.forEach((listener) => listener(snapshot))
    return snapshot
  }
  const inOrder = <Result>(run: () => Promise<Result>): Promise<Result> => {
    const result = mirror.queue.then(run)
    mirror.queue = result.catch(() => undefined)
    return result
  }
  const state: SettingsState = {
    read: () => inOrder(async () => mirror.latest),
    set: (key, value) => inOrder(async () => accept(await rpc.settings.set({...target, key, value}, {signal}))),
    delete: (key) => inOrder(async () => accept(await rpc.settings.delete({...target, key}, {signal}))),
    subscribe: async (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const follow = async (): Promise<SettingsState> => {
    const stream = await rpc.settings.changes(target, {signal})
    const first = await stream.next()
    if (first.done === true) throw new Error(`conciv: the ${target.scope} settings of "${target.namespace}" closed`)
    accept(first.value)
    drain(stream, accept).then(
      () => forget(),
      (error: unknown) => forget(error),
    )
    return state
  }
  const forget = (error?: unknown): void => {
    mirror.following = undefined
    if (error !== undefined && signal?.aborted !== true)
      console.error(`conciv: following the ${target.scope} settings of "${target.namespace}" failed`, error)
  }
  return () => {
    mirror.following ??= follow().catch((error: unknown) => {
      mirror.following = undefined
      throw error
    })
    return mirror.following
  }
}

async function drain(
  stream: AsyncIterable<SettingsSnapshot>,
  accept: (snapshot: SettingsSnapshot) => SettingsSnapshot,
): Promise<void> {
  for await (const snapshot of stream) accept(snapshot)
}
