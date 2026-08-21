import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'

const draw = defineTool({
  name: 'acme_draw',
  description: 'Draw a shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
  outputSchema: z.object({drawn: z.string()}),
  meta: {summary: 'draw a shape on the canvas', category: 'fixture', mutating: false},
}).server((input) => ({drawn: input.shape}))

const acme = defineExtension({name: 'acme', tools: [draw]})

async function execute(base: string, typescriptCode: string): Promise<unknown> {
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
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
  it('discovers an extension tool through the catalog binding and calls it in the same round trip', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const result = await execute(
        kit.base,
        `
          const found = await external_catalog({search: 'acme'})
          const entry = found.tools.find((tool) => tool.name === 'acme_draw')
          if (!entry) throw new Error('acme_draw missing from the catalog')
          const detail = await external_catalog({name: entry.name})
          const drawn = await external_acme_draw({shape: 'square'})
          return {call: entry.call, stub: detail.typeStub, drawn}
        `,
      )
      const shaped = z.object({call: z.string(), stub: z.string(), drawn: z.unknown()}).parse(result)
      expect(shaped.call).toBe('external_acme_draw')
      expect(shaped.stub).toContain('external_acme_draw')
      expect(JSON.stringify(shaped.drawn)).toContain('square')
    } finally {
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
