import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from './helpers/boot.js'
import {riskyMatches} from '../src/chat/gate.js'

function makeAcme() {
  const executed: string[] = []
  const draw = defineTool({
    name: 'acme_draw',
    description: 'Draw a shape on the canvas.',
    inputSchema: z.object({shape: z.string()}),
  }).server((input) => {
    executed.push('acme_draw')
    return {drawn: input.shape}
  })
  const remove = defineTool({
    name: 'acme_delete',
    description: 'Delete a shape from the canvas.',
    inputSchema: z.object({id: z.string()}),
    approval: 'ask',
  }).server((input) => {
    executed.push('acme_delete')
    return {deleted: input.id}
  })
  return {extension: defineExtension({name: 'acme', tools: [draw, remove]}), executed}
}

function mcpFor(base: string, sessionId?: string) {
  const headers = sessionId ? {'conciv-session-id': sessionId} : undefined
  return createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`, headers}})
}

describe('/api/mcp lazy discovery', () => {
  it('hides extension tools until discovered, then lists and runs them per session', async () => {
    const {extension, executed} = makeAcme()
    const kit = await bootKit({extensions: [extension]})
    const {base, cleanup: close} = kit
    const alice = 'conciv_alice'
    const bob = 'conciv_bob'
    const mcpAlice = await mcpFor(base, alice)
    const mcpBob = await mcpFor(base, bob)
    try {
      const initial = (await mcpAlice.tools()).map((tool) => tool.name)
      expect(initial).toEqual(expect.arrayContaining(['conciv_ui', 'conciv_discover_tools']))
      expect(initial).not.toContain('acme_draw')
      expect(initial).not.toContain('acme_delete')

      const discovery = await mcpAlice.callTool('conciv_discover_tools', {names: ['acme_draw', 'nope']})
      const discoveryText = JSON.stringify(discovery)
      expect(discoveryText).toContain('Draw a shape on the canvas.')
      expect(discoveryText).toContain('shape')
      expect(discoveryText).toContain('nope')
      expect(executed).toEqual([])

      const afterDiscovery = (await mcpAlice.tools()).map((tool) => tool.name)
      expect(afterDiscovery).toContain('acme_draw')

      const drawTool = (await mcpAlice.tools()).find((tool) => tool.name === 'acme_draw')
      if (!drawTool?.execute) throw new Error('acme_draw not callable after discovery')
      const result = await drawTool.execute({shape: 'square'})
      expect(JSON.stringify(result)).toContain('square')
      expect(executed).toEqual(['acme_draw'])

      const bobTools = (await mcpBob.tools()).map((tool) => tool.name)
      expect(bobTools).not.toContain('acme_draw')
    } finally {
      await mcpAlice.close()
      await mcpBob.close()
      await close()
    }
  }, 30_000)

  it('registers a discovered approval:ask tool under its bare name that the risky set still matches', async () => {
    const {extension, executed} = makeAcme()
    const kit = await bootKit({extensions: [extension]})
    const {base, cleanup: close} = kit
    const mcp = await mcpFor(base, 'conciv_carol')
    try {
      await mcp.callTool('conciv_discover_tools', {names: ['acme_delete']})
      expect(executed).toEqual([])

      const listed = (await mcp.tools()).find((tool) => tool.name === 'acme_delete')
      expect(listed?.name).toBe('acme_delete')

      const risky = new Set(
        [extension]
          .flatMap((ext) => ext.tools ?? [])
          .filter((tool) => tool.approval === 'ask')
          .map((tool) => tool.name),
      )
      expect(riskyMatches(risky, `mcp__conciv__${listed?.name}`)).toBe(true)
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
