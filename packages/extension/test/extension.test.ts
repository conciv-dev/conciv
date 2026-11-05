import {describe, expect, it, vi, test} from 'vitest'
import ts from 'typescript'
import {TOKENS} from '@conciv/ui-kit-system/tokens'
import {buildCatalog, scaffold, validateSource, type ScaffoldKind} from '../src/catalog.js'
import {defineExtension} from '../src/define-extension.js'
import {defineAttachment} from '../src/define-attachment.js'
import {collectAttachmentCards, collectToolRenderers, collectClientEffects} from '../src/collect-client.js'
import {z} from 'zod'
import {defineTool, type ClientToolCtx, isToolError, toolError} from '../src/define-tool.js'
import {
  type ClientEffect,
  type ServerToolPageAccess,
  type ServerToolRegistryAccess,
  type ToolRequest,
} from '../src/types.js'
import {Hono} from 'hono'
import {SessionId} from '@conciv/protocol/chat-types'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {pageVerbError, isPageVerbError} from '../src/page-errors.js'
import {os, createRouterClient, type AnyRouter} from '@orpc/server'
import {rpcWebsocketRoute, RPC_WS_PATH, type UpgradeWebSocket} from '../src/rpc-mount.js'
import {isDefinedError, ORPCError} from '@orpc/client'
import {
  createToolRegistry,
  TOOL_TRANSPORT_ERRORS,
  type RegistryToolMeta,
  type ToolRegistry,
} from '../src/tool-registry.js'
import {walkRegistryProcedures} from '../src/registry-walk.js'
import {type PageErrorCode} from '@conciv/protocol/page-types'

describe('catalog', () => {
  describe('extension catalog (new contract projection)', () => {
    it('projects every token into the catalog', () => {
      const cat = buildCatalog()
      const names = cat.tokens.map((t) => t.name)
      for (const name of Object.keys(TOKENS)) expect(names).toContain(name)
      expect(cat.tokens.find((t) => t.name === 'chat-accent')?.cssVar).toBe('--chat-accent')
    })

    it('lists the six extension slots', () => {
      const slots = buildCatalog().slots.map((s) => s.name)
      for (const name of ['header', 'footer', 'composer', 'empty', 'status', 'widget']) expect(slots).toContain(name)
    })

    it('teaches the new entry convention (defineExtension({name}) with .client/.server)', () => {
      const {entry} = buildCatalog().conventions
      expect(entry).toContain('defineExtension({name')
      expect(entry).toContain('.client(')
      expect(entry).toContain('.server(')
    })

    it('scaffolds a full extension on the new contract surfaces', () => {
      const src = scaffold('full', {name: 'demo'})
      expect(src).toContain('defineExtension({name:')
      expect(src).toContain('.client(')
      expect(src).toContain('.server(')
      expect(src).toContain('useSlot')
    })

    it('describes the composer slot through the ComposerActions primitives', () => {
      const composer = buildCatalog().slots.find((slot) => slot.name === 'composer')
      expect(composer?.description).toContain('ComposerActions')
      expect(composer?.description).toContain('@conciv/ui-kit-chat')
    })

    it('warns the authoring agent that @conciv/ui-kit-chat needs a package.json dependency', () => {
      const composer = buildCatalog().slots.find((slot) => slot.name === 'composer')
      expect(composer?.description).toContain('package.json')
      expect(composer?.description).toMatch(/dependency|dependencies/)
    })

    it('scaffolds composer buttons through the ComposerActions primitives, never a raw button', () => {
      for (const kind of ['composer-action', 'full'] as ScaffoldKind[]) {
        const src = scaffold(kind, {name: 'demo'})
        expect(src).toContain("import {ComposerActions} from '@conciv/ui-kit-chat'")
        expect(src).toContain('<ComposerActions.ActionButton')
        expect(src).not.toContain('<button')
      }
    })

    it('never emits the internal __ properties in a scaffold', () => {
      for (const kind of ['composer-action', 'tool', 'tool-renderer', 'component', 'full'] as ScaffoldKind[]) {
        const src = scaffold(kind, {name: 'demo'})
        expect(src).not.toContain('__client')
        expect(src).not.toContain('__server')
        expect(src).not.toContain('__serverRun')
        expect(src).not.toContain('__render')
      }
    })

    it('validate errors when the defineExtension default export is missing', () => {
      const res = validateSource('export const notAnExtension = 1')
      expect(res.ok).toBe(false)
      expect(res.issues.some((i) => i.level === 'error' && i.message.includes('defineExtension'))).toBe(true)
    })

    it('no longer treats a theme field as a customization surface', () => {
      const src = `import {defineExtension} from '@conciv/extension'
export default defineExtension({name: 'x', theme: {'chat-panel': '#000'}})`
      const res = validateSource(src)
      expect(res.ok).toBe(true)
      expect(res.issues).toHaveLength(0)
    })

    it('validate warns on a top-level node import with no .server() half', () => {
      const src = `import {readFile} from 'node:fs/promises'
export default defineExtension({name: 'x'})`
      const res = validateSource(src)
      expect(res.issues.some((i) => i.message.includes('node:'))).toBe(true)
    })

    it('every scaffold kind emits source that parses as TS/TSX', () => {
      const kinds: ScaffoldKind[] = ['composer-action', 'tool', 'tool-renderer', 'component', 'full']
      for (const kind of kinds) {
        const out = ts.transpileModule(scaffold(kind, {name: 'demo'}), {
          fileName: `${kind}.tsx`,
          reportDiagnostics: true,
          compilerOptions: {jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext},
        })
        const syntactic = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
        expect(syntactic, `${kind} scaffold should parse`).toHaveLength(0)
      }
    })
  })
})

