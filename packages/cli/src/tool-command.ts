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
})

const DeclaredInput = z.object({
  properties: z.record(z.string(), DeclaredField).default({}),
  required: z.array(z.string()).default([]),
})

type ToolField = {name: string; required: boolean; field: z.infer<typeof DeclaredField>}

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

function toolInput(tool: ToolDeclaration, raw: unknown): Record<string, unknown> {
  const parsed = tool.inputSchema.safeParse(supplied(raw))
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
    run: ({args}) => options.run(toolInput(tool, args)),
  })
}

export type WireToolSignature = {name: string; summary: string; positional?: string; inputSchema: unknown}

function wireFields(signature: WireToolSignature): ToolField[] {
  const declared = DeclaredInput.parse(signature.inputSchema ?? {})
  const required = new Set(declared.required)
  return Object.entries(declared.properties).map(([name, field]) => ({name, required: required.has(name), field}))
}

function castWireValue(field: z.infer<typeof DeclaredField>, value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (field.type === 'number' || field.type === 'integer') {
    const numeric = Number(value)
    return Number.isNaN(numeric) ? value : numeric
  }
  return value
}

function wireInput(fields: ToolField[], raw: unknown): Record<string, unknown> {
  const known = new Map(fields.map((field) => [field.name, field.field]))
  return Object.fromEntries(
    Object.entries(supplied(raw))
      .filter(([name]) => known.has(name))
      .map(([name, value]) => {
        const field = known.get(name)
        return [name, field === undefined ? value : castWireValue(field, value)]
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
    run: ({args}) => options.run(wireInput(fields, args)),
  })
}
