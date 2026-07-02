import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const hello = defineTool({
  name: 'acme_hello',
  description: 'Return a friendly greeting for a name',
  inputSchema: z.object({name: z.string()}),
}).server(({name}) => ({greeting: `Hello, ${name}!`}))

const blue = defineExtension({
  name: 'blue',
  Component: BlueSurface,
  systemPrompt: 'This app is themed blue. Greet users with the acme_hello tool.',
  theme: {'pw-accent': 'rgb(37, 99, 235)'},
  tools: [hello],
})
export default blue

function BlueSurface() {
  const slot = blue.useSlot()
  if (slot() === 'status') return <span>Blue theme active</span>
  return null
}
