import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {Scope} from '../src/experimental/scope.js'
import {Plugin, Rpc, Tool} from '../src/index.js'
import type {Registration} from '../src/registration.js'
import type {ServerRef} from '../src/servers.js'
import type {Accessor} from 'solid-js'
import * as Experimental from '../src/experimental/index.js'
import {evaluatePluginBundle, inertModule, pluginIdAvailable, type InertModule} from '../src/experimental/host.js'
import * as Host from '../src/host.js'

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

describe('experimental', () => {
  const {CodeBlock, CodeBlockAction, Command, Contract, Plugin: App, Registry, Store} = Experimental
  const Notes = Contract.define<{count(): number}, 'acme.notes'>('acme.notes')
  const Tree = Contract.define<{open(path: string): void}, 'fixture.tree'>('fixture.tree')
  const View = z.object({open: z.boolean()})
  const Consumer = App.define({
    stores: {view: Store.global(View, {open: false}), draft: Store.session(View, {open: true})},
  })
  const Nested = App.define({
    stores: {prefs: Store.global(z.object({items: z.array(z.object({shown: z.boolean()}))}), {items: []})},
  })
  const Fixture = App.define({})

  it('tokens carry their kind and id', () => {
    expect(Registry.define<{readonly label: string}>('details.badge')).toEqual({kind: 'registry', id: 'details.badge'})
    expect(Notes).toEqual({kind: 'contract', id: 'acme.notes'})
    expectTypeOf(Notes.id).toEqualTypeOf<'acme.notes'>()
  })

  it('stores carry their scope, schema, initial value and older homes', () => {
    expect(Store.global(View, {open: false}, 'plugin.acme.view')).toEqual({
      scope: 'global',
      schema: View,
      initial: {open: false},
      from: 'plugin.acme.view',
    })
    expect(Store.project(View, {open: true})).toEqual({
      scope: 'project',
      schema: View,
      initial: {open: true},
      from: undefined,
    })
    expect(Store.session(View, {open: false}, ['b', 'a'])).toEqual({
      scope: 'session',
      schema: View,
      initial: {open: false},
      from: ['b', 'a'],
    })
  })

  it('define returns the plugin and types the setup from the declared stores', () => {
    const plugin = App.define({
      stores: {prefs: Store.global(z.object({on: z.boolean()}), {on: true})},
      setup(ctx) {
        ctx.provide(Notes, {count: () => 1})
        ctx.add(Command, () => ({id: 'open', title: String(ctx.stores.prefs.value.on), run() {}}))
        return () => {}
      },
    })
    const declared = App.define({stores: {count: Store.global(z.object({n: z.number()}), {n: 0})}})
    const setup: Experimental.Plugin.Setup<typeof declared> = (ctx) => {
      ctx.stores.count.set({n: ctx.stores.count.value.n + 1})
    }
    const split = App.define({...declared, setup})
    const wrongImpl = App.define({
      setup(ctx) {
        // @ts-expect-error the implementation must match the contract
        ctx.provide(Notes, {size: () => 1})
      },
    })
    const asyncWindow = App.define({
      // @ts-expect-error a window setup is synchronous
      async setup() {},
    })
    expect(split.setup).toBe(setup)
    expect([plugin, wrongImpl, asyncWindow].map((definition) => typeof definition.setup)).toEqual([
      'function',
      'function',
      'function',
    ])
  })

  it('types the setup context', () => {
    const setup: Experimental.Plugin.Setup<typeof Consumer> = (ctx) => {
      expectTypeOf(ctx.use(Tree)).toEqualTypeOf<Accessor<Experimental.Live<{open(path: string): void}>>>()
      ctx.provide(Tree, {open: () => undefined})
      // @ts-expect-error the implementation must match the contract
      ctx.provide(Tree, {close: () => undefined})
      expectTypeOf(ctx.stores.view.value).toEqualTypeOf<{readonly open: boolean}>()
      expectTypeOf<ReturnType<typeof ctx.stores.draft>['value']>().toEqualTypeOf<{readonly open: boolean} | undefined>()
      expectTypeOf(ctx.desktop).toEqualTypeOf<Experimental.Desktop | undefined>()
      // @ts-expect-error no store named missing
      void ctx.stores.missing
      const session = ctx.sessions.current()
      // @ts-expect-error a session has no workspace files
      void session?.file
      // @ts-expect-error a session has no comments
      void session?.comment
      // @ts-expect-error a session has no composer: read `ctx.screen.current()?.composer`
      void session?.composer
      expectTypeOf<ReturnType<typeof ctx.screen.current>>().toEqualTypeOf<Experimental.SessionScreen | undefined>()
      // @ts-expect-error the screen has no duplicate session accessor
      void ctx.screen.current()?.session
      ctx.stores.view.update((draft) => {
        draft.open = true
      })
      ctx.stores.view.set({open: false})
      // @ts-expect-error update only mutates; replacement values go through set
      ctx.stores.view.update(() => ({open: true}))
      // @ts-expect-error replacement values match the schema
      ctx.stores.view.set({open: 'wrong'})
    }
    expectTypeOf<ReturnType<Experimental.Plugin.Setup<typeof Consumer>>>().toEqualTypeOf<Experimental.Cleanup | void>()
    // @ts-expect-error an async window setup returns a Promise, not nothing or a cleanup
    const asyncSetup: Experimental.Plugin.Setup<typeof Consumer> = async () => {}
    // @ts-expect-error a window setup cannot return an object either
    const returningSetup: Experimental.Plugin.Setup<typeof Consumer> = () => ({open: true})
    const nested: Experimental.Plugin.Setup<typeof Nested> = (ctx) => {
      ctx.stores.prefs.update((draft) => {
        draft.items.push({shown: true})
        const [first] = draft.items
        if (first) first.shown = false
      })
      // @ts-expect-error stored values stay readonly outside update
      ctx.stores.prefs.value.items.push({shown: true})
    }
    expect([setup, asyncSetup, returningSetup, nested].every((value) => typeof value === 'function')).toBe(true)
  })

  it('types panels, slots, tabs, live providers and icons', () => {
    expectTypeOf<Experimental.PanelProps['screen']>().toEqualTypeOf<Experimental.SessionScreen>()
    expectTypeOf<Parameters<Experimental.Panel['list']>[0]['session']>().toEqualTypeOf<Experimental.MountedSession>()
    expectTypeOf<Parameters<Experimental.Panel['list']>[0]['screen']>().toEqualTypeOf<Experimental.SessionScreen>()
    expectTypeOf<Parameters<NonNullable<Experimental.Panel['focus']>>[0]['restored']>().toEqualTypeOf<boolean>()
    expectTypeOf<
      Parameters<NonNullable<Experimental.Panel['normalize']>>[0]['screen']
    >().toEqualTypeOf<Experimental.SessionScreen>()
    expectTypeOf<Parameters<NonNullable<Experimental.Panel['close']>>[0]>().toEqualTypeOf<Experimental.PanelProps>()
    expectTypeOf<Experimental.SlotMap['session.header']['screen']>().toEqualTypeOf<Experimental.SessionScreen>()
    expectTypeOf<Experimental.SlotMap['window.bottom']['screen']>().toEqualTypeOf<never>()
    expectTypeOf<Experimental.PanelTab['fallback']>().toEqualTypeOf<boolean | undefined>()
    const ineligible: Experimental.PanelTab = {id: 'details', title: 'Details', fallback: false}
    expectTypeOf<Extract<Experimental.Live<never>, {status: 'inactive'}>['reason']>().toEqualTypeOf<
      'disabled' | 'failed'
    >()
    // @ts-expect-error only known artwork names belong to SDK icon fields
    const unknownIcon: Experimental.IconName = 'not-an-icon'
    expect([ineligible.fallback, unknownIcon]).toEqual([false, 'not-an-icon'])
  })

  it('types code block contributions', () => {
    const codeBlocks: Experimental.Plugin.Setup<typeof Fixture> = (ctx) => {
      ctx.add(CodeBlock, {languages: ['csv'], render: (block) => (block.code ? block.language : undefined)})
      ctx.add(CodeBlockAction, {
        id: 'run',
        languages: ['sh'],
        icon: 'terminal',
        title: 'Run',
        run: async (input) => void input.session?.directory,
      })
      // @ts-expect-error an action needs an icon
      ctx.add(CodeBlockAction, {id: 'run', languages: ['sh'], title: 'Run', run() {}})
    }
    expect(typeof codeBlocks).toBe('function')
  })

  it('declares the members conciv does not implement yet as undefined', () => {
    expectTypeOf<undefined>().toExtend<Experimental.Context['dialogs']>()
    expectTypeOf<undefined>().toExtend<Experimental.Context['commands']>()
    expectTypeOf<undefined>().toExtend<Experimental.Context['system']>()
    expectTypeOf<undefined>().toExtend<Experimental.Context['attention']>()
    expectTypeOf<undefined>().toExtend<Experimental.Desktop['reveal']>()
    expectTypeOf<undefined>().toExtend<Experimental.Layout['scroll']>()
    expectTypeOf<undefined>().toExtend<Experimental.Composer['setText']>()
    expectTypeOf<undefined>().toExtend<Experimental.Tabs['move']>()
    expectTypeOf<undefined>().toExtend<Experimental.Links['exists']>()
  })
})

