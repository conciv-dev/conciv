import type {StandardSchemaV1} from '@standard-schema/spec'
import {isPlainObject, omit, uniq} from 'es-toolkit'

type Path = readonly PropertyKey[]

export function withInitial<S extends StandardSchemaV1<unknown, object>>(
  name: string,
  schema: S,
  initial: StandardSchemaV1.InferOutput<S>,
) {
  const validate = (value: unknown) => {
    const result = schema['~standard'].validate(value)

    if (result instanceof Promise) throw new TypeError(`The store ${name} has a schema that validates asynchronously`)

    return result
  }

  return (stored: unknown): StandardSchemaV1.InferOutput<S> => {
    const merged = merge(initial, stored)
    const result = validate(merged)

    if (!result.issues) return result.value
    const recovered = recover(merged, initial, result.issues)

    if (recovered === undefined) return initial
    const retried = validate(recovered.value)

    return retried.issues ? initial : retried.value
  }
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

function issuePath(issue: StandardSchemaV1.Issue): Path {
  return (issue.path ?? []).map((segment) => (typeof segment === 'object' ? segment.key : segment))
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
