import type {Db} from 'jazz-tools/backend'
import type {ToolRequest} from '@mandarax/extension'

export type WhiteboardToolContext = {
  cwd: string
  db: Db
  sessionId: (request: ToolRequest) => string
  room: (request: ToolRequest) => string
  model: (request: ToolRequest) => string | null
}
