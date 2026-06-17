import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/tools.js'

describe('aidx_test tool', () => {
  it('forwards the action to ctx.test', async () => {
    const calls: unknown[] = []
    const tools = aidxTools({
      injectUi: () => true,
      page: async () => ({}),
      test: async (a) => (calls.push(a), {tests: []}),
      open: () => {},
    })
    const test = tools.find((t) => t.name === 'aidx_test')
    if (!test) throw new Error('aidx_test tool missing')
    const result = await test.run({action: 'list'})
    expect(calls[0]).toMatchObject({kind: 'list'})
    expect(result).toMatchObject({tests: []})
  })
})
