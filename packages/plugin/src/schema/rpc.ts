import type {StandardSchemaV1} from '@standard-schema/spec'
import type {PayloadBase} from './event.js'
import type {Ref} from './location.js'
import type {ValueSchema} from './tool.js'

export type ErrorMap = Readonly<Record<string, ValueSchema>> & {
  readonly [Name in `rpc.${string}`]?: never
}

export interface Method {
  readonly input: ValueSchema
  readonly output: ValueSchema
  readonly errors?: ErrorMap
}

export type PortableValueSchema = StandardSchemaV1<unknown, unknown>

export interface PortableMethod extends Method {
  readonly input: PortableValueSchema
  readonly output: PortableValueSchema
  readonly errors?: Readonly<Record<string, PortableValueSchema>> & {
    readonly [Name in `rpc.${string}`]?: never
  }
}

type EventDataObject = Readonly<Record<string, unknown>>
type EventValueSchema = StandardSchemaV1<unknown, EventDataObject>
type PortableEventValueSchema = StandardSchemaV1<unknown, EventDataObject>

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

export type Input<S extends ValueSchema> = S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : unknown

export type Output<S extends ValueSchema> = S extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<S> : unknown

export type HandlerOutput<S extends ValueSchema> = Input<S>

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

export type EventInput<D extends Definition> = {
  [Name in keyof D['events'] & string]: [name: Name, data: EventInputData<D['events'][Name]['schema']>]
}[keyof D['events'] & string]

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
