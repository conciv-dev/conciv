import {describe, it, expect} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {collectToolRenderers} from '../src/collect-client.js'

const Card = () => null
const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({})}).render(Card)

describe('collectToolRenderers', () => {
  it('returns a render entry per tool with a clientRender', () => {
    const entries = collectToolRenderers([defineExtension({name: 'canvas', tools: [draw]})])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.names).toEqual(['draw'])
    expect(entries[0]?.render).toBe(Card)
  })

  it('skips tools without a render half', () => {
    const bare = defineTool({name: 'bare', description: 'd', inputSchema: z.object({})})
    expect(collectToolRenderers([defineExtension({name: 'x', tools: [bare]})])).toHaveLength(0)
  })

  it('dedups by name across extensions, first wins', () => {
    const a = defineExtension({name: 'a', tools: [draw]})
    const b = defineExtension({name: 'b', tools: [draw]})
    expect(collectToolRenderers([a, b])).toHaveLength(1)
  })
})
