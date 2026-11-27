import {z} from 'zod'
import {TypeTable, type TypeNode} from 'fumadocs-ui/components/type-table'
import {ConcivConfigSchema} from '@conciv/types/config-types'
import {TestRunnerConfigSchema} from '@conciv/plugin-test-runner/config'

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

function readDefault(name: string, schema: Schema, text: string): string | undefined {
  const written = DEFAULT_PATTERN.exec(text)?.[1]
  if (typeof schema === 'boolean' || schema.default === undefined) return written
  if (written === undefined)
    throw new Error(`the config option ${name} has a default but no "Default: X." in its description`)
  return JSON.stringify(schema.default)
}

function readOption(name: string, schema: Schema): TypeNode {
  const text = typeof schema === 'boolean' ? '' : (schema.description ?? '')
  return {
    type: writeType(schema),
    description: text.replace(DEFAULT_PATTERN, ''),
    default: readDefault(name, schema, text),
  }
}

function SchemaOptions(props: {schema: z.ZodObject}) {
  const schema = z.toJSONSchema(props.schema, {io: 'input', unrepresentable: 'any'})
  const options = Object.entries(schema.properties ?? {}).map(([name, option]): [string, TypeNode] => [
    name,
    readOption(name, option),
  ])
  return <TypeTable type={Object.fromEntries(options)} />
}

export function ConfigOptions() {
  return <SchemaOptions schema={ConcivConfigSchema} />
}

export function TestRunnerOptions() {
  return <SchemaOptions schema={TestRunnerConfigSchema} />
}
