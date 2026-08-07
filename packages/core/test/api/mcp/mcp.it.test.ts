import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool} from '@conciv/extension'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {requireClaude} from '../../helpers/adapters.js'

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
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
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
  it('lists exactly one tool whatever the registry holds', async () => {
    const kit = await bootKit({extensions: [acme]})
    const mcp = await createMCPClient({transport: {type: 'http', url: `${kit.base}/api/mcp`}})
    try {
      expect((await mcp.tools()).map((tool) => tool.name)).toEqual(['execute_typescript'])
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

  it('exposes the identical single-tool shape on more than one harness', async () => {
    const codex = getHarness('codex')
    if (!codex) throw new Error('codex adapter not registered')
    for (const harness of [requireClaude(), codex]) {
      const kit = await bootKit({extensions: [acme]}, createTestHarness(harness))
      const mcp = await createMCPClient({transport: {type: 'http', url: `${kit.base}/api/mcp`}})
      try {
        expect((await mcp.tools()).map((tool) => tool.name)).toEqual(['execute_typescript'])
      } finally {
        await mcp.close()
        await kit.cleanup()
      }
    }
  }, 60_000)

  it('never enumerates capabilities in the tool description beyond a bounded category sample', async () => {
    const kit = await bootKit({extensions: [acme]})
    const mcp = await createMCPClient({transport: {type: 'http', url: `${kit.base}/api/mcp`}})
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      expect(tool?.description).toBeDefined()
      expect(tool?.description).not.toContain('acme_draw')
      expect(tool?.description).not.toContain('page.snapshot')
      expect(tool?.description).toContain('catalog')
    } finally {
      await mcp.close()
      await kit.cleanup()
    }
  }, 30_000)
})
