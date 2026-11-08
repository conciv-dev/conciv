import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {z} from 'zod'
import {kebabCase} from 'es-toolkit'
import {argument, cli, command, description, multiple, name, option, schema, toggle, type Schema} from '@bomb.sh/router'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {handler} from './router/handler.js'

type WireToolSignature = {summary: string; positional?: string; inputSchema: unknown}

type ToolCommandOptions = {
  name: string
  run: (input: Record<string, unknown>) => Promise<CliOutcome>
}

const DeclaredField = z.object({
  type: z.string().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
  format: z.string().optional(),
  items: z.object({type: z.string().optional()}).optional(),
})

type Field = z.infer<typeof DeclaredField>

const DeclaredInput = z.object({
  properties: z.record(z.string(), DeclaredField).default({}),
  required: z.array(z.string()).default([]),
})

const JsonObject = z.record(z.string(), z.unknown())

type DeclaredEntry = {name: string; required: boolean; field: Field}

type ToolField = DeclaredEntry & {schema: Schema}

type Element = (route: never) => unknown

export function wireToolCommand(signature: WireToolSignature, options: ToolCommandOptions) {
  const fields = declaredFields(signature.inputSchema ?? {})
  const positional = fields.some((field) => field.name === signature.positional) ? signature.positional : undefined
  const envelope: Element[] = fields.some((field) => field.name === 'json') ? [] : [envelopeFlag]
  return command(
    name(options.name),
    description(signature.summary),
    ...fields.map((field) => fieldElement(field, positional)),
    ...envelope,
    handler((model) => options.run(suppliedInput(fields, model))),
  )
}

function declaredFields(inputSchema: unknown): ToolField[] {
  const declared = DeclaredInput.parse(inputSchema)
  const required = new Set(declared.required)
  return Object.entries(declared.properties).map(([entry, field]) => {
    const declaredEntry = {name: entry, required: required.has(entry), field}
    return {...declaredEntry, schema: wireSchema(declaredEntry)}
  })
}

function fieldElement(entry: ToolField, positional: string | undefined): Element {
  const text = entry.field.description ?? entry.name
  if (entry.name === positional) return argument(name(entry.name), description(text), schema(entry.schema))
  if (entry.field.type === 'boolean') return toggle(name(entry.name), description(text))
  const spellings = cli([...new Set([`--${entry.name}`, `--${kebabCase(entry.name)}`])])
  if (entry.field.type === 'array') {
    return option(
      name(entry.name),
      spellings,
      description(`${text} (repeat the flag for more)`),
      multiple(),
      schema(entry.schema),
    )
  }
  return option(name(entry.name), spellings, description(text), schema(entry.schema))
}

function wireSchema(entry: DeclaredEntry): Schema {
  const {field} = entry
  const value = field.type === 'array' ? z.array(scalarSchema(field.items?.type, undefined)) : fieldScalar(field)
  return entry.required ? value : value.optional()
}

function fieldScalar(field: Field): z.ZodType {
  if (field.enum) return z.enum(field.enum)
  return scalarSchema(field.type, field.format)
}

function scalarSchema(type: string | undefined, format: string | undefined): z.ZodType {
  if (type === 'object') return z.string().transform(jsonObject)
  if (type === 'number') return z.number()
  if (type === 'integer') return z.int()
  if (format === 'path') return z.string().transform(existingPath)
  if (type === undefined) return z.string().transform(jsonOrRaw)
  return z.string()
}

function jsonOrRaw(value: string): unknown {
  const parsed = parsedJson(value)
  return parsed === undefined ? value : parsed
}

function jsonObject(value: string, context: z.RefinementCtx): Record<string, unknown> {
  const parsed = JsonObject.safeParse(parsedJson(value))
  if (parsed.success) return parsed.data
  context.addIssue({code: 'custom', message: `expected a JSON object, got ${value}`})
  return z.NEVER
}

function parsedJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function existingPath(value: string): string {
  return existsSync(resolve(value)) ? resolve(value) : value
}

function suppliedInput(fields: ToolField[], model: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) => (model[field.name] === undefined ? [] : [[field.name, model[field.name]]])),
  )
}
