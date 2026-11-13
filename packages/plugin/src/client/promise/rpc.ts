import type {RpcClient as ConcivRpcClient} from '@conciv/contract'
import {z} from 'zod'
import type * as Rpc from '../../schema/rpc.js'
import type {RequestOptions} from './generated/client.js'
import type {EventSubscribeOutput} from './generated/types.js'

type RpcEvent = Extract<EventSubscribeOutput, {type: `rpc.${string}`}>

export type RpcCallOptions = RequestOptions

export type RpcArguments<Input, Options> = unknown extends Input
  ? [input: Input, options?: Options]
  : undefined extends Input
    ? [input?: Input, options?: Options]
    : [input: Input, options?: Options]

export type RpcClient<D extends Rpc.PortableDefinition, Options = RpcCallOptions> = {
  readonly [Name in keyof D['methods']]: (
    ...args: RpcArguments<Rpc.Input<D['methods'][Name]['input']>, Options>
  ) => Promise<Rpc.Output<D['methods'][Name]['output']>>
} & {
  readonly events: {
    readonly subscribe: <Name extends keyof D['events'] & string>(
      name: Name,
      options?: Pick<RequestOptions, 'signal'>,
    ) => AsyncIterable<RpcEventPayload<D, Name>>
    readonly on: <Name extends keyof D['events'] & string>(
      name: Name,
      handler: (event: RpcEventPayload<D, Name>) => Promise<void> | void,
      options?: Pick<RequestOptions, 'signal'>,
    ) => () => void
  }
}

type RpcEventPayloadFor<D extends Rpc.PortableDefinition, Name extends keyof D['events'] & string> = Omit<
  RpcEvent,
  'type' | 'data'
> & {
  type: `rpc.${D['id']}.${Name}`
  data: Rpc.EventData<D['events'][Name]['schema']>
}

export type RpcEventPayload<
  D extends Rpc.PortableDefinition,
  Name extends keyof D['events'] & string = keyof D['events'] & string,
> = {[K in Name]: RpcEventPayloadFor<D, K>}[Name]

export interface RpcApi<Options = RpcCallOptions> {
  <D extends Rpc.PortableDefinition>(definition: D): RpcClient<D, Options>
}

const RpcError = z.object({
  defined: z.literal(true),
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.string(), message: z.string(), data: z.unknown().optional()}),
})

export function makeRpc(
  call: ConcivRpcClient['plugin']['call'],
  subscribeEvents: ConcivRpcClient['plugin']['events'],
): RpcApi {
  return (definition) => {
    const subscribe = (
      name: string,
      options?: Pick<RequestOptions, 'signal'>,
    ): AsyncIterable<RpcEventPayload<Rpc.PortableDefinition>> => {
      if (!Object.hasOwn(definition.events, name)) throw new Error(`Unknown RPC event: ${definition.id}.${name}`)
      const type = eventType(definition, name)
      return {
        [Symbol.asyncIterator]() {
          const controller = new AbortController()
          const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
          async function* read() {
            try {
              for await (const published of await subscribeEvents({rpcId: definition.id, types: [name]}, {signal})) {
                if (signal.aborted) return
                if (published.type !== type) continue
                yield published as RpcEventPayload<Rpc.PortableDefinition>
              }
            } catch (error) {
              if (!signal.aborted) throw error
            } finally {
              controller.abort()
            }
          }
          const iterator = read()
          return {
            next: () => iterator.next(),
            return: () => {
              controller.abort()
              return iterator.return()
            },
          }
        },
      }
    }
    return Object.assign(
      Object.fromEntries(
        Object.keys(definition.methods).map((name) => [
          name,
          async (input: unknown, options?: RpcCallOptions) => {
            try {
              return await call({rpcId: definition.id, method: name, input}, {signal: options?.signal})
            } catch (error) {
              const failure = RpcError.safeParse(error)
              if (!failure.success) throw error
              const {type, message, data} = failure.data.data
              throw data === undefined ? {type, message} : {type, message, data}
            }
          },
        ]),
      ),
      {
        events: {
          subscribe,
          on: (
            name: string,
            handler: (event: RpcEventPayload<Rpc.PortableDefinition>) => Promise<void> | void,
            options?: Pick<RequestOptions, 'signal'>,
          ) => {
            const controller = new AbortController()
            const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
            const source = subscribe(name, {signal})
            async function deliver() {
              for await (const event of source) await handler(event)
            }
            void deliver().catch((error: unknown) => console.error(error))
            return () => controller.abort()
          },
        },
      },
    ) as RpcClient<typeof definition>
  }
}

function eventType(definition: Rpc.PortableDefinition, name: string) {
  return `rpc.${definition.id}.${name}` as const
}
