import type {ToolRequest} from '@conciv/extension'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {Store} from './db/store.js'

export type WhiteboardToolContext = {
  cwd: string
  store: Store
  sessionId: (request: ToolRequest) => SessionId
  room: (request: ToolRequest) => SessionId
  model: (request: ToolRequest) => string | null
}
