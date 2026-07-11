import {EventType, type StreamChunk} from '@tanstack/ai'
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

export function lastSnapshotMessages(all: StreamChunk[]): unknown[] {
  const snapshot = all.findLast((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
  if (!snapshot || snapshot.type !== EventType.MESSAGES_SNAPSHOT) return []
  return Array.isArray(snapshot.messages) ? snapshot.messages : []
}

function partsOf(all: StreamChunk[], role?: string): unknown[] {
  return lastSnapshotMessages(all).flatMap((message) => {
    const parsed = MessageSchema.safeParse(message)
    if (!parsed.success) return []
    if (role !== undefined && parsed.data.role !== role) return []
    return parsed.data.parts
  })
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
