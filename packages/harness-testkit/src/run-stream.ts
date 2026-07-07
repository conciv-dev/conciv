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

function summarize(seen: StreamChunk[]): string {
  const counts = new Map<string, number>()
  for (const chunk of seen) counts.set(chunk.type, (counts.get(chunk.type) ?? 0) + 1)
  if (counts.size === 0) return 'no events'
  return [...counts.entries()].map(([type, count]) => `${type}x${count}`).join(', ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function makeRunStream(source: AsyncIterable<StreamChunk>): RunStream {
  const seen: StreamChunk[] = []
  const collector = {ended: false, failure: ''}

  async function collect(): Promise<void> {
    try {
      for await (const chunk of source) seen.push(chunk)
    } catch (error) {
      collector.failure = error instanceof Error ? error.message : String(error)
    } finally {
      collector.ended = true
    }
  }
  void collect()

  function endMessage(base: string): string {
    return collector.failure === '' ? base : `${base} (source error: ${collector.failure})`
  }

  async function waitFor(match: (e: StreamChunk) => boolean, hangGuardMs: number): Promise<StreamChunk> {
    const liveStart = seen.length
    const deadline = performance.now() + hangGuardMs
    while (true) {
      const found = seen.find(match)
      if (found !== undefined) return found
      if (seen.slice(liveStart).some(isTerminal))
        throw new Error(`run-stream: run finished without a matching event (seen: ${summarize(seen)})`)
      if (collector.ended) throw new Error(endMessage('run-stream: source ended without a matching event'))
      if (performance.now() > deadline)
        throw new Error(`run-stream: stall - no matching event within ${hangGuardMs}ms (seen: ${summarize(seen)})`)
      await sleep(10)
    }
  }

  const doneCursor = {index: 0}

  async function waitForFinish(hangGuardMs: number): Promise<RunEvents> {
    const deadline = performance.now() + hangGuardMs
    while (true) {
      while (doneCursor.index < seen.length) {
        const index = doneCursor.index
        doneCursor.index += 1
        if (seen[index]?.type === EventType.RUN_FINISHED) return makeRunEvents(seen.slice(0, doneCursor.index))
      }
      if (collector.ended) return makeRunEvents([...seen])
      if (performance.now() > deadline)
        throw new Error(`run-stream: stall - run did not finish within ${hangGuardMs}ms (seen: ${summarize(seen)})`)
      await sleep(10)
    }
  }

  return {
    waitFor: (match, opts) => waitFor(match, opts?.hangGuardMs ?? 90_000),
    waitForUiSpec: async (question) => {
      const chunk = await waitFor(uiSpecMatch(question), 90_000)
      const spec = chunk.type === EventType.CUSTOM ? parseUiSpec(chunk.value) : null
      if (!spec) throw new Error('run-stream: matched event was not a ui spec')
      return spec
    },
    waitForText: async (substr) => {
      await waitFor(() => makeRunEvents(seen).text().includes(substr), 90_000)
    },
    done: (opts) => waitForFinish(opts?.hangGuardMs ?? 90_000),
  }
}
