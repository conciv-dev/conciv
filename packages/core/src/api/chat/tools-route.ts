import type {H3} from 'h3'
import type {ChatTool, ChatTools} from '@conciv/protocol/chat-types'

export function registerToolsRoute(app: H3, tools: ChatTool[]): void {
  app.get('/api/chat/tools', (): ChatTools => ({tools}))
}
