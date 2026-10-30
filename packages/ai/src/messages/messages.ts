import {
  isContentPartArray,
  modelMessagesToUIMessages,
  uiMessageToModelMessages,
  type ContentPart as LibraryContentPart,
  type ModelMessage as LibraryModelMessage,
} from '@tanstack/ai'
import type {
  MessagePart,
  MultimodalContent,
  QueuedMessage as LibraryQueuedMessage,
  ThinkingPart as LibraryThinkingPart,
  ToolCallPart as LibraryToolCallPart,
  ToolCallState as LibraryToolCallState,
  ToolResultPart as LibraryToolResultPart,
  UIMessage,
} from '@tanstack/ai-client'

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
