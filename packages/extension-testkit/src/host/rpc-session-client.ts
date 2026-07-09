import {createSignal} from 'solid-js'
import {
  CONCIV_SESSION_HEADER,
  ResolveResponseSchema,
  type SessionClient,
  type SessionId,
} from '@conciv/protocol/chat-types'
import {makeRpcClient} from '@conciv/harness-testkit'

export function makeRpcSessionClient(opts: {apiBase: string}): SessionClient {
  const rpc = makeRpcClient(opts.apiBase)
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)
  const requireSession = (): string => {
    const id = sessionId()
    if (!id) throw new Error('no active session')
    return id
  }
  return {
    sessionId,
    setSessionId,
    chatStreamUrl: () => `${opts.apiBase}/rpc/chat/send`,
    attachUrl: () => `${opts.apiBase}/rpc/chat/attach`,
    chatHeaders: () => {
      const id = sessionId()
      const headers: Record<string, string> = {}
      if (id) headers[CONCIV_SESSION_HEADER] = id
      return headers
    },
    resolve: async (body) => {
      const resolved = await rpc.sessions.resolve(body?.id === undefined ? {} : {id: body.id})
      return ResolveResponseSchema.parse(resolved)
    },
    session: () => Promise.reject(new Error('session() was removed with the REST surface; use sessions()')),
    sessions: async () => ({sessions: await rpc.sessions.list(undefined)}),
    history: async () => [],
    models: () => rpc.meta.models(undefined),
    commands: () => rpc.meta.commands({sessionId: sessionId() ?? undefined}),
    tools: () => rpc.meta.tools(undefined),
    rename: async (body) => {
      const renamed = await rpc.sessions.rename({sessionId: body.sessionId, title: body.title})
      return {ok: true, title: renamed.title}
    },
    launch: (body) => rpc.sessions.launch({sessionId: requireSession(), model: body?.model}),
    remove: () => rpc.sessions.remove({sessionId: requireSession()}),
    stop: () => rpc.sessions.stop({sessionId: requireSession()}),
    permissionDecision: (body) => rpc.chat.permissionDecision({approvalId: body.approvalId, approved: body.approved}),
  }
}