describe('collect attachment cards', () => {
  describe('collectAttachmentCards', () => {
    it('gathers registered cards keyed by mime, first-wins', () => {
      const CardA = () => null
      const CardB = () => null
      const first = defineAttachment({mime: 'application/x-test'})
      first.card(CardA)
      const duplicate = defineAttachment({mime: 'application/x-test'})
      duplicate.card(CardB)
      const cards = collectAttachmentCards([
        defineExtension({name: 'a', attachments: [first]}),
        defineExtension({name: 'b', attachments: [duplicate]}),
      ])
      expect(cards).toEqual([{mime: 'application/x-test', render: CardA}])
    })

    it('ignores attachments with no card', () => {
      const bare = defineAttachment({mime: 'application/x-noop'})
      expect(collectAttachmentCards([defineExtension({name: 'c', attachments: [bare]})])).toEqual([])
    })
  })
})

describe('collect client', () => {
  const Card = () => null
  const drawCard = {render: Card, hasEmbeddedBody: () => true}
  const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({})}).render(drawCard)

  function makeEffect(name: string): ClientEffect {
    let enabled = false
    return {name, description: `${name} effect`, enabled: () => enabled, set: (value) => (enabled = value)}
  }

  describe('collectToolRenderers', () => {
    it('returns a render entry per tool that has a .render() card', () => {
      const entries = collectToolRenderers([defineExtension({name: 'canvas', tools: [draw]})])
      expect(entries).toHaveLength(1)
      expect(entries[0]?.names).toEqual(['draw'])
      expect(entries[0]?.render).toBe(Card)
    })

    it('skips tools without a render half', () => {
      const bare = defineTool({name: 'bare', description: 'd', inputSchema: z.object({})})
      expect(collectToolRenderers([defineExtension({name: 'x', tools: [bare]})])).toHaveLength(0)
    })

    it('dedups by name across extensions, first wins', () => {
      const a = defineExtension({name: 'a', tools: [draw]})
      const b = defineExtension({name: 'b', tools: [draw]})
      expect(collectToolRenderers([a, b])).toHaveLength(1)
    })
  })

  describe('collectClientEffects', () => {
    it('collects every effect across instances, keyed by name', () => {
      const banner = makeEffect('banner')
      const confetti = makeEffect('confetti')
      const entries = collectClientEffects([
        {name: 'a', effects: [banner]},
        {name: 'b', effects: [confetti]},
      ])
      expect(entries).toEqual([banner, confetti])
    })

    it('dedups by name across instances, first wins, and warns naming both the kept and dropped extension', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const kept = makeEffect('banner')
      const dropped = makeEffect('banner')
      const entries = collectClientEffects([
        {name: 'a', effects: [kept]},
        {name: 'b', effects: [dropped]},
      ])
      expect(entries).toEqual([kept])
      expect(warn).toHaveBeenCalledTimes(1)
      const [message] = warn.mock.calls[0] ?? []
      expect(message).toContain('"a"')
      expect(message).toContain('"b"')
      expect(message).toContain('banner')
      warn.mockRestore()
    })
  })
})

describe('define attachment', () => {
  describe('defineAttachment', () => {
    it('records card and expand on the builder, matched by mime', () => {
      const Card = () => null
      const attachment = defineAttachment<{depth: number}>({mime: 'application/x-test'})
      attachment.card(Card)
      attachment.server((part, ctx) => [{type: 'text', content: `${part.source.mimeType}:${ctx.depth}`}])
      expect(attachment.mime).toBe('application/x-test')
      expect(attachment.__card).toBe(Card)
      expect(attachment.__expand).toBeTypeOf('function')
    })
  })
})

describe('define extension', () => {
  test('parseConfig applies defaults; absent schema yields {}', () => {
    const withSchema = defineExtension({name: 'x', configSchema: z.object({runner: z.string().default('vitest')})})
    expect(withSchema.parseConfig({})).toEqual({runner: 'vitest'})
    expect(defineExtension({name: 'y'}).parseConfig(undefined)).toEqual({})
  })

  test('carries connectGate through defineExtension', () => {
    const gate = {preflight: async () => null}
    const ext = defineExtension({name: 'gate-test', connectGate: gate})
    expect(ext.connectGate).toBe(gate)
  })

  test('server factory receives api and returns context + app + dispose', () => {
    const tool = defineTool({
      name: 'mul',
      description: 'd',
      inputSchema: z.object({n: z.number()}),
    }).server((input, ctx: {factor: number}) => input.n * ctx.factor)
    const ext = defineExtension({name: 'm', tools: [tool]}).server(() => {
      const app = new Hono().get('/ping', (c) => c.json({ok: true}))
      return {context: {factor: 10}, app, dispose: () => {}}
    })
    expect(ext.__server).toBeTypeOf('function')
  })
})

