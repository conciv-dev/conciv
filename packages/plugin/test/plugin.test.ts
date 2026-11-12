import {describe, expect, expectTypeOf, it} from 'vitest'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {SessionId} from '@conciv/protocol/chat-types'
import {define, isToolError, toolError} from '../src/plugin.js'
import type {Context, Registration, ServerRef, ToolContext, ToolEditor, ToolInfo} from '../src/plugin.js'

function recordingContext(calls: string[]): Context {
  const registration: Registration = {dispose: async () => void calls.push('dispose')}
  const tools: (ToolInfo & {readonly id: string})[] = []
  const builtin: ServerRef = {
    id: 'sidecar',
    name: 'engine',
    url: 'http://127.0.0.1:5173/t/token',
    local: true,
    builtin: true,
    compatible: true,
    connected: true,
  }
  const editor: ToolEditor = {
    list: () => tools,
    get: (id) => tools.find((tool) => tool.id === id),
    namespace: (namespace) => void calls.push(`namespace ${namespace.name}`),
    add: (tool) => void tools.push({...tool, id: tool.name}),
    update: (id) => void calls.push(`update ${id}`),
    remove: (id) => void calls.push(`remove ${id}`),
  }
  return {
    app: {name: 'conciv', version: '0.0.22', channel: 'local'},
    location: {directory: '/workspace'},
    options: {fps: 30},
    plugin: {list: async () => ({location: {directory: '/workspace'}, data: []})},
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

describe('define', () => {
  it('returns the same plugin object', () => {
    const plugin = {id: 'acme', setup: () => {}}
    expect(define(plugin)).toBe(plugin)
  })

  it('accepts a setup that returns a cleanup', async () => {
    const calls: string[] = []
    const plugin = define({
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
    expectTypeOf<ToolContext['messageId']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<ToolContext['sessionId']>().toEqualTypeOf<SessionId>()
    expectTypeOf<Context['bundler']>().toEqualTypeOf<BundlerBridge | undefined>()
  })

  it('types execute input from the input schema and output from the output schema', () => {
    type SumTool = ToolInfo<z.ZodObject<{left: z.ZodNumber}>, z.ZodObject<{sum: z.ZodNumber}>>
    expectTypeOf<Parameters<SumTool['execute']>[0]>().toEqualTypeOf<{left: number}>()
    expectTypeOf<NonNullable<Awaited<ReturnType<SumTool['execute']>>['output']>>().toEqualTypeOf<{sum: number}>()
  })
})

describe('toolError', () => {
  it('builds a value isToolError accepts', () => {
    const error = toolError('boom', {code: 1})
    expect(isToolError(error)).toBe(true)
    expect(error).toMatchObject({message: 'boom', metadata: {code: 1}})
  })

  it('rejects a plain Error', () => {
    expect(isToolError(new Error('boom'))).toBe(false)
  })
})
