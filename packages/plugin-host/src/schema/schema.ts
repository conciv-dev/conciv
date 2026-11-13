import {Schema} from 'effect'

export const AbsolutePath = Schema.String.pipe(
  Schema.brand('AbsolutePath'),
  Schema.annotate({identifier: 'AbsolutePath'}),
)
export type AbsolutePath = typeof AbsolutePath.Type

export const withStatics = <S extends object, M extends Record<string, unknown>>(schema: S, methods: M): S & M =>
  Object.defineProperties(schema, Object.getOwnPropertyDescriptors(methods)) as S & M

export const statics =
  <S extends object, M extends Record<string, unknown>>(methods: (schema: S) => M) =>
  (schema: S): S & M =>
    withStatics(schema, methods(schema))
