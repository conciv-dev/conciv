import type {Db} from 'jazz-tools/backend'
import type {ToolRequest} from '@mandarax/extension'

export type WhiteboardToolContext = {
  cwd: string
  db: Db
  room: (request: ToolRequest) => string
}
