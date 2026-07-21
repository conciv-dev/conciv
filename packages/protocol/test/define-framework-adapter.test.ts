import {describe, it, expect} from 'vitest'
import {defineFrameworkAdapter, type FrameworkClientCore, type FrameworkServerCore} from '../src/framework-types.js'

function coreClient(): FrameworkClientCore {
  return {
    detect: async () => ({name: 'tanstack-start', version: '1.0.0', router: 'file-based', dev: true}),
    routes: {
      current: async () => ({
        location: {pathname: '/posts/1', search: '', hash: ''},
        matches: [
          {
            id: 'm1',
            routeId: '/posts/$id',
            path: '/posts/1',
            params: {id: '1'},
            search: {},
            status: 'success',
            error: null,
            loaderData: {title: 'hi'},
            staleAt: null,
            isFetching: false,
          },
        ],
      }),
      tree: async () => ({id: 'root', path: '/', kind: 'layout', hasLoader: false, children: []}),
    },
    navigation: {
      navigate: async () => {},
      back: async () => {},
      refresh: async () => {},
    },
    data: {
      entries: async () => [],
      get: async () => undefined,
      invalidate: async () => {},
      refetch: async () => {},
    },
    errors: {
      snapshot: async () => [],
    },
  }
}

function coreServer(): FrameworkServerCore {
  return {
    manifest: {routes: async () => [{path: '/posts/$id', kind: 'page', dynamic: true, file: null}]},
    errors: {snapshot: async () => []},
    events: {subscribe: () => () => {}},
    logs: {tail: async () => []},
  }
}

describe('defineFrameworkAdapter (capability flags force gated surfaces at compile time)', () => {
  it('returns a capability-empty adapter unchanged, with no gated surfaces present', async () => {
    const adapter = defineFrameworkAdapter({
      name: 'astro',
      client: coreClient(),
      server: coreServer(),
      capabilities: {queryCache: false, serverFunctions: false, rscPayload: false, isr: false, middleware: false},
    })

    expect(adapter.name).toBe('astro')
    expect('queryCache' in adapter).toBe(false)
    expect('payload' in adapter).toBe(false)
    expect((await adapter.client.routes.current()).matches[0]?.params.id).toBe('1')
    expect((await adapter.server.manifest.routes())[0]?.dynamic).toBe(true)
  })

  it('accepts an adapter that provides every gated surface its capabilities require', async () => {
    const adapter = defineFrameworkAdapter({
      name: 'nextjs',
      client: coreClient(),
      server: coreServer(),
      capabilities: {queryCache: true, serverFunctions: true, rscPayload: true, isr: true, middleware: true},
      queryCache: {
        queries: async () => [],
        mutations: async () => [],
        invalidate: async () => {},
        refetch: async () => {},
      },
      payload: {snapshot: async () => ({kind: 'flight', tree: {}, mismatches: []})},
      serverFunctions: {list: async () => [], traces: async () => []},
      isr: {entries: async () => [], revalidate: async () => {}},
      middleware: {list: async () => []},
    })

    expect(adapter.capabilities.rscPayload).toBe(true)
    expect((await adapter.payload?.snapshot())?.kind).toBe('flight')
    expect(await adapter.queryCache?.queries()).toEqual([])
    expect(await adapter.isr?.entries()).toEqual([])
  })
})