describe('define tool', () => {
  const request: ToolRequest = {sessionId: SessionId.parse('conciv_define_tool'), model: null}

  const noPage: ServerToolPageAccess = {
    call: (name) => Promise.reject(new Error(`${name}: this test never reaches the page`)),
  }

  const noTools: ServerToolRegistryAccess = {
    call: (name) => Promise.reject(new Error(`${name}: this test never reaches the registry`)),
  }

  const unusedCtx: ClientToolCtx = {
    get document(): Document {
      throw new Error('this test never touches the document')
    },
    target: () => {
      throw new Error('this test never resolves a target')
    },
    resolve: () => null,
    addRef: () => 'v1',
    resetRefs: () => {},
    consoleEntries: () => [],
    effects: [],
  }

  test('tool execute receives input and injected context', async () => {
    const tool = defineTool({
      name: 't',
      description: 'd',
      inputSchema: z.object({n: z.number()}),
    }).server((input, ctx: {factor: number}) => input.n * ctx.factor)
    expect(await tool.__serverRun?.({n: 3}, {factor: 2}, request, noPage, noTools)).toBe(6)
  })

  test('the server handler receives the value the registry already validated, and never reparses it', async () => {
    const tool = defineTool({
      name: 't',
      description: 'd',
      inputSchema: z.object({n: z.string().transform((raw) => Number(raw))}),
    }).server((input) => input.n + 1)
    expect(await tool.__serverRun?.({n: 42}, undefined, request, noPage, noTools)).toBe(43)
  })

  test('every derivation leaves the base builder unbound and never leaks into a sibling derivation', () => {
    const base = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})})
    const bound = base.server((input) => input.n)
    const forwarded = base.client((input) => input.n)
    const rendered = base.render({render: () => null, hasEmbeddedBody: () => true})
    expect(base.binding).toBeUndefined()
    expect(base.__serverRun).toBeUndefined()
    expect(base.__clientExecute).toBeUndefined()
    expect(base.__render).toBeUndefined()
    expect(bound.binding).toBe('server')
    expect(bound.__clientExecute).toBeUndefined()
    expect(bound.__render).toBeUndefined()
    expect(forwarded.binding).toBe('client')
    expect(forwarded.__serverRun).toBeUndefined()
    expect(rendered.binding).toBeUndefined()
    expect(rendered.__render?.render).toBeTypeOf('function')
    expect(rendered.__render?.hasEmbeddedBody).toBeTypeOf('function')
  })

  test('streamTitle is carried onto the builder', () => {
    const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({}), streamTitle: 'Running tests'})
    expect(tool.streamTitle).toBe('Running tests')
  })

  test('a client binding without a handler still claims the binding and refuses a second one', () => {
    const base = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})})
    const forwarded = base.client()
    expect(forwarded.binding).toBe('client')
    expect(forwarded.__clientExecute).toBeUndefined()
    expect(() => forwarded.client((input) => input.n)).toThrow(/already has a client binding/)
    expect(() => forwarded.server((input) => input.n)).toThrow(/already has a client binding/)
    expect(base.binding).toBeUndefined()
  })

  test('a client binding with a handler stores it without leaking into a handler-free sibling', async () => {
    const base = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})})
    const forwarded = base.client((input) => input.n * 2)
    expect(await forwarded.__clientExecute?.({n: 4}, unusedCtx)).toBe(8)
    expect(base.client().__clientExecute).toBeUndefined()
  })
})

describe('host subpath', () => {
  async function distExports(entry: string): Promise<object> {
    return await import(new URL(`../dist/${entry}.js`, import.meta.url).href)
  }

  test('the root entry hides the host wiring surface', async () => {
    const root = await distExports('index')
    expect(Object.keys(root)).not.toContain('getHostApi')
    expect(Object.keys(root)).not.toContain('HostApiProvider')
  })

  test('the host entry exposes the host wiring surface', async () => {
    const host = await distExports('host')
    expect(Object.keys(host)).toContain('getHostApi')
    expect(Object.keys(host)).toContain('HostApiProvider')
  })
})

describe('index browser safe', () => {
  test('the package index never imports @orpc/server, so browser and SSR graphs stay free of it', async () => {
    const indexDist = fileURLToPath(new URL('../dist/index.js', import.meta.url))
    const source = await readFile(indexDist, 'utf8')
    expect(source).not.toContain('@orpc/server')
    expect(source).not.toContain('tool-registry')
  })
})

describe('page errors', () => {
  describe('pageVerbError', () => {
    it('builds a typed, guardable error carrying extension and verb', () => {
      const error = pageVerbError('no-widget', 'tanstack', 'routerState', 'no widget connected')
      expect(isPageVerbError(error)).toBe(true)
      expect(error.code).toBe('no-widget')
      expect(error.extension).toBe('tanstack')
      expect(error.verb).toBe('routerState')
      expect(error.message).toBe('no widget connected')
      expect(isPageVerbError(new Error('plain'))).toBe(false)
    })
  })
})

describe('rpc websocket route', () => {
  const router = {ping: os.input(z.object({value: z.string()})).handler(({input}) => ({pong: input.value}))}

  const strandedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response(null, {status: 500}))

  const adaptedUpgrade: UpgradeWebSocket = () => () => Promise.resolve(new Response())

  function upgradeRequest(): Request {
    return new Request(`http://127.0.0.1${RPC_WS_PATH}`, {
      headers: {upgrade: 'websocket', connection: 'Upgrade'},
    })
  }

  describe('the rpc websocket route refuses to fail silently', () => {
    it('reports a split @hono/node-server instance instead of closing the socket quietly', async () => {
      const reported: string[] = []
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {upgrade: strandedUpgrade, onError: (message) => reported.push(message)}),
      )
      const response = await app.fetch(upgradeRequest())
      expect(response.status).toBe(500)
      expect(reported.join('\n')).toContain('different @hono/node-server module instance')
    })

    it('passes an upgrade the adapter accepted straight through', async () => {
      const reported: string[] = []
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {upgrade: adaptedUpgrade, onError: (message) => reported.push(message)}),
      )
      const response = await app.fetch(upgradeRequest())
      expect(response.status).toBe(200)
      expect(reported).toEqual([])
    })

    it('leaves a plain request on the route alone', async () => {
      const app = new Hono().get(
        RPC_WS_PATH,
        rpcWebsocketRoute(router, {
          upgrade: () => () => Promise.resolve(new Response('not an upgrade', {status: 426})),
        }),
      )
      const response = await app.fetch(new Request(`http://127.0.0.1${RPC_WS_PATH}`))
      expect(response.status).toBe(426)
    })
  })
})

