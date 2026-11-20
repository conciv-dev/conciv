import {
  rpcStream,
  StreamReconnectLimitError,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
} from '@conciv/ai/client'
import {ORPCError} from '@orpc/client'
import {type ModelMessage, type ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  type ChatEvent,
  ChatEventType,
  idleFailedEvent,
  runLifecycleEvent,
  sessionRunEvent,
  type RunLifecycle,
  readApprovalAsk,
  readApprovalSettled,
  type ApprovalAsk,
} from '@conciv/protocol/chat-event-types'
import {CHAT_HISTORY_PAGE_SIZE} from '@conciv/protocol/chat-types'
import {
  browserRpcConnection,
  type ChatHistoryWindow,
  type ChatHydration,
  type RpcClient,
  type RpcClientContext,
} from '@conciv/contract'

export async function* readingValues<T>(readable: ReadableStream<T>): AsyncGenerator<T> {
  const reader = readable.getReader()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return
      yield next.value
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

type RelaySink<T> = {emit: (value: T) => void; fail: (error: unknown) => void}

function relayedValues<T>(subscribe: (sink: RelaySink<T>) => () => void, abortSignal?: AbortSignal): AsyncGenerator<T> {
  const held = {stop: () => {}}
  const readable = new ReadableStream<T>({
    start: (controller) => {
      if (abortSignal?.aborted) {
        controller.close()
        return
      }
      const unsubscribe = subscribe({
        emit: (value) => controller.enqueue(value),
        fail: (error) => {
          held.stop()
          controller.error(error)
        },
      })
      const onAbort = () => {
        unsubscribe()
        controller.close()
      }
      held.stop = () => {
        abortSignal?.removeEventListener('abort', onAbort)
        unsubscribe()
      }
      abortSignal?.addEventListener('abort', onAbort, {once: true})
    },
    cancel: () => held.stop(),
  })
  return readingValues(readable)
}

export type ChatConnectionOptions = {
  onLifecycle?: (lifecycle: RunLifecycle) => void
  onHydrated?: (hydration: ChatHydration) => void
  onApprovalAsk?: (ask: ApprovalAsk) => void
  onApprovalSettled?: (approvalId: string) => void
  onRunError?: () => void
  joinsRun?: (runId: string) => Promise<boolean>
  runReconnect?: {attempts?: number; firstDelayMs?: number; maxDelayMs?: number}
}

type RunReconnect = {attempts: number; firstDelayMs: number; maxDelayMs: number}

export type ChatConnection = SubscribeConnectionAdapter & {
  joinRun: (runId: string, abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>
  hydrate: (threadId: string, window?: ChatHistoryWindow) => Promise<ChatHydration>
  refresh: (before?: string) => Promise<ChatHydration>
  close: () => void
}

type SessionEvents = (abortSignal: AbortSignal) => AsyncIterable<ChatEvent>

type JoinRun = (runId: string, abortSignal?: AbortSignal) => AsyncGenerator<ChatEvent>

type Turns = {adapter: SubscribeConnectionAdapter; joinRun: JoinRun; handovers: EventTarget}

function within(lifetime: AbortSignal, abortSignal: AbortSignal | undefined): AbortSignal {
  return abortSignal === undefined ? lifetime : AbortSignal.any([lifetime, abortSignal])
}

async function* streamed(
  opened: (signal: AbortSignal) => Promise<AsyncIterable<ChatEvent>>,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  try {
    yield* await opened(signal)
  } catch (error) {
    if (!signal.aborted) throw error
  }
}

const RUN_RECONNECT_ATTEMPTS = 5
const RUN_RECONNECT_FIRST_DELAY_MS = 250
const RUN_RECONNECT_MAX_DELAY_MS = 5000

function runReconnects(apiBase: string, {attempts, firstDelayMs, maxDelayMs}: RunReconnect): RpcClientContext {
  let progressed: {attemptIndex: number; lastEventId: string | undefined} = {attemptIndex: 0, lastEventId: undefined}
  const attemptsSinceProgress = (attemptIndex: number, lastEventId: string | undefined): number => {
    if (lastEventId !== progressed.lastEventId) progressed = {attemptIndex, lastEventId}
    return attemptIndex - progressed.attemptIndex
  }
  return {
    retry: Number.POSITIVE_INFINITY,
    shouldRetry: async ({attemptIndex, lastEventId, error, signal}) => {
      if (signal === undefined || signal.aborted) return false
      if (refused(error) && (attemptIndex > 0 || lastEventId !== undefined)) {
        await trustedAgain(apiBase, signal)
        return !signal.aborted
      }
      return !(error instanceof ORPCError) && attemptsSinceProgress(attemptIndex, lastEventId) < attempts
    },
    retryDelay: ({attemptIndex, lastEventId}) =>
      Math.min(maxDelayMs, firstDelayMs * 2 ** attemptsSinceProgress(attemptIndex, lastEventId)),
  }
}

async function* boundedRun(
  opened: (signal: AbortSignal) => Promise<AsyncIterable<ChatEvent>>,
  signal: AbortSignal,
  attempts: number,
): AsyncGenerator<ChatEvent> {
  try {
    yield* streamed(opened, signal)
  } catch (error) {
    if (error instanceof ORPCError) throw error
    throw new StreamReconnectLimitError(attempts)
  }
}

function overRpc(
  rpc: RpcClient,
  apiBase: string,
  sessionId: string,
  lifetime: AbortSignal,
  reconnect: RunReconnect,
): Turns {
  const joinRun: JoinRun = (runId, abortSignal) =>
    boundedRun(
      (signal) => rpc.chat.join({runId}, {signal, context: runReconnects(apiBase, reconnect)}),
      within(lifetime, abortSignal),
      reconnect.attempts,
    )
  const turns = rpcStream(
    (_messages, _data, abortSignal, input) =>
      boundedRun(
        (signal) =>
          rpc.chat.send(
            {sessionId, runId: input.runId, messages: input.messages},
            {signal, context: runReconnects(apiBase, reconnect)},
          ),
        within(lifetime, abortSignal),
        reconnect.attempts,
      ),
    {joinRun},
  )
  return {adapter: subscribeOver(turns), joinRun, handovers: new EventTarget()}
}

function subscribeOver(adapter: ConnectConnectionAdapter): SubscribeConnectionAdapter {
  const listeners = new Set<RelaySink<ChatEvent>>()
  return {
    subscribe: (abortSignal) =>
      relayedValues<ChatEvent>((sink) => {
        listeners.add(sink)
        return () => listeners.delete(sink)
      }, abortSignal),
    send: async (messages, data, abortSignal, runContext) => {
      try {
        for await (const chunk of adapter.connect(messages, data, abortSignal, runContext)) {
          for (const sink of listeners) sink.emit(chunk)
        }
      } catch (error) {
        if (error instanceof StreamReconnectLimitError) for (const sink of listeners) sink.fail(error)
        throw error
      }
    },
  }
}

type Source<T> = (abortSignal: AbortSignal) => AsyncIterable<T>

async function pumpInto<T>(
  source: AsyncIterable<T>,
  controller: ReadableStreamDefaultController<T>,
  scope: AbortSignal,
): Promise<void> {
  for await (const value of source) {
    if (scope.aborted) return
    controller.enqueue(value)
  }
}

function merged<T>(sources: readonly Source<T>[], abortSignal: AbortSignal | undefined): AsyncGenerator<T> {
  const scope = new AbortController()
  const lifetime = AbortSignal.any(abortSignal ? [abortSignal, scope.signal] : [scope.signal])
  const readable = new ReadableStream<T>({
    start: async (controller) => {
      try {
        await Promise.all(sources.map((source) => pumpInto(source(lifetime), controller, lifetime)))
      } finally {
        scope.abort()
      }
      controller.close()
    },
    cancel: () => scope.abort(),
  })
  return readingValues(readable)
}

async function* announcedRuns(
  turns: Turns,
  events: SessionEvents,
  options: ChatConnectionOptions,
  scope: AbortSignal,
  threadId: string,
): AsyncGenerator<ChatEvent> {
  for await (const chunk of events(scope)) {
    if (scope.aborted) return
    const announced = sessionRunEvent.parse(chunk)
    if (announced === null || !(await options.joinsRun?.(announced.runId))) continue
    yield* finishedOnItsLifecycle(turns.joinRun(announced.runId, scope), threadId, announced.runId)
  }
}

async function* finishedOnItsLifecycle(
  joined: AsyncIterable<ChatEvent>,
  threadId: string,
  runId: string,
): AsyncGenerator<ChatEvent> {
  for await (const chunk of joined) {
    yield chunk
    const lifecycle = runLifecycleEvent.parse(chunk)
    if (lifecycle?.runId !== runId || lifecycle.phase !== 'aborted') continue
    yield {type: ChatEventType.RUN_FINISHED, threadId, runId, finishReason: 'stop', timestamp: Date.now()}
    return
  }
}

async function* joinedOrHandedOver(
  turns: Turns,
  runId: string,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<ChatEvent> {
  const joined = turns.joinRun(runId, abortSignal)
  const first = await joined.next()
  if (first.done !== true) {
    yield first.value
    yield* joined
    return
  }
  if (abortSignal?.aborted !== true) return
  turns.handovers.dispatchEvent(new CustomEvent(HANDOVER, {detail: runId}))
}

const HANDOVER = 'handover'

function handedOverRunIds(handovers: EventTarget, scope: AbortSignal): AsyncGenerator<string> {
  return relayedValues<string>((sink) => {
    const relay = (event: Event): void => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') sink.emit(event.detail)
    }
    handovers.addEventListener(HANDOVER, relay)
    return () => handovers.removeEventListener(HANDOVER, relay)
  }, scope)
}

async function* handedOverRuns(turns: Turns, scope: AbortSignal, threadId: string): AsyncGenerator<ChatEvent> {
  for await (const runId of handedOverRunIds(turns.handovers, scope)) {
    yield* finishedOnItsLifecycle(turns.joinRun(runId, scope), threadId, runId)
  }
}

function watching(
  turns: Turns,
  events: SessionEvents,
  options: ChatConnectionOptions,
  abortSignal: AbortSignal | undefined,
  threadId: string,
): AsyncGenerator<ChatEvent> {
  const sources: Source<ChatEvent>[] = [
    (scope) => turns.adapter.subscribe(scope),
    events,
    (scope) => announcedRuns(turns, events, options, scope, threadId),
    (scope) => handedOverRuns(turns, scope, threadId),
  ]
  return noticing(merged(sources, abortSignal), options)
}

function trustedAgain(apiBase: string, signal: AbortSignal): Promise<void> {
  const {trust, release} = browserRpcConnection(apiBase)
  if (trust.isTrusted() || signal.aborted) {
    release()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const settle = (): void => {
      stopTrust()
      signal.removeEventListener('abort', settle)
      release()
      resolve()
    }
    const stopTrust = trust.subscribe((status) => {
      if (status === 'trusted') settle()
    })
    signal.addEventListener('abort', settle)
  })
}

function refused(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED'
}

async function* sessionEvents(
  rpc: RpcClient,
  apiBase: string,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  while (!signal.aborted) {
    try {
      yield* await rpc.chat.events({sessionId}, {signal})
      return
    } catch (error) {
      if (signal.aborted) return
      if (!refused(error)) throw error
    }
    await trustedAgain(apiBase, signal)
  }
}

function notice(chunk: ChatEvent, options: ChatConnectionOptions): void {
  const lifecycle = runLifecycleEvent.parse(chunk)
  if (lifecycle) options.onLifecycle?.(lifecycle)
  const ask = readApprovalAsk(chunk)
  if (ask) options.onApprovalAsk?.(ask)
  const settled = readApprovalSettled(chunk)
  if (settled) options.onApprovalSettled?.(settled)
  if (chunk.type === ChatEventType.RUN_ERROR || idleFailedEvent.parse(chunk) !== null) options.onRunError?.()
}

async function* noticing(source: AsyncIterable<ChatEvent>, options: ChatConnectionOptions): AsyncGenerator<ChatEvent> {
  for await (const chunk of source) {
    notice(chunk, options)
    yield chunk
  }
}

function lastTurn<Message extends {role: string}>(messages: Message[]): Message[] {
  return messages.slice(
    Math.max(
      messages.findLastIndex((message) => message.role === 'user'),
      0,
    ),
  )
}

export function chatConnection(
  rpc: RpcClient,
  apiBase: string,
  sessionId: string,
  options: ChatConnectionOptions = {},
): ChatConnection {
  const lifetime = new AbortController()
  const turns = overRpc(rpc, apiBase, sessionId, lifetime.signal, {
    attempts: options.runReconnect?.attempts ?? RUN_RECONNECT_ATTEMPTS,
    firstDelayMs: options.runReconnect?.firstDelayMs ?? RUN_RECONNECT_FIRST_DELAY_MS,
    maxDelayMs: options.runReconnect?.maxDelayMs ?? RUN_RECONNECT_MAX_DELAY_MS,
  })
  const events: SessionEvents = (abortSignal) =>
    sessionEvents(rpc, apiBase, sessionId, within(lifetime.signal, abortSignal))
  const hydrate = async (threadId: string, window: ChatHistoryWindow = {}): Promise<ChatHydration> => {
    const hydration = await rpc.chat.hydrate({...window, sessionId: threadId})
    options.onHydrated?.(hydration)
    return hydration
  }
  return {
    subscribe: (abortSignal) => watching(turns, events, options, within(lifetime.signal, abortSignal), sessionId),
    send: async (messages: Array<ChatMessage> | Array<ModelMessage>, data, abortSignal, runContext) => {
      const {adapter} = turns
      if (messages.every((message) => 'parts' in message)) {
        await adapter.send(lastTurn(messages), data, abortSignal, runContext)
        return
      }
      await adapter.send(messages, data, abortSignal, runContext)
    },
    joinRun: (runId, abortSignal) =>
      noticing(finishedOnItsLifecycle(joinedOrHandedOver(turns, runId, abortSignal), sessionId, runId), options),
    hydrate,
    refresh: (before) =>
      hydrate(
        sessionId,
        before === undefined ? {limit: CHAT_HISTORY_PAGE_SIZE} : {limit: CHAT_HISTORY_PAGE_SIZE, before},
      ),
    close: () => lifetime.abort(),
  }
}
