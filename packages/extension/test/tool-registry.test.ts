import {expect, test} from 'vitest'
import {z} from 'zod'
import {createRouterClient, os, type AnyRouter} from '@orpc/server'
import {isDefinedError, ORPCError} from '@orpc/client'
import {defineTool, isToolError, toolError} from '../src/define-tool.js'
import {createToolRegistry, TOOL_TRANSPORT_ERRORS} from '../src/tool-registry.js'
import {walkRegistryProcedures} from '../src/registry-walk.js'
import type {PageErrorCode} from '@conciv/protocol/page-types'
import {pageVerbError} from '../src/page-verbs.js'

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
    name: 'page.fill',
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
    name: 'server.status',
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
      name: 'page.fill',
      description: 'd',
      inputSchema: z.object({}),
      meta: {summary: '   '},
    }),
  ).toThrow(/summary/)
})

test('defineTool rejects a summary that just repeats the tool name', () => {
  expect(() =>
    defineTool({
      name: 'page.fill',
      description: 'd',
      inputSchema: z.object({}),
      meta: {summary: 'page.fill'},
    }),
  ).toThrow(/summary/)
})

test('registering a tool without catalog metadata fails', () => {
  const registry = createToolRegistry()
  const tool = defineTool({
    name: 'bare.tool',
    description: 'd',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
  }).server(() => ({}))
  expect(() => registry.register(tool)).toThrow(/summary/)
})

test('registering a tool without an output schema fails', () => {
  const registry = createToolRegistry()
  const tool = defineTool({
    name: 'no.output',
    description: 'd',
    inputSchema: z.object({}),
    meta: {summary: 'a tool with no output schema'},
  }).server(() => ({}))
  expect(() => registry.register(tool)).toThrow(/outputSchema/)
})

test('registering an unbound tool fails', () => {
  const registry = createToolRegistry()
  const tool = defineTool({
    name: 'un.bound',
    description: 'd',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    meta: {summary: 'a tool nobody bound'},
  })
  expect(() => registry.register(tool)).toThrow(/server\(\)|client\(\)/)
})

test('registering the same tool name twice fails loudly', () => {
  const registry = createToolRegistry()
  registry.register(statusTool())
  expect(() => registry.register(statusTool())).toThrow(/already registered/)
})

test('a tool may not claim a transport error code as its own', () => {
  const registry = createToolRegistry()
  const tool = defineTool({
    name: 'greedy.tool',
    description: 'd',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    errors: {PAGE_TIMEOUT: {message: 'mine now'}},
    meta: {summary: 'a tool claiming a transport code'},
  }).server(() => ({}))
  expect(() => registry.register(tool)).toThrow(/transport/)
})

test('a declared server tool error arrives defined and narrowable with its code and data', async () => {
  const registry = createToolRegistry()
  const locate = defineTool({
    name: 'page.locate',
    description: 'find an element',
    inputSchema: z.object({target: z.string()}),
    outputSchema: z.object({found: z.boolean()}),
    errors: {ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}},
    meta: {summary: 'find an element on the page'},
  }).server((input) => {
    throw toolError('ELEMENT_NOT_FOUND', {data: {target: input.target}})
  })
  registry.register(locate)
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'page.locate'), {target: '#missing'})
  expect(isDefinedError(failure)).toBe(true)
  if (!isDefinedError(failure)) return
  expect(failure.code).toBe('ELEMENT_NOT_FOUND')
  expect(failure.data).toEqual({target: '#missing'})
})

test('an undeclared server failure stays distinguishable from a declared one', async () => {
  const registry = createToolRegistry()
  const explode = defineTool({
    name: 'server.explode',
    description: 'always fails',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    errors: {KNOWN: {message: 'a declared failure'}},
    meta: {summary: 'a tool that throws an undeclared error'},
  }).server(() => {
    throw new Error('boom')
  })
  registry.register(explode)
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'server.explode'), {})
  expect(failure).toBeInstanceOf(Error)
  expect(isDefinedError(failure)).toBe(false)
})

test('a tool registered after the client was created is callable', async () => {
  const registry = createToolRegistry()
  const client = createRouterClient(registry.router)
  registry.register(statusTool())
  await expect(clientTool(client, 'server.status')({})).resolves.toEqual({ok: true})
})

