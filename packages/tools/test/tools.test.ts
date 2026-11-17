import {describe, expect, it} from 'vitest'
import {createToolRegistry} from '@conciv/extension/registry'
import {BUILTIN_TABS_TOOL, builtinToolNames} from '../src/builtins.js'
import {concivSandboxToolNames, concivSandboxTools} from '../src/tools.js'

describe('builtins', () => {
  function registryWithTabs() {
    const registry = createToolRegistry()
    registry.register(BUILTIN_TABS_TOOL, {
      owner: 'a test registrant',
      context: {listTabs: async () => ({tabs: [], unreachable: []})},
    })
    return registry
  }

  describe('built-in tool declarations', () => {
    it('lists every built-in in the catalog with its binding kind', () => {
      const catalog = registryWithTabs().catalog.list()
      expect(catalog.map((entry) => entry.name).toSorted()).toEqual(builtinToolNames().toSorted())
      const bindings = new Map(catalog.map((entry) => [entry.name, entry.binding]))
      expect(bindings.get('tabs')).toBe('server')
    })
  })
})

describe('sandbox tools', () => {
  it('offers conciv_ui as the only conciv sandbox tool', () => {
    expect(concivSandboxToolNames()).toEqual(['conciv_ui'])
    expect(concivSandboxTools({askUi: async () => ({answered: true, value: 'dark'})}).map((tool) => tool.name)).toEqual(
      ['conciv_ui'],
    )
  })
})

describe('ui tool', () => {
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
})
