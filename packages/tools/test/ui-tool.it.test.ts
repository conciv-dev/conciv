import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_ui tool', () => {
  it('bridges to the ctx.injectUi sink and returns injected:true', async () => {
    const seen: unknown[] = []
    const tools = mandaraxTools({
      injectUi: (spec) => (seen.push(spec), true),
      page: async () => ({}),
      test: async () => ({}),
      open: () => {},
    })
    const ui = tools.find((t) => t.name === 'mandarax_ui')
    if (!ui) throw new Error('mandarax_ui tool missing')
    const result = await ui.execute({kind: 'confirm', question: 'ok?'})
    expect(seen).toHaveLength(1)
    expect(result).toMatchObject({injected: true})
  })
})
