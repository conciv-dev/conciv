import type {z} from 'zod'
import {Rpc} from '@conciv/plugin-host'
import {Definition} from '@conciv/plugin-page/rpc'
import type {PluginHost} from '../api/rpc/mount.js'

type Methods = typeof Definition.methods

type Input<Name extends keyof Methods> = z.input<Methods[Name]['input']>

export type PagePlugin = ReturnType<typeof makePagePlugin>

export function makePagePlugin(host: () => PluginHost) {
  const call = (method: keyof Methods, input: unknown, signal: AbortSignal | undefined) =>
    host().runPromise(
      Rpc.Service.use((rpc) => rpc.call(Definition.id, method, input)),
      signal === undefined ? {} : {signal},
    )
  return {
    hmrWait: async (input: Input<'hmr.wait'>, signal?: AbortSignal) =>
      Definition.methods['hmr.wait'].output.parse(await call('hmr.wait', input, signal)),
  }
}
