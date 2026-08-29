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
import {
  CHAT_SSE_PATH,
  CHAT_WS_PATH,
  ChatContentPartSchema,
  SessionId,
  type ChatContentPart,
} from '@conciv/protocol/chat-types'
import type {ChatDeps} from './runtime.js'
import {makeTurn, type UserContent} from './run.js'

const LIVE_BATCH = 1

const TextPartSchema = z.object({type: z.literal('text'), text: z.string().min(1)})
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
    const known = ChatContentPartSchema.safeParse(part)
    if (known.success) return [known.data]
    const asText = TextPartSchema.safeParse(part)
    return asText.success ? [{type: 'text', content: asText.data.text}] : []
  })
}

function lastUserMessage(messages: Array<UIMessage | ModelMessage>): UIMessage | ModelMessage | undefined {
  return messages.findLast((message) => RoleSchema.safeParse(message).data?.role === 'user')
}

export function userContentOf(messages: Array<UIMessage | ModelMessage>): UserContent {
  const last = lastUserMessage(messages)
  return last ? partsOf(last) : []
}

const IdSchema = z.object({id: z.string().min(1)})

function userMessageIdOf(messages: Array<UIMessage | ModelMessage>): string | undefined {
  const last = lastUserMessage(messages)
  return last ? IdSchema.safeParse(last).data?.id : undefined
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
      const messageId = userMessageIdOf(ctx.messages)
      const content = userContentOf(ctx.messages)
      if (content.length === 0) throw new Error('a turn needs a non-empty message')
      const unwatch = deps.stream.watch(sessionId)
      try {
        yield* await makeTurn(deps)(sessionId, ctx.runId, content, {
          signal: ctx.signal,
          ...(messageId === undefined ? {} : {messageId}),
        })
      } finally {
        unwatch()
      }
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
