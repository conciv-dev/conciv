export * as Rpc from './rpc.js'
export {define} from '../schema/rpc.js'
export type {Definition, EventPayload, Failure} from '../schema/rpc.js'

import type {RpcClient, RpcDomain, RpcHandlers} from '../plugin/effect/rpc.js'
import type {Rpc} from '../schema/rpc.js'
import {Event} from '../schema/event.js'
import type {Tool} from '../schema/tool.js'
import type {StandardSchemaV1} from '@standard-schema/spec'
import {Context, Deferred, Effect, JsonSchema, Layer, Schema, SchemaRepresentation, Stream} from 'effect'
import {Bus} from './bus.js'
import {Location} from './location.js'
import {optional, statics} from './schema.js'

export interface Interface {
  readonly register: RpcDomain['register']
  readonly client: <D extends Rpc.Definition>(definition: D) => RpcClient<D, Rpc.SystemError, never, unknown>
  readonly call: (rpcId: string, method: string, input: unknown) => Effect.Effect<unknown, Rpc.Failure>
  readonly close: Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@opencode/Rpc')

const DeclaredError = Schema.TaggedStruct('Rpc.DeclaredError', {
  type: Schema.String,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
})
type DeclaredError = typeof DeclaredError.Type & globalThis.Error

const makeDeclaredError = (type: string, message: string, data?: unknown): DeclaredError =>
  Object.assign(new globalThis.Error(message), DeclaredError.make({type, message, data}))

const isDeclaredError = (error: unknown): error is DeclaredError =>
  error instanceof globalThis.Error && Schema.is(DeclaredError)(error)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const location = yield* Location.Service
    const ref = Location.Ref.make({directory: location.directory, workspaceId: location.workspaceId})
    const closed = yield* Deferred.make<void>()
    const callContext = {
      error: (type: string, message: string, data?: unknown) => makeDeclaredError(type, message, data),
    }
    const registrations = new Map<
      string,
      Array<{
        readonly definition: Rpc.Definition
        readonly handlers: Readonly<Record<string, Function>>
      }>
    >()
    const definitions = new WeakMap<
      Rpc.Definition,
      ReadonlyMap<string, {readonly event: Rpc.EventDefinition; readonly definition: Event.Definition}>
    >()
    const eventsFor = (definition: Rpc.Definition) => {
      const existing = definitions.get(definition)
      if (existing) return existing
      const events = new Map(
        Object.entries(definition.events).map(([name, event]) => [
          name,
          {event, definition: eventDefinition(eventType(definition, name))},
        ]),
      )
      definitions.set(definition, events)
      return events
    }

    const register = Effect.fn('Rpc.register')(function* <const D extends Rpc.Definition>(
      definition: D,
      handlers: RpcHandlers<NoInfer<D>>,
    ) {
      const entry = {definition, handlers}
      const dispose = Effect.sync(() => {
        const remaining = (registrations.get(definition.id) ?? []).filter((candidate) => candidate !== entry)
        if (remaining.length === 0) {
          registrations.delete(definition.id)
          return
        }
        registrations.set(definition.id, remaining)
      })
      yield* Effect.acquireRelease(
        Effect.sync(() => registrations.set(definition.id, [...(registrations.get(definition.id) ?? []), entry])),
        () => dispose,
      )

      const events = eventsFor(definition)
      return {
        dispose,
        events: {
          emit: Effect.fn('Rpc.emit')(function* (...args: Rpc.EventInput<D>) {
            const registered = events.get(args[0])
            if (!registered) return yield* Effect.fail(new Error(`Unknown RPC event: ${definition.id}.${args[0]}`))
            const event = registered.event
            const data = (yield* encode(event.schema, args[1])) as Readonly<Record<string, unknown>>
            return yield* bus
              .publish(registered.definition, data, {
                location: ref,
              })
              .pipe(Effect.asVoid)
          }),
        },
      }
    })

    const call = Effect.fn('Rpc.call')(function* (rpcId: string, name: string, input: unknown) {
      if (yield* Deferred.isDone(closed))
        return yield* Effect.fail(failure('rpc.unavailable', `RPC is unavailable: ${rpcId}`))
      const entry = registrations.get(rpcId)?.at(-1)
      if (!entry) return yield* Effect.fail(failure('rpc.unavailable', `RPC is unavailable: ${rpcId}`))
      const method = entry.definition.methods[name]
      const handler = entry.handlers[name]
      if (!Object.hasOwn(entry.definition.methods, name) || !Object.hasOwn(entry.handlers, name) || !method || !handler)
        return yield* Effect.fail(failure('rpc.method_not_found', `Unknown RPC method: ${rpcId}.${name}`))
      const parsed = yield* parse(method.input, input).pipe(
        Effect.mapError((error) => failure('rpc.invalid_input', errorMessage(error, 'Invalid RPC input'))),
      )
      const result = yield* Effect.suspend(() => {
        const execution: Effect.Effect<unknown, unknown> = handler(parsed, callContext)
        return execution
      }).pipe(
        Effect.catch((error) => encodeError(method, error)),
        Effect.catchDefect((defect) =>
          Effect.logError('rpc handler failed', {rpc: rpcId, method: name, defect}).pipe(
            Effect.andThen(Effect.fail(failure('rpc.internal', 'RPC call failed'))),
          ),
        ),
        Effect.raceFirst(
          Deferred.await(closed).pipe(
            Effect.andThen(Effect.fail(failure('rpc.unavailable', `RPC is unavailable: ${rpcId}`))),
          ),
        ),
      )
      return yield* encode(method.output, result).pipe(
        Effect.mapError((error) => failure('rpc.invalid_output', errorMessage(error, 'Invalid RPC output'))),
      )
    })

