import {setImmediate as nextMacrotask} from 'node:timers/promises'
import {afterAll, afterEach, beforeAll, expect, test, describe, it} from 'vitest'
import {defineConcivFunction} from '@conciv/extension/devframe-function'
import {defineConcivPlugin} from '@conciv/extension/devframe-plugin'
import {
  createFakeHarness,
  makeRpcClient,
  makeCallTool,
  makeRunTypescript,
  resolveSession,
} from '@conciv/harness-testkit'
import ping from '../fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'
import {z} from 'zod'
import {fileURLToPath} from 'node:url'
import {expect as playwrightExpect} from '@playwright/test'
import {fixtureHost, getExtensionTestApi} from '../src/get-extension-test-api.js'
import {type EngineStaleness} from '@conciv/contract'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '../src/core-kit.js'
import {makeFakeFrameworkAdapter} from '../src/framework-fake.js'
import {createServer} from 'node:http'
import {listenLocal} from '../src/listen-local.js'
import {gateRpcCalls} from '../src/rpc-fault.js'
import {
  abortCalls,
  callCount,
  callCursor,
  failCalls,
  gateCalls,
  holdCalls,
  observeCalls,
} from '../src/devframe-faults.js'
import {rpcObserverFor, observeRpc} from '../src/rpc-observer.js'
import {test as browserTest} from '@conciv/browser-fixture'
import {launch} from '../src/launch.js'
import {settleTeardown} from '../src/settle-teardown.js'

describe('devframe faults', () => {
  const faultProbe = defineConcivPlugin({id: 'fault-probe', title: 'Fault probe'}).server((ctx) => {
    ctx.rpc.register(
      defineConcivFunction({
        name: 'fault-probe:ping',
        type: 'query',
        input: z.object({value: z.string().default('pong')}),
        output: z.string(),
        handler: (input) => input.value,
      }),
    )
  })

  const ping = (kit: CoreKit): Promise<unknown> =>
    kit.hub.connection.ready().then(({rpc}) => rpc.$callRaw({method: 'fault-probe:ping', args: [{}]}))

  let kit: CoreKit

  beforeAll(async () => {
    kit = await bootCoreKit({id: 'devframe-faults', plugins: [faultProbe]})
  })

  afterAll(() => kit.cleanup())

  it('fails a named call with a coded error until repaired', async () => {
    const fault = await failCalls(kit, ['fault-probe:ping'], 'BROKEN')
    await expect(ping(kit)).rejects.toMatchObject({code: 'BROKEN'})
    fault.repair()
    expect(await ping(kit)).toBe('pong')
  })

  it('aborts a named call as a dropped connection', async () => {
    const fault = await abortCalls(kit, ['fault-probe:ping'])
    await expect(ping(kit)).rejects.toMatchObject({code: 'DISCONNECTED'})
    fault.repair()
  })

  it('holds a call until released', async () => {
    const hold = await holdCalls(kit, ['fault-probe:ping'])
    const settled = {done: false}
    const pending = ping(kit).then((value) => {
      settled.done = true
      return value
    })
    await nextMacrotask()
    expect(settled.done).toBe(false)
    hold.release()
    expect(await pending).toBe('pong')
  })

  it('gates a call and reports its arrival', async () => {
    const gate = await gateCalls(kit, ['fault-probe:ping'])
    const pending = ping(kit)
    await gate.arrived
    gate.release()
    expect(await pending).toBe('pong')
  })

  it('observes and counts calls by pattern, through a cursor', async () => {
    const observer = await observeCalls(kit, /^fault-probe:/)
    await ping(kit)
    const cursor = callCursor(observer, 'fault-probe:ping')
    await ping(kit)
    expect(callCount(observer, 'fault-probe:ping')).toBe(2)
    expect(cursor.count()).toBe(1)
    expect(observer.calls()[0]).toEqual({name: 'fault-probe:ping', input: {}})
    observer.stop()
    await ping(kit)
    expect(callCount(observer, 'fault-probe:ping')).toBe(2)
  })

  it('refuses to wrap a function the hub does not have', async () => {
    await expect(failCalls(kit, ['fault-probe:missing'])).rejects.toThrow(/fault-probe:missing/)
  })

  it('wraps none of the named calls when one of them is missing', async () => {
    await expect(failCalls(kit, ['fault-probe:ping', 'fault-probe:missing'])).rejects.toThrow(/fault-probe:missing/)
    expect(await ping(kit)).toBe('pong')
  })
})

