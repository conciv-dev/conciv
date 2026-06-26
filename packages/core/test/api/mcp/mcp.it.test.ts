import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js'

describe('/api/mcp', () => {
  it('exposes mandarax_ui and round-trips a call through the real app', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['mandarax_ui', 'mandarax_page']))
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

  it('exposes mandarax_extensions and returns the token catalog', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['mandarax_extensions']))
      const extTool = tools.find((t) => t.name === 'mandarax_extensions')
      if (!extTool?.execute) throw new Error('mandarax_extensions not registered on /api/mcp')
      const result = await extTool.execute({verb: 'catalog'})
      // Structural, not a lone substring: the real catalog shape with the brand accent token.
      const json = JSON.stringify(result)
      expect(json).toContain('pw-accent')
      expect(json).toContain('clientSurfaces')
      expect(json).toContain('serverSurfaces')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
