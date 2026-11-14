import {z} from 'zod'
import type {RpcClient, SettingsScope, SettingsSnapshot} from '@conciv/contract'
import {pluginEnabled, type EnableState} from '@conciv/plugin/experimental/host'

const WHERE: {readonly scope: SettingsScope; readonly namespace: string} = {scope: 'global', namespace: 'plugin-enable'}

export function pluginError(code: 'notFound' | 'builtin') {
  return Object.assign(new Error(code), {code})
}

const EnableRowSchema = z.object({id: z.string().min(1), enabled: z.boolean()})

function readEnableState(snapshot: SettingsSnapshot): readonly EnableState[] {
  return Object.entries(snapshot.value).flatMap(([id, enabled]) => {
    const row = EnableRowSchema.safeParse({id, enabled})
    if (row.success) return [row.data]
    console.error(`[plugins] dropped the stored enable state of ${id}`, row.error)
    return []
  })
}

export function createManager(rpc: RpcClient, builtins: readonly string[]) {
  const read = async () => readEnableState(await rpc.settings.all(WHERE))

  return {
    read,
    async enabled(id: string) {
      return pluginEnabled({id, builtin: builtins.includes(id)}, await read())
    },
    async setEnabled(id: string, enabled: boolean) {
      if (builtins.includes(id)) throw pluginError('builtin')
      await rpc.settings.set({...WHERE, key: id, value: enabled})
    },
    on(listener: (state: readonly EnableState[]) => void, failed?: (cause: unknown) => void) {
      const controller = new AbortController()
      follow(rpc, controller.signal, listener).catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error('[plugins] following the plugin enable state failed', error)
        failed?.(error)
      })
      return () => controller.abort()
    },
  }
}

async function follow(rpc: RpcClient, signal: AbortSignal, listener: (state: readonly EnableState[]) => void) {
  const stream = await rpc.settings.changes(WHERE, {signal})

  for await (const snapshot of stream) listener(readEnableState(snapshot))

  throw new Error('the plugin enable state stream ended')
}
