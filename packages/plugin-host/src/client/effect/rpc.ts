import type {Rpc} from '../../schema/rpc.js'
import type {RpcArguments, RpcCallOptions} from '@conciv/plugin'
import type {Effect, Schema, Stream} from 'effect'

type DecodeError<S> = S extends Schema.Top ? Schema.SchemaError : never

export type RpcClient<D extends Rpc.Definition, E = never, Options = RpcCallOptions, EventError = E> = {
  readonly [Name in keyof D['methods']]: (
    ...args: RpcArguments<Rpc.Input<D['methods'][Name]['input']>, Options>
  ) => Effect.Effect<
    Rpc.Output<D['methods'][Name]['output']>,
    Rpc.MethodError<D['methods'][Name]> | DecodeError<D['methods'][Name]['output']> | E
  >
} & {
  readonly events: {
    readonly subscribe: <Name extends keyof D['events'] & string>(
      name: Name,
    ) => Stream.Stream<Rpc.EventPayload<D, Name>, DecodeError<D['events'][Name]['schema']> | EventError>
  }
}

export interface RpcApi<E = never, Options = RpcCallOptions, EventError = E> {
  <D extends Rpc.Definition>(definition: D): RpcClient<D, E, Options, EventError>
}
