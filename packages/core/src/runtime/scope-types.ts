import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ChatHistoryWindow, ChatHydration, EngineStaleness} from '@conciv/contract'
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type SessionStream = {
  publish: (chunk: ChatEvent) => void
  listen: (onChunk: (chunk: ChatEvent) => void) => () => void
  events: (signal: AbortSignal) => AsyncGenerator<ChatEvent>
}

export type SessionAsks = {
  ui: () => Promise<UiAnswer>
}

export type SessionHistory = {
  messages: () => Promise<ChatMessage[]>
  hydrate: (window?: ChatHistoryWindow) => Promise<ChatHydration>
}

export type SessionRun = {
  stop: (runIds?: readonly string[]) => Promise<{ok: true; stopped: boolean}>
  compact: () => Promise<void>
  live: () => Promise<boolean>
  record: (chunks: readonly ChatEvent[]) => Promise<void>
}

export type SessionScope = {
  readonly id: SessionId
  stream: SessionStream
  asks: SessionAsks
  history: SessionHistory
  run: SessionRun
}

export type EngineScope = {
  staleness: () => Promise<EngineStaleness>
}

export type CoreRuntime = {
  forSession: (id: SessionId) => SessionScope
  engine: EngineScope
}
