import type {RrwebEvent} from '../shared/protocol.js'

export type Flusher = {
  push(event: RrwebEvent): void
  setLive(live: boolean): void
  flushNow(): Promise<void>
  dispose(): void
}

export function createFlusher(opts: {
  send: (events: RrwebEvent[]) => Promise<void>
  idleMs?: number
  liveMs?: number
}): Flusher {
  const idleMs = opts.idleMs ?? 5000
  const liveMs = opts.liveMs ?? 200
  let queue: RrwebEvent[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const drain = async (): Promise<void> => {
    if (!queue.length) return
    const batch = queue
    queue = []
    try {
      await opts.send(batch)
    } catch {
      queue = [...batch, ...queue]
    }
  }

  const schedule = (ms: number): void => {
    if (timer) clearInterval(timer)
    timer = setInterval(() => void drain(), ms)
  }

  schedule(idleMs)

  return {
    push(event) {
      if (!disposed) queue.push(event)
    },
    setLive(live) {
      schedule(live ? liveMs : idleMs)
    },
    flushNow: drain,
    dispose() {
      disposed = true
      if (timer) clearInterval(timer)
      void drain()
    },
  }
}
