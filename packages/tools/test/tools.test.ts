import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createToolRegistry} from '@conciv/extension/registry'
import {type BundlerBridge} from '@conciv/protocol/bundler-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {BUILTIN_SERVER_TOOLS, BUILTIN_TABS_TOOL, builtinToolNames} from '../src/builtins.js'
import {concivExtensionsToolDef} from '../src/extensions-tool.js'
import {concivSandboxTools} from '../src/tools.js'

describe('builtins', () => {
  const testRequest = {sessionId: SessionId.parse('conciv_test'), agentId: 'conciv_test', model: null}

  function errorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) throw new Error('not a coded error')
    return String(error.code)
  }

  function registryWith(bundler: BundlerBridge | undefined) {
    const registry = createToolRegistry()
    for (const tool of BUILTIN_SERVER_TOOLS)
      registry.register(tool, {
        owner: 'a test registrant',
        context: {bundler: () => bundler, hotUpdate: () => Promise.reject(new Error('no page is connected'))},
      })
    registry.register(BUILTIN_TABS_TOOL, {
      owner: 'a test registrant',
      context: {listTabs: async () => ({tabs: [], unreachable: []})},
    })
    return registry
  }

  function fakeBundler(): BundlerBridge {
    return {
      id: 'fake',
      config: () => ({root: '/app', base: '/', mode: 'development', aliases: [], plugins: ['conciv']}),
      resolve: async () => ({id: '/app/src/x.ts'}),
      moduleGraph: () => [{url: '/src/a.ts', importers: [], importedModules: []}],
      transform: async () => ({code: 'export const a = 1'}),
      urls: () => ({local: ['http://localhost:5173/'], network: []}),
      reload: async () => {},
      restart: async () => {},
    }
  }

  describe('built-in tool declarations', () => {
    it('lists every built-in in the catalog with its binding kind', () => {
      const catalog = registryWith(fakeBundler()).catalog.list()
      expect(catalog.map((entry) => entry.name).toSorted()).toEqual(builtinToolNames().toSorted())
      const bindings = new Map(catalog.map((entry) => [entry.name, entry.binding]))
      expect(bindings.get('server_reload')).toBe('server')
    })

    it('gives every declared input field its own help text', () => {
      const missing: string[] = []
      for (const tool of BUILTIN_SERVER_TOOLS) {
        const schema = z.toJSONSchema(tool.inputSchema, {io: 'input'})
        const properties = schema.properties ?? {}
        for (const [field, definition] of Object.entries(properties)) {
          const described = typeof definition === 'object' && definition !== null && 'description' in definition
          if (!described) missing.push(`${tool.name}.${field}`)
        }
      }
      expect(missing).toEqual([])
    })

    it('waits for the page to apply the hot update after a reload', async () => {
      const asked: unknown[] = []
      const registry = createToolRegistry()
      const hotUpdate = async (sessionId: string, timeout: number) => {
        asked.push({sessionId, timeout})
        return {applied: true, waitedMs: 42}
      }
      for (const tool of BUILTIN_SERVER_TOOLS)
        registry.register(tool, {owner: 'a test registrant', context: {bundler: () => fakeBundler(), hotUpdate}})
      await expect(registry.call('server_reload', {file: 'src/a.ts'}, {request: testRequest})).resolves.toEqual({
        ok: true,
        applied: true,
        waitedMs: 42,
      })
      expect(asked).toEqual([{sessionId: testRequest.sessionId, timeout: 5000}])
    })

    it('still reloads when no page is connected to wait on', async () => {
      const registry = registryWith(fakeBundler())
      await expect(registry.call('server_reload', {file: 'src/a.ts'}, {request: testRequest})).resolves.toEqual({
        ok: true,
        applied: false,
        waitedMs: 0,
      })
    })

    it('raises its declared NO_BUNDLER error when no dev server is attached', async () => {
      const registry = registryWith(undefined)
      const failure = await registry.call('server_reload', {file: 'src/a.ts'}, {request: testRequest}).then(
        () => null,
        (error: unknown) => error,
      )
      expect(errorCode(failure)).toBe('NO_BUNDLER')
    })
  })
})

describe('extensions tool', () => {
  describe('conciv_extensions tool description', () => {
    it('tells the authoring agent to add @conciv/ui-kit-chat to package.json for composer scaffolds', () => {
      expect(concivExtensionsToolDef.description).toContain('@conciv/ui-kit-chat')
      expect(concivExtensionsToolDef.description).toContain('package.json')
    })
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
