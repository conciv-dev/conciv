import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extension'

// Isolation fixture: the Component touches a browser global and .client() throws — both would blow up
// if the server load (jiti) executed them. The server only drains .server()/tools, so the load must
// succeed and collect iso_tool regardless.
const tool = defineTool({name: 'iso_tool', description: 'd', inputSchema: z.object({})}).server(() => ({ok: true}))

const iso = defineExtension({name: 'iso', Component: Surface, tools: [tool]}).client(() => {
  throw new Error('client factory ran on the server')
})
export default iso

function Surface() {
  return <div>{document.title}</div>
}
