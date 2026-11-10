import type {RpcClient, SettingsScope, SettingsSnapshot} from '@conciv/contract'
import {createSettingsStore} from './settings-store.js'
import type {Settings, SettingsState} from './types.js'

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
