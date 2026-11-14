import type {StandardSchemaV1} from '@standard-schema/spec'
import {isEqual, isPlainObject, omit, uniq} from 'es-toolkit'

type Path = readonly PropertyKey[]

export type Encode<S extends StandardSchemaV1> = (
  value: StandardSchemaV1.InferOutput<S>,
) => StandardSchemaV1.InferInput<S>

function syncValidate<S extends StandardSchemaV1<unknown, object>>(name: string, schema: S) {
  return (value: unknown) => {
    const result = schema['~standard'].validate(value)

    if (result instanceof Promise) throw new TypeError(`The store ${name} has a schema that validates asynchronously`)

    return result
  }
}

export function withInitial<S extends StandardSchemaV1<unknown, object>>(
  name: string,
  schema: S,
  initial: StandardSchemaV1.InferOutput<S>,
  encode?: Encode<S>,
) {
  const validate = syncValidate(name, schema)
  const defaults = encode ? encode(initial) : initial

  return (stored: unknown): StandardSchemaV1.InferOutput<S> => {
    const merged = merge(defaults, stored)
    const result = validate(merged)

    if (!result.issues) return result.value
    const recovered = recover(merged, defaults, result.issues)

    if (recovered === undefined) return initial
    const retried = validate(recovered.value)

    return retried.issues ? initial : retried.value
  }
}

export function assertStoreDefinition<S extends StandardSchemaV1<unknown, object>>(
  name: string,
  schema: S,
  initial: StandardSchemaV1.InferOutput<S>,
  encode?: Encode<S>,
) {
  const refused = `The store ${name} is refused`
  const validate = syncValidate(name, schema)
  const read = validate(encode ? encode(initial) : initial)

  if (read.issues) throw readBackError(refused, issuePath(read.issues[0]))
  readBack(validate, read.value, refused, encode)
}

export function assertStoreWrite<S extends StandardSchemaV1<unknown, object>>(
  name: string,
  schema: S,
  value: StandardSchemaV1.InferOutput<S>,
  encode?: Encode<S>,
) {
  readBack(syncValidate(name, schema), value, `The store ${name} refused a write`, encode)
}

function readBack<S extends StandardSchemaV1<unknown, object>>(
  validate: ReturnType<typeof syncValidate<S>>,
  value: StandardSchemaV1.InferOutput<S>,
  refused: string,
  encode: Encode<S> | undefined,
) {
  const written: unknown = JSON.parse(JSON.stringify(encode ? encode(value) : value))
  const read = validate(written)

  if (read.issues) throw readBackError(refused, issuePath(read.issues[0]))

  if (!isEqual(read.value, value)) throw readBackError(refused, differingPath(value, read.value))
}

function readBackError(refused: string, path: Path) {
  const field = path.length > 0 ? path.map(String).join('.') : 'the root'

  return new Error(`${refused}: it does not read back what it writes at ${field}; a converting schema needs an encode`)
}

function differingPath(left: unknown, right: unknown): Path {
  if (!isPlainObject(left) || !isPlainObject(right)) return []
  const key = uniq([...Object.keys(left), ...Object.keys(right)]).find(
    (key) => !isEqual(ownField(left, key), ownField(right, key)),
  )

  return key === undefined ? [] : [key, ...differingPath(ownField(left, key), ownField(right, key))]
}

function merge(initial: unknown, value: unknown): unknown {
  if (value === undefined) return initial

  if (!isPlainObject(initial) || !isPlainObject(value)) return value

  return Object.fromEntries(
    uniq([...Object.keys(initial), ...Object.keys(value)]).map((key) => [
      key,
      merge(ownField(initial, key), ownField(value, key)),
    ]),
  )
}

function recover(
  value: unknown,
  initial: unknown,
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): {readonly value: unknown} | undefined {
  const paths = issues.map((issue) => recoveryPath(value, issuePath(issue)))
  const followed = paths.filter((path) => path !== undefined)

  if (followed.length < paths.length) return undefined
  const outermost = followed.filter((path) => !followed.some((other) => isAncestor(other, path)))

  return {value: outermost.reduce((recovered, path) => replaceAt(recovered, initial, path), value)}
}

function issuePath(issue: StandardSchemaV1.Issue | undefined): Path {
  return (issue?.path ?? []).map((segment) => (typeof segment === 'object' ? segment.key : segment))
}

function recoveryPath(value: unknown, path: Path): Path | undefined {
  const [key, ...rest] = path

  if (key === undefined || !isPlainObject(value)) return undefined

  if (rest.length === 0 || Array.isArray(value[key])) return [key]
  const deeper = recoveryPath(value[key], rest)

  return deeper && [key, ...deeper]
}

function isAncestor(ancestor: Path, path: Path) {
  return ancestor.length < path.length && ancestor.every((key, index) => path[index] === key)
}

function replaceAt(value: unknown, initial: unknown, path: Path): unknown {
  const [key, ...rest] = path

  if (key === undefined || !isPlainObject(value)) return value
  const defaults = isPlainObject(initial) ? ownField(initial, key) : undefined

  if (rest.length > 0) return {...value, [key]: replaceAt(value[key], defaults, rest)}

  if (defaults === undefined) return omit(value, [String(key)])

  return {...value, [key]: defaults}
}

function ownField(value: Record<PropertyKey, unknown>, key: PropertyKey) {
  return Object.hasOwn(value, key) ? value[key] : undefined
}
