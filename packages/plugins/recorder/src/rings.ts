import {Clock, Context, Effect, Layer, Ref, SubscriptionRef} from 'effect'
import {jsonByteLength, type RrwebEvent} from './rpc.js'

type Stored = {readonly event: RrwebEvent; readonly bytes: number; readonly seq: number}

type RingWindow = {readonly stored: readonly Stored[]; readonly bytes: number; readonly head: number}

type RingLimits = {readonly windowMs: number; readonly maxBytes: number}

const DEFAULT_RING_BYTES = 16 * 1024 * 1024

const emptyRing: RingWindow = {stored: [], bytes: 0, head: 0}

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

function appendToRing(
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

function readRingWindow(ring: RingWindow, range: {fromTs?: number; toTs?: number} = {}): RrwebEvent[] {
  const toTs = range.toTs ?? Number.POSITIVE_INFINITY
  const inTail = ring.stored.filter((item) => item.event.timestamp <= toTs)
  const fromTs = range.fromTs ?? Number.NEGATIVE_INFINITY
  const withMeta = (index: number): number => (index > 0 && inTail[index - 1]?.event.type === 4 ? index - 1 : index)
  const anchored = inTail.findLastIndex((item) => item.event.type === 2 && item.event.timestamp <= fromTs)
  if (anchored >= 0) return inTail.slice(withMeta(anchored)).map((item) => item.event)
  const next = inTail.findIndex((item) => item.event.type === 2 && item.event.timestamp > fromTs)
  return next >= 0 ? inTail.slice(withMeta(next)).map((item) => item.event) : []
}

function readRingSince(ring: RingWindow, cursor: number): RrwebEvent[] {
  return ring.stored.filter((item) => item.seq > cursor).map((item) => item.event)
}

const CLIENT_RING_IDLE_MS = 30 * 60 * 1000
const MAX_CLIENT_RINGS = 8
const MAX_TOTAL_RING_BYTES = 64 * 1024 * 1024

type ClientSummary = {id: string; lastSeen: number}

type ClientRing = {readonly id: string; readonly touchedAt: number; readonly ring: RingWindow}

type RingsState = {readonly clients: readonly ClientRing[]; readonly seq: number}

type Range = {fromTs?: number; toTs?: number}

export type ClientRingsInterface = {
  readonly append: (clientId: string, events: readonly RrwebEvent[]) => Effect.Effect<number>
  readonly clients: Effect.Effect<ClientSummary[]>
  readonly window: (range: Range, clientId: string) => Effect.Effect<RrwebEvent[]>
  readonly since: (cursor: number, clientId: string) => Effect.Effect<RrwebEvent[]>
  readonly head: (clientId: string) => Effect.Effect<number>
  readonly clear: Effect.Effect<void>
  readonly appendCursor: SubscriptionRef.SubscriptionRef<number>
}

export const ClientRings = Context.Service<ClientRingsInterface>('@conciv/plugin-recorder/ClientRings')

function totalBytes(clients: readonly ClientRing[]): number {
  return clients.reduce((sum, client) => sum + client.ring.bytes, 0)
}

function withinBudget(clients: readonly ClientRing[]): readonly ClientRing[] {
  const overBudget = clients.length > MAX_CLIENT_RINGS || totalBytes(clients) > MAX_TOTAL_RING_BYTES
  if (!overBudget || clients.length <= 1) return clients
  return withinBudget(clients.slice(1))
}

function sweep(clients: readonly ClientRing[], now: number): readonly ClientRing[] {
  const fresh = clients.filter((client) => client.touchedAt >= now - CLIENT_RING_IDLE_MS)
  return withinBudget(fresh.toSorted((a, b) => a.touchedAt - b.touchedAt))
}

function appendClient(
  state: RingsState,
  clientId: string,
  events: readonly RrwebEvent[],
  now: number,
  limits: RingLimits,
) {
  const existing = state.clients.find((client) => client.id === clientId)
  const ring = appendToRing(existing?.ring ?? emptyRing, events, state.seq + 1, limits)
  const others = state.clients.filter((client) => client.id !== clientId)
  const clients = sweep([...others, {id: clientId, touchedAt: now, ring}], now)
  return {head: ring.head, state: {clients, seq: state.seq + events.length}}
}

function readClient(state: RingsState, clientId: string): RingWindow | undefined {
  return state.clients.find((client) => client.id === clientId)?.ring
}

export function clientRingsLayer(options: {readonly windowMs: number}) {
  return Layer.effect(
    ClientRings,
    Effect.gen(function* () {
      const limits: RingLimits = {windowMs: options.windowMs, maxBytes: DEFAULT_RING_BYTES}
      const state = yield* Ref.make<RingsState>({clients: [], seq: 0})
      const appendCursor = yield* SubscriptionRef.make(0)
      const read = <Value>(pick: (current: RingsState) => Value) => Effect.map(Ref.get(state), pick)
      return ClientRings.of({
        append: Effect.fn('recorder.rings.append')(function* (clientId, events) {
          const now = yield* Clock.currentTimeMillis
          const head = yield* Ref.modify(state, (current) => {
            const appended = appendClient(current, clientId, events, now, limits)
            return [appended.head, appended.state]
          })
          yield* SubscriptionRef.update(appendCursor, (cursor) => Math.max(cursor, head))
          return head
        }),
        clients: read((current) =>
          current.clients
            .toSorted((a, b) => a.touchedAt - b.touchedAt)
            .map((client) => ({id: client.id, lastSeen: client.touchedAt})),
        ),
        window: (range, clientId) =>
          read((current) => readRingWindow(readClient(current, clientId) ?? emptyRing, range)),
        since: (cursor, clientId) =>
          read((current) => readRingSince(readClient(current, clientId) ?? emptyRing, cursor)),
        head: (clientId) => read((current) => readClient(current, clientId)?.head ?? 0),
        clear: Ref.update(state, (current) => ({...current, clients: []})),
        appendCursor,
      })
    }),
  )
}
