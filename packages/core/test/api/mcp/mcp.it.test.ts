import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js'

describe('/api/mcp', () => {
  it('exposes mandarax_ui and round-trips a call through the real app', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(
        expect.arrayContaining(['mandarax_ui', 'mandarax_page', 'mandarax_test']),
      )
      const uiTool = tools.find((t) => t.name === 'mandarax_ui')
      if (!uiTool?.execute) throw new Error('mandarax_ui not registered on /api/mcp')
      // No active chat turn, so the inject has no stream to land on (injected:false) — but a
      // renderId in the result proves /api/mcp → mandarax_ui → buildUiSpec → uiBus ran end to end.
      const result = await uiTool.execute({kind: 'confirm', question: 'ok?'})
      expect(JSON.stringify(result)).toContain('renderId')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
