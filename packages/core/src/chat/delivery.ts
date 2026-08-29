import {Hono} from 'hono'
import type {MiddlewareHandler} from 'hono'
import {z} from 'zod'
import {
  chatParamsFromRequestBody,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  resumeWebSocketStream,
  toServerSentEventsResponse,
  toWebSocketStream,
  type ModelMessage,
  type StreamChunk,
  type UIMessage,
  type WebSocketLike,
} from '@tanstack/ai'
import {SessionId, type ChatContentPart} from '@conciv/protocol/chat-types'
import type {ChatDeps} from './runtime.js'
import {makeTurn, type UserContent} from './run.js'

export const CHAT_WS_PATH = '/chat-ws'
export const CHAT_SSE_PATH = '/chat-sse'

const LIVE_BATCH = 1

const TextPartSchema = z.object({type: z.literal('text'), text: z.string().min(1)})
const ContentTextPartSchema = z.object({type: z.literal('text'), content: z.string().min(1)})
const RoleSchema = z.object({role: z.string()})
const StringContentSchema = z.object({content: z.string().min(1)})
const PartsSchema = z.object({parts: z.array(z.unknown())})
const ArrayContentSchema = z.object({content: z.array(z.unknown())})

function partsOf(message: UIMessage | ModelMessage): ChatContentPart[] {
  const plain = StringContentSchema.safeParse(message)
  if (plain.success) return [{type: 'text', content: plain.data.content}]
  const parts = PartsSchema.safeParse(message)
  const content = ArrayContentSchema.safeParse(message)
  const raw = parts.success ? parts.data.parts : content.success ? content.data.content : []
  return raw.flatMap((part): ChatContentPart[] => {
    const asText = TextPartSchema.safeParse(part)
    if (asText.success) return [{type: 'text', content: asText.data.text}]
    const asContent = ContentTextPartSchema.safeParse(part)
    if (asContent.success) return [{type: 'text', content: asContent.data.content}]
    return []
  })
}

export function userContentOf(messages: Array<UIMessage | ModelMessage>): UserContent {
  const last = messages.findLast((message) => RoleSchema.safeParse(message).data?.role === 'user')
  return last ? partsOf(last) : []
}

function resumeOffsetOf(request: Request): string | null {
  const fromHeader = request.headers.get('last-event-id')
  if (fromHeader !== null && fromHeader.length > 0) return fromHeader
  const fromQuery = new URL(request.url).searchParams.get('offset')
  return fromQuery !== null && fromQuery.length > 0 ? fromQuery : null
}

type TurnContext = {
  threadId: string
  runId: string
  messages: Array<UIMessage | ModelMessage>
  signal: AbortSignal
}

function turnStreamOf(deps: ChatDeps, ctx: TurnContext): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]: async function* () {
      const sessionId = SessionId.parse(ctx.threadId)
      yield* await makeTurn(deps)(sessionId, ctx.runId, userContentOf(ctx.messages), {signal: ctx.signal})
    },
  }
}

type SocketSink = {send: (data: string) => void; close: (code?: number, reason?: string) => void}
type SocketListener = (event: {data: unknown}) => void
type SocketEvents = {message: SocketListener[]; close: SocketListener[]; error: SocketListener[]}

function socketAdapter(events: SocketEvents, sink: () => SocketSink | null): WebSocketLike {
  function addEventListener(type: 'message', handler: (event: {data: unknown}) => void): void
  function addEventListener(type: 'close' | 'error', handler: () => void): void
  function addEventListener(type: 'message' | 'close' | 'error', handler: (event: {data: unknown}) => void): void {
    if (type === 'message') events.message.push(handler)
    if (type === 'close') events.close.push(handler)
    if (type === 'error') events.error.push(handler)
  }
  return {send: (data) => sink()?.send(data), close: (code, reason) => sink()?.close(code, reason), addEventListener}
}

function serveSocket(deps: ChatDeps, socket: WebSocketLike, request: Request): void {
  const offset = resumeOffsetOf(request)
  const runId = resolveResumeRunId(request)
  if (offset !== null && runId !== null) {
    resumeWebSocketStream(socket, {adapter: deps.durabilityAt(runId, offset)})
    return
  }
  toWebSocketStream(socket, request, {
    onRun: (ctx) => turnStreamOf(deps, ctx),
    durability: (ctx) => deps.durability(ctx.runId),
    batch: LIVE_BATCH,
  })
}

type SocketHandlers = {
  onOpen: (event: unknown, ws: SocketSink) => void
  onMessage: (event: {data: unknown}, ws: SocketSink) => void
  onClose: () => void
  onError: () => void
}

type UpgradeWebSocket = (handler: (c: {req: {raw: Request}}) => SocketHandlers) => MiddlewareHandler

export function chatDeliveryRoutes(deps: ChatDeps, upgrade: UpgradeWebSocket) {
  return new Hono()
    .get(
      CHAT_WS_PATH,
      upgrade((c) => {
        const events: SocketEvents = {message: [], close: [], error: []}
        const held: {sink: SocketSink | null} = {sink: null}
        serveSocket(
          deps,
          socketAdapter(events, () => held.sink),
          c.req.raw,
        )
        return {
          onOpen: (_event, ws) => {
            held.sink = ws
          },
          onMessage: (event, ws) => {
            held.sink = ws
            for (const handler of events.message) handler(event)
          },
          onClose: () => {
            for (const handler of events.close) handler({data: null})
          },
          onError: () => {
            for (const handler of events.error) handler({data: null})
          },
        }
      }),
    )
    .post(CHAT_SSE_PATH, async (c) => {
      const params = await chatParamsFromRequestBody(await c.req.json())
      const abortController = new AbortController()
      const stream = turnStreamOf(deps, {...params, signal: abortController.signal})
      return toServerSentEventsResponse(stream, {
        abortController,
        durability: {adapter: deps.durability(params.runId), batch: LIVE_BATCH},
      })
    })
    .get(CHAT_SSE_PATH, (c) => {
      const offset = resumeOffsetOf(c.req.raw)
      const runId = resolveResumeRunId(c.req.raw)
      if (offset === null || runId === null) return c.json({message: 'no resume offset'}, 400)
      return resumeServerSentEventsResponse({adapter: deps.durabilityAt(runId, offset)})
    })
}
