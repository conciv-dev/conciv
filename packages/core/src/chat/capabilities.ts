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
  errors: {code: string; message: string}[]
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown, request: ToolRequest) => Promise<unknown>
  signature: () => CapabilitySignature
}

function firstSentence(text: string): string {
  const lead = text.trimStart()
  const period = lead.indexOf('. ')
  const cut = period === -1 ? lead.indexOf('\n') : period + 1
  return (cut === -1 ? lead : lead.slice(0, cut)).trim()
}

export function registryCapabilities(registry: ToolRegistry): CodeCapability[] {
  return registry.sandboxTools().map((tool) => {
    const errors = tool.errors.map(({code, message}) => ({code, message}))
    return {
      name: tool.name,
      description: tool.hint === undefined ? tool.summary : `${tool.summary}. ${tool.hint}`,
      summary: tool.summary,
      category: tool.category ?? 'other',
      mutating: tool.mutating,
      reachable: tool.reachable,
      errors,
      inputSchema: tool.schema,
      execute: tool.run,
      signature: () => ({
        input: resolveSchemaRefs(tool.input),
        output: resolveSchemaRefs(tool.output),
        errors,
      }),
    }
  })
}

export function extensionCapabilities(tools: ExtensionServerTool[]): CodeCapability[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    summary: firstSentence(tool.description),
    category: 'extension',
    mutating: tool.mutating,
    reachable: true,
    errors: tool.errors,
    inputSchema: tool.inputSchema,
    execute: tool.execute,
    signature: () => ({
      input: resolveSchemaRefs(z.toJSONSchema(tool.inputSchema, {io: 'input'})),
      output: undefined,
      errors: tool.errors,
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
    errors: [],
    inputSchema: tool.inputSchema,
    execute: (input) => tool.execute(input),
    signature: () => ({
      input: resolveSchemaRefs(z.toJSONSchema(tool.inputSchema, {io: 'input'})),
      output: undefined,
      errors: [],
    }),
  }))
}
