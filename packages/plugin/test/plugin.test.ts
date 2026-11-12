import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {Scope} from '../src/experimental/scope.js'
import {Plugin, Rpc, Tool} from '../src/index.js'
import type {Registration} from '../src/registration.js'
import type {ServerRef} from '../src/servers.js'

function unreachable(): never {
  throw new Error('no server')
}

function recordingContext(calls: string[]): Plugin.Context {
  const registration: Registration = {dispose: async () => void calls.push('dispose')}
  const tools: (Tool.Info & {readonly id: string})[] = []
  const builtin: ServerRef = {
    id: 'sidecar',
    name: 'engine',
    url: 'http://127.0.0.1:5173/t/token',
    client: {rpc: unreachable},
    local: true,
    builtin: true,
    compatible: true,
    connected: true,
  }
  const editor: Tool.ToolEditor = {
    list: () => tools,
    get: (id) => tools.find((tool) => tool.id === id),
    namespace: (namespace) => void calls.push(`namespace ${namespace.name}`),
    add: (tool) => void tools.push({...tool, id: tool.name}),
    update: (id) => void calls.push(`update ${id}`),
    remove: (id) => void calls.push(`remove ${id}`),
  }
  return {
    app: undefined,
    location: {directory: '/workspace', project: {id: undefined, directory: '/workspace', canonical: undefined}},
    options: {fps: 30},
    experimental: {generate: undefined},
    model: {
      list: async () => ({location: {directory: '/workspace'}, data: []}),
      default: async () => ({location: {directory: '/workspace'}, data: null}),
      transform: undefined,
      reload: undefined,
    },
    permission: {
      list: async () => [],
      get: async () => Promise.reject(new Error('no request')),
      reply: async () => void calls.push('reply'),
      hook: undefined,
      assert: undefined,
    },
    plugin: {list: async () => ({location: {directory: '/workspace'}, data: []})},
    rpc: Object.assign(unreachable, {
      register: async () => ({dispose: registration.dispose, events: {emit: async () => {}}}),
    }),
    session: sessionDomain(registration),
    skill: {
      list: async () => ({location: {directory: '/workspace'}, data: []}),
      transform: async () => registration,
      reload: async () => void calls.push('skill reload'),
    },
    storage: {
      directory: '/state/acme',
      get: async () => undefined,
      set: async (key) => void calls.push(`set ${key}`),
      remove: async (key) => void calls.push(`remove ${key}`),
      scan: async () => ({entries: []}),
    },
    tool: {
      transform: async (callback) => {
        callback(editor)
        return registration
      },
      reload: async () => void calls.push('tool reload'),
      list: async () => tools,
      hook: async () => registration,
    },
    servers: {
      list: () => [builtin.id],
      get: (id) => (id === builtin.id ? builtin : undefined),
    },
    harness: {get: () => ({id: 'claude'})},
    bundler: undefined,
  }
}

function sessionDomain(registration: Registration): Plugin.Context['session'] {
  return {
    list: async () => ({data: [], cursor: {}}),
    create: async () => Promise.reject(new Error('no session')),
    get: async () => Promise.reject(new Error('no session')),
    remove: async () => {},
    switchAgent: async () => {},
    switchModel: async () => {},
    generate: undefined,
    command: undefined,
    compact: async () => Promise.reject(new Error('no session')),
    synthetic: undefined,
    interrupt: async () => ({interrupted: false}),
    update: async () => {},
    wait: async () => {},
    instructions: {entry: {list: async () => [], put: async () => {}, remove: async () => {}}},
    hook: async () => registration,
  }
}

