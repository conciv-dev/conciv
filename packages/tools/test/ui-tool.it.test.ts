import {describe, expect, it} from 'vitest'
import {concivTools} from '../src/tools.js'

describe('conciv_ui tool', () => {
  it('bridges to the ctx.injectUi sink and returns injected:true', async () => {
    const seen: unknown[] = []
    const tools = concivTools({
      injectUi: (spec) => (seen.push(spec), true),
      page: async () => ({}),
      open: () => {},
    })
    const ui = tools.find((t) => t.name === 'conciv_ui')
    if (!ui) throw new Error('conciv_ui tool missing')
    const result = await ui.execute({kind: 'confirm', question: 'ok?'})
    expect(seen).toHaveLength(1)
    expect(result).toMatchObject({injected: true})
  })
})
