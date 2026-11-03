import {join} from 'node:path'
import type {Duplex} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import {defineTool, type AnyToolBuilder, type ConcivPlugin} from '@conciv/extension'
import {fromWireError} from '@conciv/extension/devframe-function'
import {TOOL_ICON_KEYS} from '@conciv/protocol/tool-icon-types'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import type {ClaimUpgrade} from '@conciv/serve'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import {AsyncQueuer} from '@tanstack/pacer'
import type {DevframePtyTerminalSession, DevframeTerminalSession} from '@devframes/hub/types'
import {createMessagesDevframe} from '@devframes/plugin-messages'
import {createTerminalsDevframe} from '@devframes/plugin-terminals'
import {defineDevframe, type DevframeDefinition} from 'devframe'
import type {DevframeAuthHandler} from 'devframe/node/auth'
import type {AgentTool, DevframeNodeContext} from 'devframe/types'
import {createInteractiveAuth} from 'devframe/recipes/interactive-auth'
import {z} from 'zod'
import {logError} from './lib/debug.js'
import {isInheritedToken} from './devframe-trust.js'

const HUB_BASE = '/__conciv/'

export type PublishedGroup = 'sessions'

export type Publish = (group: PublishedGroup) => Promise<void>

export type CoreFunction = Parameters<DevframeNodeContext['rpc']['register']>[0]

export type ServerFunctionsOf<Definitions extends readonly unknown[]> = {
  [
    Definition in Definitions[number] as Definition extends {name: infer Name extends string} ? Name : never
  ]: Definition extends {args: readonly [infer Input extends z.ZodType]; returns: infer Output extends z.ZodType}
    ? (input: z.input<Input>) => Promise<z.output<Output>>
    : never
}

export type DevframePlaneOpts = {
  stateDir: string
  cwd: string
  host: ConcivHost
  published: Record<PublishedGroup, () => Promise<object>>
  functions: (publish: Publish) => readonly CoreFunction[]
  plugins?: readonly ConcivPlugin[]
  devframes?: readonly DevframeDefinition[]
  loginToken: string
  allowedOrigins?: readonly string[]
}

export type HubAgentTool = {tool: AnyToolBuilder; plugin: string | undefined}

export type DevframePlane = {
  hub: HubInstance
  claimUpgrade: ClaimUpgrade
  publish: Publish
  agentTools: () => Promise<HubAgentTool[]>
  close: () => Promise<void>
}

type PublishRequest = {group: PublishedGroup; done: PromiseWithResolvers<void>}

function coreDevframe(opts: DevframePlaneOpts, publish: Publish): DevframeDefinition {
  return defineDevframe({
    id: 'conciv',
    name: 'conciv',
    version: '0.0.0',
    packageName: '@conciv/core',
    homepage: 'https://conciv.dev',
    description: 'conciv engine',
    importMetaUrl: import.meta.url,
    services: [{package: '@devframes/service-open'}],
    setup(ctx) {
      ctx.services.provide(CONCIV_HOST_SERVICE, opts.host)
      opts.functions(publish).forEach((definition) => ctx.rpc.register(definition))
    },
  })
}

function hideAssetlessDock(devframe: DevframeDefinition): DevframeDefinition {
  if (devframe.clientAssets) return devframe
  return {...devframe, dock: {...devframe.dock, when: 'false'}}
}

function unfilledAuth(): DevframeAuthHandler {
  return {
    rpcFunctions: [],
    authorize: () => false,
    onConnect: () => {},
    printBanner: () => {},
    buildOpenUrl: (url) => url,
  }
}

function claimHubUpgrade(hub: HubInstance): ClaimUpgrade {
  const socketPath = `${hub.base}__ws`
  return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== socketPath) return false
    hub.handleUpgrade(req, socket, head)
    return true
  }
}

function isRunnableSession(session: DevframeTerminalSession): session is DevframePtyTerminalSession {
  return 'terminate' in session
}

async function stopHubSessions(hub: HubInstance): Promise<void> {
  const context = await hub.context
  const live = [...context.terminals.sessions.values()].filter(isRunnableSession)
  await Promise.allSettled(live.map((session) => session.terminate()))
}

async function publishGroup(
  hub: HubInstance,
  published: DevframePlaneOpts['published'],
  group: PublishedGroup,
): Promise<void> {
  try {
    const context = await hub.context
    const value = await published[group]()
    const state = await context.rpc.sharedState.get(`conciv:${group}`, {initialValue: value})
    state.mutate(() => value)
  } catch (error) {
    logError(`[core] publishing ${group} to the hub failed: ${String(error)}`)
  }
}