test('the catalog lists every tool with path, summary, binding, and the sandbox-safe binding name', () => {
  const registry = createToolRegistry()
  registry.register(fillTool().client(() => ({filled: true})))
  registry.register(statusTool())
  expect(registry.catalog.list()).toEqual([
    {
      name: 'page.fill',
      path: ['page', 'fill'],
      sandboxBinding: 'page_fill',
      binding: 'client',
      summary: 'type text into a field',
      reachable: false,
    },
    {
      name: 'server.status',
      path: ['server', 'status'],
      sandboxBinding: 'server_status',
      binding: 'server',
      summary: 'report whether the server is healthy',
      reachable: true,
    },
  ])
})

test('the catalog answers with no page client and marks client tools reachable once one is injected', () => {
  const connected = createToolRegistry({pageCaller: async () => ({filled: true})})
  connected.register(fillTool().client(() => ({filled: true})))
  expect(connected.catalog.list().map((entry) => entry.reachable)).toEqual([true])
})

test('the catalog returns one tool full signature: fields, requiredness, enums, both schemas, declared errors', () => {
  const registry = createToolRegistry()
  registry.register(fillTool().client(() => ({filled: true})))
  const signature = registry.catalog.get('page.fill')
  expect(signature.name).toBe('page.fill')
  expect(signature.sandboxBinding).toBe('page_fill')
  expect(signature.category).toBe('act')
  expect(signature.mutating).toBe(true)
  expect(signature.mirrors).toBe(true)
  expect(signature.keywords).toEqual(['type'])
  expect(signature.input).toMatchObject({
    type: 'object',
    required: ['target'],
    properties: {mode: {enum: ['exact', 'fuzzy']}},
  })
  expect(signature.output).toMatchObject({type: 'object', properties: {filled: {type: 'boolean'}}})
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
  registry.register(fillTool().client(() => ({filled: true})))
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'page.fill'), {target: '#name'})
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
        throw pageVerbError(pageCode, 'core', tool, `page failed with ${pageCode}`)
      },
    })
    registry.register(fillTool().client(() => ({filled: true})))
    const client = createRouterClient(registry.router)
    const failure = await callCaught(clientTool(client, 'page.fill'), {target: '#name'})
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
  registry.register(fillTool().client(() => ({filled: true})))
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'page.fill'), {target: '#name'})
  expect(failure).toBeInstanceOf(Error)
  expect(isDefinedError(failure)).toBe(false)
})

test('a successful client tool call forwards name and input over the page caller seam', async () => {
  const calls: [string, unknown][] = []
  const registry = createToolRegistry({
    pageCaller: async (tool, input) => {
      calls.push([tool, input])
      return {filled: true}
    },
  })
  registry.register(fillTool().client(() => ({filled: true})))
  const client = createRouterClient(registry.router)
  await expect(clientTool(client, 'page.fill')({target: '#name'})).resolves.toEqual({filled: true})
  expect(calls).toEqual([['page.fill', {target: '#name'}]])
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

test('registering a tool over an existing branch fails instead of clobbering the nested tools', () => {
  const registry = createToolRegistry()
  registry.register(fillTool().client(() => ({filled: true})))
  expect(() => registry.register(bareServerTool('page', 'a tool claiming a branch name'))).toThrow(/overwrite/)
  const client = createRouterClient(registry.router)
  expect(typeof clientTool(client, 'page.fill')).toBe('function')
})

test('registering a nested tool under an existing tool name fails loudly', () => {
  const registry = createToolRegistry()
  registry.register(bareServerTool('page', 'a tool claiming a branch name'))
  expect(() => registry.register(fillTool().client(() => ({filled: true})))).toThrow(/already names a registered tool/)
})

test('throwing a declared error without its declared data fails loudly instead of arriving defined:false', async () => {
  const registry = createToolRegistry()
  const locate = defineTool({
    name: 'page.locate',
    description: 'find an element',
    inputSchema: z.object({target: z.string()}),
    outputSchema: z.object({found: z.boolean()}),
    errors: {ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}},
    meta: {summary: 'find an element on the page'},
  }).server(() => {
    throw toolError('ELEMENT_NOT_FOUND')
  })
  registry.register(locate)
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'page.locate'), {target: '#missing'})
  expect(isDefinedError(failure)).toBe(false)
  expect(failure.message).toMatch(/page\.locate/)
  expect(failure.message).toMatch(/ELEMENT_NOT_FOUND/)
  expect(failure.message).toMatch(/declared/)
})

