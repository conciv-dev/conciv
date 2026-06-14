import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/tools.js'

describe('aidx_page tool', () => {
  it('forwards the verb+args to ctx.page and returns its result', async () => {
    const calls: unknown[] = []
    const tools = aidxTools({
      injectUi: () => true,
      page: async (q) => (calls.push(q), {ok: true}),
      test: async () => ({}),
    })
    const page = tools.find((t) => t.name === 'aidx_page')
    if (!page) throw new Error('aidx_page tool missing')
    const result = await page.run({verb: 'tree', ref: 'main'})
    expect(calls[0]).toMatchObject({kind: 'tree', ref: 'main'})
    expect(result).toMatchObject({ok: true})
  })
})
