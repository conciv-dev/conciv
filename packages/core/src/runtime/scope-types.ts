import type {StreamChunk, UIMessage} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {PageOutcome} from '@conciv/protocol/page-types'
import type {PageCaptureBundle, SessionCaptures} from '@conciv/protocol/element-capture-types'
import type {SourceLoc} from '@conciv/protocol/page-types'
import type {NavigationWrite} from '@conciv/protocol/chat-types'
import type {RawFrame} from '../editor/symbolicate.js'
import type {ChatHydration, EngineStaleness, ToolCommandSignature} from '@conciv/contract'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {ToolRequest} from '@conciv/extension'
import type {ChangeEntry} from '../page-bus.js'
import type {UiAnswer} from '@conciv/protocol/ui-types'
import type {PendingApproval} from '../chat/ask.js'

export type ToolCatalog = ToolRegistry['catalog']

export type ScopedToolCall = (name: string, input: unknown, request: ToolRequest) => Promise<unknown>

export type SessionTools = {
  call: (name: string, input: unknown, options?: {toolCallId?: string}) => Promise<unknown>
  has: (name: string) => boolean
  catalog: ToolCatalog
}

export type SessionPage = {
  ask: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>
  queries: (signal: AbortSignal) => AsyncGenerator<{requestId: string; query: unknown}>
  reply: (requestId: string, outcome: PageOutcome) => boolean
  connected: () => boolean
  changes: () => Promise<ChangeEntry[]>
  clearChanges: () => Promise<void>
}

export type SessionStream = {
  publish: (chunk: StreamChunk) => void
  listen: (onChunk: (chunk: StreamChunk) => void) => () => void
  listening: () => boolean
  events: (signal: AbortSignal) => AsyncGenerator<StreamChunk>
}

export type SessionAsks = {
  open: (key: string, approval?: PendingApproval) => void
  pending: () => string[]
  reply: (key: string, value: unknown) => boolean
  waitFor: (key: string, timeoutMs: number) => Promise<unknown>
  cancel: () => void
  noteToolCall: (toolCallId: string, toolName: string) => void
  nextUiCall: (timeoutMs: number) => Promise<string | null>
  ui: () => Promise<UiAnswer>
}

export type SessionCapturesScope = {
  list: () => Promise<SessionCaptures>
  store: (toolCallId: string, bundle: PageCaptureBundle) => Promise<void>
}

export type SessionHistory = {
  messages: () => Promise<UIMessage[]>
  hydrate: () => Promise<ChatHydration>
}

export type SessionRun = {
  stop: () => Promise<{ok: true}>
  compact: () => Promise<void>
  live: () => Promise<boolean>
}

export type SessionScope = {
  readonly id: SessionId
  readonly model: string | null
  tools: SessionTools
  page: SessionPage
  stream: SessionStream
  asks: SessionAsks
  captures: SessionCapturesScope
  history: SessionHistory
  run: SessionRun
}

export type EngineScope = {
  catalog: () => ToolCommandSignature[]
  staleness: () => EngineStaleness
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
  navigation: {
    get: () => Promise<NavigationWrite | null>
    set: (write: NavigationWrite) => Promise<{ok: true; applied: boolean}>
  }
}

export type CoreRuntime = {
  forSession: (id: SessionId) => SessionScope
  engine: EngineScope
}
