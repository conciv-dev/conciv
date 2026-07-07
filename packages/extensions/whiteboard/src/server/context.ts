import type {ToolRequest} from '@conciv/extension'
import type {Store} from './db/store.js'

export type WhiteboardToolContext = {
  cwd: string
  store: Store
  sessionId: (request: ToolRequest) => string
  room: (request: ToolRequest) => string
  model: (request: ToolRequest) => string | null
}
