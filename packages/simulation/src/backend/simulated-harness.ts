import {randomUUID} from 'node:crypto'
import {Effect, Stream} from 'effect'
import {z} from 'zod'
import {makeTextAdapter} from '@conciv/harness/adapters'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import type {HarnessChatDeps} from '@conciv/types/harness-types'
import {failureText} from '@conciv/protocol'
import {simulationErrors, type FinishReason, type Item, type ModelRequest} from '@conciv/protocol/simulation'
import type * as SimulatedProvider from './simulated-provider.js'

type StreamOptions = Parameters<Parameters<typeof makeTextAdapter>[1]>[0]

type ProviderEvent = Stream.Success<ReturnType<SimulatedProvider.Interface['stream']>>

type OpenCall = {readonly id: string; args: string}

type Encoding = {
  readonly runId: string
  readonly threadId: string
  segment: number
  text: string | undefined
  reasoning: string | undefined
  readonly calls: Map<number, OpenCall>
}

const InputSchemaSchema = z.record(z.string(), z.unknown())

const ErrorMessageSchema = z.object({message: z.string()})

const ToolInputSchema = z.record(z.string(), z.unknown())

const RawEventSchema = z.custom<ChatEvent>(
  (value) => z.object({type: z.enum(ChatEventType)}).safeParse(value).success,
  'a raw simulation chunk must be a chat event',
)

const FINISH_REASON: Record<FinishReason, 'stop' | 'tool_calls' | 'length' | 'content_filter'> = {
  stop: 'stop',
  'tool-calls': 'tool_calls',
  length: 'length',
  'content-filter': 'content_filter',
}

export function recordedRequest(request: StreamOptions, deps: HarnessChatDeps): ModelRequest {
  return {
    system: (request.systemPrompts ?? []).map((prompt) => (typeof prompt === 'string' ? prompt : prompt.content)),
    messages: [...request.messages],
    tools: (request.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: InputSchemaSchema.parse(tool.inputSchema ?? {}),
    })),
    model: deps.model ?? null,
    effort: deps.effort ?? null,
    options: {...request.modelOptions},
  }
}

function closeText(encoding: Encoding): ChatEvent[] {
  const messageId = encoding.text
  if (messageId === undefined) return []
  encoding.text = undefined
  return [{type: ChatEventType.TEXT_MESSAGE_END, messageId}]
}

function closeReasoning(encoding: Encoding): ChatEvent[] {
  const messageId = encoding.reasoning
  if (messageId === undefined) return []
  encoding.reasoning = undefined
  return [
    {type: ChatEventType.REASONING_MESSAGE_END, messageId},
    {type: ChatEventType.REASONING_END, messageId},
  ]
}

function parsedInput(call: OpenCall): Record<string, unknown> {
  const input = ToolInputSchema.safeParse(call.args === '' ? {} : JSON.parse(call.args))
  if (!input.success) throw simulationErrors.TOOL_CALL_INPUT({id: call.id})
  return input.data
}

function closeCall(encoding: Encoding, index: number): ChatEvent[] {
  const call = encoding.calls.get(index)
  if (call === undefined) return []
  encoding.calls.delete(index)
  return [{type: ChatEventType.TOOL_CALL_END, toolCallId: call.id, input: parsedInput(call)}]
}

function closeCalls(encoding: Encoding): ChatEvent[] {
  return [...encoding.calls.keys()].flatMap((index) => closeCall(encoding, index))
}

function nextMessageId(encoding: Encoding, kind: string): string {
  encoding.segment += 1
  return `${encoding.runId}-${kind}-${encoding.segment}`
}

function textDelta(encoding: Encoding, delta: string): ChatEvent[] {
  const opened: ChatEvent[] = [...closeReasoning(encoding), ...closeCalls(encoding)]
  if (encoding.text === undefined) {
    encoding.text = nextMessageId(encoding, 'text')
    opened.push({type: ChatEventType.TEXT_MESSAGE_START, messageId: encoding.text, role: 'assistant'})
  }
  return [...opened, {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: encoding.text, delta}]
}

