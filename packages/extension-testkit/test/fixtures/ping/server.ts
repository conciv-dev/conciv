import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const echo = defineTool({
  name: 'ping.echo',
  description: 'Echo the given text back.',
  inputSchema: z.object({text: z.string()}),
}).server((input) => ({echo: input.text}))

const flood = defineTool({
  name: 'ping.flood',
  description: 'Return a payload far past the MCP display cap.',
  inputSchema: z.object({}),
}).server(() => ({payload: 'x'.repeat(120_000)}))

const ping = defineExtension({name: 'ping', tools: [echo, flood]})

export default ping
