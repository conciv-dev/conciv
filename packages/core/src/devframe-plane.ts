import {join} from 'node:path'
import {defineDevframe, defineRpcFunction} from 'devframe'
import {initDevframe, type DevframeInstance} from 'devframe/initiate'
import type {DevframeNodeRpcSession} from 'devframe/types'
import type {RpcDefinitionsToFunctions} from 'devframe/rpc'
import {defineDiagnostics} from 'devframe/utils/nostics'
import {z} from 'zod'
import {eq} from 'drizzle-orm'
import {sessions} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import type {ChatContext} from './api/rpc/mount.js'
import {rpcSessionList} from './api/rpc/sessions.js'
import {rowById} from './sessions/session-rows.js'

const NAMESPACE = 'conciv'

export const concivDiagnostics = defineDiagnostics({
  codes: {
    CONCIV_NOT_FOUND: {why: (params: {sessionId: string}) => `session ${params.sessionId} not found`},
    CONCIV_NO_PAGE: {why: (params: {sessionId: string}) => `no page registered for session ${params.sessionId}`},
  },
})

const RenameInput = z.object({sessionId: SessionId, title: z.string().min(1).max(200)})

function coded(diagnostic: {code: string; message: string}): Error {
  return new Error(`${diagnostic.code}: ${diagnostic.message}`)
}

export type PlaneDeps = {chat: ChatContext; pages: Map<string, DevframeNodeRpcSession>}

function serverFunctionsFor(deps: PlaneDeps) {
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
      return {title: input.title}
    },
  })

  const pageRegister = defineRpcFunction({
    name: 'conciv:page:register',
    type: 'action',
    jsonSerializable: true,
    args: [z.object({sessionId: SessionId})],
    returns: z.object({registered: z.boolean()}),
    setup: (ctx) => ({
      handler: (input) => {
        const session = ctx.rpc.getCurrentRpcSession()
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
      if (!page) throw concivDiagnostics.CONCIV_NO_PAGE({sessionId: input.sessionId})
      return page.rpc.$call('conciv:page:query', input.question)
    },
  })

  return [sessionsList, sessionsRename, pageRegister, pageAsk] as const
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<ReturnType<typeof serverFunctionsFor>> {}
  interface DevframeRpcClientFunctions {
    'conciv:page:query': (question: string) => Promise<string>
  }
}

export type DevframePlaneOpts = {chat: ChatContext; stateDir: string; auth: boolean; mcpToken: string}

export function makeDevframePlane(opts: DevframePlaneOpts): DevframeInstance {
  const deps: PlaneDeps = {chat: opts.chat, pages: new Map()}
  const definition = defineDevframe({
    id: NAMESPACE,
    name: NAMESPACE,
    version: '0.0.0',
    packageName: '@conciv/core',
    homepage: 'https://conciv.dev',
    description: 'conciv engine',
    basePath: '/__conciv/',
    setup(ctx) {
      serverFunctionsFor(deps).forEach((fn) => ctx.rpc.register(fn))
    },
  })
  return initDevframe(definition, {
    base: '/__conciv/',
    auth: opts.auth,
    mcp: {allowedOrigins: false, authorization: opts.mcpToken},
    getStorageDir: (scope) => join(opts.stateDir, 'devframe', scope),
  })
}