function reasoningDelta(encoding: Encoding, delta: string): ChatEvent[] {
  const opened: ChatEvent[] = [...closeText(encoding), ...closeCalls(encoding)]
  if (encoding.reasoning === undefined) {
    const messageId = nextMessageId(encoding, 'thinking')
    encoding.reasoning = messageId
    opened.push(
      {type: ChatEventType.REASONING_START, messageId},
      {type: ChatEventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'},
    )
  }
  return [...opened, {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId: encoding.reasoning, delta}]
}

function startCall(encoding: Encoding, index: number, id: string, name: string): ChatEvent[] {
  const closed = [...closeText(encoding), ...closeReasoning(encoding), ...closeCall(encoding, index)]
  encoding.calls.set(index, {id, args: ''})
  return [...closed, {type: ChatEventType.TOOL_CALL_START, toolCallId: id, toolCallName: name}]
}

function callArgs(encoding: Encoding, index: number, delta: string): ChatEvent[] {
  const call = encoding.calls.get(index)
  if (call === undefined) throw simulationErrors.TOOL_CALL_NOT_STARTED({index})
  call.args += delta
  return [{type: ChatEventType.TOOL_CALL_ARGS, toolCallId: call.id, delta}]
}

function wholeCall(encoding: Encoding, item: Extract<Item, {type: 'toolCall'}>): ChatEvent[] {
  const args = JSON.stringify(item.input)
  const started = encoding.calls.get(item.index)?.id === item.id
  const opened = started ? [] : startCall(encoding, item.index, item.id, item.name)
  return [...opened, ...callArgs(encoding, item.index, args), ...closeCall(encoding, item.index)]
}

function itemEvents(encoding: Encoding, item: Item): ChatEvent[] {
  if (item.type === 'textDelta') return textDelta(encoding, item.text)
  if (item.type === 'reasoningDelta') return reasoningDelta(encoding, item.text)
  if (item.type === 'toolInputStart') return startCall(encoding, item.index, item.id, item.name)
  if (item.type === 'toolInputDelta') return callArgs(encoding, item.index, item.text)
  if (item.type === 'toolCall') return wholeCall(encoding, item)
  return [RawEventSchema.parse(item.chunk)]
}

export function chatEvents(encoding: Encoding, event: ProviderEvent): ChatEvent[] {
  if (event.type !== 'finish') return itemEvents(encoding, event)
  return [
    ...closeText(encoding),
    ...closeReasoning(encoding),
    ...closeCalls(encoding),
    {
      type: ChatEventType.RUN_FINISHED,
      runId: encoding.runId,
      threadId: encoding.threadId,
      finishReason: FINISH_REASON[event.reason],
    },
  ]
}

export function newEncoding(runId: string, threadId: string): Encoding {
  return {runId, threadId, segment: 0, text: undefined, reasoning: undefined, calls: new Map()}
}

function aborted(signal: AbortSignal | undefined): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    if (signal === undefined) return
    if (signal.aborted) return resume(Effect.void)
    const onAbort = () => resume(Effect.void)
    signal.addEventListener('abort', onAbort, {once: true})
    return Effect.sync(() => signal.removeEventListener('abort', onAbort))
  })
}

function requestSignal(request: StreamOptions): AbortSignal | undefined {
  return request.request?.signal ?? request.abortController?.signal ?? undefined
}

async function* simulatedRun(
  provider: SimulatedProvider.Interface,
  deps: HarnessChatDeps,
  request: StreamOptions,
): AsyncGenerator<ChatEvent> {
  const runId = request.runId ?? `simulated-run-${randomUUID()}`
  const threadId = request.threadId ?? runId
  const encoding = newEncoding(runId, threadId)
  yield {type: ChatEventType.RUN_STARTED, runId, threadId}
  yield {
    type: ChatEventType.CUSTOM,
    name: 'simulation.session-id',
    value: {sessionId: deps.resumeSessionId ?? `simulated-${deps.sessionId}`},
  }
  const events = provider
    .stream(recordedRequest(request, deps))
    .pipe(Stream.interruptWhen(aborted(requestSignal(request))))
  yield* encodedRun(encoding, events)
}

async function* encodedRun(
  encoding: Encoding,
  events: ReturnType<SimulatedProvider.Interface['stream']>,
): AsyncGenerator<ChatEvent> {
  try {
    for await (const event of Stream.toAsyncIterable(events)) {
      const chats = chatEvents(encoding, event)
      const ending = chats.findIndex((chat) => chat.type === ChatEventType.RUN_ERROR)
      yield* ending === -1 ? chats : chats.slice(0, ending + 1)
      if (ending !== -1) return
    }
  } catch (error) {
    const message = ErrorMessageSchema.safeParse(error).data?.message ?? failureText(error)
    yield {type: ChatEventType.RUN_ERROR, message, error: {message}}
  }
}

export function simulatedHarness(provider: SimulatedProvider.Interface): (harness: HarnessAdapter) => HarnessAdapter {
  return (harness) => ({
    ...harness,
    chatConfig: async (deps) => ({
      adapter: makeTextAdapter(harness.id, (request) => simulatedRun(provider, deps, request)),
    }),
  })
}

async function* refusedRun(message: string): AsyncGenerator<ChatEvent> {
  yield* []
  throw simulationErrors.HARNESS_REFUSED({message})
}

export function refusedHarness(message: string): (harness: HarnessAdapter) => HarnessAdapter {
  return (harness) => ({
    ...harness,
    chatConfig: async () => ({adapter: makeTextAdapter(harness.id, () => refusedRun(message))}),
  })
}