describe('boot server', () => {
  test('boots a real extension server reachable over HTTP', async () => {
    const {apiBase, stop} = await bootExtensionServer(ping)
    try {
      const models = await makeRpcClient(apiBase).meta.models()
      expect(models.harness.id.length).toBeGreaterThan(0)
    } finally {
      await stop()
    }
  })

  test('boots with an injected harness that is not in the registry', async () => {
    const harness = createFakeHarness({id: 'fake-ext-boot', text: 'ok'})
    const {apiBase, stop} = await bootExtensionServer(ping, {harness})
    try {
      const models = await makeRpcClient(apiBase).meta.models()
      expect(models.harness.id).toBe('fake-ext-boot')
    } finally {
      await stop()
    }
  })
})

describe('call tool', () => {
  test('calls a real extension tool over MCP', async () => {
    const {apiBase, stop} = await bootExtensionServer(ping)
    try {
      const session = await resolveSession(apiBase)
      const callTool = makeCallTool(apiBase, session)
      const result = await callTool('ping_echo', {text: 'marco-polo'})
      expect(JSON.stringify(result)).toContain('marco-polo')
    } finally {
      await stop()
    }
  })

  test('an oversized tool reply fails loud, and aggregating inside the sandbox stays within the cap', async () => {
    const {apiBase, stop} = await bootExtensionServer(ping)
    try {
      const session = await resolveSession(apiBase)
      const callTool = makeCallTool(apiBase, session)
      await expect(callTool('ping_flood', {})).rejects.toThrow(/truncated/)
      const runTypescript = makeRunTypescript(apiBase, session)
      const length = await runTypescript(`
      const reply = await external_ping_flood({})
      return reply.payload.length
    `)
      expect(z.number().parse(length)).toBe(120_000)
    } finally {
      await stop()
    }
  }, 30_000)

  test('a tool result merely shaped like the truncation envelope passes through untouched', async () => {
    const {apiBase, stop} = await bootExtensionServer(ping)
    try {
      const session = await resolveSession(apiBase)
      const callTool = makeCallTool(apiBase, session)
      const result = await callTool('ping_decoy', {})
      expect(result).toEqual({truncated: true, reason: 'looks like an envelope', head: 'not really'})
    } finally {
      await stop()
    }
  }, 30_000)
})

describe('composer actions', () => {
  const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))

  test('collapses a composer-slot extension action into the shared overflow menu when the row narrows', async () => {
    const api = await getExtensionTestApi({server: ping, host: fixtureHost(hostDist)})
    const composerButton = api.page.getByRole('button', {name: 'Echo from the composer'})
    const overflowTrigger = api.page.getByRole('button', {name: 'More composer actions'})
    try {
      await playwrightExpect(composerButton).toBeVisible()
      await playwrightExpect(overflowTrigger).toHaveCount(0)

      await api.page.getByLabel('Composer row width').fill('100')

      await playwrightExpect(composerButton).toHaveCount(0)
      await playwrightExpect(overflowTrigger).toBeVisible()

      await overflowTrigger.click()
      await playwrightExpect(api.page.getByRole('menuitem', {name: 'Insert an echo'})).toBeVisible()
      await playwrightExpect(api.page.getByRole('menuitem', {name: 'Clear the echo'})).toBeVisible()

      await api.page.getByRole('menuitem', {name: 'Insert an echo'}).click()
      await playwrightExpect(api.page.getByText('Composer action: insert')).toBeVisible()

      await overflowTrigger.click()
      await api.page.getByRole('menuitem', {name: 'Clear the echo'}).click()
      await playwrightExpect(api.page.getByText('Composer action: clear')).toBeVisible()
    } finally {
      await api.dispose()
    }
  })
})

