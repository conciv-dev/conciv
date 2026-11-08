import {EventType} from '@tanstack/ai'
import type {TextAdapter} from '../adapters/adapters.js'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'

export type RunGuard = {
  ended: AbortSignal
  stopped: AbortSignal
  firstOutputMs: number
  onSilence: () => void
  stop: () => void
  log: (message: string) => void
}

function isHarnessOutput(chunk: ChatEvent): boolean {
  return chunk.type !== EventType.RUN_STARTED && chunk.type !== EventType.CUSTOM
}

async function* stopped(ending: ChatEvent, guard: RunGuard): AsyncIterable<ChatEvent> {
  try {
    yield ending
  } finally {
    guard.stop()
  }
}

async function* guarded(start: () => AsyncIterable<ChatEvent>, guard: RunGuard): AsyncIterable<ChatEvent> {
  if (guard.ended.aborted) {
    yield* stopped(guard.ended.reason, guard)
    return
  }
  if (guard.stopped.aborted) return
  const iterator = start()[Symbol.asyncIterator]()
  const ending = Promise.withResolvers<ChatEvent>()
  const end = () => ending.resolve(guard.ended.reason)
  guard.ended.addEventListener('abort', end, {once: true})
  const finished = Promise.withResolvers<IteratorReturnResult<undefined>>()
  const finish = () => finished.resolve({done: true, value: undefined})
  guard.stopped.addEventListener('abort', finish, {once: true})
  const silence = AbortSignal.timeout(guard.firstOutputMs)
  silence.addEventListener('abort', guard.onSilence, {once: true})
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), ending.promise, finished.promise])
      if ('type' in next) {
        yield* stopped(next, guard)
        return
      }
      if (next.done) return
      if (isHarnessOutput(next.value)) silence.removeEventListener('abort', guard.onSilence)
      yield next.value
    }
  } finally {
    silence.removeEventListener('abort', guard.onSilence)
    guard.ended.removeEventListener('abort', end)
    guard.stopped.removeEventListener('abort', finish)
    Promise.resolve(iterator.return?.()).catch((error: unknown) => {
      guard.log(`[ai] closing the adapter stream failed: ${String(error)}`)
    })
  }
}

export function guardedAdapter(adapter: TextAdapter, guard: RunGuard): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) => guarded(() => adapter.chatStream(options), guard)
  return new Proxy(adapter, {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}
