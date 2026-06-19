import {describe, expect, it} from 'vitest'
import {mandaraxTools} from '../src/tools.js'

describe('mandarax_open tool', () => {
  it('forwards file + line to ctx.open', async () => {
    const calls: Array<[string, number | undefined]> = []
    const tools = mandaraxTools({
      injectUi: () => true,
      page: async () => ({}),
      test: async () => ({}),
      open: (file, line) => calls.push([file, line]),
    })
    const open = tools.find((t) => t.name === 'mandarax_open')
    if (!open) throw new Error('mandarax_open tool missing')
    const result = await open.execute({file: 'src/routes/index.tsx', line: 12})
    expect(calls[0]).toEqual(['src/routes/index.tsx', 12])
    expect(result).toMatchObject({ok: true, file: 'src/routes/index.tsx', line: 12})
  })
})
