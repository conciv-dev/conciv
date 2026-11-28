import {Option, Schema} from 'effect'

const decode = Schema.decodeUnknownOption(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    _tag: Schema.optional(Schema.String),
    message: Schema.optional(Schema.String),
    code: Schema.optional(Schema.Union([Schema.String, Schema.Number])),
    errno: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Unknown),
  }),
)

export function from(error: unknown) {
  const errors: {type: string; message?: string; code?: string | number; errno?: number}[] = []
  const seen = new Set<unknown>()
  let current = error
  while (current && !seen.has(current) && errors.length < 8) {
    seen.add(current)
    const result = decode(current)
    if (Option.isNone(result)) break
    errors.push({
      type: result.value._tag ?? (current instanceof Error ? current.name : result.value.name) ?? 'unknown',
      message: result.value.message || undefined,
      code: result.value.code,
      errno: result.value.errno,
    })
    current = current instanceof Error ? current.cause : result.value.cause
  }
  return errors
}
