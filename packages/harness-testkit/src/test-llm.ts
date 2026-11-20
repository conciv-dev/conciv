import {Stream} from 'effect'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {TokenUsage} from '@conciv/protocol/usage-types'

export type Response = readonly ChatEvent[] | Stream.Stream<ChatEvent, Error>

export type RecordedRequestTool = {name: string; description: string}

export type RecordedRequest = {messages: ModelMessage[]; tools: RecordedRequestTool[]}

export type Responder = (request: RecordedRequest) => Response

export type Gate = Readonly<{started: Promise<void>; release: () => Promise<void>}>

type RunFinished = Extract<ChatEvent, {type: typeof ChatEventType.RUN_FINISHED}>

export type FinishReason = NonNullable<RunFinished['finishReason']>

export type CompleteOptions = {reason: FinishReason; usage?: TokenUsage}

export function complete(options: CompleteOptions, ...events: readonly ChatEvent[]): ChatEvent[] {
  const finished: RunFinished = {
    type: ChatEventType.RUN_FINISHED,
    threadId: '',
    runId: '',
    finishReason: options.reason,
  }
  return [...events, options.usage === undefined ? finished : {...finished, usage: options.usage}]
}

export function stop(...events: readonly ChatEvent[]): ChatEvent[] {
  return complete({reason: 'stop'}, ...events)
}

export function toolCalls(...events: readonly ChatEvent[]): ChatEvent[] {
  return complete({reason: 'tool_calls'}, ...events)
}

export function textEvents(value: string, id: string): ChatEvent[] {
  return [
    {type: ChatEventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant'},
    {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: value},
    {type: ChatEventType.TEXT_MESSAGE_END, messageId: id},
  ]
}

export function toolCallEvents(id: string, name: string, input: unknown): ChatEvent[] {
  return [
    {type: ChatEventType.TOOL_CALL_START, toolCallId: id, toolCallName: name},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: id, delta: JSON.stringify(input)},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: id},
  ]
}

export function reasoningEvents(value: string, id: string): ChatEvent[] {
  return [
    {type: ChatEventType.REASONING_MESSAGE_START, messageId: id, role: 'reasoning'},
    {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId: id, delta: value},
    {type: ChatEventType.REASONING_MESSAGE_END, messageId: id},
  ]
}

export function text(value: string, id: string): ChatEvent[] {
  return stop(...textEvents(value, id))
}

export function textWithUsage(value: string, id: string, inputTokens: number): ChatEvent[] {
  const usage = {promptTokens: inputTokens, completionTokens: 0, totalTokens: inputTokens}
  return complete({reason: 'stop', usage}, ...textEvents(value, id))
}

export function reasoning(value: string, id: string): ChatEvent[] {
  return stop(...reasoningEvents(value, id))
}

export function toolCall(id: string, name: string, input: unknown): ChatEvent[] {
  return toolCalls(...toolCallEvents(id, name, input))
}

export function failAfter(error: Error, ...events: readonly ChatEvent[]): Stream.Stream<ChatEvent, Error> {
  return Stream.concat(Stream.fromIterable(events), Stream.fail(error))
}

export function hangAfter(...events: readonly ChatEvent[]): Stream.Stream<ChatEvent, Error> {
  return Stream.concat(Stream.fromIterable(events), Stream.never)
}
