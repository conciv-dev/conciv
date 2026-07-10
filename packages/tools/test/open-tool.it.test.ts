import {describe, expect, it} from 'vitest'
import {concivTools} from '../src/tools.js'

describe('conciv_open tool', () => {
  it('forwards file + line to ctx.open', async () => {
    const calls: Array<[string, number | undefined]> = []
    const tools = concivTools({
      askUi: async () => ({answered: false, note: ''}),
      page: async () => ({}),
      open: (file, line) => calls.push([file, line]),
    })
    const open = tools.find((t) => t.name === 'conciv_open')
    if (!open) throw new Error('conciv_open tool missing')
    const result = await open.execute({file: 'src/routes/index.tsx', line: 12})
    expect(calls[0]).toEqual(['src/routes/index.tsx', 12])
    expect(result).toMatchObject({ok: true, file: 'src/routes/index.tsx', line: 12})
  })
})
