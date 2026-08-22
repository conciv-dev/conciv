import {z} from 'zod'
import type {ToolRequest} from '@conciv/extension'
import type {SandboxTool} from '@conciv/extension/registry'
import type {ScopedToolCall} from '../runtime/scope-types.js'
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
  approval?: 'ask'
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

export function registryCapabilities(tools: readonly SandboxTool[], call: ScopedToolCall): CodeCapability[] {
  return tools.map((tool) => {
    const errors = tool.errors.map(({code, message}) => ({code, message}))
    return {
      name: tool.name,
      description: tool.hint === undefined ? tool.summary : `${tool.summary}. ${tool.hint}`,
      summary: tool.summary,
      category: tool.category ?? 'other',
      ...(tool.approval === undefined ? {} : {approval: tool.approval}),
      mutating: tool.mutating,
      reachable: tool.reachable,
      errors,
      inputSchema: tool.schema,
      execute: (input, request) => call(tool.name, input, request),
      signature: () => ({
        input: resolveSchemaRefs(tool.inputSchema),
        output: resolveSchemaRefs(tool.outputSchema),
        errors,
      }),
    }
  })
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
