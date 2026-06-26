import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineTool} from '../src/define-tool.js'

test('tool execute receives input and injected context', async () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 't',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((input, ctx) => input.n * ctx.factor)
  expect(await tool.__execute?.({n: 3}, {factor: 2})).toBe(6)
})

test('execute reparses raw input at the boundary', async () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})}).server((i) => i.n)
  await expect(tool.__execute?.({n: 'x'}, undefined)).rejects.toThrow()
})

test('streamTitle is carried onto the builder', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({}), streamTitle: 'Running tests'})
  expect(tool.streamTitle).toBe('Running tests')
})
