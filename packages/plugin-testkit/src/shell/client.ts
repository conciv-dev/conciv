import {createORPCClient} from '@orpc/client'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {z} from 'zod'
import type {RpcClient} from '@conciv/contract'
import {Conciv, type ConcivClient} from '@conciv/plugin'
import type {EngineEvent} from '../browser-commands.js'

export interface ShellEngine {
  readonly sessionId: string
  call(rpcId: string, method: string, input?: unknown): Promise<unknown>
  events(signal: AbortSignal): AsyncGenerator<EngineEvent>
}

const UNSERVED = 'the fake app shell answers only plugin.call and event.subscribe'

const wire = new StandardRPCSerializer(new StandardRPCJsonSerializer())

function overTheWire(value: unknown): unknown {
  return wire.deserialize(JSON.parse(JSON.stringify(wire.serialize(value))))
}

const PluginCallInput = z.object({rpcId: z.string(), method: z.string(), input: z.unknown().optional()})

export function shellClient(engine: ShellEngine | undefined): ConcivClient {
  const raw = createORPCClient<RpcClient>({
    call: async (path, input, options) => {
      const [group, method] = path
      if (engine === undefined) throw new Error(UNSERVED)
      if (group === 'plugin' && method === 'call') {
        const parsed = PluginCallInput.parse(overTheWire(input))
        return overTheWire(await engine.call(parsed.rpcId, parsed.method, parsed.input))
      }
      if (group === 'event' && method === 'subscribe')
        return engine.events(options.signal ?? new AbortController().signal)
      throw new Error(`${UNSERVED}, not ${path.join('.')}`)
    },
  })
  return Conciv.make(raw, {server: () => 'engine'})
}
