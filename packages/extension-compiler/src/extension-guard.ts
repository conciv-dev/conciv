import type {AnyExtension} from '@conciv/extension'

export function isExtension(value: unknown): value is AnyExtension {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value)) return false
  const name = value.name
  return typeof name === 'string' && name.length > 0
}
