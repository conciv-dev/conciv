import {createMemo, type Accessor} from 'solid-js'
import {takeRightWhile} from 'es-toolkit'
import type {ChatMessage, ChatPart, ToolCallPart} from '@conciv/protocol/chat-message-types'

type ToolTimings = {startedAt: Readonly<Record<string, number>>; settledMs: Readonly<Record<string, number>>}

const NO_TIMINGS: ToolTimings = {startedAt: {}, settledMs: {}}

export function createToolDurations(
  messages: Accessor<readonly ChatMessage[]>,
  now: () => number,
): (toolCallId: string) => number | undefined {
  const timings = createMemo<ToolTimings>((previous) => {
    const at = now()
    return liveTurnCalls(messages()).reduce((folded, call) => foldCall(folded, call, at), previous)
  }, NO_TIMINGS)
  const settledMs = createMemo(() => timings().settledMs)
  return (toolCallId) => settledMs()[toolCallId]
}

function liveTurnCalls(messages: readonly ChatMessage[]): ToolCallPart[] {
  return takeRightWhile([...messages], (message) => message.role === 'assistant').flatMap((message) =>
    message.parts.filter(isToolCall),
  )
}

function isToolCall(part: ChatPart): part is ToolCallPart {
  return part.type === 'tool-call' && part.id.length > 0
}

function isSettled(part: ToolCallPart): boolean {
  return part.state === 'complete' || part.state === 'error' || part.output !== undefined
}

function foldCall(timings: ToolTimings, call: ToolCallPart, at: number): ToolTimings {
  if (Object.hasOwn(timings.settledMs, call.id)) return timings
  const started = timings.startedAt[call.id]
  if (!isSettled(call)) {
    if (started !== undefined) return timings
    return {startedAt: {...timings.startedAt, [call.id]: at}, settledMs: timings.settledMs}
  }
  if (started === undefined) return timings
  return {startedAt: timings.startedAt, settledMs: {...timings.settledMs, [call.id]: at - started}}
}
