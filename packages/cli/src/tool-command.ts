import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {z} from 'zod'
import {defineCommand, type ArgDef, type ArgsDef, type CommandDef} from 'citty'
import type {ToolMeta} from '@conciv/extension/tool'
import {userFailure} from './failure.js'

export type ToolDeclaration = {
  name: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  meta?: ToolMeta
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

type ToolField = {name: string; required: boolean; field: Field}

type ParsedArgs = {args: unknown; rawArgs: readonly string[]}

function toolFields(tool: ToolDeclaration): ToolField[] {
  const declared = DeclaredInput.parse(z.toJSONSchema(tool.inputSchema, {io: 'input'}))
  const required = new Set(declared.required)
  return Object.entries(declared.properties).map(([name, field]) => ({name, required: required.has(name), field}))
}

function toolSummary(tool: ToolDeclaration): string {
  return tool.meta?.summary ?? tool.name
}

function flagArg(entry: ToolField): ArgDef {
  const description = entry.field.description ?? entry.name
  if (entry.field.type === 'array') return {type: 'string', description: `${description} (repeat the flag for more)`}
  if (entry.field.enum) return {type: 'enum', options: entry.field.enum, description}
  if (entry.field.type === 'boolean') return {type: 'boolean', description}
  return {type: 'string', description}
}

function toolArgs(tool: ToolDeclaration, positional: string | undefined): ArgsDef {
  const args: ArgsDef = {}
  for (const entry of toolFields(tool)) {
    if (entry.name === positional) {
      args[entry.name] = {
        type: 'positional',
        required: entry.required,
        description: entry.field.description ?? entry.name,
      }
      continue
    }
    args[entry.name] = flagArg(entry)
  }
  return args
}

function toolInput(input: {tool: ToolDeclaration; parsed: ParsedArgs}): Record<string, unknown> {
  const parsed = input.tool.inputSchema.safeParse(wireInput({fields: toolFields(input.tool), parsed: input.parsed}))
  if (!parsed.success) throw userFailure(z.prettifyError(parsed.error))
  return Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined))
}

function supplied(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined))
}

export function toolCommand(
  tool: ToolDeclaration,
  options: {name: string; positional?: string; run: (input: Record<string, unknown>) => Promise<unknown> | unknown},
): CommandDef {
  return defineCommand({
    meta: {name: options.name, description: toolSummary(tool)},
    args: toolArgs(tool, options.positional),
    run: ({args, rawArgs}) => options.run(toolInput({tool, parsed: {args, rawArgs}})),
  })
}

export type WireToolSignature = {name: string; summary: string; positional?: string; inputSchema: unknown}

function wireFields(signature: WireToolSignature): ToolField[] {
  const declared = DeclaredInput.parse(signature.inputSchema ?? {})
  const required = new Set(declared.required)
  return Object.entries(declared.properties).map(([name, field]) => ({name, required: required.has(name), field}))
}

function castScalar(input: {type: string | undefined; format: string | undefined; value: unknown}): unknown {
  const {type, format, value} = input
  if (typeof value !== 'string') return value
  if (type === 'number' || type === 'integer') {
    const numeric = Number(value)
    return Number.isNaN(numeric) ? value : numeric
  }
  if (format === 'path' && existsSync(resolve(value))) return resolve(value)
  return value
}

function repeatedFlag(input: {rawArgs: readonly string[]; name: string}): string[] {
  const flag = `--${input.name}`
  const end = input.rawArgs.indexOf('--')
  const flags = end === -1 ? input.rawArgs : input.rawArgs.slice(0, end)
  return flags.flatMap((arg, index) => {
    const next = flags[index + 1]
    if (arg === flag) return next === undefined ? [] : [next]
    return arg.startsWith(`${flag}=`) ? [arg.slice(flag.length + 1)] : []
  })
}

function castValue(input: {name: string; field: Field; value: unknown; rawArgs: readonly string[]}): unknown {
  const {name, field, value, rawArgs} = input
  if (field.type !== 'array') return castScalar({type: field.type, format: field.format, value})
  const repeated = repeatedFlag({rawArgs, name})
  const values = repeated.length > 0 ? repeated : [value].flat()
  return values.map((item) => castScalar({type: field.items?.type, format: undefined, value: item}))
}

function wireInput(input: {fields: ToolField[]; parsed: ParsedArgs}): Record<string, unknown> {
  const {fields, parsed} = input
  const known = new Map(fields.map((field) => [field.name, field.field]))
  return Object.fromEntries(
    Object.entries(supplied(parsed.args)).flatMap(([name, value]) => {
      const field = known.get(name)
      if (field === undefined) return []
      return [[name, castValue({name, field, value, rawArgs: parsed.rawArgs})]]
    }),
  )
}

function wireArgs(fields: ToolField[], positional: string | undefined): ArgsDef {
  const args: ArgsDef = {}
  for (const entry of fields) {
    if (entry.name === positional) {
      args[entry.name] = {
        type: 'positional',
        required: entry.required,
        description: entry.field.description ?? entry.name,
      }
      continue
    }
    args[entry.name] = flagArg(entry)
  }
  return args
}

export function wireToolCommand(
  signature: WireToolSignature,
  options: {name: string; positional?: string; run: (input: Record<string, unknown>) => Promise<unknown> | unknown},
): CommandDef {
  const fields = wireFields(signature)
  const positional = fields.some((field) => field.name === options.positional) ? options.positional : undefined
  return defineCommand({
    meta: {name: options.name, description: signature.summary},
    args: wireArgs(fields, positional),
    run: ({args, rawArgs}) => options.run(wireInput({fields, parsed: {args, rawArgs}})),
  })
}
