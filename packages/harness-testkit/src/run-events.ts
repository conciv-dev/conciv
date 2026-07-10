import {EventType, type StreamChunk} from '@tanstack/ai'

export type SeenToolCall = {toolCallId: string; name: string; input: unknown}

export type RunEvents = {
  all: StreamChunk[]
  text: () => string
  toolCalls: (name?: string) => SeenToolCall[]
  errors: () => string[]
  runs: () => number
  custom: (name: string) => unknown[]
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function argsFor(all: StreamChunk[], toolCallId: string): string {
  return all
    .flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_ARGS && chunk.toolCallId === toolCallId ? [chunk.delta ?? ''] : [],
    )
    .join('')
}

export function collectToolCalls(all: StreamChunk[], name?: string): SeenToolCall[] {
  return all
    .flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_START ? [{toolCallId: chunk.toolCallId, name: chunk.toolCallName}] : [],
    )
    .filter((call) => name === undefined || call.name === name)
    .map((call) => ({...call, input: parseArgs(argsFor(all, call.toolCallId))}))
}

export function makeRunEvents(all: StreamChunk[]): RunEvents {
  return {
    all,
    text: () =>
      all.flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta ?? ''] : [])).join(''),
    toolCalls: (name) => collectToolCalls(all, name),
    errors: () => all.flatMap((chunk) => (chunk.type === EventType.RUN_ERROR ? [chunk.message] : [])),
    runs: () => all.filter((chunk) => chunk.type === EventType.RUN_FINISHED).length,
    custom: (name) =>
      all.flatMap((chunk) => (chunk.type === EventType.CUSTOM && chunk.name === name ? [chunk.value] : [])),
  }
}
