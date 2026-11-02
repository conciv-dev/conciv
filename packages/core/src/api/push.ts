import {Hono} from 'hono'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH, type PushFrame} from '@conciv/protocol/push-types'
import type {UpgradeWebSocket, WSContext} from 'hono/ws'
import {logError} from '../lib/debug.js'

export type PushDeps = {
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<ChatEvent>
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
      const held: {sink: WSContext | null} = {sink: null}
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
