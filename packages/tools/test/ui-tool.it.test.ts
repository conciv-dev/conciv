import {describe, expect, it} from 'vitest'
import {concivSandboxTools} from '../src/tools.js'

describe('conciv_ui tool', () => {
  it('pends on ctx.askUi and returns the answer as the tool result', async () => {
    const tools = concivSandboxTools({askUi: async () => ({answered: true, value: 'dark'})})
    const ui = tools.find((tool) => tool.name === 'conciv_ui')
    if (!ui) throw new Error('conciv_ui tool missing')
    const result = await ui.execute({kind: 'choices', question: 'theme?', options: ['light', 'dark']})
    expect(result).toEqual({answered: true, value: 'dark'})
  })

  it('rejects malformed input at the zod boundary before asking', async () => {
    const asked = {count: 0}
    const tools = concivSandboxTools({
      askUi: async () => {
        asked.count += 1
        return {answered: false, note: ''}
      },
    })
    const ui = tools.find((tool) => tool.name === 'conciv_ui')
    if (!ui) throw new Error('conciv_ui tool missing')
    await expect(ui.execute({kind: 'vitest'})).rejects.toThrow()
    expect(asked.count).toBe(0)
  })
})
