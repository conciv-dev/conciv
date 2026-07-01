import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const echo = defineTool({
  name: 'ping.echo',
  description: 'Echo the given text back.',
  inputSchema: z.object({text: z.string()}),
}).server((input) => ({echo: input.text}))

const ping = defineExtension({name: 'ping', tools: [echo]})

export default ping
