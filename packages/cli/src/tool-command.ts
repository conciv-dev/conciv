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

export function firstRequiredField(tool: ToolDeclaration): string | undefined {
  return toolFields(tool).find((entry) => entry.required)?.name
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
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''))
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
