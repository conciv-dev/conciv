import {Hono} from 'hono'
import type {ChatTool, ChatTools} from '@conciv/protocol/chat-types'

export type ToolsVars = {tools: {list: ChatTool[]}}

const app = new Hono<{Variables: ToolsVars}>().get('/', (c) => {
  const payload: ChatTools = {tools: c.var.tools.list}
  return c.json(payload)
})

export default app