const ConcivAgentSchema = z.object({
  name: z.string(),
  approval: z.literal('ask').optional(),
  meta: z.object({
    summary: z.string(),
    category: z.string().optional(),
    mutating: z.boolean().optional(),
    mirrors: z.boolean().optional(),
    keywords: z.array(z.string()).optional(),
    positional: z.string().optional(),
    hint: z.string().optional(),
    icon: z.enum(TOOL_ICON_KEYS).optional(),
    label: z.object({running: z.string(), done: z.string()}).optional(),
  }),
})

const DefinitionSchemasSchema = z.object({args: z.array(z.unknown()).optional(), returns: z.unknown().optional()})

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && '_zod' in schema
}

function isObjectSchema(schema: unknown): schema is z.ZodObject {
  return isZodSchema(schema) && typeof Reflect.get(schema, 'shape') === 'object'
}

type AgentCall = {inputSchema: z.ZodObject; wireArgs: (input: object, sessionId: string) => unknown}

function agentCall(args: readonly unknown[] | undefined): AgentCall {
  const [first] = args ?? []
  if (args?.length !== 1 || !isObjectSchema(first)) {
    const positional = Object.fromEntries((args ?? []).map((_schema, index) => [`arg${index}`, z.unknown()]))
    return {inputSchema: z.object(positional), wireArgs: (input) => input}
  }
  if (!('sessionId' in first.shape)) return {inputSchema: first, wireArgs: (input) => [input]}
  return {inputSchema: first.omit({sessionId: true}), wireArgs: (input, sessionId) => [{...input, sessionId}]}
}

function agentToolName(functionName: string): string {
  return functionName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function registryToolFor(context: DevframeNodeContext, listed: AgentTool, rpcName: string): HubAgentTool {
  const definition = context.rpc.definitions.get(rpcName)
  const schemas = DefinitionSchemasSchema.parse(definition ?? {})
  const declared = ConcivAgentSchema.safeParse(definition?.agent)
  const call = agentCall(schemas.args)
  const tool = defineTool({
    name: declared.success ? declared.data.name : agentToolName(rpcName),
    description: listed.description,
    inputSchema: call.inputSchema,
    outputSchema: isZodSchema(schemas.returns) ? schemas.returns : z.unknown(),
    ...(declared.data?.approval === undefined ? {} : {approval: declared.data.approval}),
    meta: declared.success ? declared.data.meta : {summary: listed.description, mutating: listed.safety !== 'read'},
  }).server(async (input, _context, request) => {
    try {
      return await context.agent.invoke(rpcName, call.wireArgs(input, request.sessionId))
    } catch (error) {
      throw fromWireError(error)
    }
  })
  return {tool, plugin: declared.success ? rpcName.split(':')[0] : undefined}
}

async function hubAgentTools(hub: HubInstance): Promise<HubAgentTool[]> {
  const context = await hub.context
  return context.agent
    .list()
    .tools.flatMap((listed) => (listed.rpcName === undefined ? [] : [registryToolFor(context, listed, listed.rpcName)]))
}

export function makeDevframePlane(opts: DevframePlaneOpts): DevframePlane {
  const auth = unfilledAuth()
  const queue = new AsyncQueuer<PublishRequest>(
    async (request) => {
      await publishGroup(hub, opts.published, request.group)
      request.done.resolve()
    },
    {concurrency: 1},
  )
  const publish: Publish = (group) => {
    const done = Promise.withResolvers<void>()
    if (!queue.addItem({group, done})) done.resolve()
    return done.promise
  }
  const hub = initHub({
    name: 'conciv',
    base: HUB_BASE,
    cwd: opts.cwd,
    mcp: false,
    devframes: [
      coreDevframe(opts, publish),
      createMessagesDevframe(),
      createTerminalsDevframe(),
      ...(opts.plugins ?? []).map((plugin) => plugin.devframe),
      ...(opts.devframes ?? []),
    ].map(hideAssetlessDock),
    auth,
    allowedOrigins: opts.allowedOrigins,
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
    configure(ctx) {
      const interactive = createInteractiveAuth(ctx, {clientAuthTokens: [opts.loginToken]})
      const guarded: DevframeAuthHandler = {
        ...interactive,
        authorize: (method, session) =>
          interactive.authorize(method, session) && !isInheritedToken(ctx, session.meta.clientAuthToken),
      }
      Object.assign(auth, guarded)
    },
  })
  return {
    hub,
    claimUpgrade: claimHubUpgrade(hub),
    publish,
    agentTools: () => hubAgentTools(hub),
    close: async () => {
      await stopHubSessions(hub)
      await hub.close()
    },
  }
}
