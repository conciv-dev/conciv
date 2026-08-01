import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from './helpers/boot.js'

const echo = defineTool({
  name: 'acme_echo_session',
  description: 'Echo the request session back',
  inputSchema: z.object({}),
}).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

const acme = defineExtension({name: 'acme', tools: [echo]})

describe('/api/mcp threads the request session into extension tool execute', () => {
  it('echoes the header session id', async () => {
    const server = await bootKit({extensions: [acme]})
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${server.base}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: 'conciv_x'}},
    })
    try {
      await mcp.callTool('conciv_discover_tools', {names: ['acme_echo_session']})
      const echoTool = (await mcp.tools()).find((tool) => tool.name === 'acme_echo_session')
      if (!echoTool?.execute) throw new Error('acme_echo_session not registered on /api/mcp')
      const result = JSON.stringify(await echoTool.execute({}))
      expect(result).toContain('conciv_x')
    } finally {
      await mcp.close()
      await server.cleanup()
    }
  }, 30_000)
})