    const client = <D extends Rpc.Definition>(definition: D): RpcClient<D, Rpc.SystemError, never, unknown> => {
      const events = eventsFor(definition)
      const methods = Object.fromEntries(
        Object.entries(definition.methods).map(([name, method]) => [
          name,
          (input: unknown) =>
            call(definition.id, name, input).pipe(
              Effect.catch((error) => decodeError(method, error)),
              Effect.flatMap((value) => read(method.output, value).pipe(Effect.catch((cause) => Effect.die(cause)))),
            ),
        ]),
      )
      return {
        ...methods,
        events: {
          subscribe: <Name extends keyof D['events'] & string>(name: Name) => {
            const registered = events.get(name)
            if (!registered) return Stream.fail(new Error(`Unknown RPC event: ${definition.id}.${name}`))
            return bus.subscribe(registered.definition).pipe(
              Stream.provideService(Location.Service, location),
              Stream.mapEffect((payload) => logicalEvent(definition, name, payload, ref)),
            )
          },
        },
      } as RpcClient<D, Rpc.SystemError, never, unknown>
    }

    return Service.of({register, call, client, close: Deferred.succeed(closed, undefined).pipe(Effect.asVoid)})
  }),
)

const fields = {
  id: Event.Id,
  created: Schema.Finite,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
  location: optional(Location.Ref),
}
const EventData = Schema.Record(Schema.String, Schema.Unknown)
const jsonSchemas = new WeakMap<JsonSchema.JsonSchema, Schema.Codec<unknown>>()

function eventType<const D extends Rpc.Definition, const Name extends keyof D['events'] & string>(
  definition: D,
  name: Name,
): `rpc.${D['id']}.${Name}` {
  return `rpc.${definition.id}.${name}`
}

export function eventDefinition(type: `rpc.${string}`): Event.Definition & Schema.Codec<unknown, unknown> {
  const data = EventData
  return Schema.Struct({...fields, type: Schema.Literal(type), data}).pipe(
    statics(() => ({type, durability: 'ephemeral' as const, durable: undefined, data})),
  ) satisfies Event.EphemeralDefinition<string, typeof data>
}

function parse(schema: Tool.ValueSchema, value: unknown): Effect.Effect<unknown, unknown> {
  if (Schema.isSchema(schema)) return Schema.decodeUnknownEffect(schema)(value)
  if (isStandardSchema(schema)) {
    return Effect.gen(function* () {
      const parsed = yield* Effect.try({try: () => schema['~standard'].validate(value), catch: (cause) => cause})
      const result =
        parsed instanceof Promise ? yield* Effect.tryPromise({try: () => parsed, catch: (cause) => cause}) : parsed
      if (result.issues) return yield* Effect.fail(new Error(result.issues.map((issue) => issue.message).join('\n')))
      return result.value
    })
  }
  return Effect.try({
    try: () => {
      const existing = jsonSchemas.get(schema)
      if (existing) return existing
      const codec = Schema.make<Schema.Codec<unknown>>(
        SchemaRepresentation.fromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(schema)).ast,
      )
      jsonSchemas.set(schema, codec)
      return codec
    },
    catch: (cause) => cause,
  }).pipe(Effect.flatMap((codec) => Schema.decodeUnknownEffect(codec)(value)))
}

function encode(schema: Tool.ValueSchema, value: unknown): Effect.Effect<unknown, unknown> {
  return Schema.isSchema(schema) ? Schema.encodeUnknownEffect(schema)(value) : parse(schema, value)
}

function encodeError(method: Rpc.Method, error: unknown): Effect.Effect<never, Rpc.Failure> {
  if (!isDeclaredError(error)) return Effect.die(error)
  const schema = method.errors?.[error.type]
  if (!method.errors || !Object.hasOwn(method.errors, error.type) || !schema) {
    return Effect.die(new Error(`Undeclared RPC error: ${error.type}`))
  }
  return encode(schema, error.data).pipe(
    Effect.catch((cause) => Effect.die(cause)),
    Effect.flatMap((data) => Effect.fail(failure(error.type, error.message, data))),
  )
}

function decodeError(method: Rpc.Method, error: Rpc.Failure): Effect.Effect<never, Rpc.Failure> {
  const schema = method.errors?.[error.type]
  if (!method.errors || !Object.hasOwn(method.errors, error.type) || !schema) return Effect.fail(error)
  return read(schema, error.data).pipe(
    Effect.catch((cause) => Effect.die(cause)),
    Effect.flatMap((data) => Effect.fail(failure(error.type, error.message, data))),
  )
}

function failure(type: string, message: string, data?: unknown): Rpc.Failure {
  return data === undefined ? {type, message} : {type, message, data}
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function isStandardSchema(schema: Tool.ValueSchema): schema is Extract<Tool.ValueSchema, StandardSchemaV1> {
  return '~standard' in schema
}

function read(schema: Tool.ValueSchema, value: unknown): Effect.Effect<unknown, unknown> {
  return Schema.isSchema(schema) ? Schema.decodeUnknownEffect(schema)(value) : Effect.succeed(value)
}

const logicalEvent = Effect.fn('Rpc.logicalEvent')(function* <
  D extends Rpc.Definition,
  Name extends keyof D['events'] & string,
>(
  definition: D,
  name: Name,
  payload: Event.Payload,
  ref: Location.Ref,
): Effect.fn.Return<Rpc.EventPayload<D, Name>, unknown> {
  const event = definition.events[name]
  if (!event) return yield* Effect.fail(new Error(`Unknown RPC event: ${definition.id}.${name}`))
  const data = yield* read(event.schema, payload.data)
  return {
    ...payload,
    type: eventType(definition, name),
    data,
    location: ref,
  } as Rpc.EventPayload<D, Name>
})
