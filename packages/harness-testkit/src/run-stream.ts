import {ChatEventType, type ChatEvent} from '@conciv/ai/events'
import {collectToolCalls, makeRunEvents, type RunEvents, type SeenToolCall} from './run-events.js'

export type RunStream = {
  tap: (listener: (chunk: ChatEvent) => void) => () => void
  waitFor: (match: (e: ChatEvent) => boolean, opts?: {hangGuardMs?: number}) => Promise<ChatEvent>
  waitForRunStart: (opts?: {runId?: string}) => Promise<ChatEvent>
  waitForToolCall: (name: string, opts?: {hangGuardMs?: number}) => Promise<SeenToolCall>
  waitForText: (substr: string) => Promise<void>
  done: (opts?: {hangGuardMs?: number}) => Promise<RunEvents>
}

function isRunStart(chunk: ChatEvent, runId: string | undefined): boolean {
  if (chunk.type !== ChatEventType.RUN_STARTED) return false
  if (runId === undefined) return true
  return 'runId' in chunk && chunk.runId === runId
}

function isTerminal(chunk: ChatEvent): boolean {
  if (chunk.type === ChatEventType.RUN_ERROR) return true
  return chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

function summarize(seen: ChatEvent[]): string {
  const counts = new Map<string, number>()
  for (const chunk of seen) counts.set(chunk.type, (counts.get(chunk.type) ?? 0) + 1)
  if (counts.size === 0) return 'no events'
  return [...counts.entries()].map(([type, count]) => `${type}x${count}`).join(', ')
}

export function makeRunStream(source: AsyncIterable<ChatEvent>): RunStream {
  const seen: ChatEvent[] = []
  const collector = {ended: false, failure: ''}
  const listeners = new Set<() => void>()

  function announce(): void {
    for (const listener of listeners) listener()
  }

  async function collect(): Promise<void> {
    try {
      for await (const chunk of source) {
        seen.push(chunk)
        announce()
      }
    } catch (error) {
      collector.failure = error instanceof Error ? error.message : String(error)
    } finally {
      collector.ended = true
      announce()
    }
  }
  void collect()

  function endMessage(base: string): string {
    return collector.failure === '' ? base : `${base} (source error: ${collector.failure})`
  }

  function waitFor(match: (e: ChatEvent) => boolean, hangGuardMs: number | null): Promise<ChatEvent> {
    const liveStart = seen.length
    return new Promise<ChatEvent>((resolve, reject) => {
      const settle = (finish: () => void): void => {
        listeners.delete(listener)
        if (guard !== null) clearTimeout(guard)
        finish()
      }
      const listener = (): void => {
        const found = seen.find(match)
        if (found !== undefined) return settle(() => resolve(found))
        if (seen.slice(liveStart).some(isTerminal)) {
          return settle(() =>
            reject(new Error(`run-stream: run finished without a matching event (seen: ${summarize(seen)})`)),
          )
        }
        if (collector.ended) {
          return settle(() => reject(new Error(endMessage('run-stream: source ended without a matching event'))))
        }
      }
      const guard =
        hangGuardMs === null
          ? null
          : setTimeout(
              () =>
                settle(() =>
                  reject(
                    new Error(
                      `run-stream: stall - no matching event within ${hangGuardMs}ms (seen: ${summarize(seen)})`,
                    ),
                  ),
                ),
              hangGuardMs,
            )
      listeners.add(listener)
      listener()
    })
  }

  const doneCursor = {index: 0}

  function takeFinished(): RunEvents | null {
    while (doneCursor.index < seen.length) {
      const index = doneCursor.index
      doneCursor.index += 1
      const chunk = seen[index]
      if (chunk && isTerminal(chunk)) return makeRunEvents(seen.slice(0, doneCursor.index))
    }
    return null
  }

  function waitForFinish(hangGuardMs: number): Promise<RunEvents> {
    return new Promise<RunEvents>((resolve, reject) => {
      const settle = (finish: () => void): void => {
        listeners.delete(listener)
        clearTimeout(guard)
        finish()
      }
      const listener = (): void => {
        const finished = takeFinished()
        if (finished) return settle(() => resolve(finished))
        if (collector.ended) return settle(() => resolve(makeRunEvents([...seen])))
      }
      const guard = setTimeout(
        () =>
          settle(() =>
            reject(
              new Error(`run-stream: stall - run did not finish within ${hangGuardMs}ms (seen: ${summarize(seen)})`),
            ),
          ),
        hangGuardMs,
      )
      listeners.add(listener)
      listener()
    })
  }

  return {
    tap: (onChunk) => {
      const cursor = {index: 0}
      const listener = (): void => {
        while (cursor.index < seen.length) {
          const chunk = seen[cursor.index]
          cursor.index += 1
          if (chunk) onChunk(chunk)
        }
      }
      listeners.add(listener)
      listener()
      return () => {
        listeners.delete(listener)
      }
    },
    waitFor: (match, opts) => waitFor(match, opts?.hangGuardMs ?? 90_000),
    waitForRunStart: (opts) => waitFor((chunk) => isRunStart(chunk, opts?.runId), null),
    waitForToolCall: async (name, opts) => {
      await waitFor(() => collectToolCalls(seen, name).length > 0, opts?.hangGuardMs ?? 90_000)
      const call = collectToolCalls([...seen], name).at(-1)
      if (!call) throw new Error('run-stream: matched tool call disappeared from the collected stream')
      return call
    },
    waitForText: async (substr) => {
      await waitFor(() => makeRunEvents(seen).text().includes(substr), 90_000)
    },
    done: (opts) => waitForFinish(opts?.hangGuardMs ?? 90_000),
  }
}
