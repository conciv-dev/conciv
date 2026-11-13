import type {RpcClient, SettingsScope, SettingsSnapshot} from '@conciv/contract'
import type {AsyncStorage, PersistenceSyncAPI, PersistenceSyncCallback} from '@solid-primitives/storage'

type SettingsTarget = {readonly scope: SettingsScope; readonly namespace: string}

export function settingsStorage(rpc: RpcClient, target: SettingsTarget): AsyncStorage {
  const where = {scope: target.scope, namespace: target.namespace}

  return {
    getItem: async (key) => {
      const snapshot = await rpc.settings.all(where)

      return Object.hasOwn(snapshot.value, key) ? JSON.stringify(snapshot.value[key]) : null
    },
    setItem: async (key, value) => {
      const parsed: unknown = JSON.parse(value)

      await rpc.settings.set({...where, key, value: parsed})
    },
    removeItem: async (key) => {
      await rpc.settings.delete({...where, key})
    },
  }
}

export function settingsSync(rpc: RpcClient, target: SettingsTarget, signal: AbortSignal): PersistenceSyncAPI {
  const where = {scope: target.scope, namespace: target.namespace}

  const subscribe = (subscriber: PersistenceSyncCallback) => {
    follow(rpc, where, signal, subscriber).catch((error: unknown) => {
      if (signal.aborted) return
      console.error(`[persistence] following the ${where.scope} settings of ${where.namespace} failed`, error)
    })
  }

  return [subscribe, () => undefined]
}

async function follow(
  rpc: RpcClient,
  where: SettingsTarget,
  signal: AbortSignal,
  subscriber: PersistenceSyncCallback,
): Promise<void> {
  const stream = await rpc.settings.changes(where, {signal})

  for await (const snapshot of stream) announce(snapshot, subscriber)
}

function announce(snapshot: SettingsSnapshot, subscriber: PersistenceSyncCallback) {
  Object.entries(snapshot.value).forEach(([key, value]) =>
    subscriber({key, newValue: JSON.stringify(value), timeStamp: Date.now()}),
  )
}
