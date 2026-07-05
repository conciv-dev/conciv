import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessRun} from '@conciv/protocol/harness-types'

export type ScriptedRun = {run: HarnessRun; hold: () => void; release: () => void}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const gate = {held: false, release: () => {}}
  const hold = () => {
    gate.held = true
  }
  const release = () => gate.release()
  const run: HarnessRun = async function* (): AsyncGenerator<StreamChunk> {
    yield {type: EventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'scripted', delta: opts.text ?? 'ok'}
    if (gate.held) await new Promise<void>((resolve) => (gate.release = resolve))
    yield {type: EventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted'}
  }
  return {run, hold, release}
}
