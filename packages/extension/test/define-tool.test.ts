import {expect, test} from 'vitest'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import {defineTool, type ClientToolCtx} from '../src/define-tool.js'
import type {ServerToolPageAccess, ServerToolRegistryAccess, ToolRequest} from '../src/types.js'

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
