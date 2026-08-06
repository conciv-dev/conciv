import {isToolError} from '@conciv/extension'
import {isPageFailure} from '@conciv/protocol/page-types'
import {badArgs, fail, failRaised} from './page-failure.js'

function isSchemaRejection(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray(Reflect.get(error, 'issues'))
}

export function rethrow(error: unknown): never {
  if (isPageFailure(error)) throw error
  if (isSchemaRejection(error)) badArgs(error.message)
  if (!isToolError(error)) fail(error instanceof Error ? error.message : String(error))
  failRaised({
    code: error.code,
    message: error.message,
    ...(isJsonSerializable(error.data) ? {data: error.data} : {}),
  })
}

export function isJsonSerializable(value: unknown): boolean {
  return isStructurallySerializable(value, new Set<object>())
}

function isSerializablePrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  return typeof value === 'number' && Number.isFinite(value)
}

function isStructurallySerializable(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value !== 'object') return isSerializablePrimitive(value)
  if (seen.has(value)) return false
  const children = transmittedValues(value)
  if (!children) return false
  seen.add(value)
  const ok = children.every((child) => isStructurallySerializable(child, seen))
  seen.delete(value)
  return ok
}

function transmittedValues(value: object): unknown[] | null {
  if (Array.isArray(value)) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  const values: unknown[] = []
  for (const key in value) values.push(Reflect.get(value, key))
  return values
}
