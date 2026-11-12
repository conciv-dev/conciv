import {
  isContentPartArray,
  modelMessagesToUIMessages,
  uiMessageToModelMessages,
  type ContentPart as LibraryContentPart,
  type MessagePart,
  type ModelMessage as LibraryModelMessage,
  type ThinkingPart as LibraryThinkingPart,
  type ToolCallPart as LibraryToolCallPart,
  type ToolResultPart as LibraryToolResultPart,
  type UIMessage,
} from '@tanstack/ai'
import type {ToolCallState as LibraryToolCallState} from '@tanstack/ai/client'
import {z} from 'zod'

export {generateMessageId} from '@tanstack/ai'

export type ChatMessage = UIMessage

export type ChatPart = MessagePart

export type ToolCallPart = LibraryToolCallPart

export type ToolResultPart = LibraryToolResultPart

export type ThinkingPart = LibraryThinkingPart

export type ToolCallState = LibraryToolCallState

export type ModelMessage = LibraryModelMessage

export type ContentPart = LibraryContentPart

export type SendContent = {content: string | ContentPart[]; id?: string; metadata?: Record<string, unknown>}

export const CompactionMetadataSchema = z.object({conciv: z.object({compaction: z.literal(true)})})

export const OutsideCallMetadataSchema = z.object({
  conciv: z.object({origin: z.literal('hub'), client: z.string().nullable(), run: z.string().optional()}),
})

export type QueuedMessage = {id: string; content: string | SendContent; createdAt: number}

export function toModelMessages(messages: readonly ChatMessage[]): ModelMessage[] {
  return messages.flatMap(uiMessageToModelMessages)
}

export function toChatMessages(messages: ModelMessage[]): ChatMessage[] {
  return modelMessagesToUIMessages(messages)
}

export function isContentParts(value: unknown): value is ContentPart[] {
  return isContentPartArray(value)
}

const ImagePartSchema = z.looseObject({
  type: z.literal('image'),
  source: z.looseObject({type: z.literal('data'), value: z.string(), mimeType: z.string()}),
})

type ImagePart = z.infer<typeof ImagePartSchema>

const IMAGE_STUB = {type: 'image', sent: 'as an image block beside this text'}

export function imagesIn(value: unknown): ImagePart[] {
  const image = ImagePartSchema.safeParse(value)
  if (image.success) return [image.data]
  if (Array.isArray(value)) return value.flatMap(imagesIn)
  return isRecord(value) ? Object.values(value).flatMap(imagesIn) : []
}

export function withoutImages(value: unknown): unknown {
  if (ImagePartSchema.safeParse(value).success) return IMAGE_STUB
  if (Array.isArray(value)) return value.map(withoutImages)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withoutImages(entry)]))
}

export function imageBlocks(images: readonly ImagePart[]): {type: 'image'; data: string; mimeType: string}[] {
  return images.map(({source}) => ({type: 'image', data: source.value, mimeType: source.mimeType}))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
