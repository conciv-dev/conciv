import {ORPCError} from '@orpc/client'
import type {ContractClient} from '@conciv/client'
import type {SettingsScope} from '@conciv/protocol'
import type {AsyncStorage} from '@solid-primitives/storage'

type SettingsTarget = {readonly scope: SettingsScope; readonly namespace: string}

const untilEngineError = (attempt: {readonly error: unknown}) => !(attempt.error instanceof ORPCError)

export function settingsStorage(rpc: ContractClient, target: SettingsTarget, signal?: AbortSignal): AsyncStorage {
  const where = {scope: target.scope, namespace: target.namespace}

  return {
    getItem: async (key) => {
      const snapshot = await rpc.settings.all(where, {signal, context: {shouldRetry: untilEngineError}})

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
