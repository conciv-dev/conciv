import type {Page, Request as PageRequest, WebSocket as PageWebSocket} from 'playwright'
import {z} from 'zod'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '@conciv/protocol/chat-types'

const TURN_TIMEOUT_MS = 30_000

export type ChatTransport = 'websocket' | 'fetch'

const WirePartSchema = z.looseObject({type: z.string()})

const WireMessageSchema = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(WirePartSchema)]).optional(),
})

const RunAgentInputSchema = z.looseObject({
  threadId: z.string(),
  runId: z.string(),
  messages: z.array(WireMessageSchema),
})

export type ChatWirePart = z.infer<typeof WirePartSchema>

export type ChatTurnFrame = {
  transport: ChatTransport
  threadId: string
  runId: string
  content: ChatWirePart[] | string
}

export type ChatWireWatch = {
  nextTurn: () => Promise<ChatTurnFrame>
  socketMark: () => number
  socketsOpenedSince: (mark: number) => number
  liveSockets: () => number
}

type Waiter = {from: number; settle: (frame: ChatTurnFrame) => void}

function lastUserContent(input: z.infer<typeof RunAgentInputSchema>): ChatWirePart[] | string {
  return input.messages.findLast((message) => message.role === 'user')?.content ?? []
}

function frameOf(transport: ChatTransport, raw: unknown): ChatTurnFrame | null {
  const parsed = RunAgentInputSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    transport,
    threadId: parsed.data.threadId,
    runId: parsed.data.runId,
    content: lastUserContent(parsed.data),
  }
}

function parsedJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export function watchChatWire(page: Page): ChatWireWatch {
  const turns: ChatTurnFrame[] = []
  const waiters = new Set<Waiter>()
  const sockets = {count: 0, closed: 0}

  const record = (frame: ChatTurnFrame | null): void => {
    if (!frame) return
    const index = turns.push(frame) - 1
    for (const waiter of waiters) {
      if (index < waiter.from) continue
      waiters.delete(waiter)
      waiter.settle(frame)
    }
  }

  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(CHAT_WS_PATH)) return
    sockets.count += 1
    socket.on('close', () => {
      sockets.closed += 1
    })
    socket.on('framesent', (event) => record(frameOf('websocket', parsedJson(String(event.payload)))))
  }

  const onRequest = (request: PageRequest): void => {
    if (request.method() !== 'POST') return
    if (!new URL(request.url()).pathname.endsWith(CHAT_SSE_PATH)) return
    const body = request.postData()
    if (body !== null) record(frameOf('fetch', parsedJson(body)))
  }

  page.on('websocket', onSocket)
  page.on('request', onRequest)

  const nextTurn = (): Promise<ChatTurnFrame> => {
    const from = turns.length
    const buffered = turns[from]
    if (buffered) return Promise.resolve(buffered)
    return new Promise<ChatTurnFrame>((resolve, reject) => {
      const waiter: Waiter = {
        from,
        settle: (frame) => {
          clearTimeout(timer)
          resolve(frame)
        },
      }
      const timer = setTimeout(() => {
        waiters.delete(waiter)
        reject(new Error(`no chat turn reached the wire within ${TURN_TIMEOUT_MS}ms`))
      }, TURN_TIMEOUT_MS)
      waiters.add(waiter)
    })
  }

  return {
    nextTurn,
    socketMark: () => sockets.count,
    socketsOpenedSince: (mark) => sockets.count - mark,
    liveSockets: () => sockets.count - sockets.closed,
  }
}