describe('core kit seams', () => {
  const STALENESS: EngineStaleness = {
    stale: true,
    changed: ['@conciv/kit-probe'],
    tracked: ['@conciv/kit-probe'],
    bootedAt: 1_700_000_000_000,
    fingerprint: 'kitprobe123',
  }

  const ORIGIN = 'https://widget.example.test'

  const state = {kit: undefined as CoreKit | undefined}

  afterEach(async () => {
    await state.kit?.cleanup()
    state.kit = undefined
  })

  describe('bootCoreKit seams', () => {
    it('adopts the harness transcript rows as external sessions with their message counts', async () => {
      const kit = await bootCoreKit({
        id: 'seams-history',
        history: [
          {id: HarnessSessionId.parse('native-1'), derivedTitle: 'A native session', updatedAt: 1_700, messageCount: 7},
        ],
      })
      state.kit = kit

      const sessions = await kit.hub.call('conciv:sessions:list', {})
      const adopted = sessions.find((meta) => meta.native?.nativeId === 'native-1')

      expect(adopted?.origin).toBe('external')
      expect(adopted?.messageCount).toBe(7)
      expect(adopted?.title).toBe('A native session')
      expect(adopted?.running).toBe(false)
    }, 30_000)

    it('serves the injected staleness probe to the widget rpc surface', async () => {
      const kit = await bootCoreKit({id: 'seams-staleness', staleness: () => STALENESS})
      state.kit = kit

      expect(await kit.rpc.meta.engine()).toEqual(STALENESS)
    }, 30_000)

    it('lets a non-loopback origin through only when the kit declares it allowed', async () => {
      const closed = await bootCoreKit({id: 'seams-origins-closed'})
      state.kit = closed
      const rejected = await fetch(`${closed.base}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
      })
      await closed.cleanup()
      state.kit = undefined

      const open = await bootCoreKit({id: 'seams-origins-open', allowedOrigins: [ORIGIN]})
      state.kit = open
      const accepted = await fetch(`${open.base}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
      })

      expect(rejected.status).toBe(403)
      expect(accepted.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    }, 30_000)
  })
})

describe('framework fake', () => {
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

  test('detect returns well-formed framework info', async () => {
    const info = await makeFakeFrameworkAdapter().client.detect()
    expect(info).toEqual({name: 'tanstack-start', version: '1.4.2', router: 'file-based', dev: true})
  })

  test('router current returns a well-formed location and matches', async () => {
    const current = await makeFakeFrameworkAdapter().client.routes.current()
    expect(current.location.pathname).toBe('/posts/42')
    const [, postMatch] = current.matches
    if (!postMatch) throw new Error('expected a route match')
    expect(postMatch.routeId).toBe('/posts/$postId')
    expect(postMatch.status).toBe('success')
    expect(postMatch.params).toEqual({postId: '42'})
  })

  test('route tree returns a well-formed node graph', async () => {
    const tree = await makeFakeFrameworkAdapter().client.routes.tree()
    expect(tree.id).toBe('__root__')
    expect(tree.kind).toBe('layout')
    expect(tree.hasLoader).toBe(false)
    expect(tree.children).toHaveLength(2)
  })

  test('client data entries and error snapshot are well-formed', async () => {
    const adapter = makeFakeFrameworkAdapter()
    const [entry] = await adapter.client.data.entries()
    if (!entry) throw new Error('expected a cache entry')
    expect(entry.key).toBe('["posts",42]')
    expect(entry.state).toBe('fresh')
    const [appError] = await adapter.client.errors.snapshot()
    if (!appError) throw new Error('expected an app error')
    expect(appError.kind).toBe('build')
  })

  test('query cache surface returns well-formed queries and mutations', async () => {
    const adapter = makeFakeFrameworkAdapter()
    if (!adapter.queryCache) throw new Error('expected a query cache surface')
    const [query] = await adapter.queryCache.queries()
    if (!query) throw new Error('expected a query entry')
    expect(query.state).toBe('fresh')
    const [mutation] = await adapter.queryCache.mutations()
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
    const current = await adapter.client.routes.current()
    expect(current.location.pathname).toBe('/custom')
    const tree = await adapter.client.routes.tree()
    expect(tree.id).toBe('__root__')
  })

  test('override a mutating method to observe calls', async () => {
    const calls: string[] = []
    const adapter = makeFakeFrameworkAdapter({
      client: {navigation: {navigate: async (input) => void calls.push(`navigate:${input.to}`)}},
      queryCache: {invalidate: async (key) => void calls.push(`invalidate:${key}`)},
    })
    await adapter.client.navigation.navigate({to: '/next'})
    if (!adapter.queryCache) throw new Error('expected a query cache surface')
    await adapter.queryCache.invalidate('users')
    expect(calls).toEqual(['navigate:/next', 'invalidate:users'])
  })
})

