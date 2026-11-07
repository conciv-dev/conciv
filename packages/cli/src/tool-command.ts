import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {z} from 'zod'
import {kebabCase} from 'es-toolkit'
import {argument, cli, command, description, multiple, name, option, schema, toggle, type Schema} from '@bomb.sh/router'
import type {ToolMeta} from '@conciv/extension/tool'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {handler} from './router/handler.js'

export type ToolDeclaration = {
  name: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  meta?: ToolMeta
}

export type WireToolSignature = {name: string; summary: string; positional?: string; inputSchema: unknown}

type ToolCommandOptions = {
  name: string
  positional?: string
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

type DeclaredEntry = {name: string; required: boolean; field: Field}

type ToolField = DeclaredEntry & {schema: Schema}

type Element = (route: never) => unknown

export function toolCommand(tool: ToolDeclaration, options: ToolCommandOptions) {
  const shape = tool.inputSchema.shape
  const fields = declaredFields(
    z.toJSONSchema(tool.inputSchema, {io: 'input'}),
    (entry) => shape[entry.name] ?? z.unknown(),
  )
  return verbCommand({
    summary: tool.meta?.summary ?? tool.name,
    fields,
    options: {
      ...options,
      run: (input) => options.run(validInput(tool, input)),
    },
  })
}

export function wireToolCommand(signature: WireToolSignature, options: ToolCommandOptions) {
  const fields = declaredFields(signature.inputSchema ?? {}, wireSchema)
  return verbCommand({summary: signature.summary, fields, options})
}

function verbCommand(input: {summary: string; fields: ToolField[]; options: ToolCommandOptions}) {
  const {summary, fields, options} = input
  const positional = fields.some((field) => field.name === options.positional) ? options.positional : undefined
  const envelope: Element[] = fields.some((field) => field.name === 'json') ? [] : [envelopeFlag]
  return command(
    name(options.name),
    description(summary),
    ...fields.map((field) => fieldElement(field, positional)),
    ...envelope,
    handler((model) => options.run(suppliedInput(fields, model))),
  )
}

function declaredFields(inputSchema: unknown, schemaOf: (entry: DeclaredEntry) => Schema): ToolField[] {
  const declared = DeclaredInput.parse(inputSchema)
  const required = new Set(declared.required)
  return Object.entries(declared.properties).map(([entry, field]) => {
    const declaredEntry = {name: entry, required: required.has(entry), field}
    return {...declaredEntry, schema: schemaOf(declaredEntry)}
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
  if (type === 'number') return z.number()
  if (type === 'integer') return z.int()
  if (format === 'path') return z.string().transform(existingPath)
  return z.string()
}

function existingPath(value: string): string {
  return existsSync(resolve(value)) ? resolve(value) : value
}

function suppliedInput(fields: ToolField[], model: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) => (model[field.name] === undefined ? [] : [[field.name, model[field.name]]])),
  )
}

function validInput(tool: ToolDeclaration, input: Record<string, unknown>): Record<string, unknown> {
  const parsed = tool.inputSchema.safeParse(input)
  if (!parsed.success) throw userFailure(z.prettifyError(parsed.error))
  return Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined))
}
