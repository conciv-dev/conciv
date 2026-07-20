import {describe, it, expect} from 'vitest'
import {defineFrameworkAdapter, type FrameworkClientCore, type FrameworkServerCore} from '../src/framework-types.js'

function coreClient(): FrameworkClientCore {
  return {
    detect: () => ({name: 'tanstack-start', version: '1.0.0', router: 'file-based', dev: true}),
    routes: {
      current: () => [
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
      tree: () => ({id: 'root', path: '/', kind: 'layout', hasLoader: false, children: []}),
    },
    navigation: {
      navigate: async () => {},
      back: () => {},
      refresh: async () => {},
    },
    data: {
      entries: () => [],
      get: () => undefined,
      invalidate: async () => {},
      refetch: async () => {},
    },
    errors: {
      snapshot: () => [],
      subscribe: () => () => {},
    },
  }
}

function coreServer(): FrameworkServerCore {
  return {
    manifest: {routes: () => [{path: '/posts/$id', kind: 'page', dynamic: true, file: null}]},
    events: {subscribe: () => () => {}},
    logs: {tail: () => []},
  }
}

describe('defineFrameworkAdapter (capability flags force gated surfaces at compile time)', () => {
  it('returns a capability-empty adapter unchanged, with no gated surfaces present', () => {
    const adapter = defineFrameworkAdapter({
      name: 'astro',
      client: coreClient(),
      server: coreServer(),
      capabilities: {queryCache: false, serverFunctions: false, rscPayload: false, isr: false, middleware: false},
    })

    expect(adapter.name).toBe('astro')
    expect('queryCache' in adapter).toBe(false)
    expect('payload' in adapter).toBe(false)
    expect(adapter.client.routes.current()[0]?.params.id).toBe('1')
    expect(adapter.server.manifest.routes()[0]?.dynamic).toBe(true)
  })

  it('accepts an adapter that provides every gated surface its capabilities require', () => {
    const adapter = defineFrameworkAdapter({
      name: 'nextjs',
      client: coreClient(),
      server: coreServer(),
      capabilities: {queryCache: true, serverFunctions: true, rscPayload: true, isr: true, middleware: true},
      queryCache: {queries: () => [], mutations: () => [], invalidate: async () => {}, refetch: async () => {}},
      payload: {snapshot: () => ({kind: 'flight', tree: {}, mismatches: []})},
      serverFunctions: {list: () => [], traces: () => []},
      isr: {entries: () => [], revalidate: async () => {}},
      middleware: {list: () => []},
    })

    expect(adapter.capabilities.rscPayload).toBe(true)
    expect(adapter.payload?.snapshot().kind).toBe('flight')
    expect(adapter.queryCache?.queries()).toEqual([])
    expect(adapter.isr?.entries()).toEqual([])
  })
})
