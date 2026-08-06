import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import type {RouterClient} from '@orpc/server'
import {isDefinedError} from '@orpc/client'
import type {Client, ORPCError} from '@orpc/client'
import {
  defineExtension,
  defineTool,
  getExtensionApi,
  toolDefinition,
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

const treblerDef = toolDefinition({
  name: 'demo.trebler',
  description: 'triple a number',
  inputSchema: z.object({value: z.number()}),
  outputSchema: z.object({tripled: z.number()}),
  meta: {summary: 'triple the number it is given'},
})

const trebler = defineTool(treblerDef).client((input) => ({tripled: input.value * 3}))

const locator = defineTool({
  name: 'demo.locator',
  description: 'find an element on the page',
  inputSchema: z.object({target: z.string()}),
  outputSchema: z.object({found: z.boolean()}),
  errors: {ELEMENT_NOT_FOUND: {message: 'no element matched the target', data: z.object({target: z.string()})}},
  meta: {summary: 'find an element on the page by selector'},
}).client(() => ({found: true}))

const guard = defineTool({
  name: 'demo.guard',
  description: 'reject a factor that is too large',
  inputSchema: z.object({factor: z.number()}),
  outputSchema: z.object({accepted: z.boolean()}),
  errors: {FACTOR_TOO_LARGE: {message: 'the factor exceeds the allowed range'}},
  meta: {summary: 'check a factor against the allowed range'},
}).server(() => ({accepted: true}))

const pickerDef = toolDefinition({
  name: 'demo.picker',
  description: 'let the user pick an element in the page',
  inputSchema: z.object({}),
  outputSchema: z.object({picked: z.string()}),
  errors: {PICK_CANCELLED: {message: 'the user dismissed the picker'}},
  meta: {summary: 'let the user point at an element in the page'},
})

const pickerRenderer = defineTool(pickerDef).render(() => null)

const demo = defineExtension({
  name: 'demo',
  configSchema: cfgSchema,
  tools: [doubler, trebler, locator, guard, pickerRenderer],
}).client(() => ({
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

const treblerTwinDef = toolDefinition({
  name: 'demo.trebler',
  description: 'triple a number, differently',
  inputSchema: z.object({amount: z.number()}),
  outputSchema: z.object({thrice: z.number()}),
  meta: {summary: 'another shared definition claiming the same name'},
})

const treblerTwin = defineTool(treblerTwinDef).client((input) => ({thrice: input.amount * 3}))

const emptySegment = defineTool({
  name: 'page..fill',
  description: 'a name with an empty segment',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'a tool whose name has an empty path segment'},
}).client(() => ({ok: true}))

const leadingForbidden = defineTool({
  name: '__proto__.x',
  description: 'a name that starts with a prototype-chain segment',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'a tool whose name starts with a hostile path segment'},
}).client(() => ({ok: true}))

const middleForbidden = defineTool({
  name: 'page.constructor.x',
  description: 'a name with a prototype-chain segment in the middle',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'a tool whose name carries a hostile path segment in the middle'},
}).client(() => ({ok: true}))

const trailingForbidden = defineTool({
  name: 'page.prototype',
  description: 'a name that ends with a prototype-chain segment',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'a tool whose name ends with a hostile path segment'},
}).client(() => ({ok: true}))

const prefixed = defineExtension({name: 'prefixed', tools: [page, pageFill]})
const twin = defineExtension({name: 'twin', tools: [doublerTwin]})
const hollow = defineExtension({name: 'hollow', tools: [emptySegment]})
const hostile = defineExtension({name: 'hostile', tools: [trailingForbidden]})

type PrefixedRegistry = RegisterExtension<typeof prefixed>
type TwinRegistry = RegisterExtension<typeof demo> & RegisterExtension<typeof twin>
type HollowRegistry = RegisterExtension<typeof hollow>
type HostileRegistry = RegisterExtension<typeof hostile>

declare const registry: ToolRegistry

type FailureOf<Procedure> =
  Procedure extends Client<infer _Context, infer _Input, infer _Output, infer Failure> ? Failure : never

type DefinedErrorOf<Procedure> = Extract<FailureOf<Procedure>, ORPCError<string, unknown>>

type DoublerError = FailureOf<typeof client.demo.doubler>

type LocatorError = FailureOf<typeof client.demo.locator>

type GuardError = FailureOf<typeof client.demo.guard>

type TransportErrorCode = 'NO_PAGE_CLIENT' | 'PAGE_TIMEOUT' | 'UNKNOWN_TOOL' | 'INVALID_ARGS' | 'HANDLER_ERROR'

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

test('a tool declared through a shared definition reaches the client under its literal name', () => {
  expectTypeOf(client.demo.trebler).parameter(0).toEqualTypeOf<{value: number}>()
  expectTypeOf(client.demo.trebler).returns.resolves.toEqualTypeOf<{tripled: number}>()
})

