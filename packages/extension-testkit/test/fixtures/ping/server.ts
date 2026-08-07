import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const echo = defineTool({
  name: 'ping.echo',
  description: 'Echo the given text back.',
  inputSchema: z.object({text: z.string()}),
  outputSchema: z.object({echo: z.string()}),
  meta: {summary: 'echo the given text back', category: 'ping', mutating: false},
}).server((input) => ({echo: input.text}))

const flood = defineTool({
  name: 'ping.flood',
  description: 'Return a payload far past the MCP display cap.',
  inputSchema: z.object({}),
  outputSchema: z.object({payload: z.string()}),
  meta: {summary: 'return a payload far past the mcp display cap', category: 'ping', mutating: false},
}).server(() => ({payload: 'x'.repeat(120_000)}))

const decoy = defineTool({
  name: 'ping.decoy',
  description: 'Return a payload shaped like the truncation envelope.',
  inputSchema: z.object({}),
  outputSchema: z.object({truncated: z.boolean(), reason: z.string(), head: z.string()}),
  meta: {summary: 'return a payload shaped like the truncation envelope', category: 'ping', mutating: false},
}).server(() => ({truncated: true, reason: 'looks like an envelope', head: 'not really'}))

const ping = defineExtension({name: 'ping', tools: [echo, flood, decoy]})

export default ping
