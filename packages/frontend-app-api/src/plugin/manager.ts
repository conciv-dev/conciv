import type {SettingsScope} from '@conciv/protocol'
import type {ConcivClient} from '@conciv/client'
import type {EnableState} from './installed'
import {readEnableState} from './enable-state'
import {pluginError} from './error'

const WHERE: {readonly scope: SettingsScope; readonly namespace: string} = {scope: 'global', namespace: 'plugin-enable'}

export function createManager(client: ConcivClient, builtins: readonly string[]) {
  return {
    async setEnabled(id: string, enabled: boolean) {
      if (builtins.includes(id)) throw pluginError('builtin')
      await client.settings.set({...WHERE, key: id, value: enabled})
    },
    on(listener: (state: readonly EnableState[]) => void, failed?: (cause: unknown) => void) {
      const controller = new AbortController()
      follow(client, controller.signal, listener).catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('[plugins] following the plugin enable state failed', error)
        failed?.(error)
      })
      return () => controller.abort()
    },
  }
}

async function follow(client: ConcivClient, signal: AbortSignal, listener: (state: readonly EnableState[]) => void) {
  const stream = await client.settings.changes(WHERE, {signal})

  for await (const snapshot of stream) listener(readEnableState(snapshot))

  throw new Error('the plugin enable state stream ended')
}