test('a shared definition colliding with another tool resolves to a diagnostic', () => {
  expectTypeOf<RegisteredTools<[typeof trebler, typeof treblerTwin]>>().toMatchTypeOf<ToolNameProblem<string>>()
  expectTypeOf<RegisteredTools<[typeof doubler, typeof treblerTwin, typeof trebler]>>().toMatchTypeOf<
    ToolNameProblem<string>
  >()
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

test('a prototype-chain path segment resolves to a diagnostic in every position', () => {
  expectTypeOf<RegisteredTools<[typeof leadingForbidden]>>().toMatchTypeOf<ToolNameProblem<string>>()
  expectTypeOf<RegisteredTools<[typeof middleForbidden]>>().toMatchTypeOf<ToolNameProblem<string>>()
  expectTypeOf<RegisteredTools<[typeof trailingForbidden]>>().toMatchTypeOf<ToolNameProblem<string>>()
})

test('a registry carrying a prototype-chain segment is not a usable router', () => {
  expectTypeOf<ToolRouterFor<HostileRegistry>>().toMatchTypeOf<ToolNameProblem<string>>()
  // @ts-expect-error a forbidden path segment is not a usable router
  expectTypeOf<RouterClient<ToolRouterFor<HostileRegistry>>>().toBeObject()
})

test('two tools in one extension claiming one name resolve to a diagnostic', () => {
  expectTypeOf<RegisteredTools<[typeof doubler, typeof doublerTwin]>>().toMatchTypeOf<ToolNameProblem<string>>()
})

test('a registry with no name collision stays a usable router', () => {
  expectTypeOf<ToolRegistry['router']>().not.toMatchTypeOf<ToolNameProblem<string>>()
  expectTypeOf<RouterClient<ToolRegistry['router']>>().toBeObject()
})

test('a declared tool error narrows through isDefinedError with its code and its data type', () => {
  function narrow(error: LocatorError) {
    if (!isDefinedError(error)) return
    if (error.code !== 'ELEMENT_NOT_FOUND') return
    expectTypeOf(error.data).toEqualTypeOf<{target: string}>()
  }
  expectTypeOf(narrow).toBeFunction()
})

test('a client-bound tool carries its declared error alongside the transport codes', () => {
  expectTypeOf<DefinedErrorOf<typeof client.demo.locator>['code']>().toEqualTypeOf<
    'ELEMENT_NOT_FOUND' | TransportErrorCode
  >()
})

test('a client-bound tool that declares nothing still carries the transport codes', () => {
  expectTypeOf<DefinedErrorOf<typeof client.demo.doubler>['code']>().toEqualTypeOf<TransportErrorCode>()
})

test('an unbound renderer declaration still reports the transport codes its runtime twin can raise', () => {
  expectTypeOf<DefinedErrorOf<typeof client.demo.picker>['code']>().toEqualTypeOf<
    'PICK_CANCELLED' | TransportErrorCode
  >()
})

test('a server-bound tool carries its declared error and no transport code', () => {
  expectTypeOf<DefinedErrorOf<typeof client.demo.guard>['code']>().toEqualTypeOf<'FACTOR_TOO_LARGE'>()
})

test('an undeclared error stays outside the defined-error union', () => {
  function narrow(error: GuardError) {
    if (isDefinedError(error)) return
    expectTypeOf(error).toEqualTypeOf<Error>()
  }
  expectTypeOf(narrow).toBeFunction()
})

test('the declared failure union still admits a plain thrown Error', () => {
  expectTypeOf<Error>().toMatchTypeOf<DoublerError>()
})

test('register only accepts the context its tool declared', () => {
  registry.register(scaler, {owner: 'a test registrant', context: {factor: 2}})
  // @ts-expect-error the tool's handler declares ctx: {factor: number}
  registry.register(scaler, {owner: 'a test registrant', context: {}})
})

test('a tool whose handler declares a context cannot be registered without one', () => {
  // @ts-expect-error the tool's handler declares ctx: {factor: number}, so a context is required
  registry.register(scaler, {owner: 'a test registrant'})
})

test('every registration names its registrant', () => {
  // @ts-expect-error a registration must name its owner so a collision can name both
  registry.register(doubler, {})
})

test('a context-free tool still registers with just an owner', () => {
  registry.register(doubler, {owner: 'a test registrant'})
})

test('a heterogeneous registration loop still type-checks', () => {
  const tools: AnyToolBuilder[] = [scaler, doubler]
  for (const tool of tools) registry.register(tool, {owner: 'a test registrant', context: {factor: 2}})
})

test('extension context must satisfy the intersection of its tools Ctx', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({})}).server(
    (_input, ctx: {factor: number}) => ctx.factor,
  )
  // @ts-expect-error the returned context is missing `factor`, which the tool's Ctx requires
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {}}))
  defineExtension({name: 'k', tools: [tool]}).server(() => ({context: {factor: 1}}))
})
