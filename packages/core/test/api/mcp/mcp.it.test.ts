import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {bootKit} from '../../helpers/boot.js'

describe('/api/mcp', () => {
  it('exposes conciv_ui and round-trips a non-blocking call through the real app', async () => {
    const opened: string[] = []
    const kit = await bootKit({openInEditor: (file) => opened.push(file)})
    const {base, cleanup: close} = kit
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['conciv_ui', 'conciv_page', 'conciv_open']))
      const openTool = tools.find((t) => t.name === 'conciv_open')
      if (!openTool?.execute) throw new Error('conciv_open not registered on /api/mcp')

      const result = await openTool.execute({file: 'src/app.ts'})
      expect(JSON.stringify(result)).toContain('src/app.ts')
      expect(opened).toEqual(['src/app.ts'])
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)

  it('exposes conciv_extensions and returns the token catalog', async () => {
    const kit = await bootKit()
    const {base, cleanup: close} = kit
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
