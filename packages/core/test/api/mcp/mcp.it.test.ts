import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js'

describe('/api/mcp', () => {
  it('exposes conciv_ui and round-trips a call through the real app', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['conciv_ui', 'conciv_page']))
      const uiTool = tools.find((t) => t.name === 'conciv_ui')
      if (!uiTool?.execute) throw new Error('conciv_ui not registered on /api/mcp')

      const result = await uiTool.execute({kind: 'confirm', question: 'ok?'})
      expect(JSON.stringify(result)).toContain('renderId')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)

  it('exposes conciv_extensions and returns the token catalog', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['conciv_extensions']))
      const extTool = tools.find((t) => t.name === 'conciv_extensions')
      if (!extTool?.execute) throw new Error('conciv_extensions not registered on /api/mcp')
      const result = await extTool.execute({verb: 'catalog'})

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
