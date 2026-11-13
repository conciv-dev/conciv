import type {RpcApi, RpcCallOptions} from '../client/promise/api.js'
import type * as Rpc from '../schema/rpc.js'
import type {Registration} from './registration.js'

export type {RpcEventPayload} from '../client/promise/api.js'

export interface RpcCallContext<M extends Rpc.Method> {
  readonly signal: AbortSignal
  readonly error: Rpc.ErrorFactory<M>
}

export type RpcHandlers<D extends Rpc.PortableDefinition> = {
  readonly [Name in keyof D['methods']]: (
    input: Rpc.Output<D['methods'][Name]['input']>,
    context: RpcCallContext<D['methods'][Name]>,
  ) => Promise<Rpc.HandlerOutput<D['methods'][Name]['output']> | Rpc.HandlerError<D['methods'][Name]>>
}

export interface RpcRegistration<D extends Rpc.PortableDefinition> extends Registration {
  readonly events: {
    readonly emit: (...args: Rpc.EventInput<D>) => Promise<void>
  }
}

export interface RpcDomain extends RpcApi<
  Pick<RpcCallOptions, 'signal'> & {readonly location?: never; readonly headers?: never}
> {
  readonly register: <const D extends Rpc.PortableDefinition>(
    definition: D,
    handlers: RpcHandlers<NoInfer<D>>,
  ) => Promise<RpcRegistration<D>>
}
