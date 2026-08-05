import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import type {RouterClient} from '@orpc/server'
import type {Client, ORPCError} from '@orpc/client'
import {
  defineExtension,
  defineTool,
  getExtensionApi,
  type AnyToolBuilder,
  type ExtensionApi,
  type RegisteredTools,
  type RegisterExtension,
  type ToolNameProblem,
} from '../src/index.js'
import type {ToolRegistry, ToolRouterFor} from '../src/tool-registry.js'
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

const scaler = defineTool({
  name: 'demo.scaler',
  description: 'scale a number by the configured factor',
  inputSchema: z.object({value: z.number()}),
  outputSchema: z.object({scaled: z.number()}),
  meta: {summary: 'multiply the number it is given by the configured factor'},
}).server((input, ctx: {factor: number}) => ({scaled: input.value * ctx.factor}))

const page = defineTool({
  name: 'page',
  description: 'read the page',
  inputSchema: z.object({}),
  outputSchema: z.object({title: z.string()}),
  meta: {summary: 'read the page title'},
}).client(() => ({title: 'x'}))

const pageFill = defineTool({
  name: 'page.fill',
  description: 'type text into a field',
  inputSchema: z.object({target: z.string()}),
  outputSchema: z.object({filled: z.boolean()}),
  meta: {summary: 'type text into a field on the page'},
}).client(() => ({filled: true}))

const doublerTwin = defineTool({
  name: 'demo.doubler',
  description: 'double a number, differently',
  inputSchema: z.object({amount: z.number()}),
  outputSchema: z.object({twice: z.number()}),
  meta: {summary: 'another tool that claims the same name'},
}).client((input) => ({twice: input.amount * 2}))

const emptySegment = defineTool({
  name: 'page..fill',
  description: 'a name with an empty segment',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'a tool whose name has an empty path segment'},
}).client(() => ({ok: true}))

const prefixed = defineExtension({name: 'prefixed', tools: [page, pageFill]})
const twin = defineExtension({name: 'twin', tools: [doublerTwin]})
const hollow = defineExtension({name: 'hollow', tools: [emptySegment]})

type PrefixedRegistry = RegisterExtension<typeof prefixed>
type TwinRegistry = RegisterExtension<typeof demo> & RegisterExtension<typeof twin>
type HollowRegistry = RegisterExtension<typeof hollow>

declare const registry: ToolRegistry

type DoublerError =
  typeof client.demo.doubler extends Client<infer _Context, infer _Input, infer _Output, infer Failure>
    ? Failure
    : never

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

test('a tool name that is also the prefix of another resolves to a diagnostic, never a client that drops one', () => {
  expectTypeOf<ToolRouterFor<PrefixedRegistry>>().toMatchTypeOf<ToolNameProblem<string>>()
  // @ts-expect-error a colliding registry is not a usable router
  expectTypeOf<RouterClient<ToolRouterFor<PrefixedRegistry>>>().toBeObject()
})

test('two extensions claiming one tool name resolve to a diagnostic, never an intersected schema', () => {
  expectTypeOf<ToolRouterFor<TwinRegistry>>().toMatchTypeOf<ToolNameProblem<string>>()
  // @ts-expect-error a colliding registry is not a usable router
  expectTypeOf<RouterClient<ToolRouterFor<TwinRegistry>>>().toBeObject()
})

test('a tool name with an empty path segment resolves to a diagnostic, never an empty-string key', () => {
  expectTypeOf<ToolRouterFor<HollowRegistry>>().toMatchTypeOf<ToolNameProblem<string>>()
  // @ts-expect-error a name with an empty segment is not a usable router
  expectTypeOf<RouterClient<ToolRouterFor<HollowRegistry>>>().toBeObject()
})

test('two tools in one extension claiming one name resolve to a diagnostic', () => {
  expectTypeOf<RegisteredTools<[typeof doubler, typeof doublerTwin]>>().toMatchTypeOf<ToolNameProblem<string>>()
})

test('a registry with no name collision stays a usable router', () => {
  expectTypeOf<ToolRegistry['router']>().not.toMatchTypeOf<ToolNameProblem<string>>()
  expectTypeOf<RouterClient<ToolRegistry['router']>>().toBeObject()
})

test('the derived client declares no errors, so isDefinedError narrows to never on it', () => {
  expectTypeOf<DoublerError>().toEqualTypeOf<Error>()
  expectTypeOf<Extract<DoublerError, ORPCError<string, unknown>>>().toEqualTypeOf<never>()
})

test('register only accepts the context its tool declared', () => {
  registry.register(scaler, {context: {factor: 2}})
  // @ts-expect-error the tool's handler declares ctx: {factor: number}
  registry.register(scaler, {context: {}})
})

test('a heterogeneous registration loop still type-checks', () => {
  const tools: AnyToolBuilder[] = [scaler, doubler]
  for (const tool of tools) registry.register(tool, {context: {factor: 2}})
})

test('extension context must satisfy the intersection of its tools Ctx', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({})}).server(
    (_input, ctx: {factor: number}) => ctx.factor,
  )
  // @ts-expect-error the returned context is missing `factor`, which the tool's Ctx requires
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {}}))
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {factor: 1}}))
})
