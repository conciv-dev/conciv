import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {createRouterClient, os} from '@orpc/server'
import {isDefinedError, safe} from '@orpc/client'
import {defineTool} from '../src/define-tool.js'
import type {RegistryToolMeta} from '../src/tool-registry.js'

test('the client binding handler receives input typed by the schema', () => {
  defineTool({
    name: 'page.fill',
    description: 'type text into a field',
    inputSchema: z.object({target: z.string(), value: z.string()}),
    outputSchema: z.object({filled: z.boolean()}),
    meta: {summary: 'type text into a field on the page'},
  }).client((input) => {
    expectTypeOf(input.target).toEqualTypeOf<string>()
    expectTypeOf(input.value).toEqualTypeOf<string>()
    return {filled: true}
  })
})

test('catalog metadata requires a summary', () => {
  defineTool({
    name: 't',
    description: 'd',
    inputSchema: z.object({}),
    // @ts-expect-error meta without a summary is rejected
    meta: {category: 'act'},
  })
})

test('oRPC pin: a declared error narrows through isDefinedError at the call site', async () => {
  const base = os.$meta<RegistryToolMeta>({name: '', binding: 'server', summary: ''})
  const locate = base
    .errors({ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}})
    .input(z.object({target: z.string()}))
    .output(z.object({found: z.boolean()}))
    .handler(() => ({found: true}))
  const client = createRouterClient({page: {locate}})
  const {error} = await safe(client.page.locate({target: '#x'}))
  if (isDefinedError(error)) {
    expectTypeOf(error.code).toEqualTypeOf<'ELEMENT_NOT_FOUND'>()
    expectTypeOf(error.data).toEqualTypeOf<{target: string}>()
  }
})

test('declared error data must be a zod schema', () => {
  defineTool({
    name: 't',
    description: 'd',
    inputSchema: z.object({}),
    // @ts-expect-error data must be a zod schema, not a plain value
    errors: {BROKEN: {message: 'm', data: 123}},
  })
})
