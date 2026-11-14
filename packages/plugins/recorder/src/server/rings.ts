import {createEventRing, createSequence, type EventRing} from './ring.js'
import type {RrwebEvent} from '../shared/protocol.js'

const CLIENT_RING_IDLE_MS = 30 * 60 * 1000
const MAX_CLIENT_RINGS = 8
const MAX_TOTAL_RING_BYTES = 64 * 1024 * 1024

export type ClientSummary = {id: string; lastSeen: number}

export type ClientRings = {
  append(clientId: string, events: RrwebEvent[]): void
  clients(): ClientSummary[]
  window(range: {fromTs?: number; toTs?: number}, clientId: string): RrwebEvent[]
  since(cursor: number, clientId: string): RrwebEvent[]
  head(clientId: string): number
  appendCursor(): number
  clear(): void
  onAppend(listener: () => void): () => void
}

type Entry = {ring: EventRing; touchedAt: number; unsubscribe: () => void}

export function createClientRings(opts: {windowMs: number; maxBytes?: number}): ClientRings {
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  const sequence = createSequence()
  let appended = 0

  const drop = (clientId: string, entry: Entry): void => {
    entry.unsubscribe()
    entries.delete(clientId)
  }

  const byTouchTime = (): [string, Entry][] => [...entries].toSorted(([, a], [, b]) => a.touchedAt - b.touchedAt)

  const evictable = (): [string, Entry][] => byTouchTime().slice(0, -1)

  const totalBytes = (): number => [...entries.values()].reduce((sum, entry) => sum + entry.ring.bytes(), 0)

  const overBudget = (): boolean => entries.size > MAX_CLIENT_RINGS || totalBytes() > MAX_TOTAL_RING_BYTES

  const sweep = (): void => {
    const cutoff = Date.now() - CLIENT_RING_IDLE_MS
    for (const [clientId, entry] of entries) {
      if (entry.touchedAt >= cutoff) continue
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
    const ring = createEventRing({...opts, sequence})
    const unsubscribe = ring.onAppend(() => {
      for (const listener of listeners) listener()
    })
    const created = {ring, touchedAt: Date.now(), unsubscribe}
    entries.set(clientId, created)
    return created
  }

  const ringFor = (clientId: string): EventRing | null => entries.get(clientId)?.ring ?? null

  return {
    append(clientId, events) {
      const entry = entryFor(clientId)
      entry.touchedAt = Date.now()
      entry.ring.append(clientId, events)
      appended = Math.max(appended, entry.ring.head())
      sweep()
    },
    clients: () => byTouchTime().map(([id, entry]) => ({id, lastSeen: entry.touchedAt})),
    window: (range, clientId) => ringFor(clientId)?.window(range) ?? [],
    since: (cursor, clientId) => ringFor(clientId)?.since(cursor) ?? [],
    head: (clientId) => ringFor(clientId)?.head() ?? 0,
    appendCursor: () => appended,
    clear() {
      for (const entry of entries.values()) entry.unsubscribe()
      entries.clear()
    },
    onAppend(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
