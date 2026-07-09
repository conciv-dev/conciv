import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export type ScriptedRun = {
  chatStream: (deps: HarnessChatDeps) => AsyncGenerator<StreamChunk>
  hold: () => void
  release: () => void
}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const gate = {held: false, release: () => {}}
  const hold = () => {
    gate.held = true
  }
  const release = () => {
    gate.held = false
    gate.release()
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
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'scripted', delta: opts.text ?? 'ok'}
    if (gate.held) await new Promise<void>((resolve) => (gate.release = resolve))
    yield {type: EventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted'}
  }
  return {chatStream, hold, release}
}
