import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineTool} from '../src/define-tool.js'

test('tool execute receives input and injected context', async () => {
  const tool = defineTool({
    name: 't',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((input, ctx: {factor: number}) => input.n * ctx.factor)
  expect(await tool.__execute?.({n: 3}, {factor: 2})).toBe(6)
})

test('execute reparses raw input at the boundary', async () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})}).server((i) => i.n)
  await expect(tool.__execute?.({n: 'x'}, undefined)).rejects.toThrow()
})

test('every derivation leaves the base builder unbound and never leaks into a sibling derivation', () => {
  const base = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})})
  const bound = base.server((input) => input.n)
  const forwarded = base.client((input) => input.n)
  const rendered = base.render(() => null)
  expect(base.binding).toBeUndefined()
  expect(base.__execute).toBeUndefined()
  expect(base.__clientExecute).toBeUndefined()
  expect(base.__render).toBeUndefined()
  expect(bound.binding).toBe('server')
  expect(bound.__clientExecute).toBeUndefined()
  expect(bound.__render).toBeUndefined()
  expect(forwarded.binding).toBe('client')
  expect(forwarded.__execute).toBeUndefined()
  expect(rendered.binding).toBeUndefined()
  expect(rendered.__render).toBeTypeOf('function')
})

test('streamTitle is carried onto the builder', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({}), streamTitle: 'Running tests'})
  expect(tool.streamTitle).toBe('Running tests')
})
