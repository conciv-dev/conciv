import {z} from 'zod'

const JsonSchemaShape = z.object({
  properties: z.record(z.string(), z.object({type: z.string().optional()}).loose()).optional(),
  required: z.array(z.string()).optional(),
})

export type SchemaField = {name: string; type: string; required: boolean}

export function schemaFields(schema: unknown): SchemaField[] {
  const parsed = JsonSchemaShape.safeParse(schema)
  if (!parsed.success) return []
  const properties = parsed.data.properties ?? {}
  const required = new Set(parsed.data.required ?? [])
  const names = Object.keys(properties)
  const ordered = [...names.filter((name) => required.has(name)), ...names.filter((name) => !required.has(name))]
  return ordered.map((name) => ({name, type: properties[name]?.type ?? 'unknown', required: required.has(name)}))
}

export function schemaParams(schema: unknown): string {
  return schemaFields(schema)
    .map((field) => `${field.name}${field.required ? '' : '?'}: ${field.type}`)
    .join(' · ')
}
