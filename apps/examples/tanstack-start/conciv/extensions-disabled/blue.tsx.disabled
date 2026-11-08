import {z} from 'zod'
import {defineExtension, defineTool, getExtensionApi} from '@conciv/extension'

const BLUE_NAME = 'blue'

const hello = defineTool({
  name: 'acme_hello',
  description: 'Return a friendly greeting for a name',
  inputSchema: z.object({name: z.string()}),
  outputSchema: z.object({greeting: z.string()}),
  meta: {summary: 'return a friendly greeting for a name', category: 'acme', mutating: false},
}).server(({name}) => ({greeting: `Hello, ${name}!`}))

const blue = defineExtension({
  name: BLUE_NAME,
  Component: BlueSurface,
  systemPrompt: 'This app is themed blue. Greet users with the acme_hello tool.',
  theme: {'pw-accent': 'rgb(37, 99, 235)'},
  tools: [hello],
})
export default blue

function BlueSurface() {
  const slot = getExtensionApi(BLUE_NAME).useSlot()
  if (slot === 'status') return <span>Blue theme active</span>
  return null
}
