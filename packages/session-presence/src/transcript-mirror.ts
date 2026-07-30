import type {UIMessage} from '@conciv/protocol/chat-types'

export type TranscriptSink = (messages: UIMessage[]) => void

const DEFAULT_INTERVAL_MS = 500

type Watch = {
  sinks: Set<TranscriptSink>
  timer: ReturnType<typeof setInterval>
  fingerprint: string
  latest: UIMessage[] | null
  running: boolean
}

function fingerprintOf(messages: UIMessage[]): string {
  const last = messages.at(-1)
  return `${messages.length}:${last?.id ?? ''}:${JSON.stringify(last?.parts ?? []).length}`
}

export function makeTranscriptMirror(deps: {messages(key: string): Promise<UIMessage[]>; intervalMs?: number}): {
  subscribe(key: string, sink: TranscriptSink): () => void
} {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
  const watches = new Map<string, Watch>()

  const tick = async (key: string): Promise<void> => {
    const watch = watches.get(key)
    if (!watch || watch.running) return
    watch.running = true
    const messages = await deps.messages(key).catch((): UIMessage[] => [])
    watch.running = false
    if (watches.get(key) !== watch) return
    const fingerprint = fingerprintOf(messages)
    if (fingerprint === watch.fingerprint) return
    watch.fingerprint = fingerprint
    watch.latest = messages
    for (const sink of watch.sinks) sink(messages)
  }

  const unsubscribe = (key: string, sink: TranscriptSink): void => {
    const watch = watches.get(key)
    if (!watch) return
    watch.sinks.delete(sink)
    if (watch.sinks.size > 0) return
    clearInterval(watch.timer)
    watches.delete(key)
  }

  const replay = (watch: Watch, sink: TranscriptSink): void => {
    const messages = watch.latest
    if (!messages) return
    queueMicrotask(() => {
      if (watch.sinks.has(sink)) sink(messages)
    })
  }

  return {
    subscribe(key, sink) {
      const existing = watches.get(key)
      if (existing) {
        existing.sinks.add(sink)
        replay(existing, sink)
        return () => unsubscribe(key, sink)
      }
      const timer = setInterval(() => void tick(key), intervalMs)
      timer.unref?.()
      watches.set(key, {sinks: new Set([sink]), timer, fingerprint: '', latest: null, running: false})
      void tick(key)
      return () => unsubscribe(key, sink)
    },
  }
}
