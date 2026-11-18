import {jsonByteLength, type RrwebEvent} from './rpc.js'

type Stored = {readonly event: RrwebEvent; readonly bytes: number; readonly seq: number}

export type RingWindow = {readonly stored: readonly Stored[]; readonly bytes: number; readonly head: number}

export type RingLimits = {readonly windowMs: number; readonly maxBytes: number}

export const DEFAULT_RING_BYTES = 16 * 1024 * 1024

export const emptyRing: RingWindow = {stored: [], bytes: 0, head: 0}

function countEvicted(ring: RingWindow, limits: RingLimits): {readonly dropTo: number; readonly bytes: number} {
  const newest = ring.stored.at(-1)?.event.timestamp ?? 0
  return ring.stored.slice(0, -1).reduce(
    (evicted, item) => {
      if (evicted.done) return evicted
      const tooOld = newest - item.event.timestamp > limits.windowMs
      if (!tooOld && evicted.bytes <= limits.maxBytes) return {...evicted, done: true}
      return {dropTo: evicted.dropTo + 1, bytes: evicted.bytes - item.bytes, done: false}
    },
    {dropTo: 0, bytes: ring.bytes, done: false},
  )
}

function evict(ring: RingWindow, limits: RingLimits): RingWindow {
  const evicted = countEvicted(ring, limits)
  if (evicted.dropTo === 0) return ring
  return {...ring, stored: ring.stored.slice(evicted.dropTo), bytes: evicted.bytes}
}

export function appendToRing(
  ring: RingWindow,
  events: readonly RrwebEvent[],
  firstSeq: number,
  limits: RingLimits,
): RingWindow {
  if (!events.length) return ring
  const incoming = events
    .toSorted((a, b) => a.timestamp - b.timestamp)
    .map((event, index) => ({event, bytes: jsonByteLength(event), seq: firstSeq + index}))
  const tailAppend = (incoming[0]?.event.timestamp ?? 0) >= (ring.stored.at(-1)?.event.timestamp ?? 0)
  const merged = [...ring.stored, ...incoming]
  const stored = tailAppend ? merged : merged.toSorted((a, b) => a.event.timestamp - b.event.timestamp || a.seq - b.seq)
  const bytes = ring.bytes + incoming.reduce((sum, item) => sum + item.bytes, 0)
  return evict({stored, bytes, head: firstSeq + incoming.length - 1}, limits)
}

export function readRingWindow(ring: RingWindow, range: {fromTs?: number; toTs?: number} = {}): RrwebEvent[] {
  const toTs = range.toTs ?? Number.POSITIVE_INFINITY
  const inTail = ring.stored.filter((item) => item.event.timestamp <= toTs)
  const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY
  const withMeta = (index: number): number => (index > 0 && inTail[index - 1]?.event.type === 4 ? index - 1 : index)
  const anchored = inTail.findLastIndex((item) => item.event.type === 2 && item.event.timestamp <= fromTs)
  if (anchored >= 0) return inTail.slice(withMeta(anchored)).map((item) => item.event)
  const next = inTail.findIndex((item) => item.event.type === 2 && item.event.timestamp > fromTs)
  return next >= 0 ? inTail.slice(withMeta(next)).map((item) => item.event) : []
}

export function readRingSince(ring: RingWindow, cursor: number): RrwebEvent[] {
  return ring.stored.filter((item) => item.seq > cursor).map((item) => item.event)
}
