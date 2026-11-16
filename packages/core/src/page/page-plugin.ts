import {z} from 'zod'
import {Effect} from 'effect'
import {Rpc} from '@conciv/plugin-host'
import {Definition} from '@conciv/plugin-page/rpc'
import type {RawFrame, SourceLoc} from '@conciv/protocol/page-introspect-types'
import type {PluginHost} from '../api/rpc/mount.js'
import {logError} from '../lib/debug.js'

export type PagePlugin = ReturnType<typeof makePagePlugin>

const Unavailable = z.object({type: z.literal('rpc.unavailable')})

function unlisted(error: unknown): boolean {
  return error instanceof Error && Unavailable.safeParse(error.cause).success
}

export function makePagePlugin(host: () => PluginHost) {
  const symbolicate = async (frames: RawFrame[]): Promise<SourceLoc | null> =>
    Definition.methods.symbolicate.output.parse(
      await host().runPromise(
        Rpc.Service.use((rpc) => rpc.call(Definition.id, 'symbolicate', {frames})).pipe(
          Effect.mapError((failure) => new Error(failure.message, {cause: failure})),
        ),
      ),
    )

  const symbolicateOrNone = (frames: RawFrame[]): Promise<SourceLoc | null> =>
    symbolicate(frames).catch((error: unknown) => {
      if (!unlisted(error)) logError(`[core] the page plugin could not symbolicate: ${String(error)}`)
      return null
    })

  return {symbolicate, symbolicateOrNone}
}
