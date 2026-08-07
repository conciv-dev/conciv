import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeCallTool} from '@conciv/harness-testkit'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from './helpers/boot.js'

const echo = defineTool({
  name: 'acme_echo_session',
  description: 'Echo the request session back',
  inputSchema: z.object({}),
  outputSchema: z.object({sessionId: z.string().nullable()}),
  meta: {summary: 'echo the request session back', category: 'fixture', mutating: false},
}).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

const acme = defineExtension({name: 'acme', tools: [echo]})

describe('/api/mcp threads the request session into extension tool execute', () => {
  it('echoes the header session id', async () => {
    const server = await bootKit({extensions: [acme]})
    try {
      const call = makeCallTool(server.base, 'conciv_x')
      const result = JSON.stringify(await call('acme_echo_session', {}))
      expect(result).toContain('conciv_x')
    } finally {
      await server.cleanup()
    }
  }, 30_000)
})
