import {createSignal} from 'solid-js'
import type {ChatSessionMeta} from '@aidx/protocol/chat-types'
import {createChatApi} from './chat-api.js'

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
  inflight = createChatApi({apiBase})
    .sessions()
    .then((r) => {
      setFetched(r.sessions)
      setStatus(r.status === 'error' ? 'error' : 'ready')
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
// Optimistic title update applied to the cached rows.
export function applyTitle(id: string, title: string): void {
  setFetched((p) => p.map((s) => (s.id === id ? {...s, title} : s)))
}
// A surface contributes its current session so a brand-new one shows as one row before it's on disk.
export function mergeSurface(token: string | null, row: ChatSessionMeta | null): void {
  setSurfaces((p) => {
    const n = {...p}
    if (token && row) n[token] = row
    return n
  })
}
// Rendered list: fetched rows, with surface rows unioned in and deduped by id (fetched wins).
export function sessions(): ChatSessionMeta[] {
  const byId = new Map(Object.values(surfaces()).map((s) => [s.id, s]))
  for (const s of fetched()) byId.set(s.id, s)
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}
export {status}
