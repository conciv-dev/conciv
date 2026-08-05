import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {defineTool} from '../src/define-tool.js'

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

test('declared error data must be a zod schema', () => {
  defineTool({
    name: 't',
    description: 'd',
    inputSchema: z.object({}),
    // @ts-expect-error data must be a zod schema, not a plain value
    errors: {BROKEN: {message: 'm', data: 123}},
  })
})
