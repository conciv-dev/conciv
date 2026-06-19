import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_test tool', () => {
  it('forwards the action to ctx.test', async () => {
    const calls: unknown[] = []
    const tools = mandaraxTools({
      injectUi: () => true,
      page: async () => ({}),
      test: async (a) => (calls.push(a), {tests: []}),
      open: () => {},
    })
    const test = tools.find((t) => t.name === 'mandarax_test')
    if (!test) throw new Error('mandarax_test tool missing')
    const result = await test.execute({action: 'list'})
    expect(calls[0]).toMatchObject({kind: 'list'})
    expect(result).toMatchObject({tests: []})
  })
})
