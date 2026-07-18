import {createEventRing, type EventRing} from './ring.js'
import type {RrwebEvent} from '../shared/protocol.js'

const CLIENT_RING_IDLE_MS = 30 * 60 * 1000
const MAX_CLIENT_RINGS = 8
const MAX_TOTAL_RING_BYTES = 64 * 1024 * 1024

export type ClientRings = {
  append(clientId: string, events: RrwebEvent[]): void
  window(range?: {fromTs?: number; toTs?: number}, clientId?: string): RrwebEvent[]
  since(cursor: number, clientId?: string): RrwebEvent[]
  head(clientId?: string): number
  lastTs(): number
  clear(): void
  onAppend(listener: (lastTs: number) => void): () => void
}

type Entry = {ring: EventRing; touchedAt: number; unsubscribe: () => void}

export function createClientRings(opts: {windowMs: number; maxBytes?: number}): ClientRings {
  const entries = new Map<string, Entry>()
  const listeners = new Set<(lastTs: number) => void>()
  let active: string | null = null

  const drop = (clientId: string, entry: Entry): void => {
    entry.unsubscribe()
    entries.delete(clientId)
  }

  const evictable = (): [string, Entry][] =>
    [...entries].filter(([clientId]) => clientId !== active).toSorted(([, a], [, b]) => a.touchedAt - b.touchedAt)

  const totalBytes = (): number => [...entries.values()].reduce((sum, entry) => sum + entry.ring.bytes(), 0)

  const overBudget = (): boolean => entries.size > MAX_CLIENT_RINGS || totalBytes() > MAX_TOTAL_RING_BYTES

  const sweep = (): void => {
    const cutoff = Date.now() - CLIENT_RING_IDLE_MS
    for (const [clientId, entry] of entries) {
      if (entry.touchedAt >= cutoff || clientId === active) continue
      drop(clientId, entry)
    }
    for (const [clientId, entry] of evictable()) {
      if (!overBudget()) break
      drop(clientId, entry)
    }
  }

  const entryFor = (clientId: string): Entry => {
    const existing = entries.get(clientId)
    if (existing) return existing
    const ring = createEventRing(opts)
    const unsubscribe = ring.onAppend((lastTs) => {
      for (const listener of listeners) listener(lastTs)
    })
    const created = {ring, touchedAt: Date.now(), unsubscribe}
    entries.set(clientId, created)
    return created
  }

  const resolve = (clientId?: string): EventRing | null => {
    const key = clientId ?? active
    return key ? (entries.get(key)?.ring ?? null) : null
  }

  return {
    append(clientId, events) {
      const entry = entryFor(clientId)
      entry.touchedAt = Date.now()
      active = clientId
      entry.ring.append(clientId, events)
      sweep()
    },
    window: (range = {}, clientId) => resolve(clientId)?.window(range) ?? [],
    since: (cursor, clientId) => resolve(clientId)?.since(cursor) ?? [],
    head: (clientId) => resolve(clientId)?.head() ?? 0,
    lastTs: () => resolve()?.lastTs() ?? 0,
    clear() {
      for (const entry of entries.values()) entry.unsubscribe()
      entries.clear()
      active = null
    },
    onAppend(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
