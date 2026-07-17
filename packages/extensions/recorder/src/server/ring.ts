import type {RrwebEvent} from '../shared/protocol.js'

export type EventRing = {
  append(clientId: string, events: RrwebEvent[]): void
  window(opts?: {fromTs?: number; toTs?: number}): RrwebEvent[]
  lastTs(): number
  clear(): void
  onAppend(listener: (lastTs: number) => void): () => void
}

type Stored = {event: RrwebEvent; bytes: number}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

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
      const incoming = events.map((event) => ({event, bytes: JSON.stringify(event).length}))
      stored = [...stored, ...incoming].toSorted((a, b) => a.event.timestamp - b.event.timestamp)
      totalBytes += incoming.reduce((sum, item) => sum + item.bytes, 0)
      evict()
      const last = stored.at(-1)?.event.timestamp ?? 0
      for (const listener of listeners) listener(last)
    },
    window(range = {}) {
      const toTs = range.toTs ?? Number.POSITIVE_INFINITY
      const inTail = stored.filter((item) => item.event.timestamp <= toTs)
      const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY
      const snapshotIndex = inTail.reduce(
        (found, item, index) => (item.event.type === 2 && item.event.timestamp <= fromTs ? index : found),
        0,
      )
      return inTail.slice(snapshotIndex).map((item) => item.event)
    },
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
