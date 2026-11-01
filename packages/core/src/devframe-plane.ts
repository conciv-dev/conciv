import {join} from 'node:path'
import {defineDevframe, defineRpcFunction, type DevframeDefinition} from 'devframe'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import type {DevframeNodeRpcSession, RpcStreamingChannel} from 'devframe/types'
import type {RpcDefinitionsToFunctions} from 'devframe/rpc'
import {defineDiagnostics} from 'devframe/utils/nostics'
import {getInternalContext} from 'devframe/node/hub-internals'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import type {DevframeHubContext} from '@devframes/hub/types'
import {createTerminalsDevframe} from '@devframes/plugin-terminals'
import {createMessagesDevframe} from '@devframes/plugin-messages'
import {createGitDevframe} from '@devframes/plugin-git'
import {createA11yDevframe} from '@devframes/plugin-a11y'
import {createInspectDevframe} from '@devframes/plugin-inspect'
import {createJsonRenderView} from '@devframes/json-render/node'
import {z} from 'zod'
import {eq} from 'drizzle-orm'
import {DraftRowSchema, type SessionMeta} from '@conciv/contract'
import {drafts, sessions} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import type {ChatContext} from './api/rpc/mount.js'
import {rpcSessionList} from './api/rpc/sessions.js'
import {rowById} from './sessions/session-rows.js'
import {concivError, defineConcivFunction} from './devframe-function.js'
import {routeTools} from './devframe-agent-route.js'

const NAMESPACE = 'conciv'
const SESSIONS_STATE = 'conciv:sessions'
const TICKS_CHANNEL = 'conciv:ticks'

export const concivDiagnostics = defineDiagnostics({
  codes: {
    CONCIV_NOT_FOUND: {why: (params: {sessionId: string}) => `session ${params.sessionId} not found`},
    CONCIV_NO_PAGE: {why: (params: {sessionId: string}) => `no page registered for session ${params.sessionId}`},
  },
})

const ErrorVariant = z.enum(['coded', 'diagnostic'])

function raised(variant: z.infer<typeof ErrorVariant>): Error {
  if (variant === 'diagnostic') return concivDiagnostics.CONCIV_NOT_FOUND({sessionId: 'conciv_probe'})
  return concivError('CONCIV_PROBE', 'probe failure', {attempt: 3, ids: ['a', 'b']})
}

export type PlaneDeps = {
  chat: ChatContext
  pages: Map<string, DevframeNodeRpcSession>
  refresh: () => Promise<void>
  agentRoute: boolean
}

function serverFunctionsFor(deps: PlaneDeps, ctx: () => DevframeHubContext) {
  const ticksChannel: {current: RpcStreamingChannel<number> | null} = {current: null}
  const ticks = (): RpcStreamingChannel<number> => {
    ticksChannel.current ??= ctx().rpc.streaming.create<number>(TICKS_CHANNEL, {replayWindow: 256})
    return ticksChannel.current
  }

  const sessionsList = defineRpcFunction({
    name: 'conciv:sessions:list',
    type: 'query',
    jsonSerializable: true,
    ...(deps.agentRoute ? {} : {agent: {description: 'List the chat sessions of this project.', safety: 'read'}}),
    handler: () => rpcSessionList(deps.chat, false),
  })

  const sessionsRename = defineConcivFunction({
    name: 'conciv:sessions:rename',
    type: 'action',
    input: z.object({sessionId: SessionId, title: z.string().trim().min(1).max(200)}),
    output: z.object({title: z.string()}),
    handler: async (input) => {
      if (!(await rowById(deps.chat.db, input.sessionId)))
        throw concivDiagnostics.CONCIV_NOT_FOUND({sessionId: input.sessionId})
      await deps.chat.db
        .update(sessions)
        .set({title: input.title, updatedAt: Date.now()})
        .where(eq(sessions.id, input.sessionId))
      await deps.refresh()
      return {title: input.title}
    },
  })

  const draftsGet = defineConcivFunction({
    name: 'conciv:drafts:get',
    type: 'query',
    input: z.object({sessionId: SessionId}),
    output: DraftRowSchema.nullable(),
    handler: async (input) => {
      const rows = await deps.chat.db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId))
      return rows[0] ?? null
    },
  })

  const draftsSet = defineConcivFunction({
    name: 'conciv:drafts:set',
    type: 'action',
    input: DraftRowSchema.omit({updatedAt: true}),
    output: z.object({ok: z.literal(true)}),
    handler: async (input) => {
      const row = {...input, updatedAt: Date.now()}
      await deps.chat.db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
      return {ok: true as const}
    },
  })

  const errorsRaw = defineRpcFunction({
    name: 'conciv:errors:raw',
    type: 'query',
    jsonSerializable: true,
    args: [ErrorVariant],
    returns: z.null(),
    handler: (variant) => {
      throw raised(variant)
    },
  })

  const errorsWrapped = defineConcivFunction({
    name: 'conciv:errors:wrapped',
    type: 'query',
    input: ErrorVariant,
    output: z.null(),
    handler: (variant) => {
      throw raised(variant)
    },
  })

  const pageRegister = defineRpcFunction({
    name: 'conciv:page:register',
    type: 'action',
    jsonSerializable: true,
    args: [z.object({sessionId: SessionId})],
    returns: z.object({registered: z.boolean()}),
    setup: (context) => ({
      handler: (input) => {
        const session = context.rpc.getCurrentRpcSession()
        if (session) deps.pages.set(input.sessionId, session)
        return {registered: Boolean(session)}
      },
    }),
  })

  const pageAsk = defineConcivFunction({
    name: 'conciv:page:ask',
    type: 'query',
    input: z.object({sessionId: SessionId, question: z.string()}),
    output: z.string(),
    handler: async (input) => {
      const page = deps.pages.get(input.sessionId)
      if (!page) throw concivDiagnostics.CONCIV_NO_PAGE({sessionId: input.sessionId})
      return page.rpc.$call('conciv:page:query', input.question)
    },
  })

  const ticksStart = defineConcivFunction({
    name: 'conciv:ticks:start',
    type: 'action',
    input: z.object({count: z.number().int().min(1).max(100), hold: z.boolean().default(false)}),
    output: z.object({streamId: z.string(), held: z.boolean()}),
    handler: (input) => {
      const stream = ticks().start()
      Array.from({length: input.count}, (_, index) => index + 1).forEach((tick) => stream.write(tick))
      if (!input.hold) stream.close()
      return {streamId: stream.id, held: input.hold}
    },
  })

  return [
    sessionsList,
    sessionsRename,
    draftsGet,
    draftsSet,
    errorsRaw,
    errorsWrapped,
    pageRegister,
    pageAsk,
    ticksStart,
  ] as const
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<ReturnType<typeof serverFunctionsFor>> {}
  interface DevframeRpcClientFunctions {
    'conciv:page:query': (question: string) => Promise<string>
  }
  interface DevframeSettingsRegistry {
    conciv: {scheme: 'light' | 'dark' | 'system'}
  }
}

