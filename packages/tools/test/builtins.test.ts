import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createToolRegistry} from '@conciv/extension/registry'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS, builtinToolNames} from '../src/builtins.js'

const testRequest = {sessionId: SessionId.parse('conciv_test'), model: null}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) throw new Error('not a coded error')
  return String(error.code)
}

function registryWith(bundler: BundlerBridge | undefined, opened: string[] = []) {
  const registry = createToolRegistry()
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
  it('lists every built-in in the catalog with its binding kind', () => {
    const catalog = registryWith(fakeBundler()).catalog.list()
    expect(catalog.map((entry) => entry.name).toSorted()).toEqual(builtinToolNames().toSorted())
    const bindings = new Map(catalog.map((entry) => [entry.name, entry.binding]))
    expect(bindings.get('server.urls')).toBe('server')
    expect(bindings.get('open')).toBe('server')
  })

  it('gives every declared input field its own help text', () => {
    const missing: string[] = []
    for (const tool of [...BUILTIN_SERVER_TOOLS, BUILTIN_OPEN_TOOL]) {
      const schema = z.toJSONSchema(tool.inputSchema, {io: 'input'})
      const properties = schema.properties ?? {}
      for (const [field, definition] of Object.entries(properties)) {
        const described = typeof definition === 'object' && definition !== null && 'description' in definition
        if (!described) missing.push(`${tool.name}.${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('runs a server tool and the open tool end to end through the registry', async () => {
    const opened: string[] = []
    const registry = registryWith(fakeBundler(), opened)
    await expect(registry.call('server.urls', {}, {request: testRequest})).resolves.toEqual({
      local: ['http://localhost:5173/'],
      network: [],
    })
    await expect(registry.call('server.resolve', {spec: 'x'}, {request: testRequest})).resolves.toEqual({
      id: '/app/src/x.ts',
    })
    await expect(registry.call('open', {file: 'src/app.ts', line: 4}, {request: testRequest})).resolves.toEqual({
      ok: true,
      file: 'src/app.ts',
      line: 4,
    })
    expect(opened).toEqual(['src/app.ts'])
  })

  it('raises its declared NO_BUNDLER error when no dev server is attached', async () => {
    const registry = registryWith(undefined)
    const failure = await registry.call('server.config', {}, {request: testRequest}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(errorCode(failure)).toBe('NO_BUNDLER')
  })
})
