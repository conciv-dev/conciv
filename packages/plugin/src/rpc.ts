import type {z} from 'zod'
import type {RequestOptions} from './domains.js'
import type {PublicRef, Ref} from './location.js'
import type {Registration} from './registration.js'

export type ErrorMap = Readonly<Record<string, z.ZodType>> & {
  readonly [Name in `rpc.${string}`]?: never
}

export interface Method {
  readonly input: z.ZodType
  readonly output: z.ZodType
  readonly errors?: ErrorMap
}

export type PortableValueSchema = z.ZodType

export interface PortableMethod extends Method {
  readonly input: PortableValueSchema
  readonly output: PortableValueSchema
  readonly errors?: Readonly<Record<string, PortableValueSchema>> & {
    readonly [Name in `rpc.${string}`]?: never
  }
}

type EventDataObject = Readonly<Record<string, unknown>>
type EventValueSchema = z.ZodType<EventDataObject>
type PortableEventValueSchema = z.ZodType<EventDataObject>

export interface EventDefinition {
  readonly schema: EventValueSchema
}
export type PortableEventDefinition = EventDefinition & {readonly schema: PortableEventValueSchema}

export interface Definition {
  readonly id: string
  readonly methods: Readonly<Record<string, Method>> & {readonly events?: never}
  readonly events: Readonly<Record<string, EventDefinition>>
}

export interface PortableDefinition extends Definition {
  readonly methods: Readonly<Record<string, PortableMethod>> & {readonly events?: never}
  readonly events: Readonly<Record<string, PortableEventDefinition>>
}

export function define<const D extends Definition>(definition: D) {
  const reserved = Object.values(definition.methods)
    .flatMap((method) => Object.keys(method.errors ?? {}))
    .find((name) => name.startsWith('rpc.'))
  if (reserved) throw new Error(`RPC error names starting with "rpc." are reserved: ${reserved}`)
  return definition
}

export type Input<S extends z.ZodType> = z.input<S>

export type Output<S extends z.ZodType> = z.output<S>

/** zod parses handler results forward, so a handler returns the schema's input side. */
export type HandlerOutput<S extends z.ZodType> = Input<S>

type MethodErrors<M extends Method> = M extends {
  readonly errors: infer Errors extends ErrorMap
}
  ? Errors
  : never
type ErrorSchema<M extends Method, Name extends ErrorName<M>> = MethodErrors<M>[Name]
type ErrorData<Data> = unknown extends Data
  ? {readonly data: Data}
  : undefined extends Data
    ? {readonly data?: Data}
    : {readonly data: Data}
type ErrorDataArguments<Data> = unknown extends Data
  ? [data: Data]
  : undefined extends Data
    ? [data?: Data]
    : [data: Data]
type Simplify<A> = {readonly [K in keyof A]: A[K]}
declare const HandlerErrorTypeId: unique symbol

export interface Failure<Type extends string = string, Data = unknown> {
  readonly type: Type
  readonly message: string
  readonly data?: Data
}

export type SystemError = Failure<
  'rpc.unavailable' | 'rpc.method_not_found' | 'rpc.invalid_input' | 'rpc.invalid_output' | 'rpc.internal',
  never
>

export type ErrorName<M extends Method> = M extends {
  readonly errors: infer Errors extends ErrorMap
}
  ? Exclude<keyof Errors & string, `rpc.${string}`>
  : never
export type HandlerErrorFor<M extends Method, Name extends ErrorName<M>> = Simplify<
  {
    readonly type: Name
    readonly message: string
    readonly [HandlerErrorTypeId]: true
  } & ErrorData<HandlerOutput<ErrorSchema<M, Name>>>
>
export type HandlerError<M extends Method> = {
  readonly [Name in ErrorName<M>]: HandlerErrorFor<M, Name>
}[ErrorName<M>]
export type MethodErrorFor<M extends Method, Name extends ErrorName<M>> = Simplify<
  {
    readonly type: Name
    readonly message: string
  } & ErrorData<Output<ErrorSchema<M, Name>>>
