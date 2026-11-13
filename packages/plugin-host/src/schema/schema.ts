import {DateTime, Option, Schema, SchemaGetter} from 'effect'

export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

export const AbsolutePath = Schema.String.pipe(
  Schema.brand('AbsolutePath'),
  Schema.annotate({identifier: 'AbsolutePath'}),
)
export type AbsolutePath = typeof AbsolutePath.Type

export const optional = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(Schema.toType(schema)), {
      decode: SchemaGetter.passthrough({strict: false}),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
    }),
  )

export const withStatics = <S extends object, M extends Record<string, unknown>>(schema: S, methods: M): S & M =>
  Object.defineProperties(schema, Object.getOwnPropertyDescriptors(methods)) as S & M

export const statics =
  <S extends object, M extends Record<string, unknown>>(methods: (schema: S) => M) =>
  (schema: S): S & M =>
    withStatics(schema, methods(schema))

export const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
