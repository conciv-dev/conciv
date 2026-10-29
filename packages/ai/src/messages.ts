import {
  isContentPartArray,
  modelMessagesToUIMessages,
  uiMessageToModelMessages,
  type ContentPart as LibraryContentPart,
  type MessagePart,
  type ModelMessage as LibraryModelMessage,
  type ThinkingPart as LibraryThinkingPart,
  type ToolCallPart as LibraryToolCallPart,
  type ToolCallState as LibraryToolCallState,
  type ToolResultPart as LibraryToolResultPart,
  type UIMessage,
} from '@tanstack/ai'
import type {MultimodalContent, QueuedMessage as LibraryQueuedMessage} from '@tanstack/ai-client'

export type ChatMessage = UIMessage

export type ChatPart = MessagePart

export type ToolCallPart = LibraryToolCallPart

export type ToolResultPart = LibraryToolResultPart

export type ThinkingPart = LibraryThinkingPart

export type ToolCallState = LibraryToolCallState

export type ModelMessage = LibraryModelMessage

export type ContentPart = LibraryContentPart

export type SendContent = MultimodalContent

export type QueuedMessage = LibraryQueuedMessage

export function toModelMessages(messages: readonly ChatMessage[]): ModelMessage[] {
  return messages.flatMap(uiMessageToModelMessages)
}

export function toChatMessages(messages: ModelMessage[]): ChatMessage[] {
  return modelMessagesToUIMessages(messages)
}

export function isContentParts(value: unknown): value is ContentPart[] {
  return isContentPartArray(value)
}
