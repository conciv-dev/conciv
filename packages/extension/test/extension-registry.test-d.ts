import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import type {RouterClient} from '@orpc/server'
import {defineExtension, defineTool, getExtensionApi, type ExtensionApi, type RegisterExtension} from '../src/index.js'
import type {ToolRegistry} from '../src/tool-registry.js'
import type {ConcivConfig} from '@conciv/protocol/config-types'

const cfgSchema = z.object({runner: z.enum(['vitest', 'jest']).default('vitest')})

const doubler = defineTool({
  name: 'demo.doubler',
  description: 'double a number',
  inputSchema: z.object({value: z.number()}),
  outputSchema: z.object({doubled: z.number()}),
  meta: {summary: 'double the number it is given'},
}).client((input) => ({doubled: input.value * 2}))

const demo = defineExtension({name: 'demo', configSchema: cfgSchema, tools: [doubler]}).client(() => ({
  value: {ratio: 2},
}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof demo> {}
}

declare const client: RouterClient<ToolRegistry['router']>

test('config key + value type are derived from the registry (z.input, defaults optional)', () => {
  expectTypeOf<NonNullable<ConcivConfig['extensions']>['demo']>().toMatchTypeOf<
    {runner?: 'vitest' | 'jest'} | undefined
  >()
})

test('the extension context is derived from the builder, never restated by the registration', () => {
  expectTypeOf(getExtensionApi<'demo'>).returns.toMatchTypeOf<ExtensionApi<{ratio: number}>>()
  // @ts-expect-error the derived context carries ratio, so it is not an api over {label: string}
  expectTypeOf(getExtensionApi<'demo'>).returns.toMatchTypeOf<ExtensionApi<{label: string}>>()
})

test('an extension that never declared itself is not a known id', () => {
  // @ts-expect-error "absent" contributed nothing to the registry
  expectTypeOf(getExtensionApi<'absent'>).toBeFunction()
})

test('an extension tool is reachable on the typed client, typed by its own schemas', () => {
  expectTypeOf(client.demo.doubler).parameter(0).toEqualTypeOf<{value: number}>()
  expectTypeOf(client.demo.doubler).returns.resolves.toEqualTypeOf<{doubled: number}>()
})

test('the tool input type is enforced at the call site', () => {
  // @ts-expect-error the tool's input schema requires a number
  expectTypeOf(client.demo.doubler).toBeCallableWith({value: 'two'})
})

test('a tool the extension never declared is absent from the client', () => {
  // @ts-expect-error demo declares no "absent" tool
  expectTypeOf(client.demo.absent).toBeFunction()
})

test('extension context must satisfy the intersection of its tools Ctx', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({})}).server(
    (_input, ctx: {factor: number}) => ctx.factor,
  )
  // @ts-expect-error the returned context is missing `factor`, which the tool's Ctx requires
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {}}))
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {factor: 1}}))
})
