import {Hono} from 'hono'
import type {StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH, type PushFrame} from '@conciv/protocol/push-types'
import type {PendingApproval} from '../chat/ask.js'
import {approvalRequestedChunk} from '../chat/gate.js'
import type {SocketSink, UpgradeWebSocket} from '../lib/socket-upgrade.js'
import {logError} from '../lib/debug.js'

export type PageQuery = {requestId: string; query: unknown}

export type PushDeps = {
  queries: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<PageQuery>
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<StreamChunk>
  pendingApprovals: (sessionId: SessionId) => PendingApproval[]
}

function replayedApproval(sessionId: SessionId, approval: PendingApproval): StreamChunk {
  return approvalRequestedChunk({
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    input: approval.input,
    approvalId: approval.approvalId,
    threadId: sessionId,
    ...(approval.runId === null ? {} : {runId: approval.runId}),
  })
}

const NO_SESSION_CLOSE_CODE = 1008

async function forward<T>(source: AsyncIterable<T>, emit: (item: T) => void): Promise<void> {
  for await (const item of source) emit(item)
}

function pump<T>(source: AsyncIterable<T>, emit: (item: T) => void, label: string): void {
  void forward(source, emit).catch((error: unknown) => {
    logError(`[core] the ${label} push stream ended: ${String(error)}`)
  })
}

export function pushRoutes(deps: PushDeps, upgrade: UpgradeWebSocket) {
  return new Hono().get(
    PUSH_WS_PATH,
    upgrade((c) => {
      const requested = SessionId.safeParse(new URL(c.req.raw.url).searchParams.get(PUSH_SESSION_PARAM))
      const abort = new AbortController()
      const held: {sink: SocketSink | null} = {sink: null}
      const send = (frame: PushFrame): void => held.sink?.send(JSON.stringify(frame))
      return {
        onOpen: (_event, ws) => {
          held.sink = ws
          if (!requested.success) {
            ws.close(NO_SESSION_CLOSE_CODE, 'a push socket needs a session id')
            return
          }
          const sessionId = requested.data
          send({channel: 'ready'})
          for (const approval of deps.pendingApprovals(sessionId)) {
            send({channel: 'chat', chunk: replayedApproval(sessionId, approval)})
          }
          pump(
            deps.queries(sessionId, abort.signal),
            ({requestId, query}) => send({channel: 'page', requestId, query}),
            'page query',
          )
          pump(deps.events(sessionId, abort.signal), (chunk) => send({channel: 'chat', chunk}), 'session event')
        },
        onMessage: (_event, ws) => {
          held.sink = ws
        },
        onClose: () => abort.abort(),
        onError: () => abort.abort(),
      }
    }),
  )
}
