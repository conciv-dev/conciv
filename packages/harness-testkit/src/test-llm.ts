import {Stream} from 'effect'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'

export type Response = readonly ChatEvent[] | Stream.Stream<ChatEvent, Error>

export type Gate = Readonly<{started: Promise<void>; release: () => Promise<void>}>

type FinishReason = 'stop' | 'tool_calls'

function complete(reason: FinishReason, ...events: readonly ChatEvent[]): ChatEvent[] {
  return [...events, {type: ChatEventType.RUN_FINISHED, threadId: '', runId: '', finishReason: reason}]
}

function stop(...events: readonly ChatEvent[]): ChatEvent[] {
  return complete('stop', ...events)
}

function toolCalls(...events: readonly ChatEvent[]): ChatEvent[] {
  return complete('tool_calls', ...events)
}

export function text(value: string, id: string): ChatEvent[] {
  return stop(
    {type: ChatEventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant'},
    {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: value},
    {type: ChatEventType.TEXT_MESSAGE_END, messageId: id},
  )
}

export function toolCall(id: string, name: string, input: unknown): ChatEvent[] {
  return toolCalls(
    {type: ChatEventType.TOOL_CALL_START, toolCallId: id, toolCallName: name},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: id, delta: JSON.stringify(input)},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: id},
  )
}

export function hangAfter(...events: readonly ChatEvent[]): Stream.Stream<ChatEvent, Error> {
  return Stream.concat(Stream.fromIterable(events), Stream.never)
}
