import {z} from 'zod'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ConcivServerTool} from '@conciv/tools'
import {resolveSchemaRefs} from './resolve-schema-refs.js'

export type CapabilitySignature = {
  input: unknown
  output: unknown
  errors: {code: string; message: string}[]
}

export type CodeCapability = {
  name: string
  description: string
  summary: string
  category: string
  mutating: boolean
  reachable: boolean
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
  signature: () => CapabilitySignature
}

function firstSentence(text: string): string {
  const period = text.indexOf('. ')
  const cut = period === -1 ? text.indexOf('\n') : period + 1
  return (cut === -1 ? text : text.slice(0, cut)).trim()
}

export function registryCapabilities(registry: ToolRegistry): CodeCapability[] {
  return registry.sandboxTools().map((tool) => ({
    name: tool.name,
    description: tool.hint === undefined ? tool.summary : `${tool.summary}. ${tool.hint}`,
    summary: tool.summary,
    category: tool.category ?? 'other',
    mutating: tool.mutating,
    reachable: tool.reachable,
    inputSchema: tool.schema,
    execute: tool.run,
    signature: () => ({
      input: resolveSchemaRefs(tool.input),
      output: resolveSchemaRefs(tool.output),
      errors: tool.errors.map(({code, message}) => ({code, message})),
    }),
  }))
}

export function extensionCapabilities(tools: ExtensionServerTool[]): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    summary: firstSentence(tool.description),
    category: 'extension',
    mutating: tool.mutating,
    reachable: true,
    inputSchema: tool.inputSchema,
    execute: tool.execute,
    signature: () => ({
      input: resolveSchemaRefs(z.toJSONSchema(tool.inputSchema, {io: 'input'})),
      output: undefined,
      errors: [],
    }),
  }))
}

export function assistCapabilities(tools: ConcivServerTool[]): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    summary: firstSentence(tool.description),
    category: 'assist',
    mutating: false,
    reachable: true,
    inputSchema: tool.inputSchema,
    execute: (input) => tool.execute(input),
    signature: () => ({
      input: resolveSchemaRefs(z.toJSONSchema(tool.inputSchema, {io: 'input'})),
      output: undefined,
      errors: [],
    }),
  }))
}
