import {describe, expect, it} from 'vitest'
import {concivTools} from '../src/tools.js'

describe('conciv_page tool', () => {
  it('forwards the verb+args to ctx.page and returns its result', async () => {
    const calls: unknown[] = []
    const tools = concivTools({
      capabilities: () => [{name: 'page.tree', summary: 'walk the live React tree', category: 'react'}],
      askUi: async () => ({answered: false, note: ''}),
      page: async (name, input) => (calls.push([name, input]), {ok: true}),
      open: async () => ({ok: true}),
    })
    const page = tools.find((t) => t.name === 'conciv_page')
    if (!page) throw new Error('conciv_page tool missing')
    const result = await page.execute({verb: 'tree', ref: 'main'})
    expect(calls[0]).toEqual(['page.tree', {ref: 'main'}])
    expect(result).toMatchObject({ok: true})
  })
})
