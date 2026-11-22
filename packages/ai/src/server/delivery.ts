import {
  chatParamsFromRequestBody,
  EventType,
  memoryStream,
  toServerSentEventsResponse,
  type DebugConfig,
} from '@tanstack/ai'
import {InMemoryLockStore} from '@tanstack/ai/locks'
import {withEventMeta} from '@orpc/server'
import {isRunPhaseTerminal, runLifecycleEvent, type ChatEvent, type RunPhase} from '@conciv/protocol/chat-event-types'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'
import {z} from 'zod'

export type Turn =
  | {threadId: string; runId: string; kind: 'chat' | 'compact'}
  | {threadId: string; runId: string; kind: 'page-queue'; input: string}

export type ChatJoin = {runId: string; lastEventId?: string}

export type ChatSend = ChatJoin & {threadId: string; messages: readonly unknown[]}

export type ChatDelivery = {
  send: (request: ChatSend, signal?: AbortSignal) => AsyncGenerator<ChatEvent>
  join: (request: ChatJoin, signal?: AbortSignal) => AsyncGenerator<ChatEvent>
  drive: (turn: Turn, messages: Array<ChatMessage | ModelMessage>) => Promise<void>
}

type DeliveryDeps = {
  run: (
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    controller: AbortController,
  ) => AsyncIterable<ChatEvent>
  seenRun: (runId: string) => Promise<boolean>
  debug: DebugConfig
  log: (message: string) => void
}

const LIVE_BATCH = 1

const FROM_START = '-1'

const IdentifiedMessagesSchema = z.array(z.looseObject({id: z.string().min(1)}))

export function readTerminalPhase(chunk: ChatEvent): RunPhase | null {
  if (chunk.type === EventType.RUN_ERROR) return 'failed'
  if (chunk.type !== EventType.RUN_FINISHED) return null
  const finishReason = chunk.finishReason ?? chunk.metadata?.tanstack?.finishReason
  return finishReason === 'tool_calls' ? null : 'completed'
}

export function endsTheRun(chunk: ChatEvent): boolean {
  if (readTerminalPhase(chunk) !== null) return true
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
    IdentifiedMessagesSchema.parse(messages)
    const durability = memoryStream({runId: turn.runId})
    const stream = run(turn, messages, new AbortController())
    const response = toServerSentEventsResponse(finishLast(stream), {
      durability: {adapter: durability, batch: LIVE_BATCH},
      debug,
    })
    await response.text()
  }

  const starts = new InMemoryLockStore()

  async function* join({runId, lastEventId}: ChatJoin, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    for await (const {offset, chunk} of memoryStream({runId}).read(lastEventId ?? FROM_START, signal)) {
      yield withEventMeta(chunk, {id: offset})
    }
  }

  async function* send(request: ChatSend, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const params = await chatParamsFromRequestBody({
      threadId: request.threadId,
      runId: request.runId,
      messages: request.messages,
      tools: [],
      context: [],
    })
    await starts.withLock(params.runId, async () => {
      if (await seenRun(params.runId)) return
      IdentifiedMessagesSchema.parse(params.messages)
      drive({threadId: params.threadId, runId: params.runId, kind: 'chat'}, params.messages).catch((error: unknown) =>
        log(`[ai] run ${params.runId} failed outside its stream: ${String(error)}`),
      )
    })
    yield* join(request, signal)
  }

  return {send, join, drive}
}
