import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import {defineExtension, defineTool} from '@mandarax/extension'
import {startTestServer} from './helpers/server.js'

// G1: a per-request {sessionId, previewId} must reach an extension tool's execute. The MCP server is
// built per request, the session rides the MANDARAX_SESSION_HEADER, and previewId comes from core
// config — so a session-scoped tool (canvas.draw, comments) resolves the room the widget joined.
const echo = defineTool({
  name: 'acme_echo_session',
  description: 'Echo the request session + preview back',
  inputSchema: z.object({}),
}).server((_input, _ctx, request) => ({sessionId: request.sessionId, previewId: request.previewId}))

const acme = defineExtension({name: 'acme', tools: [echo]})

describe('/api/mcp threads the request session into extension tool execute', () => {
  it('echoes the header session id and the config previewId', async () => {
    const server = await startTestServer({extensions: [acme]})
    const mcp = await createMCPClient({
      transport: {type: 'http', url: `${server.base}/api/mcp`, headers: {[MANDARAX_SESSION_HEADER]: 'mandarax_x'}},
    })
    try {
      const echoTool = (await mcp.tools()).find((tool) => tool.name === 'acme_echo_session')
      if (!echoTool?.execute) throw new Error('acme_echo_session not registered on /api/mcp')
      const result = JSON.stringify(await echoTool.execute({}))
      expect(result).toContain('mandarax_x')
      expect(result).toContain(server.previewId)
    } finally {
      await mcp.close()
      await server.close()
    }
  }, 30_000)
})
