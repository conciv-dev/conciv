import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import type {ChatPart} from '@conciv/types/chat-message-types'
import type {PermissionReply} from '@conciv/types/chat-types'
import type {UiAnswerValue} from '@conciv/types/ui-types'
import {aborted} from './fake-channel.js'
import type {FakeAsk, FakeTool} from './fake-types.js'

export const NOT_APPROVED = 'the call was not approved'

const UI_TOOL = 'conciv_ui'

export type AskedCall = {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
  readonly runId: string | null
}

export type ExecuteDeps = {
  readonly tools: Readonly<Record<string, FakeTool>> | undefined
  readonly ask: (call: AskedCall, request: FakeAsk, signal: AbortSignal) => Promise<PermissionReply>
  readonly answer: (toolCallId: string, signal: AbortSignal) => Promise<UiAnswerValue>
}

export type ExecuteSink = {
  readonly emit: (event: ChatEvent) => void
  readonly part: (part: ChatPart) => void
  readonly marker: Readonly<Record<string, unknown>>
  readonly messageId: string
  readonly runId: string | null
  readonly signal: AbortSignal
}

export type ExecuteOutcome =
  | {readonly kind: 'done'; readonly value: unknown}
  | {readonly kind: 'denied'}
  | {readonly kind: 'failed'; readonly message: string}
  | {readonly kind: 'stopped'}

type Settled = {readonly content: string; readonly outcome: 'complete' | 'error' | 'denied'}

function readResources(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  return Object.values(input)
    .flatMap((value) => (typeof value === 'string' || typeof value === 'number' ? [String(value)] : []))
    .join(', ')
}

function askTitle(name: string, input: unknown, request: FakeAsk): string {
  if (request.title !== undefined) return request.title
  const resources = readResources(input)
  return resources === '' ? name : `${name} ${resources}`
}

function resultMetadata(settled: Settled, base: Record<string, unknown>): Record<string, unknown> {
  if (settled.outcome === 'complete') return base
  if (settled.outcome === 'denied') return {...base, tanstack: {state: 'output-error', toolResultOutcome: 'denied'}}
  return {...base, tanstack: {state: 'output-error'}}
}

function resultPart(toolCallId: string, settled: Settled): ChatPart {
  if (settled.outcome === 'complete')
    return {type: 'tool-result', toolCallId, content: settled.content, state: 'complete'}
  if (settled.outcome === 'denied')
    return {type: 'tool-result', toolCallId, content: settled.content, state: 'error', outcome: 'denied'}
  return {type: 'tool-result', toolCallId, content: settled.content, state: 'error'}
}

function beginCall(sink: ExecuteSink, toolCallId: string, name: string, input: unknown, parent?: string): number {
  const start = Date.now()
  const metadata = {...sink.marker, time: {start}, ...(parent === undefined ? {} : {parentToolCallId: parent})}
  const args = JSON.stringify(input ?? {})
  sink.emit({
    type: ChatEventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: name,
    parentMessageId: sink.messageId,
    metadata,
  })
  sink.emit({type: ChatEventType.TOOL_CALL_ARGS, toolCallId, delta: args})
  sink.emit({type: ChatEventType.TOOL_CALL_END, toolCallId, metadata: sink.marker})
  sink.part({type: 'tool-call', id: toolCallId, name, arguments: args, input, state: 'input-complete', metadata})
  return start
}

function endCall(sink: ExecuteSink, toolCallId: string, start: number, settled: Settled): void {
  const metadata = resultMetadata(settled, {...sink.marker, time: {start, end: Date.now()}})
  sink.emit({
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId: sink.messageId,
    toolCallId,
    content: settled.content,
    metadata,
  })
  sink.part(resultPart(toolCallId, settled))
}

function stopped(signal: AbortSignal): Promise<'stopped'> {
  return aborted(signal).then(() => 'stopped' as const)
}

async function invoke(tool: FakeTool, input: unknown): Promise<ExecuteOutcome> {
  try {
    const value: unknown = (await tool.run?.(input)) ?? {}
    return {kind: 'done', value}
  } catch (error) {
    return {kind: 'failed', message: error instanceof Error ? error.message : String(error)}
  }
}

async function allowed(deps: ExecuteDeps, sink: ExecuteSink, call: AskedCall, request: FakeAsk) {
  const decision = await deps.ask(call, request, sink.signal)
  if (sink.signal.aborted) return {kind: 'stopped' as const}
  return decision === 'reject' ? {kind: 'denied' as const} : undefined
}

async function runTool(
  deps: ExecuteDeps,
  sink: ExecuteSink,
  childId: string,
  name: string,
  input: unknown,
): Promise<ExecuteOutcome> {
  const tool = deps.tools?.[name]
  if (tool === undefined && name === UI_TOOL) {
    const value = await deps.answer(childId, sink.signal)
    return {kind: 'done', value: {answered: true, value}}
  }
  if (tool === undefined) return {kind: 'failed', message: `Unknown tool: ${name}`}
  if (tool.ask === undefined) return invoke(tool, input)
  const call = {toolCallId: childId, toolName: askTitle(name, input, tool.ask), input, runId: sink.runId}
  return (await allowed(deps, sink, call, tool.ask)) ?? invoke(tool, input)
}

export async function executeTool(
  deps: ExecuteDeps,
  sink: ExecuteSink,
  call: {readonly id: string; readonly name: string; readonly input: unknown},
): Promise<ExecuteOutcome> {
  const childId = `call_${call.id}`
  const program = `return await external_${call.name}(${JSON.stringify(call.input)})`
  const outerStart = beginCall(sink, call.id, 'execute_typescript', {typescriptCode: program})
  const childStart = beginCall(sink, childId, call.name, call.input, call.id)
  const outcome = await Promise.race([runTool(deps, sink, childId, call.name, call.input), stopped(sink.signal)])
  if (outcome === 'stopped' || outcome.kind === 'stopped' || sink.signal.aborted) return {kind: 'stopped'}
  if (outcome.kind === 'denied') {
    endCall(sink, childId, childStart, {content: JSON.stringify({error: NOT_APPROVED}), outcome: 'denied'})
    endCall(sink, call.id, outerStart, {
      content: JSON.stringify({success: false, error: {message: NOT_APPROVED}}),
      outcome: 'denied',
    })
    return outcome
  }
  if (outcome.kind === 'failed') {
    endCall(sink, childId, childStart, {content: outcome.message, outcome: 'error'})
    endCall(sink, call.id, outerStart, {
      content: JSON.stringify({success: false, error: {message: outcome.message}}),
      outcome: 'error',
    })
    return outcome
  }
  endCall(sink, childId, childStart, {content: JSON.stringify(outcome.value), outcome: 'complete'})
  endCall(sink, call.id, outerStart, {
    content: JSON.stringify({success: true, result: outcome.value}),
    outcome: 'complete',
  })
  return outcome
}
