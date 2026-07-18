import type {RrwebEvent} from '../shared/protocol.js'

export type Flusher = {
  push(event: RrwebEvent): void
  setLive(live: boolean): void
  flushNow(): Promise<void>
  dispose(): void
}

const MAX_QUEUE_BYTES = 8 * 1024 * 1024
const MAX_POST_BYTES = 1024 * 1024
const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 30_000

type Queued = {event: RrwebEvent; bytes: number}

export function createFlusher(opts: {
  send: (events: RrwebEvent[]) => Promise<void>
  idleMs?: number
  liveMs?: number
}): Flusher {
  const idleMs = opts.idleMs ?? 5000
  const liveMs = opts.liveMs ?? 200
  let queue: Queued[] = []
  let queueBytes = 0
  let cadenceMs = idleMs
  let backoffMs = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let draining = false

  const enqueue = (event: RrwebEvent): void => {
    const bytes = JSON.stringify(event).length
    queue.push({event, bytes})
    queueBytes += bytes
    if (queueBytes <= MAX_QUEUE_BYTES) return
    const lastSnapshot = queue.findLastIndex((item) => item.event.type === 2)
    let dropTo = 0
    while (queueBytes > MAX_QUEUE_BYTES && dropTo < queue.length - 1 && dropTo < lastSnapshot) {
      const head = queue[dropTo]
      if (!head) break
      queueBytes -= head.bytes
      dropTo += 1
    }
    while (queueBytes > MAX_QUEUE_BYTES && dropTo < queue.length - 1 && lastSnapshot === -1) {
      const head = queue[dropTo]
      if (!head) break
      queueBytes -= head.bytes
      dropTo += 1
    }
    if (dropTo > 0) queue = queue.slice(dropTo)
  }

  const takeChunk = (): Queued[] => {
    const chunk: Queued[] = []
    let chunkBytes = 0
    while (queue.length > 0) {
      const head = queue[0]
      if (!head) break
      if (chunk.length > 0 && chunkBytes + head.bytes > MAX_POST_BYTES) break
      chunk.push(head)
      chunkBytes += head.bytes
      queue = queue.slice(1)
      queueBytes -= head.bytes
    }
    return chunk
  }

  const drain = async (): Promise<void> => {
    if (draining) return
    draining = true
    try {
      while (queue.length > 0) {
        const chunk = takeChunk()
        try {
          await opts.send(chunk.map((item) => item.event))
          backoffMs = 0
        } catch {
          queue = [...chunk, ...queue]
          for (const item of chunk) queueBytes += item.bytes
          backoffMs = backoffMs === 0 ? BACKOFF_START_MS : Math.min(backoffMs * 2, BACKOFF_MAX_MS)
          return
        }
      }
    } finally {
      draining = false
      schedule()
    }
  }

  const schedule = (): void => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void drain(), backoffMs > 0 ? backoffMs : cadenceMs)
  }

  schedule()

  return {
    push(event) {
      if (!disposed) enqueue(event)
    },
    setLive(live) {
      cadenceMs = live ? liveMs : idleMs
      schedule()
    },
    flushNow: drain,
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      void drain()
    },
  }
}
