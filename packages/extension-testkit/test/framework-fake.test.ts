import {expect, test} from 'vitest'
import {makeFakeFrameworkAdapter} from '../src/framework-fake.js'

test('advertises the surfaces it fakes with fixed capabilities', () => {
  const adapter = makeFakeFrameworkAdapter()
  expect(adapter.name).toBe('tanstack-start')
  expect(adapter.capabilities).toEqual({
    queryCache: true,
    serverFunctions: true,
    rscPayload: false,
    isr: false,
    middleware: false,
  })
  expect(adapter.payload).toBeUndefined()
  expect(adapter.isr).toBeUndefined()
  expect(adapter.middleware).toBeUndefined()
})

const SESSION_ID = 'test-session'

test('detect returns well-formed framework info', async () => {
  const info = await makeFakeFrameworkAdapter().client.detect(SESSION_ID)
  expect(info).toEqual({name: 'tanstack-start', version: '1.4.2', router: 'file-based', dev: true})
})

test('router current returns a well-formed location and matches', async () => {
  const current = await makeFakeFrameworkAdapter().client.routes.current(SESSION_ID)
  expect(current.location.pathname).toBe('/posts/42')
  const [, postMatch] = current.matches
  if (!postMatch) throw new Error('expected a route match')
  expect(postMatch.routeId).toBe('/posts/$postId')
  expect(postMatch.status).toBe('success')
  expect(postMatch.params).toEqual({postId: '42'})
})

test('route tree returns a well-formed node graph', async () => {
  const tree = await makeFakeFrameworkAdapter().client.routes.tree(SESSION_ID)
  expect(tree.id).toBe('__root__')
  expect(tree.kind).toBe('layout')
  expect(tree.hasLoader).toBe(false)
  expect(tree.children).toHaveLength(2)
})

test('client data entries and error snapshot are well-formed', async () => {
  const adapter = makeFakeFrameworkAdapter()
  const [entry] = await adapter.client.data.entries(SESSION_ID)
  if (!entry) throw new Error('expected a cache entry')
  expect(entry.key).toBe('["posts",42]')
  expect(entry.state).toBe('fresh')
  const [appError] = await adapter.client.errors.snapshot(SESSION_ID)
  if (!appError) throw new Error('expected an app error')
  expect(appError.kind).toBe('build')
})

test('query cache surface returns well-formed queries and mutations', async () => {
  const adapter = makeFakeFrameworkAdapter()
  if (!adapter.queryCache) throw new Error('expected a query cache surface')
  const [query] = await adapter.queryCache.queries(SESSION_ID)
  if (!query) throw new Error('expected a query entry')
  expect(query.state).toBe('fresh')
  const [mutation] = await adapter.queryCache.mutations(SESSION_ID)
  if (!mutation) throw new Error('expected a mutation entry')
  expect(mutation.state).toBe('fetching')
})

test('server functions surface returns well-formed list and traces', async () => {
  const adapter = makeFakeFrameworkAdapter()
  if (!adapter.serverFunctions) throw new Error('expected a server functions surface')
  const [fn] = await adapter.serverFunctions.list()
  if (!fn) throw new Error('expected a server function')
  expect(fn.name).toBe('createPost')
  const [trace] = await adapter.serverFunctions.traces(5)
  if (!trace) throw new Error('expected a server function trace')
  expect(trace.status).toBe('ok')
})

test('server manifest, logs, and errors are well-formed', async () => {
  const adapter = makeFakeFrameworkAdapter()
  const [route] = await adapter.server.manifest.routes()
  if (!route) throw new Error('expected a server route')
  expect(route.kind).toBe('page')
  const [log] = await adapter.server.logs.tail(10)
  if (!log) throw new Error('expected a log entry')
  expect(log.level).toBe('info')
  const errors = await adapter.server.errors.snapshot()
  expect(errors).toHaveLength(1)
})

test('server events subscribe returns an unsubscribe function', () => {
  const adapter = makeFakeFrameworkAdapter()
  const unsubscribe = adapter.server.events.subscribe(() => {})
  expect(typeof unsubscribe).toBe('function')
  unsubscribe()
})

test('overrides replace a single method and leave siblings on defaults', async () => {
  const adapter = makeFakeFrameworkAdapter({
    client: {
      routes: {
        current: async () => ({location: {pathname: '/custom', search: '', hash: ''}, matches: []}),
      },
    },
  })
  const current = await adapter.client.routes.current(SESSION_ID)
  expect(current.location.pathname).toBe('/custom')
  const tree = await adapter.client.routes.tree(SESSION_ID)
  expect(tree.id).toBe('__root__')
})

test('override a mutating method to observe calls', async () => {
  const calls: string[] = []
  const adapter = makeFakeFrameworkAdapter({
    client: {navigation: {navigate: async (_sessionId, input) => void calls.push(`navigate:${input.to}`)}},
    queryCache: {invalidate: async (_sessionId, key) => void calls.push(`invalidate:${key}`)},
  })
  await adapter.client.navigation.navigate(SESSION_ID, {to: '/next'})
  if (!adapter.queryCache) throw new Error('expected a query cache surface')
  await adapter.queryCache.invalidate(SESSION_ID, 'users')
  expect(calls).toEqual(['navigate:/next', 'invalidate:users'])
})