describe('define', () => {
  it('returns the same plugin object', () => {
    const plugin = {id: 'acme', setup: () => {}}
    expect(Plugin.define(plugin)).toBe(plugin)
  })

  it('accepts a setup that returns a cleanup', async () => {
    const calls: string[] = []
    const plugin = Plugin.define({
      id: 'acme',
      setup: async (context) => {
        await context.tool.transform((tools) =>
          tools.add({
            name: 'acme_echo',
            description: 'Echoes the text back.',
            input: z.object({text: z.string()}),
            execute: async (input) => ({content: input.text}),
          }),
        )
        return () => void calls.push('cleanup')
      },
    })
    const context = recordingContext(calls)
    const cleanup = await plugin.setup(context)
    if (typeof cleanup === 'function') await cleanup()
    expect(calls).toEqual(['cleanup'])
    expect((await context.tool.list()).map((tool) => tool.id)).toEqual(['acme_echo'])
  })

  it('types a tool call context with an always undefined messageId', () => {
    expectTypeOf<Tool.ToolContext['messageId']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Tool.ToolContext['sessionId']>().toEqualTypeOf<SessionId>()
    expectTypeOf<Plugin.Context['bundler']>().toEqualTypeOf<BundlerBridge | undefined>()
  })

  it('types the members conciv does not implement yet as possibly undefined', () => {
    expectTypeOf<Plugin.Context['app']>().toExtend<undefined | object>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['app']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['experimental']['generate']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['session']['generate']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['session']['command']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['session']['synthetic']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['permission']['hook']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['permission']['assert']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['model']['transform']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['location']['project']['id']>()
    expectTypeOf<undefined>().toExtend<Plugin.Context['location']['project']['canonical']>()
  })

  it('types execute input from the input schema and output from the output schema', () => {
    type SumTool = Tool.Info<z.ZodObject<{left: z.ZodNumber}>, z.ZodObject<{sum: z.ZodNumber}>>
    expectTypeOf<Parameters<SumTool['execute']>[0]>().toEqualTypeOf<{left: number}>()
    expectTypeOf<NonNullable<Awaited<ReturnType<SumTool['execute']>>['output']>>().toEqualTypeOf<{sum: number}>()
  })
})

describe('Rpc', () => {
  const Acme = Rpc.define({
    id: 'acme',
    methods: {
      search: {
        input: z.object({query: z.string(), limit: z.number().default(10)}),
        output: z.object({hits: z.array(z.string())}),
        errors: {not_found: z.object({query: z.string()})},
      },
    },
    events: {indexed: {schema: z.object({count: z.number()})}},
  })

  it('define returns its argument', () => {
    const definition = {
      id: 'acme',
      methods: {ping: {input: z.object({}), output: z.object({ok: z.boolean()})}},
      events: {},
    }
    expect(Rpc.define(definition)).toBe(definition)
  })

  it('define rejects an error name in the reserved rpc. space', () => {
    expect(() =>
      Rpc.define({
        id: 'acme',
        methods: {
          ping: {
            input: z.object({}),
            output: z.object({}),
            // @ts-expect-error error names starting with rpc. are reserved
            errors: {'rpc.internal': z.object({})},
          },
        },
        events: {},
      }),
    ).toThrow('RPC error names starting with "rpc." are reserved: rpc.internal')
  })

  it('types handlers, the error factory, the client and event payloads from the definition', () => {
    type Handlers = Rpc.RpcHandlers<typeof Acme>
    type Search = typeof Acme.methods.search
    expectTypeOf<Parameters<Handlers['search']>[0]>().toEqualTypeOf<{query: string; limit: number}>()
    expectTypeOf<Rpc.ErrorName<Search>>().toEqualTypeOf<'not_found'>()
    expectTypeOf<Parameters<Rpc.ErrorFactory<Search>>>().toEqualTypeOf<
      [type: 'not_found', message: string, data: {query: string}]
    >()
    expectTypeOf<Rpc.MethodError<Search>>().toEqualTypeOf<{
      readonly type: 'not_found'
      readonly message: string
      readonly data: {query: string}
    }>()
    type Client = Rpc.RpcClient<typeof Acme>
    expectTypeOf<Parameters<Client['search']>>().toEqualTypeOf<
      [input: {query: string; limit?: number | undefined}, options?: Rpc.RpcCallOptions]
    >()
    expectTypeOf<Awaited<ReturnType<Client['search']>>>().toEqualTypeOf<{hits: string[]}>()
    expectTypeOf<Rpc.RpcEventPayload<typeof Acme>['type']>().toEqualTypeOf<'rpc.acme.indexed'>()
    expectTypeOf<Rpc.RpcEventPayload<typeof Acme>['data']>().toEqualTypeOf<{count: number}>()
    expectTypeOf<Rpc.EventInput<typeof Acme>>().toEqualTypeOf<[name: 'indexed', data: {count: number}]>()
    expectTypeOf<Plugin.Context['rpc']>().toEqualTypeOf<Rpc.RpcDomain>()
    expectTypeOf<ServerRef['client']['rpc']>().toEqualTypeOf<Rpc.RpcApi>()
  })
})

