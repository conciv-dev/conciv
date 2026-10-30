import {Hono} from 'hono'
import {z} from 'zod'
import type {ModelMessage, ChatMessage, ChatEvent} from '@conciv/ai'
import {
  resumeTurnEvents,
  serveTurnEvents,
  serveTurnSocket,
  type TurnDelivery,
  type TurnRequest,
  type WebSocketLike,
} from '@conciv/ai/server'
import {
  CHAT_SSE_PATH,
  CHAT_WS_PATH,
  ChatContentPartSchema,
  SessionId,
  type ChatContentPart,
} from '@conciv/protocol/chat-types'
import type {SocketSink, UpgradeWebSocket} from './socket-upgrade.js'
import type {ChatDeps} from './runtime.js'
import {makeTurn, type UserContent} from './run.js'

const LIVE_BATCH = 1

const TextPartSchema = z.object({type: z.literal('text'), text: z.string().min(1)})
const RoleSchema = z.object({role: z.string()})
const StringContentSchema = z.object({content: z.string().min(1)})
const PartsSchema = z.object({parts: z.array(z.unknown())})
const ArrayContentSchema = z.object({content: z.array(z.unknown())})

function partsOf(message: ChatMessage | ModelMessage): ChatContentPart[] {
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

function lastUserMessage(messages: Array<ChatMessage | ModelMessage>): ChatMessage | ModelMessage | undefined {
  return messages.findLast((message) => RoleSchema.safeParse(message).data?.role === 'user')
}

export function userContentOf(messages: Array<ChatMessage | ModelMessage>): UserContent {
  const last = lastUserMessage(messages)
  return last ? partsOf(last) : []
}

const IdSchema = z.object({id: z.string().min(1)})

function userMessageIdOf(messages: Array<ChatMessage | ModelMessage>): string | undefined {
  const last = lastUserMessage(messages)
  return last ? IdSchema.safeParse(last).data?.id : undefined
}

function turnStreamOf(deps: ChatDeps, ctx: TurnRequest): AsyncIterable<ChatEvent> {
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

function turnDelivery(deps: ChatDeps): TurnDelivery {
  return {
    onTurn: (ctx) => turnStreamOf(deps, ctx),
    durability: deps.durability,
    durabilityAt: deps.durabilityAt,
    batch: LIVE_BATCH,
  }
}

export function chatDeliveryRoutes(deps: ChatDeps, upgrade: UpgradeWebSocket) {
  const delivery = turnDelivery(deps)
  return new Hono()
    .get(
      CHAT_WS_PATH,
      upgrade((c) => {
        const events: SocketEvents = {message: [], close: [], error: []}
        const held: {sink: SocketSink | null} = {sink: null}
        serveTurnSocket(
          socketAdapter(events, () => held.sink),
          c.req.raw,
          delivery,
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
    .post(CHAT_SSE_PATH, async (c) => serveTurnEvents(await c.req.json(), delivery))
    .get(CHAT_SSE_PATH, (c) => resumeTurnEvents(c.req.raw, delivery) ?? c.json({message: 'no resume offset'}, 400))
}
