import type {RrwebEvent} from '../shared/protocol.js'

export type EventRing = {
  append(clientId: string, events: RrwebEvent[]): void
  window(opts?: {fromTs?: number; toTs?: number}): RrwebEvent[]
  since(ts: number): RrwebEvent[]
  lastTs(): number
  clear(): void
  onAppend(listener: (lastTs: number) => void): () => void
}

type Stored = {event: RrwebEvent; bytes: number}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024

export function createEventRing(opts: {windowMs: number; maxBytes?: number}): EventRing {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  let stored: Stored[] = []
  let totalBytes = 0
  const listeners = new Set<(lastTs: number) => void>()

  const evict = (): void => {
    const newest = stored.at(-1)?.event.timestamp ?? 0
    let dropTo = 0
    let bytes = totalBytes
    while (dropTo < stored.length - 1) {
      const head = stored[dropTo]
      if (!head) break
      const tooOld = newest - head.event.timestamp > opts.windowMs
      if (!tooOld && bytes <= maxBytes) break
      bytes -= head.bytes
      dropTo += 1
    }
    if (dropTo === 0) return
    stored = stored.slice(dropTo)
    totalBytes = bytes
  }

  return {
    append(_clientId, events) {
      if (!events.length) return
      const incoming = events
        .map((event) => ({event, bytes: JSON.stringify(event).length}))
        .toSorted((a, b) => a.event.timestamp - b.event.timestamp)
      const tailAppend = (incoming[0]?.event.timestamp ?? 0) >= (stored.at(-1)?.event.timestamp ?? 0)
      stored = tailAppend
        ? [...stored, ...incoming]
        : [...stored, ...incoming].toSorted((a, b) => a.event.timestamp - b.event.timestamp)
      totalBytes += incoming.reduce((sum, item) => sum + item.bytes, 0)
      evict()
      const last = stored.at(-1)?.event.timestamp ?? 0
      for (const listener of listeners) listener(last)
    },
    window(range = {}) {
      const toTs = range.toTs ?? Number.POSITIVE_INFINITY
      const inTail = stored.filter((item) => item.event.timestamp <= toTs)
      const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY
      const withMeta = (index: number): number => (index > 0 && inTail[index - 1]?.event.type === 4 ? index - 1 : index)
      const anchored = inTail.findLastIndex((item) => item.event.type === 2 && item.event.timestamp <= fromTs)
      if (anchored >= 0) return inTail.slice(withMeta(anchored)).map((item) => item.event)
      const next = inTail.findIndex((item) => item.event.type === 2 && item.event.timestamp > fromTs)
      return next >= 0 ? inTail.slice(withMeta(next)).map((item) => item.event) : []
    },
    since: (ts) => stored.filter((item) => item.event.timestamp > ts).map((item) => item.event),
    lastTs: () => stored.at(-1)?.event.timestamp ?? 0,
    clear() {
      stored = []
      totalBytes = 0
    },
    onAppend(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