>
export type MethodError<M extends Method> = {
  readonly [Name in ErrorName<M>]: MethodErrorFor<M, Name>
}[ErrorName<M>]
export type ErrorArguments<M extends Method, Name extends ErrorName<M>> = [
  type: Name,
  message: string,
  ...data: ErrorDataArguments<HandlerOutput<ErrorSchema<M, Name>>>,
]
export type ErrorFactory<M extends Method> = <Name extends ErrorName<M>>(
  ...args: ErrorArguments<M, Name>
) => HandlerErrorFor<M, Name>

export type EventInputData<S extends EventValueSchema> = HandlerOutput<S>
export type EventData<S extends EventValueSchema> = Output<S>

/** Keeps the event name correlated with its payload even when callers use unions. */
export type EventInput<D extends Definition> = {
  [Name in keyof D['events'] & string]: [name: Name, data: EventInputData<D['events'][Name]['schema']>]
}[keyof D['events'] & string]

type PayloadBase = {
  readonly id: string
  readonly type: string
  readonly created: number
  readonly data: unknown
  readonly location?: Ref
  readonly metadata?: Record<string, unknown>
}

type EventPayloadFor<D extends Definition, Name extends keyof D['events'] & string> = Omit<
  PayloadBase,
  'type' | 'data' | 'location'
> & {
  readonly type: `rpc.${D['id']}.${Name}`
  readonly data: EventData<D['events'][Name]['schema']>
  readonly location: Ref
}

export type EventPayload<D extends Definition, Name extends keyof D['events'] & string = keyof D['events'] & string> = {
  readonly [K in Name]: EventPayloadFor<D, K>
}[Name]

export interface RpcCallContext<M extends Method> {
  readonly signal: AbortSignal
  readonly error: ErrorFactory<M>
}

export type RpcHandlers<D extends PortableDefinition> = {
  readonly [Name in keyof D['methods']]: (
    input: Output<D['methods'][Name]['input']>,
    context: RpcCallContext<D['methods'][Name]>,
  ) => Promise<HandlerOutput<D['methods'][Name]['output']> | HandlerError<D['methods'][Name]>>
}

export interface RpcRegistration<D extends PortableDefinition> extends Registration {
  readonly events: {
    readonly emit: (...args: EventInput<D>) => Promise<void>
  }
}

export interface RpcDomain extends RpcApi<
  Pick<RpcCallOptions, 'signal'> & {readonly location?: never; readonly headers?: never}
> {
  readonly register: <const D extends PortableDefinition>(
    definition: D,
    handlers: RpcHandlers<NoInfer<D>>,
  ) => Promise<RpcRegistration<D>>
}

type RpcEvent = {
  id: string
  created: number
  metadata?: Record<string, unknown> | undefined
  type: `rpc.${string}`
  location: PublicRef
  data: Record<string, unknown>
}

export type RpcCallOptions = RequestOptions

export type RpcArguments<Input, Options> = unknown extends Input
  ? [input: Input, options?: Options]
  : undefined extends Input
    ? [input?: Input, options?: Options]
    : [input: Input, options?: Options]

export type RpcClient<D extends PortableDefinition, Options = RpcCallOptions> = {
  readonly [Name in keyof D['methods']]: (
    ...args: RpcArguments<Input<D['methods'][Name]['input']>, Options>
  ) => Promise<Output<D['methods'][Name]['output']>>
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

type RpcEventPayloadFor<D extends PortableDefinition, Name extends keyof D['events'] & string> = Omit<
  RpcEvent,
  'type' | 'data'
> & {
  type: `rpc.${D['id']}.${Name}`
  data: EventData<D['events'][Name]['schema']>
}

export type RpcEventPayload<
  D extends PortableDefinition,
  Name extends keyof D['events'] & string = keyof D['events'] & string,
> = {[K in Name]: RpcEventPayloadFor<D, K>}[Name]

export interface RpcApi<Options = RpcCallOptions> {
  <D extends PortableDefinition>(definition: D): RpcClient<D, Options>
}