test('a transform input schema is validated once and the handler receives the transformed value', async () => {
  const registry = createToolRegistry()
  const parse = defineTool({
    name: 'math.parse',
    description: 'parse a number',
    inputSchema: z.object({n: z.string().transform(Number)}),
    outputSchema: z.object({value: z.number()}),
    meta: {summary: 'turn a numeric string into a number'},
  }).server((input) => ({value: input.n}))
  registry.register(parse)
  const client = createRouterClient(registry.router)
  await expect(clientTool(client, 'math.parse')({n: '42'})).resolves.toEqual({value: 42})
})

test('registration context and the caller request reach a server handler', async () => {
  const registry = createToolRegistry()
  const seen: unknown[] = []
  const probe = defineTool({
    name: 'server.probe',
    description: 'record ctx and request',
    inputSchema: z.object({}),
    outputSchema: z.object({ok: z.boolean()}),
    meta: {summary: 'record the execution context'},
  }).server((_input, ctx, request) => {
    seen.push(ctx, request)
    return {ok: true}
  })
  registry.register(probe, {context: {db: 'handle'}})
  const client = createRouterClient(registry.router, {context: {request: {sessionId: 's1', model: null}}})
  await clientTool(client, 'server.probe')({})
  expect(seen).toEqual([{db: 'handle'}, {sessionId: 's1', model: null}])
})

test('a toolError with an undeclared code rethrows the original error instead of a defined:false ORPCError', async () => {
  const registry = createToolRegistry()
  const typo = defineTool({
    name: 'server.typo',
    description: 'throws a typo code',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    errors: {KNOWN: {message: 'a declared failure'}},
    meta: {summary: 'a tool that throws an undeclared tool error'},
  }).server(() => {
    throw toolError('KNOWN_TYPO', {message: 'original failure text'})
  })
  registry.register(typo)
  const client = createRouterClient(registry.router)
  const failure = await callCaught(clientTool(client, 'server.typo'), {})
  expect(isDefinedError(failure)).toBe(false)
  expect(isToolError(failure)).toBe(true)
  expect(failure.message).toBe('original failure text')
})

test('colliding mangled names get distinct deterministic sandbox bindings in list and get alike', () => {
  const registry = createToolRegistry()
  registry.register(fillTool().client(() => ({filled: true})))
  registry.register(bareServerTool('page_fill', 'an underscore-named tool colliding after mangling'))
  expect(registry.catalog.list().map((entry) => entry.sandboxBinding)).toEqual(['page_fill', 'page_fill_2'])
  expect(registry.catalog.get('page_fill').sandboxBinding).toBe('page_fill_2')
})

test('a reserved-word tool name yields a valid sandbox identifier', () => {
  const registry = createToolRegistry()
  registry.register(bareServerTool('delete', 'remove something somewhere'))
  expect(registry.catalog.list().map((entry) => entry.sandboxBinding)).toEqual(['_delete'])
})

test('client tool reachability follows the liveness callback on the same registry instance', () => {
  const liveness = {connected: false}
  const registry = createToolRegistry({
    pageCaller: async () => ({filled: true}),
    isPageConnected: () => liveness.connected,
  })
  registry.register(fillTool().client(() => ({filled: true})))
  expect(registry.catalog.list().map((entry) => entry.reachable)).toEqual([false])
  liveness.connected = true
  expect(registry.catalog.list().map((entry) => entry.reachable)).toEqual([true])
  expect(registry.catalog.get('page.fill').reachable).toBe(true)
})

