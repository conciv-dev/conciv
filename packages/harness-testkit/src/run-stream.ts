import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_UI_EVENT, parseUiSpec, type UiSpec} from '@conciv/protocol/ui-types'
import {makeRunEvents, type RunEvents} from './run-events.js'

export type RunStream = {
  waitFor: (match: (e: StreamChunk) => boolean, opts?: {hangGuardMs?: number}) => Promise<StreamChunk>
  waitForUiSpec: (question?: string) => Promise<UiSpec>
  waitForText: (substr: string) => Promise<void>
  done: (opts?: {hangGuardMs?: number}) => Promise<RunEvents>
}

function isTerminal(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

function uiSpecMatch(question?: string): (chunk: StreamChunk) => boolean {
  return (chunk) => {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== CONCIV_UI_EVENT) return false
    if (question === undefined) return true
    const spec = parseUiSpec(chunk.value)
    return spec !== null && 'question' in spec && spec.question === question
  }
}

export function makeRunStream(source: AsyncIterable<StreamChunk>): RunStream {
  const seen: StreamChunk[] = []
  const iterator = source[Symbol.asyncIterator]()

  async function pump(match: (e: StreamChunk) => boolean, hangGuardMs: number): Promise<StreamChunk> {
    for (const chunk of seen) if (match(chunk)) return chunk
    const deadline = performance.now() + hangGuardMs
    while (true) {
      if (performance.now() > deadline) throw new Error(`run-stream: stall - no matching event within ${hangGuardMs}ms`)
      const {value, done} = await iterator.next()
      if (done) throw new Error('run-stream: source ended without a matching event')
      seen.push(value)
      if (match(value)) return value
      if (isTerminal(value)) throw new Error('run-stream: run finished without a matching event')
    }
  }

  return {
    waitFor: (match, opts) => pump(match, opts?.hangGuardMs ?? 90_000),
    waitForUiSpec: async (question) => {
      const chunk = await pump(uiSpecMatch(question), 90_000)
      const spec = chunk.type === EventType.CUSTOM ? parseUiSpec(chunk.value) : null
      if (!spec) throw new Error('run-stream: matched event was not a ui spec')
      return spec
    },
    waitForText: async (substr) => {
      await pump((chunk) => makeRunEvents([...seen, chunk]).text().includes(substr), 90_000)
    },
    done: async (opts) => {
      const deadline = performance.now() + (opts?.hangGuardMs ?? 90_000)
      while (true) {
        if (performance.now() > deadline) throw new Error('run-stream: stall - run did not finish')
        const {value, done} = await iterator.next()
        if (done) break
        seen.push(value)
        if (value.type === EventType.RUN_FINISHED) break
      }
      return makeRunEvents(seen)
    },
  }
}
