import {Hono} from 'hono'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {
  PageServingFrameSchema,
  PUSH_SESSION_PARAM,
  PUSH_WS_PATH,
  type PushFrame,
  type WidgetHost,
} from '@conciv/protocol/push-types'
import type {WSContext} from 'hono/ws'
import type {UpgradeWebSocket} from '@conciv/extension/rpc-mount'
import {logError} from '../lib/debug.js'

export type PageQuery = {requestId: string; query: unknown}

export type PushDeps = {
  queries: (sessionId: SessionId, host: WidgetHost, signal: AbortSignal) => AsyncIterable<PageQuery>
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncIterable<ChatEvent>
}

const NO_SESSION_CLOSE_CODE = 4400

async function forward<T>(source: AsyncIterable<T>, emit: (item: T) => void): Promise<void> {
  for await (const item of source) emit(item)
}

function pump<T>(source: AsyncIterable<T>, emit: (item: T) => void, label: string): void {
  void forward(source, emit).catch((error: unknown) => {
    logError(`[core] the ${label} push stream ended: ${String(error)}`)
  })
}

function parsedJson(payload: unknown): unknown {
  if (typeof payload !== 'string') return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export function pushRoutes(deps: PushDeps, upgrade: UpgradeWebSocket) {
  return new Hono().get(
    PUSH_WS_PATH,
    upgrade((c) => {
      const requested = SessionId.safeParse(new URL(c.req.raw.url).searchParams.get(PUSH_SESSION_PARAM))
      const abort = new AbortController()
      const held: {sink: WSContext | null; page: {host: WidgetHost; stop: AbortController} | null} = {
        sink: null,
        page: null,
      }
      const send = (frame: PushFrame): void => held.sink?.send(JSON.stringify(frame))
      const servePage = (sessionId: SessionId, host: WidgetHost | null): void => {
        if (host === (held.page?.host ?? null)) return
        held.page?.stop.abort()
        held.page = null
        if (host === null) return
        const stop = new AbortController()
        held.page = {host, stop}
        pump(
          deps.queries(sessionId, host, AbortSignal.any([abort.signal, stop.signal])),
          ({requestId, query}) => send({channel: 'page', requestId, query}),
          'page query',
        )
        send({channel: 'ready'})
      }
      return {
        onOpen: (_event, ws) => {
          held.sink = ws
          if (!requested.success) {
            ws.close(NO_SESSION_CLOSE_CODE, 'a push socket needs a session id')
            return
          }
          pump(deps.events(requested.data, abort.signal), (chunk) => send({channel: 'chat', chunk}), 'session event')
        },
        onMessage: (event, ws) => {
          held.sink = ws
          const frame = PageServingFrameSchema.safeParse(parsedJson(event.data))
          if (!requested.success || !frame.success) return
          servePage(requested.data, frame.data.host)
        },
        onClose: () => abort.abort(),
        onError: () => abort.abort(),
      }
    }),
  )
}
