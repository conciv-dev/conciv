import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {collectServerContributions} from '../src/collect-server.js'

const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({x: z.number()})}).server((i) => i.x)

describe('collectServerContributions', () => {
  it('drains top-level tools, .server() systemPrompt', () => {
    const ext = defineExtension({name: 'canvas', systemPrompt: 'top', tools: [draw]}).server(() => ({
      systemPrompt: 'srv',
    }))
    const out = collectServerContributions([ext])
    expect(out.tools?.map((t) => t.name)).toEqual(['draw'])
    expect(out.systemPrompt).toContain('top')
    expect(out.systemPrompt).toContain('srv')
  })

  it('throws on a tool name collision across extensions', () => {
    const a = defineExtension({name: 'a', tools: [draw]})
    const b = defineExtension({name: 'b', tools: [draw]})
    expect(() => collectServerContributions([a, b])).toThrow(/collision/)
  })

  it('produces an executable server tool from .server(execute)', async () => {
    const ext = defineExtension({name: 'canvas', tools: [draw]})
    const tool = collectServerContributions([ext]).tools?.[0]
    expect(await tool?.execute({x: 41})).toBe(41)
  })

  it('skips a tool with no server execute', () => {
    const bare = defineTool({name: 'bare', description: 'd', inputSchema: z.object({})})
    expect(collectServerContributions([defineExtension({name: 'x', tools: [bare]})]).tools).toEqual([])
  })
})
