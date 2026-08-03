import {EventType, StreamProcessor, type StreamChunk} from '@tanstack/ai'
import {z} from 'zod'

export type SeenToolCall = {toolCallId: string; name: string; input: unknown}

export type RunEvents = {
  all: StreamChunk[]
  text: () => string
  toolCalls: (name?: string) => SeenToolCall[]
  errors: () => string[]
  runs: () => number
  custom: (name: string) => unknown[]
}

const MessageSchema = z.object({role: z.string(), parts: z.array(z.unknown())}).loose()
const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()
const ToolCallPartSchema = z
  .object({type: z.literal('tool-call'), id: z.string(), name: z.string(), arguments: z.string().default('')})
  .loose()

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function renderedMessages(all: StreamChunk[]): unknown[] {
  const processor = new StreamProcessor({})
  for (const chunk of all) processor.processChunk(chunk)
  return processor.getMessages()
}

function partsOf(all: StreamChunk[], role?: string): unknown[] {
  return renderedMessages(all).flatMap((message) => {
    const parsed = MessageSchema.safeParse(message)
    if (!parsed.success) return []
    if (role !== undefined && parsed.data.role !== role) return []
    return parsed.data.parts
  })
}

const ApprovalChunkSchema = z
  .object({
    type: z.literal(EventType.CUSTOM),
    name: z.literal('approval-requested'),
    value: z.object({approval: z.object({id: z.string()}).loose()}).loose(),
  })
  .loose()

export function approvalIds(chunk: StreamChunk): string[] {
  const parsed = ApprovalChunkSchema.safeParse(chunk)
  return parsed.success ? [parsed.data.value.approval.id] : []
}

export function collectToolCalls(all: StreamChunk[], name?: string): SeenToolCall[] {
  return partsOf(all)
    .flatMap((part) => {
      const parsed = ToolCallPartSchema.safeParse(part)
      return parsed.success ? [parsed.data] : []
    })
    .filter((part) => name === undefined || part.name === name)
    .map((part) => ({toolCallId: part.id, name: part.name, input: parseArgs(part.arguments)}))
}

export function snapshotText(all: StreamChunk[]): string {
  return partsOf(all, 'assistant')
    .flatMap((part) => {
      const parsed = TextPartSchema.safeParse(part)
      return parsed.success ? [parsed.data.content] : []
    })
    .join('')
}

export function makeRunEvents(all: StreamChunk[]): RunEvents {
  return {
    all,
    text: () => snapshotText(all),
    toolCalls: (name) => collectToolCalls(all, name),
    errors: () => all.flatMap((chunk) => (chunk.type === EventType.RUN_ERROR ? [chunk.message] : [])),
    runs: () => all.filter((chunk) => chunk.type === EventType.RUN_FINISHED).length,
    custom: (name) =>
      all.flatMap((chunk) => (chunk.type === EventType.CUSTOM && chunk.name === name ? [chunk.value] : [])),
  }
}
