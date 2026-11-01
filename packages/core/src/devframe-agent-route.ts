import {AsyncLocalStorage} from 'node:async_hooks'
import {join} from 'node:path'
import {createMcpFetchHandler} from '@devframes/agentic/mcp'
import type {HubInstance} from '@devframes/hub/initiate'
import {createHostContext} from 'devframe/node'
import type {AgentToolInput, McpFetchHandler} from 'devframe/types'
import {timingSafeEqual} from 'devframe/utils/crypto-token'
import {withMcpContent} from 'devframe'
import {z} from 'zod'
import type {CodeRunner} from '@conciv/chat'
import type {SessionId} from '@conciv/protocol/chat-types'
import {EXECUTE_TOOL_NAME, ExecuteInputSchema} from './api/execute-schemas.js'
import {
  DISCOVER_TOOL_NAME,
  DiscoverInputSchema,
  EXECUTE_DESCRIPTION,
  nativeIdFromHeaders,
  runDirect,
  runDiscover,
  runExecute,
  serverInstructions,
  sessionIdFromHeaders,
  type ExecuteReply,
  type McpDeps,
  type PublishChunks,
} from './api/mcp.js'
import type {SessionScope} from './runtime/scope-types.js'

export type AgentRouteDeps = McpDeps & {token: string}

type RouteCall = {scope: SessionScope; runner: CodeRunner | null; instructions: string}

const routeCall = new AsyncLocalStorage<RouteCall>()

export function currentRouteSessionId(): SessionId | null {
  return routeCall.getStore()?.scope.id ?? null
}

function toolResult(reply: ExecuteReply): object {
  if (reply.isError === true) {
    throw new Error(reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'))
  }
  return withMcpContent({}, reply.content)
}

function toolsFor(runner: CodeRunner, publish: PublishChunks): AgentToolInput[] {
  const discover = runner.discover
  return [
    ...(discover === null
      ? []
      : [
          {
            id: DISCOVER_TOOL_NAME,
            description: discover.description,
            inputSchema: z.toJSONSchema(DiscoverInputSchema),
            handler: async (args: unknown) =>
              toolResult(await runDiscover(runner, DiscoverInputSchema.parse(args).toolNames)),
          },
        ]),
    ...runner.asking.map((tool) => ({
      id: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema),
      handler: async (args: unknown) => toolResult(await runDirect(tool, tool.inputSchema.parse(args), publish)),
    })),
    {
      id: EXECUTE_TOOL_NAME,
      description: EXECUTE_DESCRIPTION,
      inputSchema: z.toJSONSchema(ExecuteInputSchema),
      handler: async (args: unknown) =>
        toolResult(await runExecute(runner, ExecuteInputSchema.parse(args).typescriptCode, publish)),
    },
  ]
}

export function routeTools(): AgentToolInput[] {
  const call = routeCall.getStore()
  if (call === undefined || call.runner === null) return []
  return toolsFor(call.runner, (chunks) => chunks.forEach((chunk) => call.scope.stream.publish(chunk)))
}

function holdsToken(request: Request, token: string): boolean {
  const presented = /^Bearer (\S+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')?.[1]
  return presented !== undefined && timingSafeEqual(presented, token)
}

async function withRouteCall(
  deps: AgentRouteDeps,
  request: Request,
  forward: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (!holdsToken(request, deps.token)) return forward(request)
  const scope = await deps.resolveSession(sessionIdFromHeaders(request.headers), nativeIdFromHeaders(request.headers))
  const runner = await deps.codeRunner(scope.id)
  const instructions = serverInstructions(runner?.systemPrompt ?? '', deps.staleness())
  return routeCall.run({scope, runner, instructions}, () => forward(request))
}

async function makeAgentHandler(deps: AgentRouteDeps, cwd: string, stateDir: string): Promise<McpFetchHandler> {
  const context = await createHostContext({
    cwd,
    mode: 'dev',
    host: {
      mountStatic: () => {},
      resolveOrigin: () => 'mcp://conciv',
      getStorageDir: (scope) => join(stateDir, 'devframe-agent', scope),
    },
  })
  context.agent.registerToolProvider(routeTools)
  return createMcpFetchHandler(context, {
    serverName: 'conciv',
    serverVersion: '0.0.0',
    exposeSharedState: false,
    allowedOrigins: false,
    authorization: deps.token,
    get instructions() {
      return routeCall.getStore()?.instructions
    },
  })
}

type AgentRouteMount = {
  enabled: boolean | undefined
  deps: AgentRouteDeps
  hub: HubInstance
  cwd: string
  stateDir: string
  mount: (path: string, serve: (request: Request) => Promise<Response>) => void
}

export async function mountAgentRoutes(opts: AgentRouteMount): Promise<() => Promise<void>> {
  if (opts.enabled !== true) return async () => {}
  const handler = await makeAgentHandler(opts.deps, opts.cwd, opts.stateDir)
  opts.mount('/api/devframe-mcp', (raw) => withRouteCall(opts.deps, raw, (request) => handler.fetch(request)))
  opts.mount(`${opts.hub.base}__mcp`, (raw) => withRouteCall(opts.deps, raw, (request) => opts.hub.handler(request)))
  return () => handler.dispose()
}
