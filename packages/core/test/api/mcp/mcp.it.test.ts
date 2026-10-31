import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {requireClaude} from '../../helpers/adapters.js'
import {connectMcpClient} from '@conciv/harness-testkit'

const draw = defineTool({
  name: 'acme_draw',
  description: 'Draw a shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
  outputSchema: z.object({drawn: z.string()}),
  meta: {summary: 'draw a shape on the canvas', category: 'fixture', mutating: false},
}).server((input) => ({drawn: input.shape}))

const acme = defineExtension({name: 'acme', tools: [draw]})

const ExecuteReplySchema = z.object({result: z.unknown(), logs: z.array(z.string())})

async function executeCode(base: string, typescriptCode: string): Promise<z.infer<typeof ExecuteReplySchema>> {
  const mcp = await connectMcpClient(`${base}/api/mcp`)
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
    const raw = await tool.execute({typescriptCode})
    return ExecuteReplySchema.parse(JSON.parse(z.string().parse(raw)))
  } finally {
    await mcp.close()
  }
}

describe('/api/mcp single code-mode surface', () => {
  it('lists code mode and discovery, never a capability, whatever the registry holds', async () => {
    const kit = await bootKit({extensions: [acme]})
    const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
    try {
      const names = (await mcp.tools()).map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools']))
      expect(names).not.toContain('acme_draw')
    } finally {
      await mcp.close()
      await kit.cleanup()
    }
  }, 30_000)

  it('runs a built-in through the sandbox: open reaches the editor', async () => {
    const opened: string[] = []
    const kit = await bootKit({openInEditor: (file) => opened.push(file)})
    try {
      const reply = await executeCode(kit.base, "return await external_open({file: 'src/app.ts'})")
      expect(JSON.stringify(reply.result)).toContain('src/app.ts')
      expect(opened).toEqual(['src/app.ts'])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('captures console output alongside the result', async () => {
    const kit = await bootKit()
    try {
      const reply = await executeCode(kit.base, "console.log('breadcrumb'); return 7")
      expect(reply.result).toBe(7)
      expect(reply.logs.join('\n')).toContain('breadcrumb')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('exposes the identical tool shape on more than one harness', async () => {
    const codex = getHarness('codex')
    if (!codex) throw new Error('codex adapter not registered')
    const shapes: string[][] = []
    for (const harness of [requireClaude(), codex]) {
      const kit = await bootKit({extensions: [acme]}, createTestHarness(harness))
      const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
      try {
        shapes.push((await mcp.tools()).map((tool) => tool.name))
      } finally {
        await mcp.close()
        await kit.cleanup()
      }
    }
    expect(shapes[1]).toEqual(shapes[0])
    expect(shapes[0]).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools']))
  }, 60_000)

  it('never enumerates capabilities in the tool description beyond a bounded category sample', async () => {
    const kit = await bootKit({extensions: [acme]})
    const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      expect(tool?.description).toBeDefined()
      expect(tool?.description).not.toContain('acme_draw')
      expect(tool?.description).not.toContain('page_snapshot')
      expect(tool?.description).toContain('discover_tools')
    } finally {
      await mcp.close()
      await kit.cleanup()
    }
  }, 30_000)
})
