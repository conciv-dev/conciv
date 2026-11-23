import {randomUUID} from 'node:crypto'
import {convertSchemaToJsonSchema, EventType} from '@tanstack/ai'
import {isEqual, keyBy} from 'es-toolkit'
import {z} from 'zod'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import type {TextAdapter} from '../adapters/adapters.js'

export type RequestTool = {description: string; input: Record<string, unknown>}

const RequestResultSchema = z.object({
  summary: z.string(),
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({read: z.number(), write: z.number()}),
    })
    .optional(),
})

export type RequestResult = z.infer<typeof RequestResultSchema>

const AnsweredSchema = z.object({conciv: z.object({answer: RequestResultSchema})})

export type ModelRequest = {
  system: string[]
  messages: ModelMessage[]
  options: Record<string, unknown>
  tools: Record<string, RequestTool>
  result?: RequestResult
}

export type ModelRequestDraft = Omit<ModelRequest, 'tools' | 'result'> & {tools: ChatTool[]}

export type HookedRequest = Omit<ModelRequest, 'tools'> & {tools: ChatTool[]}

export type RequestHook = (request: ModelRequest, signal: AbortSignal) => Promise<ModelRequest>

function inputSchema(tool: ChatTool): Record<string, unknown> {
  return structuredClone(convertSchemaToJsonSchema(tool.inputSchema) ?? {type: 'object', properties: {}})
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
): Promise<HookedRequest> {
  const offered = draft.tools.map((tool) => {
    const input = inputSchema(tool)
    return {
      tool,
      definition: {description: tool.description, input},
      given: {description: tool.description, input: structuredClone(input)},
    }
  })
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
    const entry = offered.find((candidate) => candidate.definition === definition) ?? byName[name]
    return entry === undefined ? [] : [hookedTool(entry.tool, name, definition, entry.given)]
  })
  return {
    system: shaped.system,
    messages: shaped.messages,
    options: shaped.options,
    tools,
    ...(shaped.result === undefined ? {} : {result: shaped.result}),
  }
}

export function answeredMetadata(
  metadata: Record<string, unknown> | undefined,
  result: RequestResult | undefined,
): Record<string, unknown> {
  return {...metadata, conciv: result === undefined ? undefined : {answer: result}}
}

async function* answered(result: RequestResult, run: {threadId: string; runId: string}): AsyncIterable<ChatEvent> {
  const messageId = randomUUID()
  const tokens = result.tokens
  yield {type: EventType.RUN_STARTED, ...run}
  yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: result.summary}
  yield {type: EventType.TEXT_MESSAGE_END, messageId}
  yield {
    type: EventType.RUN_FINISHED,
    ...run,
    finishReason: 'stop',
    ...(tokens === undefined
      ? {}
      : {
          usage: {
            promptTokens: tokens.input,
            completionTokens: tokens.output,
            totalTokens: tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write,
            promptTokensDetails: {cachedTokens: tokens.cache.read, cacheWriteTokens: tokens.cache.write},
            completionTokensDetails: {reasoningTokens: tokens.reasoning},
          },
        }),
  }
}

export function answeredAdapter(adapter: TextAdapter): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) => {
    const given = AnsweredSchema.safeParse(options.metadata)
    if (!given.success) return adapter.chatStream(options)
    return answered(given.data.conciv.answer, {threadId: options.threadId ?? '', runId: options.runId ?? ''})
  }
  return new Proxy(adapter, {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}