test('the catalog reports input requiredness in input mode so defaulted fields stay optional', () => {
  const registry = createToolRegistry()
  const greet = defineTool({
    name: 'server.greet',
    description: 'greet someone',
    inputSchema: z.object({greeting: z.string().default('hi'), name: z.string()}),
    outputSchema: z.object({message: z.string()}),
    meta: {summary: 'greet someone by name'},
  }).server((input) => ({message: `${input.greeting} ${input.name}`}))
  registry.register(greet)
  expect(registry.catalog.get('server.greet').input).toMatchObject({required: ['name']})
})

test('a schema that cannot be represented in JSON Schema is rejected at registration, naming the tool', () => {
  const registry = createToolRegistry()
  const dated = defineTool({
    name: 'server.now',
    description: 'report the time',
    inputSchema: z.object({}),
    outputSchema: z.date(),
    meta: {summary: 'report the current time'},
  }).server(() => new Date())
  expect(() => registry.register(dated)).toThrow(/server\.now.+output/)
  expect(() => registry.catalog.get('server.now')).toThrow(/unknown tool/)
})

test('a summary that repeats the tool name with padding or casing is rejected', () => {
  const spec = {name: 'page.fill', description: 'd', inputSchema: z.object({})}
  expect(() => defineTool({...spec, meta: {summary: ' page.fill '}})).toThrow(/summary/)
  expect(() => defineTool({...spec, meta: {summary: 'Page.fill'}})).toThrow(/summary/)
})

test('binding a tool twice fails loudly', () => {
  const bound = statusTool()
  expect(() => bound.client(() => ({ok: true}))).toThrow(/already has a server binding/)
})

test('prototype-chain segments are rejected at registration and leave Object.prototype untouched', () => {
  const registry = createToolRegistry()
  expect(() => registry.register(bareServerTool('__proto__.x', 'a tool with a hostile path segment'))).toThrow(
    /forbidden/,
  )
  expect(() => registry.register(bareServerTool('constructor.x', 'a tool with a hostile path segment'))).toThrow(
    /forbidden/,
  )
  expect(() => registry.register(bareServerTool('page.prototype', 'a tool with a hostile path segment'))).toThrow(
    /forbidden/,
  )
  expect(Object.hasOwn(Object.prototype, 'x')).toBe(false)
  expect(registry.catalog.list()).toEqual([])
})

test('a tool name with an empty path segment is rejected at registration', () => {
  const registry = createToolRegistry()
  expect(() => registry.register(bareServerTool('page..fill', 'a tool whose name has an empty segment'))).toThrow(
    /non-empty dot-separated segments/,
  )
  expect(registry.catalog.list()).toEqual([])
})

test('the router type is fully populated while the runtime node starts empty and fills on register', () => {
  const registry = createToolRegistry()
  expect(Reflect.get(registry.router, 'server')).toBeUndefined()
  registry.register(statusTool())
  expect(Reflect.get(registry.router, 'server')).toBeDefined()
})

test('the registry answers has() only for the tools it registered, never for inherited members', () => {
  const registry = createToolRegistry()
  registry.register(statusTool())
  expect(registry.has('server.status')).toBe(true)
  expect(registry.has('server.missing')).toBe(false)
  expect(registry.has('constructor')).toBe(false)
  expect(registry.has('toString')).toBe(false)
})

test('calling an inherited member of the router client is refused instead of echoing the input back', async () => {
  const registry = createToolRegistry()
  registry.register(statusTool())
  await expect(registry.call('server.status', {})).resolves.toEqual({ok: true})
  await expect(registry.call('constructor', {smuggled: true})).rejects.toThrow(/unknown tool "constructor"/)
  await expect(registry.call('toString', {})).rejects.toThrow(/unknown tool "toString"/)
  await expect(registry.call('server.missing', {})).rejects.toThrow(/unknown tool "server\.missing"/)
})

test('the caller request reaches the page caller seam, so a forwarded call keeps its session identity', async () => {
  const seen: unknown[] = []
  const registry = createToolRegistry({
    pageCaller: async (_tool, _input, request) => {
      seen.push(request)
      return {filled: true}
    },
  })
  registry.register(fillTool().client())
  await registry.call('page.fill', {target: '#name'}, {request: {sessionId: 's1', model: 'sonnet'}})
  expect(seen).toEqual([{sessionId: 's1', model: 'sonnet'}])
})
