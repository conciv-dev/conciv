import type {RpcClient, SettingsScope} from '@conciv/contract'
import type {AsyncStorage} from '@solid-primitives/storage'

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
