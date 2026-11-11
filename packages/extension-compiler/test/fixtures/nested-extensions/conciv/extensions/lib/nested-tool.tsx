import {z} from 'zod'
import {defineTool} from '@conciv/extension'

function card() {
  const title = document.title
  return {render: () => <span>{title}</span>, hasEmbeddedBody: () => false}
}

export const nestedTool = defineTool({name: 'nested_tool', description: 'd', inputSchema: z.object({})})
  .render(card())
  .server(() => ({ok: true}))
