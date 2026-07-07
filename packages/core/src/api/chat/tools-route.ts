import {Hono} from 'hono'
import type {ChatTool, ChatTools} from '@conciv/protocol/chat-types'

export function makeToolsRoute(tools: ChatTool[]) {
  return new Hono().get('/', (c) => {
    const payload: ChatTools = {tools}
    return c.json(payload)
  })
}
