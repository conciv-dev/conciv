import {z} from 'zod'
import {type ChatEvent, ChatEventType} from '@conciv/ai'
import {foldChatEvents} from '@conciv/ai/server-testkit'

const MessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.string(),
    parts: z.array(z.object({type: z.string(), content: z.string().optional()}).loose()).default([]),
  })
  .loose()

const SnapshotSchema = z.object({type: z.literal(ChatEventType.MESSAGES_SNAPSHOT), messages: z.array(MessageSchema)})

type SnapshotMessage = z.infer<typeof MessageSchema>
export type SnapshotView = z.infer<typeof SnapshotSchema>

function textOf(message: SnapshotMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content ?? '')
    .join(' ')
}

export function asSnapshot(chunk: ChatEvent): SnapshotView {
  const parsed = SnapshotSchema.safeParse(chunk)
  if (!parsed.success) throw new Error(`expected a MESSAGES_SNAPSHOT chunk, got ${chunk.type}`)
  return parsed.data
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

function rendered(chunks: ChatEvent[]): SnapshotMessage[] {
  return z.array(MessageSchema).parse(foldChatEvents(chunks))
}

export function reconstructSnapshot(chunks: ChatEvent[]): SnapshotView {
  return {type: ChatEventType.MESSAGES_SNAPSHOT, messages: rendered(chunks)}
}

export function reconstructTranscript(chunks: ChatEvent[]): string[] {
  return rendered(chunks).map((message) => `${message.role}: ${textOf(message)}`)
}

export function reconstructUserTexts(chunks: ChatEvent[]): string[] {
  return rendered(chunks)
    .filter((message) => message.role === 'user')
    .map(textOf)
}