describe('listen local', () => {
  describe('listenLocal', () => {
    it('rejects instead of hanging when the requested port is already bound', async () => {
      const holder = createServer()
      const bound = await listenLocal(holder)
      const contender = createServer()
      await expect(listenLocal(contender, bound.port)).rejects.toThrow()
      await bound.close()
    })
  })
})

describe('page rpc observer', () => {
  const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))
  const PING_PATH = ['ext', 'ping', 'ping']
  const CORE_NAMESAKE_PATH = ['ping']

  test('the page observer sees extension rpc calls from the page-load one onward, over the fetch transport', async () => {
    const api = await getExtensionTestApi({server: ping, host: fixtureHost(hostDist)})
    try {
      await playwrightExpect(api.page.getByText('pong: boot')).toBeVisible()
      const observer = rpcObserverFor(api.page)
      const mark = observer.mark()
      await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
      await playwrightExpect(api.page.getByText('pong: again')).toBeVisible()
      const roundtrip = await observer.completed({path: PING_PATH, since: mark})
      playwrightExpect(roundtrip.status).toBe(200)
      playwrightExpect(observer.socketCount()).toBe(0)
      playwrightExpect(observer.startedCount({path: PING_PATH, since: mark})).toBe(1)
      playwrightExpect(observer.startedCount({path: PING_PATH})).toBe(2)
    } finally {
      await api.dispose()
    }
  })

  test('the observer matches a call by its decoded input and never by a shorter path that shares its name', async () => {
    const api = await getExtensionTestApi({server: ping, host: fixtureHost(hostDist)})
    try {
      const observer = rpcObserverFor(api.page)
      const booted = await observer.completed({path: PING_PATH, input: {value: 'boot'}})
      playwrightExpect(booted.input).toMatchObject({value: 'boot'})
      await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
      const again = await observer.completed({path: PING_PATH, input: {value: 'again'}})
      playwrightExpect(again.input).toMatchObject({value: 'again'})
      playwrightExpect(observer.completedCount({path: PING_PATH, input: {value: 'boot'}})).toBe(1)
      playwrightExpect(observer.completedCount({path: PING_PATH})).toBe(2)
      playwrightExpect(observer.startedCount({path: CORE_NAMESAKE_PATH})).toBe(0)
    } finally {
      await api.dispose()
    }
  })

  test('a call the gate holds stays started and uncompleted until the gate releases it', async () => {
    const api = await getExtensionTestApi({server: ping, host: fixtureHost(hostDist)})
    try {
      await playwrightExpect(api.page.getByText('pong: boot')).toBeVisible()
      const observer = rpcObserverFor(api.page)
      const gate = await gateRpcCalls(api.page, {path: PING_PATH})
      const mark = observer.mark()
      await api.page.getByRole('button', {name: 'Roundtrip over rpc'}).click()
      await gate.awaitCaptured(1)
      playwrightExpect(observer.startedCount({path: PING_PATH, since: mark})).toBe(1)
      playwrightExpect(observer.completedCount({path: PING_PATH, since: mark})).toBe(0)

      await gate.release()
      await observer.completed({path: PING_PATH, since: mark})
      await playwrightExpect(api.page.getByText('pong: again')).toBeVisible()
      playwrightExpect(observer.completedCount({path: PING_PATH, since: mark})).toBe(1)
      await gate.dispose()
    } finally {
      await api.dispose()
    }
  })
})

