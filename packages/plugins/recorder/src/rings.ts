import {Clock, Context, Effect, Layer, Ref, SubscriptionRef} from 'effect'
import {
  DEFAULT_RING_BYTES,
  appendToRing,
  emptyRing,
  readRingSince,
  readRingWindow,
  type RingLimits,
  type RingWindow,
} from './ring.js'
import type {RrwebEvent} from './rpc.js'

const CLIENT_RING_IDLE_MS = 30 * 60 * 1000
const MAX_CLIENT_RINGS = 8
const MAX_TOTAL_RING_BYTES = 64 * 1024 * 1024

export type ClientSummary = {id: string; lastSeen: number}

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
