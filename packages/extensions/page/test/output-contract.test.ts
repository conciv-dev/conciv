import {describe, expect, it} from 'vitest'
import {createToolRegistry} from '@conciv/extension/registry'
import {inspectDef, locateDef} from '../src/shared/defs.js'
import pageServer from '../src/server.js'

function registryReplying(reply: Record<string, unknown>) {
  const registry = createToolRegistry({pageCaller: async () => reply, isPageConnected: () => true})
  return registry
}

describe('react tool outputs accept a deliberately null component', () => {
  it('locate resolves through the real server wrapper when the browser names no component', async () => {
    const registry = createToolRegistry({isPageConnected: () => true})
    const locateServer = pageServer.tools?.find((tool) => tool.name === locateDef.name)
    if (!locateServer) throw new Error('the page server extension declares no locate tool')
    registry.register(locateServer, {
      owner: 'the page extension',
      context: {
        page: {call: async () => ({component: null, stack: [], frames: [], owners: []})},
        symbolicate: async () => null,
      },
    })
    await expect(registry.call('page.locate', {selector: '#anon'})).resolves.toMatchObject({component: null})
  })

  it('inspect resolves when the composite has no resolvable display name', async () => {
    const registry = registryReplying({component: null, props: {}, state: null, hooks: [], rect: null})
    registry.register(inspectDef.client(), {owner: 'a test registrant'})
    await expect(registry.call('page.inspect', {selector: '#anon'})).resolves.toMatchObject({component: null})
  })
})
