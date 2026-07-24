import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export type ScriptedRun = {
  chatStream: (deps: HarnessChatDeps) => AsyncGenerator<StreamChunk>
  hold: () => void
  release: () => void
  scriptToolCall: (name: string, input: unknown, opts?: {blocking?: boolean}) => void
  scriptCustomEvent: (name: string, value: unknown) => void
  scriptError: (message: string) => void
}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const gate = {held: false, release: () => {}}
  const queuedToolCalls: Array<{name: string; input: unknown; blocking: boolean}> = []
  const queuedCustomEvents: Array<{name: string; value: unknown}> = []
  const queuedErrors: string[] = []
  const hold = () => {
    gate.held = true
  }
  const release = () => {
    gate.held = false
    gate.release()
  }
  const scriptToolCall = (name: string, input: unknown, toolOpts: {blocking?: boolean} = {}) => {
    queuedToolCalls.push({name, input, blocking: toolOpts.blocking ?? true})
  }
  const scriptCustomEvent = (name: string, value: unknown) => {
    queuedCustomEvents.push({name, value})
  }
  const scriptError = (message: string) => {
    queuedErrors.push(message)
  }
  const chatStream = async function* (deps: HarnessChatDeps): AsyncGenerator<StreamChunk> {
    yield {type: EventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
    yield {
      type: EventType.CUSTOM,
      name: 'fake.session-id',
      value: {sessionId: `fake-${deps.sessionId}`},
      threadId: 'scripted',
      runId: 'scripted',
    }
    const toolCall = queuedToolCalls.shift()
    if (toolCall) {
      const toolCallId = `tc-${deps.sessionId}`
      yield {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: toolCall.name, toolName: toolCall.name}
      yield {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(toolCall.input)}
      yield {type: EventType.TOOL_CALL_END, toolCallId}
      if (toolCall.blocking) {
        yield {type: EventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted', finishReason: 'tool_calls'}
        return
      }
      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: `${toolCallId}-result`,
        toolCallId,
        content: JSON.stringify({ok: true}),
        state: 'output-available',
      }
    }
    for (const event of queuedCustomEvents.splice(0)) {
      yield {type: EventType.CUSTOM, name: event.name, value: event.value, threadId: 'scripted', runId: 'scripted'}
    }
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'scripted', delta: opts.text ?? 'ok'}
    if (gate.held) await new Promise<void>((resolve) => (gate.release = resolve))
    const failure = queuedErrors.shift()
    if (failure) throw new Error(failure)
    yield {type: EventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted'}
  }
  return {chatStream, hold, release, scriptToolCall, scriptCustomEvent, scriptError}
}
