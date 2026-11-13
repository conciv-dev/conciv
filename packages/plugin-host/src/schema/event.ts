export * as Event from './event.js'

import {Schema, SchemaTransformation} from 'effect'
import {optional} from './schema.js'
import {ascending} from './identifier.js'
import {Location} from './location.js'
import {statics} from './schema.js'

export const Id = Schema.String.check(Schema.isStartingWith('evt_')).pipe(
  Schema.brand('Event.ID'),
  Schema.annotate({identifier: 'Event.ID'}),
  statics((schema) => ({create: () => schema.make('evt_' + ascending())})),
)
export type Id = typeof Id.Type

export const Seq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('Event.Seq'),
  Schema.annotate({identifier: 'Event.Seq'}),
)
export type Seq = typeof Seq.Type

export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
  Schema.brand('Event.Version'),
  Schema.annotate({identifier: 'Event.Version'}),
)
export type Version = typeof Version.Type

const DurableEnvelope = Schema.Struct({aggregateID: Schema.String, seq: Seq, version: Version})
export type DurableEnvelope = typeof DurableEnvelope.Type

export type DurableDefinition<
  Type extends string = string,
  DataSchema extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
> = Schema.Top & {
  readonly type: Type
  readonly durability: 'durable'
  readonly durable: {
    readonly version: number
    readonly aggregate: string
  }
  readonly data: DataSchema
}

export type EphemeralDefinition<
  Type extends string = string,
  DataSchema extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
> = Schema.Top & {
  readonly type: Type
  readonly durability: 'ephemeral'
  readonly durable?: never
  readonly data: DataSchema
}

export type Definition<
  Type extends string = string,
  DataSchema extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
> = DurableDefinition<Type, DataSchema> | EphemeralDefinition<Type, DataSchema>

export type Data<D extends Definition> = Schema.Schema.Type<D['data']>

type PayloadBase<D extends Definition> = {
  readonly id: Id
  readonly type: D['type']
  readonly created: number
  readonly data: Data<D>
  readonly location?: Location.Ref
  readonly metadata?: Record<string, unknown>
}

export type Payload<D extends Definition = Definition> = D extends DurableDefinition
  ? PayloadBase<D> & {readonly durable: DurableEnvelope}
  : PayloadBase<D> & {readonly durable?: never}

type Input<Type extends string, Fields extends Readonly<Record<PropertyKey, Schema.Codec<unknown, unknown>>>> = {
  readonly type: Type
  readonly identifier?: string
  readonly durable?: {
    readonly version: number
    readonly aggregate: string
  }
  readonly schema: Fields
}

export function durable<
  const Type extends string,
  const Fields extends Readonly<Record<PropertyKey, Schema.Codec<unknown, unknown>>>,
>(input: Input<Type, Fields> & {readonly durable: NonNullable<Input<Type, Fields>['durable']>}) {
  const data = Schema.Struct(input.schema)
  const durable = Schema.Struct({
    aggregateID: DurableEnvelope.fields.aggregateID,
    seq: DurableEnvelope.fields.seq,
    version: Schema.Literal(input.durable.version).pipe(
      Schema.decodeTo(
        Schema.toType(Version),
        SchemaTransformation.transform({
          decode: () => Version.make(input.durable.version),
          encode: () => input.durable.version,
        }),
      ),
    ),
  })
  return Schema.Struct({
    id: Id,
    created: Schema.Finite,
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    type: Schema.Literal(input.type),
    durable,
    location: optional(Location.Ref),
    data,
  })
    .annotate({identifier: input.identifier ?? input.type})
    .pipe(
      statics(() => ({
        type: input.type,
        durability: 'durable' as const,
        durable: input.durable,
        data,
      })),
    ) satisfies DurableDefinition<Type, typeof data>
}

export function ephemeral<
  const Type extends string,
  const Fields extends Readonly<Record<PropertyKey, Schema.Codec<unknown, unknown>>>,
>(input: Omit<Input<Type, Fields>, 'durable'>) {
  const data = Schema.Struct(input.schema)
  return Schema.Struct({
    id: Id,
    created: Schema.Finite,
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    type: Schema.Literal(input.type),
    location: optional(Location.Ref),
    data,
  })
    .annotate({identifier: input.identifier ?? input.type})
    .pipe(
      statics(() => ({
        type: input.type,
        durability: 'ephemeral' as const,
        durable: undefined,
        data,
      })),
    ) satisfies EphemeralDefinition<Type, typeof data>
}

export function versionedType(type: string, version: number) {
  return `${type}.${version}`
}
