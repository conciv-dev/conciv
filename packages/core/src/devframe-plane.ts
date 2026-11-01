import {join} from 'node:path'
import {defineDevframe, defineRpcFunction, type DevframeDefinition} from 'devframe'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import type {DevframeNodeRpcSession} from 'devframe/types'
import type {RpcDefinitionsToFunctions} from 'devframe/rpc'
import {defineDiagnostics} from 'devframe/utils/nostics'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import type {DevframeHubContext} from '@devframes/hub/types'
import {createTerminalsDevframe} from '@devframes/plugin-terminals'
import {createMessagesDevframe} from '@devframes/plugin-messages'
import {createJsonRenderView} from '@devframes/json-render/node'
import {z} from 'zod'
import {eq} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import {sessions} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import type {ChatContext} from './api/rpc/mount.js'
import {rpcSessionList} from './api/rpc/sessions.js'
import {rowById} from './sessions/session-rows.js'

const NAMESPACE = 'conciv'
const SESSIONS_STATE = 'conciv:sessions'
const TICKS_CHANNEL = 'conciv:ticks'

export const concivDiagnostics = defineDiagnostics({
  codes: {
    CONCIV_NOT_FOUND: {why: (params: {sessionId: string}) => `session ${params.sessionId} not found`},
    CONCIV_NO_PAGE: {why: (params: {sessionId: string}) => `no page registered for session ${params.sessionId}`},
  },
})

function coded(diagnostic: {code: string; message: string}): Error {
  return new Error(`${diagnostic.code}: ${diagnostic.message}`)
}

const RenameInput = z.object({sessionId: SessionId, title: z.string().min(1).max(200)})

export type PlaneDeps = {chat: ChatContext; pages: Map<string, DevframeNodeRpcSession>; refresh: () => Promise<void>}

function serverFunctionsFor(deps: PlaneDeps, ctx: () => DevframeHubContext) {
  const sessionsList = defineRpcFunction({
    name: 'conciv:sessions:list',
    type: 'query',
    jsonSerializable: true,
    agent: {description: 'List the chat sessions of this project.', safety: 'read'},
    handler: () => rpcSessionList(deps.chat, false),
  })

  const sessionsRename = defineRpcFunction({
    name: 'conciv:sessions:rename',
    type: 'action',
    args: [RenameInput],
    returns: z.object({title: z.string()}),
    handler: async (raw) => {
      const input = RenameInput.parse(raw)
      if (!(await rowById(deps.chat.db, input.sessionId)))
        throw coded(concivDiagnostics.CONCIV_NOT_FOUND({sessionId: input.sessionId}))
      await deps.chat.db
        .update(sessions)
        .set({title: input.title, updatedAt: Date.now()})
        .where(eq(sessions.id, input.sessionId))
      await deps.refresh()
      return {title: input.title}
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

  const pageAsk = defineRpcFunction({
    name: 'conciv:page:ask',
    type: 'query',
    jsonSerializable: true,
    args: [z.object({sessionId: SessionId, question: z.string()})],
    returns: z.string(),
    handler: async (input) => {
      const page = deps.pages.get(input.sessionId)
      if (!page) throw coded(concivDiagnostics.CONCIV_NO_PAGE({sessionId: input.sessionId}))
      return page.rpc.$call('conciv:page:query', input.question)
    },
  })

  const ticksStart = defineRpcFunction({
    name: 'conciv:ticks:start',
    type: 'action',
    jsonSerializable: true,
    args: [z.object({count: z.number().int().min(1).max(100)})],
    returns: z.object({streamId: z.string()}),
    handler: (input) => {
      const stream = ctx().rpc.streaming.create<number>(TICKS_CHANNEL, {replayWindow: 256}).start()
      Array.from({length: input.count}, (_, index) => index + 1).forEach((tick) => stream.write(tick))
      stream.close()
      return {streamId: stream.id}
    },
  })

  return [sessionsList, sessionsRename, pageRegister, pageAsk, ticksStart] as const
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
      ...opts.plugins,
    ],
    auth: opts.auth,
    mcp: {allowedOrigins: false, authorization: opts.mcpToken},
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
    async configure(ctx) {
      contextRef.current = ctx
      ctx.services.provide(CONCIV_HOST_SERVICE, opts.host)
      await deps.refresh()
      ctx.commands.register({
        id: 'conciv:new-session',
        title: 'New conciv session',
        agent: {description: 'Start a new conciv chat session.'},
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
