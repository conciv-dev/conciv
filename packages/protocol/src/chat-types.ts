// Chat contracts for the devgent chat agent. The streaming protocol + message model are
// TanStack AI's own types (AG-UI `StreamChunk`, `UIMessage`) — we do NOT invent a wire
// format: the backend emits TanStack `StreamChunk`s via `toServerSentEventsStream` and the
// widget consumes them with `fetchServerSentEvents` natively. Only the request/session
// envelopes below are ours.
export type {StreamChunk, UIMessage, MessagePart} from '@tanstack/ai'

// POST /__pw/chat body (what the widget's fetchServerSentEvents transport sends).
export type ChatRequest = {messages: unknown[]; sessionId?: string}

// GET /__pw/chat/session response.
export type ChatSession = {
  sessionId: string | null
  source: 'agent' | 'chat' | 'new'
  cwd: string
  lock: {held: boolean; role: 'iterate' | 'chat' | null}
}
