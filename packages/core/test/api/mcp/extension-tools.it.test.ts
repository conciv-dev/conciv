import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'
import {connectMcpClient} from '../../helpers/mcp-client.js'

const draw = defineTool({
  name: 'acme_draw',
  description: 'Draw a shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
  outputSchema: z.object({drawn: z.string()}),
  meta: {summary: 'draw a shape on the canvas', category: 'fixture', mutating: false},
}).server((input) => ({drawn: input.shape}))

const acme = defineExtension({name: 'acme', tools: [draw]})

async function execute(base: string, typescriptCode: string): Promise<unknown> {
  const mcp = await connectMcpClient(`${base}/api/mcp`)
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
    const raw = await tool.execute({typescriptCode})
    const parsed = z
      .object({result: z.unknown()})
      .loose()
      .parse(JSON.parse(z.string().parse(raw)))
    return parsed.result
  } finally {
    await mcp.close()
  }
}

describe('/api/mcp extension tools through the sandbox', () => {
  it('discovers an extension tool through discover_tools and calls it in the same round trip', async () => {
    const kit = await bootKit({extensions: [acme]})
    const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
    try {
      const discover = (await mcp.tools()).find((entry) => entry.name === 'discover_tools')
      expect(JSON.stringify(await discover?.execute({toolNames: ['acme_draw']}))).toContain('acme_draw')
      const drawn = await execute(kit.base, "return await external_acme_draw({shape: 'square'})")
      expect(JSON.stringify(drawn)).toContain('square')
    } finally {
      await mcp.close()
      await kit.cleanup()
    }
  }, 30_000)

  it('keeps the extension-authoring capability reachable through the sandbox', async () => {
    const kit = await bootKit()
    try {
      const result = await execute(kit.base, "return await external_conciv_extensions({verb: 'catalog'})")
      const json = JSON.stringify(result)
      expect(json).toContain('chat-accent')
      expect(json).toContain('clientSurfaces')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
