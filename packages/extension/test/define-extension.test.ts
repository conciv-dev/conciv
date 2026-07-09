import {expect, test} from 'vitest'
import {z} from 'zod'
import {Hono} from 'hono'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'

test('parseConfig applies defaults; absent schema yields {}', () => {
  const withSchema = defineExtension({name: 'x', configSchema: z.object({runner: z.string().default('vitest')})})
  expect(withSchema.parseConfig({})).toEqual({runner: 'vitest'})
  expect(defineExtension({name: 'y'}).parseConfig(undefined)).toEqual({})
})

test('server factory receives api and returns context + app + dispose', () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 'mul',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((input, ctx) => input.n * ctx.factor)
  const ext = defineExtension({name: 'm', tools: [tool]}).server(() => {
    const app = new Hono().get('/ping', (c) => c.json({ok: true}))
    return {context: {factor: 10}, app, dispose: () => {}}
  })
  expect(ext.__server).toBeTypeOf('function')
})

test('carries tables, composer actions and controls through the builder', () => {
  const ext = defineExtension({
    name: 'decls',
    tables: [{name: 'notes', columns: 'body TEXT'}],
    composerActions: [{id: 'a', label: 'A', icon: () => null, run: () => {}}],
    controls: [{id: 'c', Component: () => null}],
  })
  expect(ext.tables).toHaveLength(1)
  expect(ext.composerActions?.[0]?.id).toBe('a')
  expect(ext.controls?.[0]?.id).toBe('c')
})
