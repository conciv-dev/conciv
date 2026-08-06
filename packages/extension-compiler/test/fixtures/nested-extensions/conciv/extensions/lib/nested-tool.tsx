import {z} from 'zod'
import {defineTool} from '@conciv/extension'

function cardLabel() {
  return document.title
}

export const nestedTool = defineTool({name: 'nested_tool', description: 'd', inputSchema: z.object({})})
  .render(cardLabel())
  .server(() => ({ok: true}))
