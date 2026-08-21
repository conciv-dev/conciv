import {z} from 'zod'
import {defineExtension, defineTool, getExtensionApi} from '@conciv/extension'

const BLUE_NAME = 'blue'
const BLUE_ACCENT_ENABLED = import.meta.env.VITE_CONCIV_DEMO_BLUE_ACCENT === '1'

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
  theme: BLUE_ACCENT_ENABLED ? {'pw-accent': 'rgb(37, 99, 235)'} : {},
  tools: [hello],
})
export default blue

function BlueSurface() {
  const slot = getExtensionApi(BLUE_NAME).useSlot()
  if (slot === 'status' && BLUE_ACCENT_ENABLED) return <span>Blue theme active</span>
  return null
}
