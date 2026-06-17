import {describe, expect, it} from 'vitest'
import {aidxTools} from '../src/tools.js'

describe('aidx_ui tool', () => {
  it('bridges to the ctx.injectUi sink and returns injected:true', async () => {
    const seen: unknown[] = []
    const tools = aidxTools({
      injectUi: (spec) => (seen.push(spec), true),
      page: async () => ({}),
      test: async () => ({}),
      open: () => {},
    })
    const ui = tools.find((t) => t.name === 'aidx_ui')
    if (!ui) throw new Error('aidx_ui tool missing')
    const result = await ui.execute({kind: 'confirm', question: 'ok?'})
    expect(seen).toHaveLength(1)
    expect(result).toMatchObject({injected: true})
  })
})