describe('tool registry', () => {
  const TEST_REQUEST: ToolRequest = {sessionId: SessionId.parse('conciv_test'), model: null}

  function testClient(registry: ToolRegistry, request: ToolRequest = TEST_REQUEST): unknown {
    return createRouterClient<AnyRouter, Record<never, never>>(registry.router, {context: {request}})
  }

  type ToolCall = (input: unknown) => Promise<unknown>

  function isToolCall(value: unknown): value is ToolCall {
    return typeof value === 'function'
  }

  function navigate(node: unknown, segment: string): unknown {
    if (node === null || (typeof node !== 'object' && typeof node !== 'function')) {
      throw new Error(`cannot navigate into "${segment}"`)
    }
    return Reflect.get(node, segment)
  }

  function clientTool(client: unknown, name: string): ToolCall {
    const target = name.split('.').reduce<unknown>(navigate, client)
    if (!isToolCall(target)) throw new Error(`no callable tool at "${name}"`)
    return target
  }

  async function callCaught(call: ToolCall, input: unknown): Promise<ORPCError<string, unknown> | Error> {
    try {
      await call(input)
    } catch (error) {
      if (error instanceof Error) return error
      throw error
    }
    throw new Error('expected the call to fail')
  }

  function fillTool() {
    return defineTool({
      name: 'page_fill',
      description: 'type text into a field',
      inputSchema: z.object({target: z.string(), mode: z.enum(['exact', 'fuzzy']).optional()}),
      outputSchema: z.object({filled: z.boolean()}),
      errors: {
        ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})},
      },
      meta: {summary: 'type text into a field', category: 'act', mutating: true, mirrors: true, keywords: ['type']},
    })
  }

  function statusTool() {
    return defineTool({
      name: 'server_status',
      description: 'report server status',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.boolean()}),
      meta: {summary: 'report whether the server is healthy', category: 'read'},
    }).server(() => ({ok: true}))
  }

  test('oRPC pin: the walk finds procedures added to the router object after construction, at nested paths', () => {
    const early = os.input(z.object({})).handler(() => 'early')
    const router: Record<string, AnyRouter> = {alpha: {inner: early}}
    const late = os.input(z.object({})).handler(() => 'late')
    router.beta = {deep: {tool: late}}
    const paths = walkRegistryProcedures(router).map((entry) => entry.path.join('.'))
    expect(paths).toEqual(['alpha.inner', 'beta.deep.tool'])
  })

  test('oRPC pin: the walk reports one procedure registered at two paths twice, so registration must guard duplicates', () => {
    const procedure = os.input(z.object({})).handler(() => 'twice')
    const router: Record<string, AnyRouter> = {first: procedure, second: procedure}
    const entries = walkRegistryProcedures(router)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.procedure).toBe(entries[1]?.procedure)
  })

  test('oRPC pin: a procedure without its own meta silently inherits the $meta base default in the walk', () => {
    const base = os.$meta<{summary: string}>({summary: 'inherited-default'})
    const router: Record<string, AnyRouter> = {
      bare: base.handler(() => null),
      own: base.meta({summary: 'its own summary'}).handler(() => null),
    }
    const summaries = walkRegistryProcedures(router).map((entry) => entry.meta['summary'])
    expect(summaries).toEqual(['inherited-default', 'its own summary'])
  })

  test('defineTool rejects catalog metadata without a usable summary', () => {
    expect(() =>
      defineTool({
        name: 'page_fill',
        description: 'd',
        inputSchema: z.object({}),
        meta: {summary: '   '},
      }),
    ).toThrow(/summary/)
  })

  test('defineTool rejects a summary that just repeats the tool name', () => {
    expect(() =>
      defineTool({
        name: 'page_fill',
        description: 'd',
        inputSchema: z.object({}),
        meta: {summary: 'page_fill'},
      }),
    ).toThrow(/summary/)
  })

  test('registering a tool without catalog metadata fails', () => {
    const registry = createToolRegistry()
    const tool = defineTool({
      name: 'bare_tool',
      description: 'd',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    }).server(() => ({}))
    expect(() => registry.register(tool, {owner: 'a test registrant'})).toThrow(/summary/)
  })

  test('registering a tool without an output schema fails', () => {
    const registry = createToolRegistry()
    const tool = defineTool({
      name: 'no_output',
      description: 'd',
      inputSchema: z.object({}),
      meta: {summary: 'a tool with no output schema'},
    }).server(() => ({}))
    expect(() => registry.register(tool, {owner: 'a test registrant'})).toThrow(/outputSchema/)
  })

  test('registering an unbound tool fails', () => {
    const registry = createToolRegistry()
    const tool = defineTool({
      name: 'un_bound',
      description: 'd',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      meta: {summary: 'a tool nobody bound'},
    })
    expect(() => registry.register(tool, {owner: 'a test registrant'})).toThrow(/server\(\)|client\(\)/)
  })

  test('registering the same tool name twice fails loudly', () => {
    const registry = createToolRegistry()
    registry.register(statusTool(), {owner: 'a test registrant'})
    expect(() => registry.register(statusTool(), {owner: 'a test registrant'})).toThrow(/declared by both/)
  })

  test('one tool name carries one tool: a client-bound and a server-bound declaration of it collide under one owner', () => {
    const registry = createToolRegistry()
    const shared = {
      name: 'tanstack_router_state',
      description: 'read the router state',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.boolean()}),
      meta: {summary: 'read the router state of the running app', category: 'read'},
    }
    registry.register(
      defineTool(shared).server(() => ({ok: true})),
      {owner: 'extension "tanstack"'},
    )

    expect(() => registry.register(defineTool(shared).client(), {owner: 'extension "tanstack"'})).toThrow(
      /tool "tanstack_router_state" is declared by both extension "tanstack" and extension "tanstack"/,
    )
  })

  test('a tool may not claim a transport error code as its own', () => {
    const registry = createToolRegistry()
    const tool = defineTool({
      name: 'greedy_tool',
      description: 'd',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      errors: {PAGE_TIMEOUT: {message: 'mine now'}},
      meta: {summary: 'a tool claiming a transport code'},
    }).server(() => ({}))
    expect(() => registry.register(tool, {owner: 'a test registrant'})).toThrow(/transport/)
  })

  test('a declared server tool error arrives defined and narrowable with its code and data', async () => {
    const registry = createToolRegistry()
    const locate = defineTool({
      name: 'page_locate',
      description: 'find an element',
      inputSchema: z.object({target: z.string()}),
      outputSchema: z.object({found: z.boolean()}),
      errors: {ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}},
      meta: {summary: 'find an element on the page'},
    }).server((input) => {
      throw toolError('ELEMENT_NOT_FOUND', {data: {target: input.target}})
    })
    registry.register(locate, {owner: 'a test registrant'})
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'page_locate'), {target: '#missing'})
    expect(isDefinedError(failure)).toBe(true)
    if (!isDefinedError(failure)) return
    expect(failure.code).toBe('ELEMENT_NOT_FOUND')
    expect(failure.data).toEqual({target: '#missing'})
  })

  test('an undeclared server failure stays distinguishable from a declared one', async () => {
    const registry = createToolRegistry()
    const explode = defineTool({
      name: 'server_explode',
      description: 'always fails',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      errors: {KNOWN: {message: 'a declared failure'}},
      meta: {summary: 'a tool that throws an undeclared error'},
    }).server(() => {
      throw new Error('boom')
    })
    registry.register(explode, {owner: 'a test registrant'})
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'server_explode'), {})
    expect(failure).toBeInstanceOf(Error)
    expect(isDefinedError(failure)).toBe(false)
  })

  test('a tool registered after the client was created is callable', async () => {
    const registry = createToolRegistry()
    const client = testClient(registry)
    registry.register(statusTool(), {owner: 'a test registrant'})
    await expect(clientTool(client, 'server_status')({})).resolves.toEqual({ok: true})
  })

  test('the catalog lists every tool with path, summary and binding', () => {
    const registry = createToolRegistry()
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    registry.register(statusTool(), {owner: 'a test registrant'})
    expect(registry.catalog.list()).toEqual([
      {
        name: 'page_fill',
        path: ['page_fill'],
        binding: 'client',
        summary: 'type text into a field',
        category: 'act',
        hint: undefined,
        icon: undefined,
        label: undefined,
        reachable: false,
      },
      {
        name: 'server_status',
        path: ['server_status'],
        binding: 'server',
        summary: 'report whether the server is healthy',
        category: 'read',
        hint: undefined,
        icon: undefined,
        label: undefined,
        reachable: true,
      },
    ])
  })

  test('the catalog answers with no page client and marks client tools reachable once one is injected', () => {
    const connected = createToolRegistry({pageCaller: async () => ({filled: true})})
    connected.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    expect(connected.catalog.list().map((entry) => entry.reachable)).toEqual([true])
  })

  test('the catalog returns one tool full signature: fields, requiredness, enums, both schemas, declared errors', () => {
    const registry = createToolRegistry()
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    const signature = registry.catalog.get('page_fill')
    expect(signature.name).toBe('page_fill')
    expect(signature.category).toBe('act')
    expect(signature.mutating).toBe(true)
    expect(signature.mirrors).toBe(true)
    expect(signature.keywords).toEqual(['type'])
    expect(signature.inputSchema).toMatchObject({
      type: 'object',
      required: ['target'],
      properties: {mode: {enum: ['exact', 'fuzzy']}},
    })
    expect(signature.outputSchema).toMatchObject({type: 'object', properties: {filled: {type: 'boolean'}}})
    expect(signature.errors).toContainEqual({
      code: 'ELEMENT_NOT_FOUND',
      message: 'no element matched the target',
      transport: false,
    })
    expect(signature.errors).toContainEqual({
      code: 'NO_PAGE_CLIENT',
      message: TOOL_TRANSPORT_ERRORS['NO_PAGE_CLIENT']?.message ?? '',
      transport: true,
    })
  })

  test('asking the catalog for an unknown tool fails loudly', () => {
    const registry = createToolRegistry()
    expect(() => registry.catalog.get('no.such.tool')).toThrow(/unknown tool/)
  })

  test('calling a client tool with no page client raises NO_PAGE_CLIENT as a defined error', async () => {
    const registry = createToolRegistry()
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'page_fill'), {target: '#name'})
    expect(isDefinedError(failure)).toBe(true)
    if (!isDefinedError(failure)) return
    expect(failure.code).toBe('NO_PAGE_CLIENT')
  })

  test('page failures map onto their declared transport error codes', async () => {
    const cases: [PageErrorCode, string][] = [
      ['timeout', 'PAGE_TIMEOUT'],
      ['unknown-verb', 'UNKNOWN_TOOL'],
      ['invalid-args', 'INVALID_ARGS'],
      ['no-widget', 'NO_PAGE_CLIENT'],
      ['handler-error', 'HANDLER_ERROR'],
    ]
    for (const [pageCode, transportCode] of cases) {
      const registry = createToolRegistry({
        pageCaller: async (tool) => {
          throw pageVerbError(pageCode, 'core', tool.name, `page failed with ${pageCode}`)
        },
      })
      registry.register(
        fillTool().client(() => ({filled: true})),
        {owner: 'a test registrant'},
      )
      const client = testClient(registry)
      const failure = await callCaught(clientTool(client, 'page_fill'), {target: '#name'})
      expect(isDefinedError(failure)).toBe(true)
      if (!isDefinedError(failure)) continue
      expect(failure.code).toBe(transportCode)
    }
  })

  test('an undeclared page failure stays distinguishable from the declared transport errors', async () => {
    const registry = createToolRegistry({
      pageCaller: async () => {
        throw new Error('kaboom')
      },
    })
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'page_fill'), {target: '#name'})
    expect(failure).toBeInstanceOf(Error)
    expect(isDefinedError(failure)).toBe(false)
  })

  test('a successful client tool call forwards name and input over the page caller seam', async () => {
    const calls: [{name: string; mutating: boolean}, unknown][] = []
    const registry = createToolRegistry({
      pageCaller: async (tool, input) => {
        calls.push([tool, input])
        return {filled: true}
      },
    })
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    const client = testClient(registry)
    await expect(clientTool(client, 'page_fill')({target: '#name'})).resolves.toEqual({filled: true})
    expect(calls).toEqual([[{name: 'page_fill', mutating: true}, {target: '#name'}]])
  })

  function bareServerTool(name: string, summary: string) {
    return defineTool({
      name,
      description: 'd',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      meta: {summary},
    }).server(() => ({}))
  }

  test('a tool name that is the prefix of another is an ordinary sibling, not a branch', () => {
    const registry = createToolRegistry()
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    registry.register(bareServerTool('page', 'read the whole page'), {owner: 'a test registrant'})
    const client = testClient(registry)
    expect(typeof clientTool(client, 'page_fill')).toBe('function')
    expect(typeof clientTool(client, 'page')).toBe('function')
  })

  test('throwing a declared error without its declared data fails loudly instead of arriving defined:false', async () => {
    const registry = createToolRegistry()
    const locate = defineTool({
      name: 'page_locate',
      description: 'find an element',
      inputSchema: z.object({target: z.string()}),
      outputSchema: z.object({found: z.boolean()}),
      errors: {ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}},
      meta: {summary: 'find an element on the page'},
    }).server(() => {
      throw toolError('ELEMENT_NOT_FOUND')
    })
    registry.register(locate, {owner: 'a test registrant'})
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'page_locate'), {target: '#missing'})
    expect(isDefinedError(failure)).toBe(false)
    expect(failure.message).toMatch(/page_locate/)
    expect(failure.message).toMatch(/ELEMENT_NOT_FOUND/)
    expect(failure.message).toMatch(/declared/)
  })

  test('a transform input schema is validated once and the handler receives the transformed value', async () => {
    const registry = createToolRegistry()
    const parse = defineTool({
      name: 'math_parse',
      description: 'parse a number',
      inputSchema: z.object({n: z.string().transform(Number)}),
      outputSchema: z.object({value: z.number()}),
      meta: {summary: 'turn a numeric string into a number'},
    }).server((input) => ({value: input.n}))
    registry.register(parse, {owner: 'a test registrant'})
    const client = testClient(registry)
    await expect(clientTool(client, 'math_parse')({n: '42'})).resolves.toEqual({value: 42})
  })

  test('registration context and the caller request reach a server handler', async () => {
    const registry = createToolRegistry()
    const seen: unknown[] = []
    const probe = defineTool({
      name: 'server_probe',
      description: 'record ctx and request',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.boolean()}),
      meta: {summary: 'record the execution context'},
    }).server((_input, ctx, request) => {
      seen.push(ctx, request)
      return {ok: true}
    })
    registry.register(probe, {owner: 'a test registrant', context: {db: 'handle'}})
    const request: ToolRequest = {sessionId: SessionId.parse('conciv_s1'), model: null}
    const client = testClient(registry, request)
    await clientTool(client, 'server_probe')({})
    expect(seen).toEqual([{db: 'handle'}, request])
  })

  test('a toolError with an undeclared code rethrows the original error instead of a defined:false ORPCError', async () => {
    const registry = createToolRegistry()
    const typo = defineTool({
      name: 'server_typo',
      description: 'throws a typo code',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      errors: {KNOWN: {message: 'a declared failure'}},
      meta: {summary: 'a tool that throws an undeclared tool error'},
    }).server(() => {
      throw toolError('KNOWN_TYPO', {message: 'original failure text'})
    })
    registry.register(typo, {owner: 'a test registrant'})
    const client = testClient(registry)
    const failure = await callCaught(clientTool(client, 'server_typo'), {})
    expect(isDefinedError(failure)).toBe(false)
    expect(isToolError(failure)).toBe(true)
    expect(failure.message).toBe('original failure text')
  })

  test('a client tool declared outside the catalog stays callable but is never listed', async () => {
    const registry = createToolRegistry({pageCaller: async () => ({filled: true})})
    const hidden = defineTool({
      name: 'page_measure',
      description: 'measure the page',
      inputSchema: z.object({}),
      outputSchema: z.object({filled: z.boolean()}),
      meta: {summary: 'measure the page', catalog: false},
    })
    registry.register(hidden.client(), {owner: 'a test registrant'})
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    expect(registry.catalog.list().map((entry) => entry.name)).toEqual(['page_fill'])
    expect(registry.sandboxTools().map((tool) => tool.name)).toEqual(['page_fill'])
    expect(() => registry.catalog.get('page_measure')).toThrow(/unknown tool/)
    expect(await registry.call('page_measure', {}, {request: TEST_REQUEST})).toEqual({filled: true})
  })

  test('client tool reachability follows the liveness callback on the same registry instance', () => {
    const liveness = {connected: false}
    const registry = createToolRegistry({
      pageCaller: async () => ({filled: true}),
      isAnyPageConnected: () => liveness.connected,
    })
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    expect(registry.catalog.list().map((entry) => entry.reachable)).toEqual([false])
    liveness.connected = true
    expect(registry.catalog.list().map((entry) => entry.reachable)).toEqual([true])
    expect(registry.catalog.get('page_fill').reachable).toBe(true)
  })

  test('the catalog reports input requiredness in input mode so defaulted fields stay optional', () => {
    const registry = createToolRegistry()
    const greet = defineTool({
      name: 'server_greet',
      description: 'greet someone',
      inputSchema: z.object({greeting: z.string().default('hi'), name: z.string()}),
      outputSchema: z.object({message: z.string()}),
      meta: {summary: 'greet someone by name'},
    }).server((input) => ({message: `${input.greeting} ${input.name}`}))
    registry.register(greet, {owner: 'a test registrant'})
    expect(registry.catalog.get('server_greet').inputSchema).toMatchObject({required: ['name']})
  })

  test('a schema that cannot be represented in JSON Schema is rejected at registration, naming the tool', () => {
    const registry = createToolRegistry()
    const dated = defineTool({
      name: 'server_now',
      description: 'report the time',
      inputSchema: z.object({}),
      outputSchema: z.date(),
      meta: {summary: 'report the current time'},
    }).server(() => new Date())
    expect(() => registry.register(dated, {owner: 'a test registrant'})).toThrow(/server_now.+output/)
    expect(() => registry.catalog.get('server_now')).toThrow(/unknown tool/)
  })

  test('a summary that repeats the tool name with padding or casing is rejected', () => {
    const spec = {name: 'page_fill', description: 'd', inputSchema: z.object({})}
    expect(() => defineTool({...spec, meta: {summary: ' page_fill '}})).toThrow(/summary/)
    expect(() => defineTool({...spec, meta: {summary: 'Page_Fill'}})).toThrow(/summary/)
  })

  test('binding a tool twice fails loudly', () => {
    const bound = statusTool()
    expect(() => bound.client(() => ({ok: true}))).toThrow(/already has a server binding/)
  })

  test('prototype-chain names are rejected at registration and leave Object.prototype untouched', () => {
    const registry = createToolRegistry()
    expect(() =>
      registry.register(bareServerTool('__proto__', 'a tool with a hostile name'), {owner: 'a test registrant'}),
    ).toThrow(/tool "__proto__"/)
    expect(() =>
      registry.register(bareServerTool('constructor', 'a tool with a hostile name'), {owner: 'a test registrant'}),
    ).toThrow(/forbidden/)
    expect(() =>
      registry.register(bareServerTool('prototype', 'a tool with a hostile name'), {owner: 'a test registrant'}),
    ).toThrow(/forbidden/)
    expect(Object.hasOwn(Object.prototype, 'x')).toBe(false)
    expect(registry.catalog.list()).toEqual([])
  })

  test('the router type is fully populated while the runtime node starts empty and fills on register', () => {
    const registry = createToolRegistry()
    expect(Reflect.get(registry.router, 'server_status')).toBeUndefined()
    registry.register(statusTool(), {owner: 'a test registrant'})
    expect(Reflect.get(registry.router, 'server_status')).toBeDefined()
  })

  test('the registry answers has() only for the tools it registered, never for inherited members', () => {
    const registry = createToolRegistry()
    registry.register(statusTool(), {owner: 'a test registrant'})
    expect(registry.has('server_status')).toBe(true)
    expect(registry.has('server.missing')).toBe(false)
    expect(registry.has('constructor')).toBe(false)
    expect(registry.has('toString')).toBe(false)
  })

  test('calling an inherited member of the router client is refused instead of echoing the input back', async () => {
    const registry = createToolRegistry()
    registry.register(statusTool(), {owner: 'a test registrant'})
    await expect(registry.call('server_status', {}, {request: TEST_REQUEST})).resolves.toEqual({ok: true})
    await expect(registry.call('constructor', {smuggled: true}, {request: TEST_REQUEST})).rejects.toThrow(
      /unknown tool "constructor"/,
    )
    await expect(registry.call('toString', {}, {request: TEST_REQUEST})).rejects.toThrow(/unknown tool "toString"/)
    await expect(registry.call('server.missing', {}, {request: TEST_REQUEST})).rejects.toThrow(
      /unknown tool "server\.missing"/,
    )
  })

  test('the caller request reaches the page caller seam, so a forwarded call keeps its session identity', async () => {
    const seen: unknown[] = []
    const registry = createToolRegistry({
      pageCaller: async (_tool, _input, request) => {
        seen.push(request)
        return {filled: true}
      },
    })
    registry.register(fillTool().client(), {owner: 'a test registrant'})
    const request: ToolRequest = {sessionId: SessionId.parse('conciv_s1'), model: 'sonnet'}
    await registry.call('page_fill', {target: '#name'}, {request})
    expect(seen).toEqual([request])
  })

  test('a cosmetic icon key this version does not know still lists, so one skewed extension cannot down the catalog', () => {
    const skewed = defineTool({
      name: 'page_sparkle',
      description: 'declared against a newer icon vocabulary',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.boolean()}),
      meta: {summary: 'declared against a newer icon vocabulary', category: 'act'},
    }).client(() => ({ok: true}))
    const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
    registry.register(skewed, {owner: 'a test registrant'})
    for (const entry of walkRegistryProcedures(registry.router)) Object.assign(entry.meta, {icon: 'sparkle'})

    const listed = registry.catalog.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({name: 'page_sparkle', summary: 'declared against a newer icon vocabulary'})
    expect(listed[0]?.icon).toBeUndefined()
    expect(registry.catalog.get('page_sparkle').icon).toBeUndefined()
  })

  test('registering a tool whose cosmetic meta is malformed fails loudly and names the tool', () => {
    const broken = defineTool({
      name: 'page_broken',
      description: 'declares an empty label',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.boolean()}),
      meta: {summary: 'declares an empty label', category: 'act'},
    }).client(() => ({ok: true}))
    Object.assign(broken.meta ?? {}, {icon: 'sparkle', label: {running: '', done: ''}})
    const registry = createToolRegistry({pageCaller: async () => ({ok: true})})

    expect(() => registry.register(broken, {owner: 'a test registrant'})).toThrow(/tool "page_broken"/)
    expect(() => registry.register(broken, {owner: 'a test registrant'})).toThrow(/meta\.icon must be one of/)
    expect(registry.has('page_broken')).toBe(false)
  })

  test('the full signature carries the CLI positional field the meta declares', () => {
    const positional = defineTool({
      name: 'page_text',
      description: 'read the visible text of an element',
      inputSchema: z.object({selector: z.string().optional()}),
      outputSchema: z.object({text: z.string()}),
      meta: {summary: 'read the visible text of an element', category: 'read', positional: 'selector'},
    }).client(() => ({text: ''}))
    const registry = createToolRegistry({pageCaller: async () => ({text: ''})})
    registry.register(positional, {owner: 'a test registrant'})

    expect(registry.catalog.get('page_text').positional).toBe('selector')
  })

  test('sandboxTools carries the live zod schema, metadata and a callable run per tool', async () => {
    const registry = createToolRegistry({pageCaller: async () => ({filled: true})})
    registry.register(
      fillTool().client(() => ({filled: true})),
      {owner: 'a test registrant'},
    )
    registry.register(statusTool(), {owner: 'a test registrant'})
    const tools = registry.sandboxTools()
    expect(tools.map((tool) => tool.name)).toEqual(['page_fill', 'server_status'])
    expect(tools.map((tool) => tool.mutating)).toEqual([true, false])
    const status = tools[1]
    if (!status) throw new Error('server_status missing')
    expect(status.schema.safeParse({}).success).toBe(true)
    await expect(status.run({}, {sessionId: SessionId.parse('conciv_x'), model: null})).resolves.toEqual({ok: true})
  })

  test('sandboxTools sees a tool registered after the registry was handed out', () => {
    const registry = createToolRegistry()
    expect(registry.sandboxTools()).toEqual([])
    registry.register(statusTool(), {owner: 'a test registrant'})
    expect(registry.sandboxTools().map((tool) => tool.name)).toEqual(['server_status'])
  })

  test('two registrants claiming one tool name fail at load with a message naming both', () => {
    const registry = createToolRegistry()
    registry.register(statusTool(), {owner: 'extension "alpha"'})
    expect(() => registry.register(statusTool(), {owner: 'extension "beta"'})).toThrow(
      'tool "server_status" is declared by both extension "alpha" and extension "beta"',
    )
  })

  test('a walked procedure whose declared name mismatches its router path is rejected, not listed uncallable', () => {
    const registry = createToolRegistry()
    registry.register(statusTool(), {owner: 'core'})
    const rogue = os
      .$context<{request?: unknown}>()
      .$meta<RegistryToolMeta>({name: '', binding: 'server', summary: ''})
      .meta({name: 'other_name', binding: 'server', summary: 'a procedure filed under the wrong path'})
      .input(z.object({}))
      .output(z.object({}))
      .handler(() => ({}))
    Object.assign(registry.router, {rogue})
    expect(() => registry.catalog.list()).toThrow(/"rogue".+"other_name"/)
    expect(() => registry.has('rogue')).toThrow(/"rogue".+"other_name"/)
  })

  test('malformed input to a registered tool is a validation error, not a swallowed parse failure', async () => {
    const registry = createToolRegistry()
    const double = defineTool({
      name: 'math_double',
      description: 'double a number',
      inputSchema: z.object({n: z.number()}),
      outputSchema: z.object({doubled: z.number()}),
      meta: {summary: 'double the given number'},
    }).server((input) => ({doubled: input.n * 2}))
    registry.register(double, {owner: 'core'})
    await expect(registry.call('math_double', {n: 'zero'}, {request: TEST_REQUEST})).rejects.toThrow(/input/i)
  })

  test('a meta.positional naming a field the input schema does not declare is rejected at registration', () => {
    const registry = createToolRegistry()
    const drifted = defineTool({
      name: 'page_drifted',
      description: 'declares a positional its schema does not carry',
      inputSchema: z.object({selector: z.string().optional()}),
      outputSchema: z.object({ok: z.literal(true)}),
      meta: {summary: 'declare a drifted positional', positional: 'selectr'},
    }).client()
    expect(() => registry.register(drifted, {owner: 'a test registrant'})).toThrow(
      /meta\.positional names "selectr" but the input schema declares no such field/,
    )
  })

  test('a dotted tool name is rejected at registration, naming the tool and the rule', () => {
    const registry = createToolRegistry()
    const dotted = () =>
      registry.register(bareServerTool('canvas.svg', 'draw an svg on the canvas'), {
        owner: 'a test registrant',
      })
    expect(dotted).toThrow(/tool "canvas\.svg"/)
    expect(dotted).toThrow(/\^\[a-z\]\[a-z0-9_\]\*\$/)
    expect(registry.catalog.list()).toEqual([])
  })

  test('an uppercase or camelCase tool name is rejected at registration', () => {
    const registry = createToolRegistry()
    expect(() =>
      registry.register(bareServerTool('pinSetState', 'set the state of a pin'), {owner: 'a test registrant'}),
    ).toThrow(/tool "pinSetState"/)
    expect(() =>
      registry.register(bareServerTool('Page_Fill', 'type into a field'), {owner: 'a test registrant'}),
    ).toThrow(/tool "Page_Fill"/)
    expect(registry.catalog.list()).toEqual([])
  })

  test('a tool name that does not start with a lowercase letter is rejected at registration', () => {
    const registry = createToolRegistry()
    expect(() =>
      registry.register(bareServerTool('3d_render', 'render in three dimensions'), {owner: 'a test registrant'}),
    ).toThrow(/tool "3d_render"/)
    expect(() =>
      registry.register(bareServerTool('_hidden', 'hide from the catalog'), {owner: 'a test registrant'}),
    ).toThrow(/tool "_hidden"/)
    expect(() => registry.register(bareServerTool('', 'a nameless tool'), {owner: 'a test registrant'})).toThrow(
      /tool ""/,
    )
    expect(registry.catalog.list()).toEqual([])
  })

  test('a snake_case tool name registers and is callable by that exact name', async () => {
    const registry = createToolRegistry()
    registry.register(bareServerTool('canvas_svg', 'draw an svg on the canvas'), {owner: 'a test registrant'})
    expect(registry.catalog.list().map((entry) => entry.name)).toEqual(['canvas_svg'])
    await expect(registry.call('canvas_svg', {}, {request: TEST_REQUEST})).resolves.toEqual({})
  })
})
