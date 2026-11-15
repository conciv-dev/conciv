import {EventType} from '@tanstack/ai'
import type {TextAdapter} from '../adapters/adapters.js'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'

export type RunGuard = {
  ended: AbortSignal
  stopped: AbortSignal
  startMs: number
  firstOutputMs: number
  onNotStarted: () => void
  onSilence: () => void
  stop: () => void
  log: (message: string) => void
}

type Watch = {phase: 'starting' | 'silent' | 'speaking'; disarm: () => void}

const SPEAKING: Watch = {phase: 'speaking', disarm: () => undefined}

function isHarnessOutput(chunk: ChatEvent): boolean {
  return chunk.type !== EventType.RUN_STARTED && chunk.type !== EventType.CUSTOM
}

function armed(phase: Watch['phase'], ms: number, fire: () => void): Watch {
  const timeout = AbortSignal.timeout(ms)
  timeout.addEventListener('abort', fire, {once: true})
  return {phase, disarm: () => timeout.removeEventListener('abort', fire)}
}

function advanced(watch: Watch, chunk: ChatEvent, guard: RunGuard): Watch {
  if (watch.phase === 'speaking') return watch
  if (isHarnessOutput(chunk)) {
    watch.disarm()
    return SPEAKING
  }
  if (watch.phase === 'silent' || chunk.type !== EventType.RUN_STARTED) return watch
  watch.disarm()
  return armed('silent', guard.firstOutputMs, guard.onSilence)
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
  let watch = armed('starting', guard.startMs, guard.onNotStarted)
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), ending.promise, finished.promise])
      if ('type' in next) {
        yield* stopped(next, guard)
        return
      }
      if (next.done) return
      watch = advanced(watch, next.value, guard)
      yield next.value
    }
  } finally {
    watch.disarm()
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
