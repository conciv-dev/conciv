import {z} from 'zod'
import {EventType, StreamProcessor, type StreamChunk} from '@tanstack/ai'

const MessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.string(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).default([]),
  })
  .loose()

const SnapshotSchema = z.object({type: z.literal(EventType.MESSAGES_SNAPSHOT), messages: z.array(MessageSchema)})

type SnapshotMessage = z.infer<typeof MessageSchema>
export type SnapshotView = z.infer<typeof SnapshotSchema>

function textOf(message: SnapshotMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content ?? '')
    .join(' ')
}

export function asSnapshot(chunk: StreamChunk): SnapshotView {
  const parsed = SnapshotSchema.safeParse(chunk)
  if (!parsed.success) throw new Error(`expected a MESSAGES_SNAPSHOT chunk, got ${chunk.type}`)
  return parsed.data
}

export function firstSnapshot(chunks: StreamChunk[]): SnapshotView {
  const found = chunks.find((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
  if (!found) throw new Error('no MESSAGES_SNAPSHOT was published')
  return asSnapshot(found)
}

export function lastSnapshot(chunks: StreamChunk[]): SnapshotView {
  const found = chunks.findLast((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
  if (!found) throw new Error('no MESSAGES_SNAPSHOT was published')
  return asSnapshot(found)
}

export function userTexts(snapshot: SnapshotView): string[] {
  return snapshot.messages.filter((message) => message.role === 'user').map(textOf)
}

export function userMessageIds(snapshot: SnapshotView): Array<string | undefined> {
  return snapshot.messages.filter((message) => message.role === 'user').map((message) => message.id)
}

export function assistantTexts(snapshot: SnapshotView): string[] {
  return snapshot.messages.filter((message) => message.role === 'assistant').map(textOf)
}

export function partTypes(snapshot: SnapshotView): string[] {
  return snapshot.messages.flatMap((message) => message.parts.map((part) => part.type))
}

function rendered(chunks: StreamChunk[]): SnapshotMessage[] {
  const processor = new StreamProcessor({})
  for (const chunk of chunks) processor.processChunk(chunk)
  return z.array(MessageSchema).parse(processor.getMessages())
}

export function reconstructSnapshot(chunks: StreamChunk[]): SnapshotView {
  return {type: EventType.MESSAGES_SNAPSHOT, messages: rendered(chunks)}
}

export function reconstructTranscript(chunks: StreamChunk[]): string[] {
  return rendered(chunks).map((message) => `${message.role}: ${textOf(message)}`)
}

export function reconstructUserTexts(chunks: StreamChunk[]): string[] {
  return rendered(chunks)
    .filter((message) => message.role === 'user')
    .map(textOf)
}
