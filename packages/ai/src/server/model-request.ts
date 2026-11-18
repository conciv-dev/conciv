import {convertSchemaToJsonSchema} from '@tanstack/ai'
import {isEqual, keyBy} from 'es-toolkit'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'

export type RequestTool = {description: string; input: Record<string, unknown>}

export type ModelRequest = {
  system: string[]
  messages: ModelMessage[]
  options: Record<string, unknown>
  tools: Record<string, RequestTool>
}

export type ModelRequestDraft = Omit<ModelRequest, 'tools'> & {tools: ChatTool[]}

export type RequestHook = (request: ModelRequest, signal: AbortSignal) => Promise<ModelRequest>

function inputSchema(tool: ChatTool): Record<string, unknown> {
  return {...(convertSchemaToJsonSchema(tool.inputSchema) ?? {type: 'object', properties: {}})}
}

function hookedTool(tool: ChatTool, name: string, definition: RequestTool, given: RequestTool | undefined): ChatTool {
  const unchanged = given !== undefined && isEqual(definition.input, given.input)
  return {
    ...tool,
    name,
    description: definition.description,
    ...(unchanged ? {} : {inputSchema: definition.input}),
  }
}

async function hookedOrStopped(
  hook: RequestHook,
  request: ModelRequest,
  signal: AbortSignal,
): Promise<ModelRequest | null> {
  try {
    return await hook(request, signal)
  } catch (error) {
    if (signal.aborted) return null
    throw error
  }
}

export async function hookedRequest(
  hook: RequestHook,
  draft: ModelRequestDraft,
  signal: AbortSignal,
): Promise<Omit<ModelRequest, 'tools'> & {tools: ChatTool[]}> {
  const offered = draft.tools.map((tool) => {
    const input = inputSchema(tool)
    return {
      tool,
      definition: {description: tool.description, input},
      given: {description: tool.description, input: structuredClone(input)},
    }
  })
  const byDefinition = new Map(offered.map((entry) => [entry.definition, entry]))
  const byName = keyBy(offered, (entry) => entry.tool.name)
  const shaped = await hookedOrStopped(
    hook,
    {
      system: draft.system,
      messages: draft.messages,
      options: draft.options,
      tools: Object.fromEntries(offered.map((entry) => [entry.tool.name, entry.definition])),
    },
    signal,
  )
  if (shaped === null) return draft
  const tools = Object.entries(shaped.tools).flatMap(([name, definition]) => {
    const entry = byDefinition.get(definition) ?? byName[name]
    return entry === undefined ? [] : [hookedTool(entry.tool, name, definition, entry.given)]
  })
  return {system: shaped.system, messages: shaped.messages, options: shaped.options, tools}
}
