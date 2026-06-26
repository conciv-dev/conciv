import {createSignal} from 'solid-js'
import {ChatSessionsSchema, type ChatSessionMeta} from '@mandarax/protocol/chat-types'
import {createTransport} from '@mandarax/api-client'

// One shared client-side cache of the session list, so every mounted SessionSelector (modal pill +
// each qt pane bar) reads the same rows from a single fetch. Surfaces contribute their just-born
// session before it lands on disk, so a brand-new session shows as one row immediately.

type Status = 'idle' | 'loading' | 'ready' | 'error'
const [fetched, setFetched] = createSignal<ChatSessionMeta[]>([])
const [status, setStatus] = createSignal<Status>('idle')
// Surfaces' just-born sessions (header id known locally before the file flushes), keyed by token.
const [surfaces, setSurfaces] = createSignal<Record<string, ChatSessionMeta>>({})
let inflight: Promise<void> | null = null

function refetch(apiBase: string): Promise<void> {
  setStatus('loading')
  // The list is not session-scoped, so a header-less transport is enough. A throw (404/network) → error.
  const list = createTransport({apiBase}).route({
    method: 'GET',
    path: '/api/chat/sessions',
    response: ChatSessionsSchema,
  })
  inflight = list()
    .then((r) => {
      setFetched(r.sessions)
      setStatus('ready')
    })
    .catch(() => {
      setStatus('error')
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

// Load once (coalesced): return the in-flight fetch if one is running, else start one.
export function loadSessions(apiBase: string): Promise<void> {
  return inflight ?? refetch(apiBase)
}
// Force a fresh fetch (turn-end, pane add/close).
export function invalidateSessions(apiBase: string): Promise<void> {
  inflight = null
  return refetch(apiBase)
}
// Optimistic title update applied to the cached rows AND any surface row (a just-adopted/born
// session shows only as a surface row until the next list refetch).
export function applyTitle(id: string, title: string): void {
  setFetched((p) => p.map((s) => (s.id === id ? {...s, title} : s)))
  setSurfaces((p) => (p[id] ? {...p, [id]: {...p[id], title}} : p))
}
// A provisional list row for a just-born session (modal or pane), keyed by our id, shown until the
// real list refetches.
export function makeSurfaceRow(id: string, name: string | null): ChatSessionMeta {
  return {
    id,
    title: name ?? 'New session',
    updatedAt: Date.now(),
    messageCount: 0,
    running: false,
    origin: 'mandarax',
    usage: null,
  }
}
// A surface contributes its current session so a brand-new one shows as one row before it's on disk.
export function mergeSurface(id: string | null, row: ChatSessionMeta | null): void {
  setSurfaces((p) => {
    const n = {...p}
    if (id && row) n[id] = row
    return n
  })
}
// Rendered list: fetched rows, with surface rows unioned in and deduped by id (fetched wins).
export function sessions(): ChatSessionMeta[] {
  const byId = new Map(Object.values(surfaces()).map((s) => [s.id, s]))
  for (const s of fetched()) byId.set(s.id, s)
  return [...byId.values()].toSorted((a, b) => b.updatedAt - a.updatedAt)
}
export {status}
