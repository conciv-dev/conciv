import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'

const draw = defineTool({
  name: 'canvas_svg',
  description: 'Draw an svg shape on the canvas',
  inputSchema: z.object({shape: z.string()}),
  outputSchema: z.object({drawn: z.string()}),
  meta: {summary: 'draw an svg shape on the canvas', category: 'fixture', mutating: false},
}).server((input) => ({drawn: input.shape}))

const acme = defineExtension({name: 'acme', tools: [draw]})

async function executeRaw(base: string, session: string, typescriptCode: string): Promise<unknown> {
  const mcp = await createMCPClient({
    transport: {type: 'http', url: `${base}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: session}},
  })
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
    return await tool.execute({typescriptCode})
  } finally {
    await mcp.close()
  }
}

function toolCallStarts(chunks: StreamChunk[]): {toolCallId: string; name: string; parent?: string}[] {
  return chunks.flatMap((chunk) => {
    if (chunk.type !== EventType.TOOL_CALL_START) return []
    const name = chunk.toolCallName ?? chunk.toolName
    if (typeof name !== 'string') return []
    const meta = z
      .object({parentToolCallId: z.string().optional()})
      .loose()
      .safeParse(chunk.metadata ?? {})
    return [{toolCallId: chunk.toolCallId, name, parent: meta.success ? meta.data.parentToolCallId : undefined}]
  })
}

describe('/api/mcp sandbox calls render as nested action cards on the session stream', () => {
  it('publishes the execute call and its capability calls, nested by parent id', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const session = await kit.session()
      const stream = await kit.attach(session)
      await executeRaw(kit.base, session, "return await external_canvas_svg({shape: 'circle'})")
      const childStart = await stream.waitFor(
        (chunk) => toolCallStarts([chunk]).some((call) => call.name === 'canvas_svg'),
        {hangGuardMs: 10_000},
      )
      const child = toolCallStarts([childStart])[0]
      if (!child) throw new Error('no canvas_svg tool call on the stream')
      expect(child.parent).toBeDefined()
      const parentStart = await stream.waitFor(
        (chunk) => toolCallStarts([chunk]).some((call) => call.name === 'execute_typescript'),
        {hangGuardMs: 10_000},
      )
      const parent = toolCallStarts([parentStart])[0]
      expect(parent?.toolCallId).toBe(child.parent)
      const childResult = await stream.waitFor(
        (chunk) => chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId === child.toolCallId,
        {hangGuardMs: 10_000},
      )
      expect(JSON.stringify(childResult)).toContain('circle')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