describe('rpc observer dispose', () => {
  const NATURAL_TIMEOUT_MS = 300

  browserTest(
    'dispose fails the pending waiter immediately instead of leaving its timer to fire naturally',
    async ({browser}) => {
      const page = await browser.newPage()
      await page.goto('about:blank')
      try {
        const observer = observeRpc(page)
        const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
        pending.catch(() => {})
        observer.dispose()
        await expect(pending).rejects.toThrow(/disposed/)
      } finally {
        await page.close()
      }
    },
  )

  browserTest('closing the launched page disposes its rpc observer and cancels pending waits', async () => {
    const {page, close} = await launch('about:blank')
    const observer = rpcObserverFor(page)
    const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
    pending.catch(() => {})
    await close()
    await expect(pending).rejects.toThrow(/disposed/)
  })

  browserTest(
    'dispose does not leak an unhandled rejection for a wait nobody awaited, and an awaited wait still rejects',
    async ({browser}) => {
      const page = await browser.newPage()
      await page.goto('about:blank')
      try {
        const observer = observeRpc(page)
        observer.completed({path: ['abandoned', 'wait'], timeout: NATURAL_TIMEOUT_MS})
        const awaited = observer.completed({path: ['awaited', 'wait'], timeout: NATURAL_TIMEOUT_MS})

        const unhandled: unknown[] = []
        const onUnhandledRejection = (reason: unknown): void => void unhandled.push(reason)
        process.on('unhandledRejection', onUnhandledRejection)

        try {
          observer.dispose()
          await expect(awaited).rejects.toThrow(/disposed/)
          await new Promise((resolve) => setImmediate(resolve))
          expect(unhandled).toEqual([])
        } finally {
          process.off('unhandledRejection', onUnhandledRejection)
        }
      } finally {
        await page.close()
      }
    },
  )
})

describe('session', () => {
  test('resolves a real conciv session id', async () => {
    const {apiBase, stop} = await bootExtensionServer(ping)
    try {
      const session = await resolveSession(apiBase)
      expect(session).toMatch(/^conciv_/)
    } finally {
      await stop()
    }
  })
})

describe('settle teardown', () => {
  test('all steps succeeding resolves without throwing', async () => {
    const completed: string[] = []
    await settleTeardown([
      {name: 'first', run: async () => void completed.push('first')},
      {name: 'second', run: async () => void completed.push('second')},
    ])
    expect(completed.toSorted()).toEqual(['first', 'second'])
  })

  test('a wedged step rejects with its own name after its own timeout, and the other steps still complete', async () => {
    const completed: string[] = []
    const wedged = new Promise<void>(() => {})
    await expect(
      settleTeardown([
        {name: 'closeBrowser', run: () => wedged, timeoutMs: 20},
        {name: 'close', run: async () => void completed.push('close')},
        {name: 'stop', run: async () => void completed.push('stop')},
      ]),
    ).rejects.toThrow('testkit closeBrowser exceeded 20ms')
    expect(completed.toSorted()).toEqual(['close', 'stop'])
  })

  test('a step whose run() throws synchronously still lets a later step complete', async () => {
    const completed: string[] = []
    await expect(
      settleTeardown([
        {
          name: 'throwsSync',
          run: () => {
            throw new Error('boom')
          },
        },
        {name: 'after', run: async () => void completed.push('after')},
      ]),
    ).rejects.toThrow('boom')
    expect(completed).toEqual(['after'])
  })
})

describe('smoke', () => {
  const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))

  test('mounts an extension, drives its real UI, grabs a source-mapped element, and calls a tool', async () => {
    const api = await getExtensionTestApi({server: ping, host: fixtureHost(hostDist)})
    try {
      await api.page.getByRole('button', {name: 'Ping'}).click()
      await playwrightExpect(api.page.getByText('Pinged')).toBeVisible()

      await api.page.getByRole('button', {name: 'Pick an element'}).click()
      await api.page.getByRole('button', {name: 'Comment target'}).click()
      await playwrightExpect(api.page.getByText(/Picked: .*fixture-element/)).toBeVisible()

      const echo = await api.callTool('ping_echo', {text: 'mcp-ok'})
      playwrightExpect(JSON.stringify(echo)).toContain('mcp-ok')
    } finally {
      await api.dispose()
    }
  })
})
