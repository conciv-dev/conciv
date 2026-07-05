import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool, imageResult} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'

const PNG_RED_4x4 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

const snap = defineTool({
  name: 'probe_snap',
  description: 'returns a png',
  inputSchema: z.object({}),
}).server(() => imageResult('image/png', PNG_RED_4x4, {width: 4}))

const probe = defineExtension({name: 'image-probe', tools: [snap]})

describe('/api/mcp image results', () => {
  it('returns an image content block for an imageResult tool', async () => {
    const kit = await bootKit({extensions: [probe]})
    const {base, cleanup: close} = kit
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'probe_snap')
      if (!tool?.execute) throw new Error('probe_snap not registered on /api/mcp')
      const result = await tool.execute({})
      expect(result).toEqual([
        {type: 'image', source: {type: 'data', value: PNG_RED_4x4, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({width: 4})},
      ])
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
