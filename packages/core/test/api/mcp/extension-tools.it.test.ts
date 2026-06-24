import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool, collectServerContributions} from '@mandarax/extension'
import {startTestServer} from '../../helpers/server.js'

// A real extension's .server() tool, drained by collectServerContributions, must register on the real
// /api/mcp alongside the built-ins and round-trip a call. No mocks — the production app + a real MCP
// client over http. Proves the full new-contract server path end to end.
const draw = defineTool({
  name: 'acme_draw',
  description: 'Draw a shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
}).server((input) => ({drawn: input.shape}))

const acme = defineExtension({name: 'acme', tools: [draw]})

describe('/api/mcp extension tools', () => {
  it('registers a collected extension tool and round-trips a call', async () => {
    const contributions = collectServerContributions([acme])
    const {base, close} = await startTestServer({extensionTools: contributions.tools})
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['acme_draw', 'mandarax_ui']))
      const drawTool = tools.find((t) => t.name === 'acme_draw')
      if (!drawTool?.execute) throw new Error('acme_draw not registered on /api/mcp')
      const result = await drawTool.execute({shape: 'square'})
      expect(JSON.stringify(result)).toContain('square')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)

  it('mandarax_extensions scaffolds + validates on the new contract over /api/mcp', async () => {
    const {base, close} = await startTestServer()
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      const ext = tools.find((t) => t.name === 'mandarax_extensions')
      if (!ext?.execute) throw new Error('mandarax_extensions not registered on /api/mcp')

      const full = JSON.stringify(await ext.execute({verb: 'scaffold', kind: 'full', name: 'demo'}))
      expect(full).toContain('defineExtension({name:')
      expect(full).toContain('useSlot')
      expect(full).toContain('.client(')

      const catalog = JSON.stringify(await ext.execute({verb: 'catalog'}))
      for (const slot of ['header', 'footer', 'composer', 'empty', 'status', 'widget']) expect(catalog).toContain(slot)

      const bad = JSON.stringify(
        await ext.execute({
          verb: 'validate',
          source: "export default defineExtension({name: 'x', theme: {'pw-nope': 'red'}})",
        }),
      )
      expect(bad).toContain('pw-nope')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
