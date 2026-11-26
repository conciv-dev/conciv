import {z} from 'zod'
import {TypeTable, type TypeNode} from 'fumadocs-ui/components/type-table'
import {ConcivConfigSchema} from '@conciv/types/config-types'

type Schema = z.core.JSONSchema._JSONSchema

const DEFAULT_PATTERN = /\s*Default: (.+)\.$/

function wrapUnion(schema: Schema) {
  const written = writeType(schema)
  return written.includes(' | ') ? `(${written})` : written
}

function writeObject(schema: z.core.JSONSchema.JSONSchema) {
  const required = schema.required ?? []
  const keys = Object.keys(schema.properties ?? {})
  if (keys.length > 0) return `{${keys.map((key) => (required.includes(key) ? key : `${key}?`)).join(', ')}}`
  if (schema.additionalProperties && schema.additionalProperties !== true) {
    return `Record<string, ${writeType(schema.additionalProperties)}>`
  }
  return 'object'
}

function writeArray(schema: z.core.JSONSchema.JSONSchema) {
  if (schema.prefixItems) return `[${schema.prefixItems.map(writeType).join(', ')}]`
  if (schema.items && !Array.isArray(schema.items)) return `${wrapUnion(schema.items)}[]`
  return 'array'
}

function writeType(schema: Schema): string {
  if (typeof schema === 'boolean') return 'JSON'
  const options = schema.anyOf ?? schema.oneOf
  if (options) return options.map(writeType).join(' | ')
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (schema.type === 'object') return writeObject(schema)
  if (schema.type === 'array') return writeArray(schema)
  if (typeof schema.type === 'string') return schema.type
  return 'JSON'
}

function readOption(schema: Schema): TypeNode {
  const text = typeof schema === 'boolean' ? '' : (schema.description ?? '')
  const found = DEFAULT_PATTERN.exec(text)
  return {
    type: writeType(schema),
    description: text.replace(DEFAULT_PATTERN, ''),
    default: found?.[1],
  }
}

export function ConfigOptions() {
  const schema = z.toJSONSchema(ConcivConfigSchema, {io: 'input', unrepresentable: 'any'})
  const options = Object.entries(schema.properties ?? {}).map(([name, option]): [string, TypeNode] => [
    name,
    readOption(option),
  ])
  return <TypeTable type={Object.fromEntries(options)} />
}
