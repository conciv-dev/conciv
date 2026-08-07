import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineTool, type ClientToolCtx} from '../src/define-tool.js'

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
