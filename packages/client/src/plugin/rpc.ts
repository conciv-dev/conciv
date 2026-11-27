import {log} from 'evlog'
import type {EngineClient} from '../connection/rpc-client.js'
import {z} from 'zod'
import type * as Rpc from '@conciv/protocol/schema/rpc'
import type {ConcivEvent, RpcEvent} from './events.js'

export type RpcCallOptions = {readonly signal?: AbortSignal}

export type RpcArguments<Input, Options> = unknown extends Input
  ? [input: Input, options?: Options]
  : undefined extends Input
    ? [input?: Input, options?: Options]
    : [input: Input, options?: Options]

type MethodInput<D extends Rpc.PortableDefinition, Name extends keyof D['methods']> = Rpc.Input<
  D['methods'][Name]['input']
>

type MethodOutput<D extends Rpc.PortableDefinition, Name extends keyof D['methods']> = Rpc.Output<
  D['methods'][Name]['output']
>

export type RpcQueryKey<D extends Rpc.PortableDefinition, Name extends keyof D['methods'] & string, Input = unknown> =
  | readonly ['plugin', {readonly server: string}, D['id'], Name]
  | readonly ['plugin', {readonly server: string}, D['id'], Name, Input]

export type RpcQueryArguments<Input> = undefined extends Input
  ? unknown extends Input
    ? [options: {readonly input: Input}]
    : [options?: {readonly input?: Input}]
  : [options: {readonly input: Input}]

export type RpcMethod<D extends Rpc.PortableDefinition, Name extends keyof D['methods'] & string, Options> = {
  (...args: RpcArguments<MethodInput<D, Name>, Options>): Promise<MethodOutput<D, Name>>
  /**
   * The method's query key: `['plugin', {server}, id, method]`, with the input appended when given. `server` names the
   * engine the client reads from, so two engines never share a cached value. Invalidate without an input to refresh
   * every read of the method on that engine.
   *
   * @example
   * ```ts
   * useQueryClient().invalidateQueries({ queryKey: ctx.client.rpc(Acme).search.key() })
   * ```
   */
  readonly key: (options?: {readonly input?: MethodInput<D, Name>}) => RpcQueryKey<D, Name, MethodInput<D, Name>>
  /**
   * The options a view passes to `useQuery` to read the method through the host's query cache.
   *
   * @example
   * ```ts
   * const found = useQuery(() => ctx.client.rpc(Acme).search.queryOptions({ input: { query } }))
   * ```
   */
  readonly queryOptions: (...args: RpcQueryArguments<MethodInput<D, Name>>) => {
    readonly queryKey: RpcQueryKey<D, Name, MethodInput<D, Name>>
    readonly queryFn: (context: {readonly signal: AbortSignal}) => Promise<MethodOutput<D, Name>>
  }
  /**
   * The options a view passes to `useMutation` to write through the method.
   *
   * @example
   * ```ts
   * const save = useMutation(() => ctx.client.rpc(Acme).save.mutationOptions())
   * ```
   */
  readonly mutationOptions: () => {
    readonly mutationKey: RpcQueryKey<D, Name>
    readonly mutationFn: (input: MethodInput<D, Name>) => Promise<MethodOutput<D, Name>>
  }
}

export type PluginClient<D extends Rpc.PortableDefinition, Options = RpcCallOptions> = {
  readonly [Name in keyof D['methods'] & string]: RpcMethod<D, Name, Options>
} & {
  readonly events: {
    readonly subscribe: <Name extends keyof D['events'] & string>(
      name: Name,
      options?: RpcCallOptions,
    ) => AsyncIterable<RpcEventPayload<D, Name>>
    readonly on: <Name extends keyof D['events'] & string>(
      name: Name,
      handler: (event: RpcEventPayload<D, Name>) => Promise<void> | void,
      options?: RpcCallOptions,
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
  <D extends Rpc.PortableDefinition>(definition: D): PluginClient<D, Options>
}

const RpcError = z.object({
  defined: z.literal(true),
  code: z.enum(['PLUGIN_RPC', 'PLUGIN_RPC_INTERNAL']),
  data: z.object({type: z.string(), message: z.string(), data: z.unknown().optional()}),
})

export function makeRpc(
  raw: EngineClient,
  events: {subscribe(options?: RpcCallOptions): AsyncIterable<ConcivEvent>},
  server: () => string,
): RpcApi {
  return (definition) => {
    const subscribe = (
      name: string,
      options?: RpcCallOptions,
    ): AsyncIterable<RpcEventPayload<Rpc.PortableDefinition>> => {
      if (!Object.hasOwn(definition.events, name)) throw new Error(`Unknown RPC event: ${definition.id}.${name}`)
      const type = eventType(definition, name)
      return {
        [Symbol.asyncIterator]() {
          const controller = new AbortController()
          const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
          async function* read() {
            try {
              for await (const published of events.subscribe({signal})) {
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
          rpcMethod(server, definition.id, name, async (input, options) => {
            try {
              return await raw.plugin.invoke({rpcId: definition.id, method: name, input}, {signal: options?.signal})
            } catch (error) {
              const failure = RpcError.safeParse(error)
              if (!failure.success) throw error
              const {type, message, data} = failure.data.data
              throw data === undefined ? {type, message} : {type, message, data}
            }
          }),
        ]),
      ),
      {
        events: {
          subscribe,
          on: (
            name: string,
            handler: (event: RpcEventPayload<Rpc.PortableDefinition>) => Promise<void> | void,
            options?: RpcCallOptions,
          ) => {
            const controller = new AbortController()
            const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
            const source = subscribe(name, {signal})
            async function deliver() {
              for await (const event of source) {
                try {
                  await handler(event)
                } catch (error) {
                  log.error({
                    action: 'plugin',
                    message: 'an rpc event handler failed',
                    plugin: definition.id,
                    event: name,
                    error,
                  })
                }
              }
            }
            void deliver().catch((error: unknown) =>
              log.error({
                action: 'plugin',
                message: 'the rpc event subscription failed',
                plugin: definition.id,
                event: name,
                error,
              }),
            )
            return () => controller.abort()
          },
        },
      },
    ) as PluginClient<typeof definition>
  }
}

export function rpcMethod(
  server: () => string,
  id: string,
  name: string,
  call: (input: unknown, options?: {readonly signal?: AbortSignal}) => Promise<unknown>,
): RpcMethod<Rpc.PortableDefinition, string, {readonly signal?: AbortSignal}> {
  const key = (options?: {readonly input?: unknown}): RpcQueryKey<Rpc.PortableDefinition, string> =>
    options?.input === undefined
      ? ['plugin', {server: server()}, id, name]
      : ['plugin', {server: server()}, id, name, options.input]

  return Object.assign(call, {
    key,
    queryOptions: (options?: {readonly input?: unknown}) => ({
      queryKey: key(options),
      queryFn: ({signal}: {readonly signal: AbortSignal}) => call(options?.input, {signal}),
    }),
    mutationOptions: () => ({mutationKey: key(), mutationFn: (input: unknown) => call(input)}),
  })
}

function eventType(definition: Rpc.PortableDefinition, name: string) {
  return `rpc.${definition.id}.${name}` as const
}
