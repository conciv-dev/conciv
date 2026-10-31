import {
  chatParamsFromRequestBody,
  EventType,
  memoryStream,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  resumeWebSocketStream,
  toServerSentEventsResponse,
  toWebSocketStream,
  type DebugConfig,
  type StreamDurability,
  type WebSocketLike,
} from '@tanstack/ai'
import {isRunPhaseTerminal, runLifecycleEvent, type ChatEvent, type RunPhase} from '@conciv/protocol/chat-event-types'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'

export type Turn = {threadId: string; runId: string; kind: 'chat' | 'compact'}

export type SocketSink = {send: (data: string) => void; close: (code?: number, reason?: string) => void}

export type ChatSocket = {open: (sink: SocketSink) => void; message: (data: unknown) => void; close: () => void}

export type ChatDelivery = {
  socket: (request: Request) => ChatSocket
  events: (request: Request) => Promise<Response>
  resume: (request: Request) => Response | null
  drive: (turn: Turn, messages: ModelMessage[]) => Promise<void>
}

type DeliveryDeps = {
  run: (
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    durability: StreamDurability,
    controller: AbortController,
  ) => AsyncIterable<ChatEvent>
  seenRun: (runId: string) => boolean
  debug: DebugConfig
  log: (message: string) => void
}

const LIVE_BATCH = 1

const FROM_START = '-1'

type SocketHandler = (event: {data: unknown}) => void

function socketLike(sink: SocketSink, handlers: {message: SocketHandler[]; close: (() => void)[]}): WebSocketLike {
  function addEventListener(type: 'message', handler: (event: {data: unknown}) => void): void
  function addEventListener(type: 'close' | 'error', handler: () => void): void
  function addEventListener(type: 'message' | 'close' | 'error', handler: (event: {data: unknown}) => void): void {
    if (type === 'message') handlers.message.push(handler)
    if (type === 'close') handlers.close.push(() => handler({data: null}))
  }
  return {send: (data) => sink.send(data), close: (code, reason) => sink.close(code, reason), addEventListener}
}

async function* noStream(): AsyncGenerator<ChatEvent> {}

export function terminalPhaseOf(chunk: ChatEvent): RunPhase | null {
  if (chunk.type === EventType.RUN_ERROR) return 'failed'
  if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') return 'completed'
  return null
}

function endsTheRun(chunk: ChatEvent): boolean {
  if (terminalPhaseOf(chunk) !== null) return true
  const lifecycle = runLifecycleEvent.parse(chunk)
  return lifecycle !== null && isRunPhaseTerminal(lifecycle.phase)
}

async function* finishLast(stream: AsyncIterable<ChatEvent>): AsyncGenerator<ChatEvent> {
  const held: ChatEvent[] = []
  try {
    for await (const chunk of stream) {
      if (endsTheRun(chunk)) held.push(chunk)
      else yield chunk
    }
  } finally {
    yield* held
  }
}

export function createDelivery({run, seenRun, debug, log}: DeliveryDeps): ChatDelivery {
  const drive = async (turn: Turn, messages: Array<ChatMessage | ModelMessage>): Promise<void> => {
    const durability = memoryStream({runId: turn.runId})
    const stream = run(turn, messages, durability, new AbortController())
    const response = toServerSentEventsResponse(finishLast(stream), {
      durability: {adapter: durability, batch: LIVE_BATCH},
      debug,
    })
    await response.text()
  }

  const serveSocket = (socket: WebSocketLike, request: Request): void => {
    const resumed = memoryStream(request)
    if (resolveResumeRunId(request) !== null && resumed.resumeFrom() !== null) {
      resumeWebSocketStream(socket, {adapter: resumed, debug})
      return
    }
    toWebSocketStream(socket, request, {
      debug,
      durability: (ctx) => memoryStream({runId: ctx.runId, offset: FROM_START}),
      onRun: (ctx) => {
        if (seenRun(ctx.runId)) return noStream()
        drive({threadId: ctx.threadId, runId: ctx.runId, kind: 'chat'}, ctx.messages).catch((error: unknown) =>
          log(`[ai] run ${ctx.runId} failed outside its stream: ${String(error)}`),
        )
        return noStream()
      },
    })
  }

  const parsedParams = async (request: Request) => {
    try {
      return await chatParamsFromRequestBody(await request.json())
    } catch (error) {
      log(`[ai] refused a chat request: ${String(error)}`)
      return null
    }
  }

  return {
    socket: (request) => {
      const handlers: {message: SocketHandler[]; close: (() => void)[]} = {message: [], close: []}
      return {
        open: (sink) => serveSocket(socketLike(sink, handlers), request),
        message: (data) => {
          for (const handler of handlers.message) handler({data})
        },
        close: () => {
          for (const handler of handlers.close) handler()
        },
      }
    },
    events: async (request) => {
      const params = await parsedParams(request)
      if (params === null) return Response.json({message: 'the request is not a valid chat run'}, {status: 400})
      if (seenRun(params.runId)) {
        return resumeServerSentEventsResponse({adapter: memoryStream({runId: params.runId, offset: FROM_START})})
      }
      const durability = memoryStream({runId: params.runId})
      const controller = new AbortController()
      const stream = run(
        {threadId: params.threadId, runId: params.runId, kind: 'chat'},
        params.messages,
        durability,
        controller,
      )
      return toServerSentEventsResponse(stream, {
        abortController: controller,
        durability: {adapter: durability, batch: LIVE_BATCH},
        debug,
      })
    },
    resume: (request) => {
      if (resolveResumeRunId(request) === null) return null
      const durability = memoryStream(request)
      if (durability.resumeFrom() === null) return null
      return resumeServerSentEventsResponse({adapter: durability})
    },
    drive,
  }
}
