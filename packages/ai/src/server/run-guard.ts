import {EventType} from '@tanstack/ai'
import type {TextAdapter} from '../adapters/adapters.js'
import type {ChatEvent} from '../events/events.js'

export type RunGuard = {
  ended: Promise<ChatEvent>
  firstOutputMs: number
  onSilence: () => void
  stop: () => void
  log: (message: string) => void
}

function isHarnessOutput(chunk: ChatEvent): boolean {
  return chunk.type !== EventType.RUN_STARTED && chunk.type !== EventType.CUSTOM
}

async function* guarded(stream: AsyncIterable<ChatEvent>, guard: RunGuard): AsyncIterable<ChatEvent> {
  const iterator = stream[Symbol.asyncIterator]()
  const silence = AbortSignal.timeout(guard.firstOutputMs)
  silence.addEventListener('abort', guard.onSilence, {once: true})
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), guard.ended])
      if ('type' in next) {
        try {
          yield next
        } finally {
          guard.stop()
        }
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
  const chatStream: TextAdapter['chatStream'] = (options) => guarded(adapter.chatStream(options), guard)
  return new Proxy(adapter, {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}
