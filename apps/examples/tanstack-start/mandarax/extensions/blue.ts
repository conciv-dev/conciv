import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

// A file-based mandarax extension: discovered from mandarax/extensions/, applied to the live widget
// (client) and the agent engine (server) with no manual wiring.
export default defineExtension({id: 'blue'})
  .client((mx) => {
    mx.ui.setTheme({'pw-accent': 'rgb(37, 99, 235)'})
  })
  .server((mx) => {
    mx.systemPrompt.append('This app is themed blue. Greet users with the acme_hello tool.')
    mx.registerTool(
      defineTool({
        name: 'acme_hello',
        description: 'Return a friendly greeting for a name',
        inputSchema: z.object({name: z.string()}),
        execute: ({name}) => ({greeting: `Hello, ${name}!`}),
      }),
    )
  })
