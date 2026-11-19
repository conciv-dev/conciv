import type {Page} from 'playwright'
import {z} from 'zod'
import {samePath} from './rpc-payload.js'
import {rpcSocketFor, type RpcSocketEvent} from './rpc-socket.js'

const TURN_TIMEOUT_MS = 30_000

const SEND_PATH = ['chat', 'send']

const WirePartSchema = z.looseObject({type: z.string()})

const WireMessageSchema = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(WirePartSchema)]).optional(),
})

const ChatSendInputSchema = z.looseObject({
  sessionId: z.string(),
  runId: z.string(),
  messages: z.array(WireMessageSchema),
})

export type ChatWirePart = z.infer<typeof WirePartSchema>

export type ChatTurnFrame = {
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

function lastUserContent(input: z.infer<typeof ChatSendInputSchema>): ChatWirePart[] | string {
  return input.messages.findLast((message) => message.role === 'user')?.content ?? []
}

function parseTurn(event: RpcSocketEvent): ChatTurnFrame | null {
  if (event.kind !== 'request' || !samePath(event.path, SEND_PATH)) return null
  const parsed = ChatSendInputSchema.safeParse(event.input)
  if (!parsed.success) return null
  return {threadId: parsed.data.sessionId, runId: parsed.data.runId, content: lastUserContent(parsed.data)}
}

export function watchChatWire(page: Page): ChatWireWatch {
  const socket = rpcSocketFor(page)
  const turns: ChatTurnFrame[] = []
  const waiters = new Set<Waiter>()

  socket.listen((event) => {
    const frame = parseTurn(event)
    if (!frame) return
    const index = turns.push(frame) - 1
    for (const waiter of waiters) {
      if (index < waiter.from) continue
      waiters.delete(waiter)
      waiter.settle(frame)
    }
  })

  const nextTurn = (): Promise<ChatTurnFrame> => {
    const from = turns.length
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
    socketMark: () => socket.opened(),
    socketsOpenedSince: (mark) => socket.opened() - mark,
    liveSockets: () => socket.liveSockets(),
  }
}
