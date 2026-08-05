import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool, imageResult, toolError} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'

const PNG_RED_4x4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

const snap = defineTool({
  name: 'probe_snap',
  description: 'returns a png',
  inputSchema: z.object({}),
}).server(() => imageResult('image/png', PNG_RED_4x4, {width: 4}))

const flood = defineTool({
  name: 'probe_flood',
  description: 'returns a huge string',
  inputSchema: z.object({}),
}).server(() => ({payload: 'x'.repeat(80_000)}))

const explode = defineTool({
  name: 'probe_explode',
  description: 'always fails with a declared code',
  inputSchema: z.object({}),
  errors: {PROBE_BROKE: {message: 'the probe broke'}},
}).server(() => {
  throw toolError('PROBE_BROKE', {message: 'wires crossed'})
})

const probe = defineExtension({name: 'probe', tools: [snap, flood, explode]})

type ExecuteOutcome = {ok: true; raw: unknown} | {ok: false; message: string}

async function execute(base: string, typescriptCode: string): Promise<ExecuteOutcome> {
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
    try {
      const raw: unknown = await tool.execute({typescriptCode})
      return {ok: true, raw}
    } catch (error) {
      return {ok: false, message: String(error)}
    }
  } finally {
    await mcp.close()
  }
}

describe('/api/mcp execute result mapping', () => {
  it('returns image content blocks for an imageResult capability', async () => {
    const kit = await bootKit({extensions: [probe]})
    try {
      const outcome = await execute(kit.base, 'return await external_probe_snap({})')
      if (!outcome.ok) throw new Error(outcome.message)
      expect(outcome.raw).toEqual([
        {type: 'image', source: {type: 'data', value: PNG_RED_4x4, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({width: 4})},
      ])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('marks a failed execution as an MCP error, never a success-shaped result', async () => {
    const kit = await bootKit({extensions: [probe]})
    try {
      const outcome = await execute(kit.base, "throw new Error('deliberate failure')")
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.message).toContain('deliberate failure')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('re-parses a declared error code out of the message on the MCP side', async () => {
    const kit = await bootKit({extensions: [probe]})
    try {
      const outcome = await execute(kit.base, 'return await external_probe_explode({})')
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.message).toContain('PROBE_BROKE')
      expect(outcome.message).toContain('"code":"PROBE_BROKE"')
      expect(outcome.message).toContain('wires crossed')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('caps an oversized result with a reason and never ships the full payload', async () => {
    const kit = await bootKit({extensions: [probe]})
    try {
      const outcome = await execute(kit.base, 'return await external_probe_flood({})')
      if (!outcome.ok) throw new Error(outcome.message)
      const text = z.string().parse(outcome.raw)
      expect(text.length).toBeLessThan(20_000)
      const envelope = z
        .object({truncated: z.literal(true), reason: z.string(), advice: z.string(), head: z.string()})
        .parse(JSON.parse(text))
      expect(envelope.reason).toMatch(/\d/)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
