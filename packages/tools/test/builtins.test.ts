import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createToolRegistry} from '@conciv/extension/registry'
import {MIRROR_KINDS, MUTATING_KINDS, PAGE_QUERY_KINDS, PageQuerySchema} from '@conciv/protocol/page-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {
  BUILTIN_OPEN_TOOL,
  BUILTIN_PAGE_TOOLS,
  BUILTIN_SERVER_TOOLS,
  builtinToolNames,
  pageVerbMirrors,
  pageVerbMutates,
  pageVerbOfTool,
} from '../src/builtins.js'

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) throw new Error('not a coded error')
  return String(error.code)
}

function registryWith(bundler: BundlerBridge | undefined, opened: string[] = []) {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool, {owner: 'a test registrant'})
  for (const tool of BUILTIN_SERVER_TOOLS)
    registry.register(tool, {owner: 'a test registrant', context: {bundler: () => bundler}})
  registry.register(BUILTIN_OPEN_TOOL, {
    owner: 'a test registrant',
    context: {openInEditor: (file: string) => opened.push(file)},
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
  it('declares one tool per page verb the protocol knows, and registers every built-in', () => {
    const verbs = BUILTIN_PAGE_TOOLS.map((tool) => pageVerbOfTool(tool.name))
    const expected = PAGE_QUERY_KINDS.filter((kind) => kind !== 'ext')
    expect(verbs.toSorted()).toEqual(expected.toSorted())
    expect(() => registryWith(fakeBundler())).not.toThrow()
  })

  it('lists every built-in in the catalog with its binding kind', () => {
    const catalog = registryWith(fakeBundler()).catalog.list()
    expect(catalog.map((entry) => entry.name).toSorted()).toEqual(builtinToolNames().toSorted())
    const bindings = new Map(catalog.map((entry) => [entry.name, entry.binding]))
    expect(bindings.get('page.fill')).toBe('client')
    expect(bindings.get('server.urls')).toBe('server')
    expect(bindings.get('open')).toBe('server')
  })

  it('gives every declared input field its own help text', () => {
    const missing: string[] = []
    for (const tool of [...BUILTIN_PAGE_TOOLS, ...BUILTIN_SERVER_TOOLS, BUILTIN_OPEN_TOOL]) {
      const schema = z.toJSONSchema(tool.inputSchema, {io: 'input'})
      const properties = schema.properties ?? {}
      for (const [field, definition] of Object.entries(properties)) {
        const described = typeof definition === 'object' && definition !== null && 'description' in definition
        if (!described) missing.push(`${tool.name}.${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('declares only fields the page query can carry, so no flag is dropped in transit', () => {
    const carried = new Set(Object.keys(PageQuerySchema.shape))
    const orphans: string[] = []
    for (const tool of BUILTIN_PAGE_TOOLS) {
      for (const field of Object.keys(tool.inputSchema.shape)) {
        if (!carried.has(field)) orphans.push(`${tool.name}.${field}`)
      }
    }
    expect(orphans).toEqual([])
  })

  it("never uses a tool's own command path as its help text", () => {
    const echoes = BUILTIN_PAGE_TOOLS.filter((tool) => {
      const summary = tool.meta?.summary ?? ''
      const verb = pageVerbOfTool(tool.name)
      return summary === tool.name || summary === `page ${verb}` || summary === verb
    })
    expect(echoes.map((tool) => tool.name)).toEqual([])
  })

  it('declares exactly the mutating and mirroring verbs the protocol lists, in both directions', () => {
    const verbsWhere = (pick: (tool: (typeof BUILTIN_PAGE_TOOLS)[number]) => boolean): string[] =>
      BUILTIN_PAGE_TOOLS.filter(pick)
        .map((tool) => pageVerbOfTool(tool.name))
        .toSorted()
    expect(verbsWhere((tool) => tool.meta?.mutating === true)).toEqual([...MUTATING_KINDS].toSorted())
    expect(verbsWhere((tool) => tool.meta?.mirrors === true)).toEqual([...MIRROR_KINDS].toSorted())
  })

  it('reads mutating and mirroring off the declarations', () => {
    expect(pageVerbMutates('fill')).toBe(true)
    expect(pageVerbMutates('text')).toBe(false)
    expect(pageVerbMirrors('click')).toBe(true)
    expect(pageVerbMirrors('setattr')).toBe(false)
  })

  it('runs a server tool and the open tool end to end through the registry', async () => {
    const opened: string[] = []
    const registry = registryWith(fakeBundler(), opened)
    await expect(registry.call('server.urls', {})).resolves.toEqual({
      local: ['http://localhost:5173/'],
      network: [],
    })
    await expect(registry.call('server.resolve', {spec: 'x'})).resolves.toEqual({id: '/app/src/x.ts'})
    await expect(registry.call('open', {file: 'src/app.ts', line: 4})).resolves.toEqual({
      ok: true,
      file: 'src/app.ts',
      line: 4,
    })
    expect(opened).toEqual(['src/app.ts'])
  })

  it('runs a browser tool end to end over the page caller seam', async () => {
    const calls: [string, unknown][] = []
    const registry = createToolRegistry({
      pageCaller: async (tool, input) => {
        calls.push([tool, input])
        return {ok: true, value: 'a@b.c'}
      },
    })
    for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool, {owner: 'a test registrant'})
    await expect(registry.call('page.fill', {selector: '#email', value: 'a@b.c'})).resolves.toEqual({
      ok: true,
      value: 'a@b.c',
    })
    expect(calls).toEqual([['page.fill', {selector: '#email', value: 'a@b.c'}]])
  })

  it('raises its declared NO_BUNDLER error when no dev server is attached', async () => {
    const registry = registryWith(undefined)
    const failure = await registry.call('server.config', {}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(errorCode(failure)).toBe('NO_BUNDLER')
  })
})
