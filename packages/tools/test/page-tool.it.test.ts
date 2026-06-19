import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_page tool', () => {
  it('forwards the verb+args to ctx.page and returns its result', async () => {
    const calls: unknown[] = []
    const tools = mandaraxTools({
      injectUi: () => true,
      page: async (q) => (calls.push(q), {ok: true}),
      test: async () => ({}),
      open: () => {},
    })
    const page = tools.find((t) => t.name === 'mandarax_page')
    if (!page) throw new Error('mandarax_page tool missing')
    const result = await page.execute({verb: 'tree', ref: 'main'})
    expect(calls[0]).toMatchObject({kind: 'tree', ref: 'main'})
    expect(result).toMatchObject({ok: true})
  })
})
