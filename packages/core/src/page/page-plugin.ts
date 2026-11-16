import {z} from 'zod'
import {Effect} from 'effect'
import {Plugin, Rpc} from '@conciv/plugin-host'
import {Definition} from '@conciv/plugin-page/rpc'
import type {RawFrame, SourceLoc} from '@conciv/protocol/page-introspect-types'
import type {PluginHost} from '../api/rpc/mount.js'
import {logError} from '../lib/debug.js'

type Methods = typeof Definition.methods

export type PagePlugin = ReturnType<typeof makePagePlugin>

const Unavailable = z.object({type: z.literal('rpc.unavailable')})

function unlisted(error: unknown): boolean {
  return error instanceof Error && Unavailable.safeParse(error.cause).success
}

export function makePagePlugin(host: () => PluginHost) {
  const call = (method: keyof Methods, input: unknown, signal?: AbortSignal) =>
    host().runPromise(
      Plugin.awaitActivation.pipe(
        Effect.andThen(Rpc.Service.use((rpc) => rpc.call(Definition.id, method, input))),
        Effect.mapError((failure) => new Error(failure.message, {cause: failure})),
      ),
      signal === undefined ? {} : {signal},
    )

  const symbolicate = async (frames: RawFrame[]): Promise<SourceLoc | null> =>
    Definition.methods.symbolicate.output.parse(await call('symbolicate', {frames}))

  const symbolicateOrNone = (frames: RawFrame[]): Promise<SourceLoc | null> =>
    symbolicate(frames).catch((error: unknown) => {
      if (!unlisted(error)) logError(`[core] the page plugin could not symbolicate: ${String(error)}`)
      return null
    })

  return {symbolicate, symbolicateOrNone}
}
