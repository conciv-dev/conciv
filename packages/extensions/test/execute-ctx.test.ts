import {z} from 'zod'
import {describe, expect, it} from 'vitest'
import {defineTool} from '../src/contract.js'
import {wrapToolDefinition} from '../src/discovery.js'

describe('execute ctx', () => {
  it('forwards {sessionId, previewId} to a tool execute', async () => {
    let seen: {sessionId: string; previewId: string} | null = null
    const tool = defineTool({
      name: 't',
      label: 'T',
      description: 'd',
      parameters: z.object({}),
      execute: async (_input, ctx) => {
        seen = ctx ?? null
        return 'ok'
      },
    })
    const wire = wrapToolDefinition(tool)
    await wire.execute({}, {sessionId: 's1', previewId: 'p1'})
    expect(seen).toEqual({sessionId: 's1', previewId: 'p1'})
  })
})
