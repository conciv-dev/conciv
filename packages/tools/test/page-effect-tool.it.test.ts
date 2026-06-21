import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_page_effect tool', () => {
  it('forwards effect+action to ctx.page as the effect verb', async () => {
    const calls: unknown[] = []
    const tools = mandaraxTools({
      injectUi: () => true,
      page: async (q) => (calls.push(q), {effect: 'highlight', enabled: true}),
      test: async () => ({}),
      open: () => {},
    })
    const tool = tools.find((t) => t.name === 'mandarax_page_effect')
    if (!tool) throw new Error('mandarax_page_effect tool missing')
    const result = await tool.execute({effect: 'highlight', action: 'enable'})
    expect(calls[0]).toMatchObject({kind: 'effect', effect: 'highlight', action: 'enable'})
    expect(result).toMatchObject({enabled: true})
  })
})
