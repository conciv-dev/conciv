import {z} from 'zod'

const JsonSchemaShape = z.object({
  properties: z.record(z.string(), z.object({type: z.string().optional()}).loose()).optional(),
  required: z.array(z.string()).optional(),
})

export function schemaParams(schema: unknown): string {
  const parsed = JsonSchemaShape.safeParse(schema)
  if (!parsed.success) return ''
  const properties = parsed.data.properties ?? {}
  const required = new Set(parsed.data.required ?? [])
  const names = Object.keys(properties)
  const ordered = [...names.filter((name) => required.has(name)), ...names.filter((name) => !required.has(name))]
  return ordered
    .map((name) => `${name}${required.has(name) ? '' : '?'}: ${properties[name]?.type ?? 'unknown'}`)
    .join(' · ')
}
