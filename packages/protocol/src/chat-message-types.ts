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
