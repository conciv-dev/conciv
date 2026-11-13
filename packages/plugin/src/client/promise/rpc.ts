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
