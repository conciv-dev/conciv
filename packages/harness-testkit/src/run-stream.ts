import {EventType, type StreamChunk} from '@tanstack/ai'
import {collectToolCalls, makeRunEvents, type RunEvents, type SeenToolCall} from './run-events.js'

export type RunStream = {
  waitFor: (match: (e: StreamChunk) => boolean, opts?: {hangGuardMs?: number}) => Promise<StreamChunk>
  waitForToolCall: (name: string, opts?: {hangGuardMs?: number}) => Promise<SeenToolCall>
  waitForText: (substr: string) => Promise<void>
  done: (opts?: {hangGuardMs?: number}) => Promise<RunEvents>
}

function isTerminal(chunk: StreamChunk): boolean {
  if (chunk.type === EventType.RUN_ERROR) return true
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
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
        const chunk = seen[index]
        if (chunk?.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') {
          return makeRunEvents(seen.slice(0, doneCursor.index))
        }
      }
      if (collector.ended) return makeRunEvents([...seen])
      if (performance.now() > deadline)
        throw new Error(`run-stream: stall - run did not finish within ${hangGuardMs}ms (seen: ${summarize(seen)})`)
      await sleep(10)
    }
  }

  return {
    waitFor: (match, opts) => waitFor(match, opts?.hangGuardMs ?? 90_000),
    waitForToolCall: async (name, opts) => {
      const matched = await waitFor(
        (chunk) =>
          chunk.type === EventType.TOOL_CALL_END &&
          collectToolCalls(seen, name).some((call) => call.toolCallId === chunk.toolCallId),
        opts?.hangGuardMs ?? 90_000,
      )
      const toolCallId = matched.type === EventType.TOOL_CALL_END ? matched.toolCallId : ''
      const call = collectToolCalls([...seen], name).find((entry) => entry.toolCallId === toolCallId)
      if (!call) throw new Error('run-stream: matched tool call disappeared from the collected stream')
      return call
    },
    waitForText: async (substr) => {
      await waitFor(() => makeRunEvents(seen).text().includes(substr), 90_000)
    },
    done: (opts) => waitForFinish(opts?.hangGuardMs ?? 90_000),
  }
}
