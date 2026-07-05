import type {ServerResponse} from 'node:http'
import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'

export type ChatStubMessage = {id: string; role: string; parts: Array<{type: string; content: string}>}
type ChatScript = () => AsyncGenerator<StreamChunk>
export type ChatPostBody = {
  messages?: ChatStubMessage[]
  forwardedProps?: Record<string, unknown>
  data?: Record<string, unknown>
}

type SessionState = {
  running: boolean
  settled: ChatStubMessage[]
  pendingUser: ChatStubMessage | null
  emitted: StreamChunk[]
  subscribers: Set<ServerResponse>
}

type AttachConfig = {
  runFor: (sessionId: string, body: ChatPostBody) => ChatScript | null
  seed?: (sessionId: string) => ChatStubMessage[]
}

export function parseBody(body: string): ChatPostBody {
  try {
    return JSON.parse(body) as ChatPostBody
  } catch {
    return {}
  }
}

const writeChunk = (res: ServerResponse, chunk: StreamChunk): void => {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`)
}

const lastUser = (messages: ChatStubMessage[] | undefined): ChatStubMessage | null => {
  const users = (messages ?? []).filter((message) => message.role === 'user')
  return users[users.length - 1] ?? null
}

const assistantMessages = (chunks: StreamChunk[]): ChatStubMessage[] => {
  const order: string[] = []
  const byId = new Map<string, ChatStubMessage>()
  for (const chunk of chunks) {
    if (chunk.type === EventType.TEXT_MESSAGE_START) {
      byId.set(chunk.messageId, {id: chunk.messageId, role: 'assistant', parts: [{type: 'text', content: ''}]})
      order.push(chunk.messageId)
    }
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      const part = byId.get(chunk.messageId)?.parts[0]
      if (part) part.content += chunk.delta
    }
  }
  return order.flatMap((id) => {
    const message = byId.get(id)
    return message ? [message] : []
  })
}

export function createAttachChat(config: AttachConfig): {
  postChat: (sessionId: string, body: ChatPostBody) => void
  openAttach: (sessionId: string, res: ServerResponse) => void
} {
  const sessions = new Map<string, SessionState>()

  const stateFor = (sessionId: string): SessionState => {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const created: SessionState = {
      running: false,
      settled: config.seed?.(sessionId) ?? [],
      pendingUser: null,
      emitted: [],
      subscribers: new Set(),
    }
    sessions.set(sessionId, created)
    return created
  }

  const runScript = async (sessionId: string, script: ChatScript): Promise<void> => {
    const state = stateFor(sessionId)
    state.running = true
    state.emitted = []
    for await (const chunk of script()) {
      state.emitted.push(chunk)
      for (const res of state.subscribers) writeChunk(res, chunk)
    }
    const produced = assistantMessages(state.emitted)
    const user = state.pendingUser
    state.settled = [...state.settled, ...(user ? [user] : []), ...produced]
    state.pendingUser = null
    state.running = false
    state.emitted = []
  }

  const postChat = (sessionId: string, body: ChatPostBody): void => {
    const script = config.runFor(sessionId, body)
    if (!script) return
    stateFor(sessionId).pendingUser = lastUser(body.messages)
    void runScript(sessionId, script)
  }

  const openAttach = (sessionId: string, res: ServerResponse): void => {
    const state = stateFor(sessionId)
    const pending = state.running && state.pendingUser ? [state.pendingUser] : []
    const messages = state.running ? [...state.settled, ...pending] : state.settled
    writeChunk(res, aguiSnapshotFor({generating: state.running, messages: messages as unknown as UIMessage[]}))
    for (const chunk of state.emitted) writeChunk(res, chunk)
    state.subscribers.add(res)
    res.on('close', () => state.subscribers.delete(res))
  }

  return {postChat, openAttach}
}