declare module 'devframe/types' {
  interface DevframeRpcSharedStates {
    [SESSIONS_STATE]: {sessions: SessionMeta[]}
  }
}

export type DevframePlaneOpts = {
  chat: ChatContext
  stateDir: string
  auth: boolean
  mcpToken: string
  cwd: string
  host: ConcivHost
  plugins: DevframeDefinition[]
  agentRoute: boolean
}

export type DevframePlane = {hub: HubInstance; sessionsChanged: () => void}

export function makeDevframePlane(opts: DevframePlaneOpts): DevframePlane {
  const contextRef: {current: DevframeHubContext | null} = {current: null}
  const requireContext = (): DevframeHubContext => {
    if (!contextRef.current) throw new Error('conciv hub is not configured yet')
    return contextRef.current
  }
  const deps: PlaneDeps = {
    chat: opts.chat,
    pages: new Map(),
    agentRoute: opts.agentRoute,
    refresh: async () => {
      const state = await requireContext().rpc.sharedState.get(SESSIONS_STATE, {initialValue: {sessions: []}})
      const list = await rpcSessionList(opts.chat, false)
      state.mutate(() => ({sessions: list}))
    },
  }
  const definition = defineDevframe({
    id: NAMESPACE,
    name: NAMESPACE,
    version: '0.0.0',
    packageName: '@conciv/core',
    homepage: 'https://conciv.dev',
    description: 'conciv engine',
    importMetaUrl: import.meta.url,
    services: [
      {package: '@devframes/service-open', options: {roots: [opts.cwd]}},
      {package: '@devframes/service-shiki'},
      {package: '@devframes/service-git', options: {cwd: opts.cwd}},
    ],
    setup(ctx) {
      serverFunctionsFor(deps, requireContext).forEach((fn) => ctx.rpc.register(fn))
    },
  })
  const hub = initHub({
    base: '/__conciv/',
    devframes: [
      definition,
      createTerminalsDevframe({
        presets: [{id: 'echo', title: 'Echo', command: '/bin/echo', args: ['hello-from-pty'], mode: 'readonly'}],
      }),
      createMessagesDevframe(),
      createGitDevframe(),
      createA11yDevframe(),
      createInspectDevframe(),
      ...opts.plugins,
    ],
    auth: opts.auth,
    mcp: {allowedOrigins: false, authorization: opts.mcpToken, exposeSharedState: !opts.agentRoute},
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
    async configure(ctx) {
      contextRef.current = ctx
      getInternalContext(ctx).storage.auth.mutate((state) => {
        state.trusted[opts.mcpToken] = {
          authToken: opts.mcpToken,
          ua: 'conciv engine',
          origin: '',
          timestamp: Date.now(),
        }
      })
      ctx.services.provide(CONCIV_HOST_SERVICE, opts.host)
      if (opts.agentRoute) ctx.agent.registerToolProvider(routeTools)
      await deps.refresh()
      ctx.commands.register({
        id: 'conciv:new-session',
        title: 'New conciv session',
        ...(opts.agentRoute ? {} : {agent: {description: 'Start a new conciv chat session.'}}),
        handler: async () => {
          await ctx.messages.add({message: 'conciv session created', level: 'success', notify: true})
          return {sessionId: 'conciv_new'}
        },
      })
      createJsonRenderView(ctx, {
        id: 'conciv:status',
        spec: {
          root: 'root',
          elements: {
            root: {type: 'Card', props: {title: 'conciv status'}, children: ['count']},
            count: {type: 'Text', props: {text: {$state: '/sessions'}}, children: []},
          },
          state: {sessions: 0},
        },
      })
    },
  })
  return {
    hub,
    sessionsChanged: () => {
      if (contextRef.current) void deps.refresh()
    },
  }
}
