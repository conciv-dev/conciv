import {Option, Schema, SchemaGetter} from 'effect'

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
