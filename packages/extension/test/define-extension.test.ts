import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'

test('parseConfig applies defaults; absent schema yields {}', () => {
  const withSchema = defineExtension({name: 'x', configSchema: z.object({runner: z.string().default('vitest')})})
  expect(withSchema.parseConfig({})).toEqual({runner: 'vitest'})
  expect(defineExtension({name: 'y'}).parseConfig(undefined)).toEqual({})
})

test('server factory receives api and returns context + dispose', () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 'mul',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((input, ctx) => input.n * ctx.factor)
  const ext = defineExtension({name: 'm', tools: [tool]}).server((server) => {
    server.app.get('/ping', (c) => c.json({ok: true}))
    return {context: {factor: 10}, dispose: () => {}}
  })
  expect(ext.__server).toBeTypeOf('function')
})
