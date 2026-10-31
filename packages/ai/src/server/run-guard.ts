import {EventType} from '@tanstack/ai'
import type {TextAdapter} from '../adapters/adapters.js'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'

export type RunGuard = {
  ended: AbortSignal
  firstOutputMs: number
  onSilence: () => void
  stop: () => void
  log: (message: string) => void
}

function isHarnessOutput(chunk: ChatEvent): boolean {
  return chunk.type !== EventType.RUN_STARTED && chunk.type !== EventType.CUSTOM
}

function endingOf(ended: AbortSignal): Promise<ChatEvent> {
  return new Promise((resolve) => ended.addEventListener('abort', () => resolve(ended.reason), {once: true}))
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
  const iterator = start()[Symbol.asyncIterator]()
  const ending = endingOf(guard.ended)
  const silence = AbortSignal.timeout(guard.firstOutputMs)
  silence.addEventListener('abort', guard.onSilence, {once: true})
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), ending])
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
