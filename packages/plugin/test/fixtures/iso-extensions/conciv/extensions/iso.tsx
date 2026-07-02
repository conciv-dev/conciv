import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const tool = defineTool({name: 'iso_tool', description: 'd', inputSchema: z.object({})}).server(() => ({ok: true}))

const iso = defineExtension({name: 'iso', Component: Surface, tools: [tool]}).client(() => {
  throw new Error('client factory ran on the server')
})
export default iso

function Surface() {
  return <div>{document.title}</div>
}