describe('host', () => {
  const source = 'throw new Error("Plugin code must not run during resolution")'
  const name = '@fixture/plugin'

  async function fixture(files: Record<string, string>, installed = false) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'conciv-host-')))
    const directory = installed ? path.join(root, 'node_modules', name) : root
    await Promise.all(
      Object.entries(files).map(async ([file, content]) => {
        await mkdir(path.dirname(path.join(directory, file)), {recursive: true})
        await writeFile(path.join(directory, file), content)
      }),
    )
    return {
      target: {directory, ...(installed ? {name} : {})},
      url: (file: string) => pathToFileURL(path.join(directory, file)).href,
      [Symbol.asyncDispose]: () => rm(root, {recursive: true, force: true}),
    }
  }

  describe('Host.resolve', () => {
    it('resolves conventional entrypoints without package.json', async () => {
      await using plugin = await fixture({'index.ts': source, 'rpc.ts': source})
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('index.ts'),
        rpc: plugin.url('rpc.ts'),
        experimental: undefined,
      })
    })

    it.each([undefined, 'lib/backend.js'])('resolves packages without exports using %s', async (main) => {
      await using plugin = await fixture(
        {'package.json': JSON.stringify({name, main}), [main ?? 'index.js']: source, 'rpc.js': source},
        true,
      )
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url(main ?? 'index.js'),
        rpc: plugin.url('rpc.js'),
        experimental: undefined,
      })
    })

    it('resolves local conventional entrypoints with package.json but no exports', async () => {
      await using plugin = await fixture({
        'package.json': JSON.stringify({name, type: 'module'}),
        'index.js': source,
        'rpc.js': source,
      })
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('index.js'),
        rpc: plugin.url('rpc.js'),
        experimental: undefined,
      })
    })

    it('honors exports and prefers the explicit server entrypoint over the root', async () => {
      await using plugin = await fixture(
        {
          'package.json': JSON.stringify({
            name,
            exports: {'.': './dist/root.js', './server': './dist/backend.js', './rpc': './dist/contract.js'},
          }),
          'dist/root.js': source,
          'dist/backend.js': source,
          'dist/contract.js': source,
        },
        true,
      )
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('dist/backend.js'),
        rpc: plugin.url('dist/contract.js'),
        experimental: undefined,
      })
    })

    it('falls back to the root export and uses import rather than require conditions', async () => {
      await using plugin = await fixture(
        {
          'package.json': JSON.stringify({
            name,
            exports: {'.': {import: './dist/server.mjs', require: './dist/server.cjs'}},
          }),
          'dist/server.mjs': source,
          'dist/server.cjs': source,
        },
        true,
      )
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('dist/server.mjs'),
        rpc: undefined,
        experimental: undefined,
      })
    })

    it('resolves the app part entrypoint from exports beside the server entrypoint', async () => {
      await using plugin = await fixture(
        {
          'package.json': JSON.stringify({
            name,
            exports: {'.': './dist/server.js', './plugin-experimental': './dist/plugin-experimental.cjs'},
          }),
          'dist/server.js': source,
          'dist/plugin-experimental.cjs': source,
        },
        true,
      )
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('dist/server.js'),
        rpc: undefined,
        experimental: plugin.url('dist/plugin-experimental.cjs'),
      })
    })

    it('resolves a local directory through its package.json exports, as the published package', async () => {
      await using plugin = await fixture({
        'package.json': JSON.stringify({
          name: 'conciv-acme-plugin',
          exports: {'.': './src/index.ts', './plugin-experimental': './dist/plugin-experimental.cjs'},
        }),
        'src/index.ts': source,
        'dist/plugin-experimental.cjs': source,
        'rpc.ts': source,
        'plugin-experimental.cjs': source,
      })
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('src/index.ts'),
        rpc: undefined,
        experimental: plugin.url('dist/plugin-experimental.cjs'),
      })
    })

    it('names a plugin without a server part after its package, or its local directory', async () => {
      await using named = await fixture({'package.json': JSON.stringify({name: '@acme/conciv-app'})})
      await using unnamed = await fixture({'plugin-experimental.cjs': source})
      await using published = await fixture({'package.json': JSON.stringify({name})}, true)
      expect(Host.packageId(named.target)).toBe('@acme/conciv-app')
      expect(Host.packageId(unnamed.target)).toBe(path.basename(unnamed.target.directory))
      expect(Host.packageId(published.target)).toBe(name)
    })

    it('treats a package.json that does not parse as missing, so resolution falls back to root files', async () => {
      await using plugin = await fixture({'package.json': '{ "name": "bad", ', 'index.ts': source})
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('index.ts'),
        rpc: undefined,
        experimental: undefined,
      })
      expect(Host.packageId(plugin.target)).toBe(path.basename(plugin.target.directory))
    })

    it('resolves the conventional app part entrypoint in a local directory', async () => {
      await using plugin = await fixture({'index.ts': source, 'plugin-experimental.js': source})
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('index.ts'),
        rpc: undefined,
        experimental: plugin.url('plugin-experimental.js'),
      })
    })

    it('does not treat TypeScript or ES module app part sources as the CommonJS bundle', async () => {
      await using local = await fixture({'index.ts': source, 'experimental.tsx': source})
      await using published = await fixture(
        {
          'package.json': JSON.stringify({
            name,
            exports: {'.': './dist/server.js', './plugin-experimental': './dist/plugin-experimental.mjs'},
          }),
          'dist/server.js': source,
          'dist/plugin-experimental.mjs': source,
        },
        true,
      )
      expect(Host.resolve(local.target).experimental).toBeUndefined()
      expect(Host.resolve(published.target).experimental).toBeUndefined()
    })

    it('does not return an exported entrypoint whose file is missing', async () => {
      await using plugin = await fixture(
        {'package.json': JSON.stringify({name, exports: {'./rpc': './missing.js'}})},
        true,
      )
      expect(Host.resolve(plugin.target)).toEqual({server: undefined, rpc: undefined, experimental: undefined})
    })

    it('resolves a local folder plugin from its TypeScript source', async () => {
      await using plugin = await fixture({'index.ts': source, 'rpc.ts': source, 'plugin-experimental.tsx': source})
      expect(Host.resolve(plugin.target)).toEqual({
        server: plugin.url('index.ts'),
        rpc: plugin.url('rpc.ts'),
        experimental: plugin.url('plugin-experimental.tsx'),
      })
    })
  })

  it.each([
    ['acme', true],
    ['file', false],
    ['file.extra', false],
    ['tools', false],
    ['conciv', false],
    ['conciv.acme', false],
    ['conciv-acme', true],
  ])('a plugin app part may take the id %s: %s', (id, available) => {
    const builtins = [{id: 'file'}, {id: 'tools.git'}]

    expect(pluginIdAvailable(id, builtins)).toBe(available)
  })

  describe('plugin app part bundles', () => {
    const modules = new Map<string, object>([
      [
        '@conciv/plugin/experimental',
        {Contract: Experimental.Contract, Plugin: Experimental.Plugin, Store: Experimental.Store},
      ],
      ['zod', {z}],
    ])

    const evaluate = (code: string) =>
      evaluatePluginBundle(code, {
        require: (required) => {
          const module = modules.get(required)

          if (module) return module

          throw new Error(`not shared: ${required}`)
        },
      })

    it("read the default export's declarations and setups", () => {
      const bundle = evaluate(`
        const sdk = require("@conciv/plugin/experimental")
        const {z} = require("zod")
        exports.default = sdk.Plugin.define({
          stores: { view: sdk.Store.project(z.object({ open: z.boolean() }), { open: false }) },
          setup() {},
        })
      `)

      expect(bundle.definition.stores?.view?.scope).toBe('project')
      expect(bundle.definition.stores?.view?.initial).toEqual({open: false})
      expect(bundle.setup).toBeTypeOf('function')
    })

    it("accept a bundler's default mode, where the plugin is the module itself", () => {
      expect(evaluate('module.exports = { setup() {} }').setup).toBeTypeOf('function')
    })

    it.each([
      ['a store without a schema', 'stores: { count: { scope: "global", initial: 0 } }', 'schema'],
      ['a setup that is not a function', 'setup: true', 'setup'],
    ])('reject a plugin with %s', (_, field, named) => {
      const evaluated = () => evaluate(`exports.default = { ${field} }`)

      expect(evaluated).toThrow('must default-export a `Plugin.define`')
      expect(evaluated).toThrow(named)
    })

    it('have at least one setup', () => {
      expect(() => evaluate('exports.default = {}')).toThrow('must have a window `setup`')
    })
  })

  describe('inert modules', () => {
    it('give module-scope code a placeholder that ignores writes and never poses as a promise or a class', async () => {
      const seen: {ready?: InertModule; window?: boolean; name?: string} = {}

      const probe = {
        ready: (value: InertModule) => void (seen.ready = value),
        window: (value: boolean) => void (seen.window = value),
        name: (value: string) => void (seen.name = value),
      }

      evaluatePluginBundle(
        `
          const fs = require("node:fs")
          const probe = require("probe")
          fs.app.name = "patched"
          probe.ready(fs.app.whenReady())
          probe.window({} instanceof fs.BrowserWindow)
          probe.name(String(fs.app.name))
          module.exports = { setup() {} }
        `,
        {require: (required) => (required === 'probe' ? probe : inertModule(required))},
      )

      expect(await Promise.resolve(seen.ready)).toBe(seen.ready)
      expect(seen.window).toBe(false)
      expect(seen.name).toBe('[inert module node:fs]')
    })
  })
})
