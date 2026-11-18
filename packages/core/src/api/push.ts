import {Hono} from 'hono'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH, type PushFrame} from '@conciv/protocol/push-types'
import type {WSContext} from 'hono/ws'
import type {UpgradeWebSocket} from '@conciv/serve/rpc'
import {logError} from '../lib/debug.js'

export type PushDeps = {
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<ChatEvent>
}

const NO_SESSION_CLOSE_CODE = 4400

const STREAM_FAILED_CLOSE_CODE = 1011

async function forward(source: AsyncIterable<ChatEvent>, emit: (chunk: ChatEvent) => void): Promise<void> {
  for await (const chunk of source) emit(chunk)
}

export function pushRoutes(deps: PushDeps, upgrade: UpgradeWebSocket) {
  return new Hono().get(
    PUSH_WS_PATH,
    upgrade((c) => {
      const requested = SessionId.safeParse(new URL(c.req.raw.url).searchParams.get(PUSH_SESSION_PARAM))
      const abort = new AbortController()
      const held: {sink: WSContext | null} = {sink: null}
      const send = (frame: PushFrame): void => held.sink?.send(JSON.stringify(frame))
      return {
        onOpen: (_event, ws) => {
          held.sink = ws
          if (!requested.success) {
            ws.close(NO_SESSION_CLOSE_CODE, 'a push socket needs a session id')
            return
          }
          forward(deps.events(requested.data, abort.signal), (chunk) => send({channel: 'chat', chunk})).catch(
            (error: unknown) => {
              if (abort.signal.aborted) return
              logError(`[core] the session event push stream failed, closing the socket: ${String(error)}`)
              held.sink?.close(STREAM_FAILED_CLOSE_CODE, 'the session event push stream failed')
            },
          )
        },
        onClose: () => abort.abort(),
        onError: () => abort.abort(),
      }
    }),
  )
}