describe('toolError', () => {
  it('builds a value isToolError accepts', () => {
    const error = Tool.toolError('boom', {code: 1})
    expect(Tool.isToolError(error)).toBe(true)
    expect(error).toMatchObject({message: 'boom', metadata: {code: 1}})
  })

  it('rejects a plain Error', () => {
    expect(Tool.isToolError(new Error('boom'))).toBe(false)
  })
})

describe('Scope', () => {
  const TIMEOUT = 1_000

  beforeEach(() => vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']}))

  afterEach(() => vi.useRealTimers())

  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

  const fixture = () => {
    const events: string[] = []
    const logs: {message: string; data: object}[] = []
    const scope: Scope = Scope.make('test', {timeout: TIMEOUT, log: (message, data) => logs.push({message, data})})

    const record = (name: string) => () => {
      events.push(name)
    }

    return {events, logs, scope, record}
  }

  const settled = (promise: Promise<unknown>) => {
    const state = {settled: false}
    void promise.then(() => (state.settled = true))

    return state
  }

  it('close aborts the signal at once and runs finalizers in reverse, past one that fails', async () => {
    const world = fixture()
    world.scope.addFinalizer(world.record('first'))
    world.scope.addFinalizer(() => {
      world.events.push('failing')
      throw new Error('boom')
    })
    world.scope.addFinalizer(world.record('last'))
    const closing = world.scope.close()
    expect(world.scope.signal.aborted).toBe(true)
    expect(world.events).toEqual([])
    await closing
    expect(world.events).toEqual(['last', 'failing', 'first'])
    expect(world.logs.map((entry) => entry.message)).toEqual(['scope finalizer failed'])
  })

  it('a finalizer added after close runs at once, and closing again waits for it', async () => {
    const world = fixture()
    await world.scope.close()
    const release = {resolve: () => {}}
    world.scope.addFinalizer(async () => {
      world.events.push('late')
      await new Promise<void>((resolve) => (release.resolve = resolve))
      world.events.push('late done')
    })
    await flush()
    expect(world.events).toEqual(['late'])
    const again = settled(world.scope.close())
    await flush()
    expect(again.settled).toBe(false)
    release.resolve()
    await flush()
    expect(again.settled).toBe(true)
    expect(world.events).toEqual(['late', 'late done'])
  })

  it('a fork closes with its parent in reverse order like a finalizer, or earlier on its own', async () => {
    const world = fixture()
    world.scope.addFinalizer(world.record('parent before fork'))
    const fork = world.scope.fork('child')
    fork.addFinalizer(world.record('child'))
    const alone = world.scope.fork('alone')
    alone.addFinalizer(world.record('alone'))
    world.scope.addFinalizer(world.record('parent after fork'))

    await alone.close()
    expect(world.events).toEqual(['alone'])
    await world.scope.close()
    expect(fork.signal.aborted).toBe(true)
    expect(world.events).toEqual(['alone', 'parent after fork', 'child', 'parent before fork'])
    expect(world.scope.fork('after close').signal.aborted).toBe(true)
  })

  it('the deadline gives up on a hung finalizer, logs it, and runs the rest', async () => {
    const world = fixture()
    world.scope.addFinalizer(world.record('first'))
    world.scope.addFinalizer(function hung() {
      world.events.push('hung')

      return new Promise<void>(() => {})
    })
    world.scope.addFinalizer(world.record('last'))
    const closing = settled(world.scope.close())
    await flush()
    vi.advanceTimersByTime(TIMEOUT - 1)
    await flush()
    expect(world.events).toEqual(['last', 'hung'])
    expect(closing.settled).toBe(false)
    vi.advanceTimersByTime(1)
    await flush()
    expect(world.events).toEqual(['last', 'hung', 'first'])
    expect(closing.settled).toBe(true)
    expect(world.logs).toEqual([{message: 'scope finalizer timed out', data: {scope: 'test', finalizer: 'hung'}}])
  })
})
