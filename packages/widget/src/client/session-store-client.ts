import {createSignal} from 'solid-js'
import {ChatSessionsSchema, type ChatSessionMeta} from '@conciv/protocol/chat-types'
import {createTransport} from '@conciv/api-client'

type Status = 'idle' | 'loading' | 'ready' | 'error'
const [fetched, setFetched] = createSignal<ChatSessionMeta[]>([])
const [status, setStatus] = createSignal<Status>('idle')

const [surfaces, setSurfaces] = createSignal<Record<string, ChatSessionMeta>>({})
let inflight: Promise<void> | null = null

function refetch(apiBase: string): Promise<void> {
  setStatus('loading')

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

export function loadSessions(apiBase: string): Promise<void> {
  return inflight ?? refetch(apiBase)
}

export function invalidateSessions(apiBase: string): Promise<void> {
  inflight = null
  return refetch(apiBase)
}

export function applyTitle(id: string, title: string): void {
  setFetched((p) => p.map((s) => (s.id === id ? {...s, title} : s)))
  setSurfaces((p) => (p[id] ? {...p, [id]: {...p[id], title}} : p))
}

export function makeSurfaceRow(id: string, name: string | null): ChatSessionMeta {
  return {
    id,
    title: name ?? 'New session',
    updatedAt: Date.now(),
    messageCount: 0,
    running: false,
    origin: 'conciv',
    usage: null,
  }
}

export function mergeSurface(id: string | null, row: ChatSessionMeta | null): void {
  setSurfaces((p) => {
    const n = {...p}
    if (id && row) n[id] = row
    return n
  })
}

export function sessions(): ChatSessionMeta[] {
  const byId = new Map(Object.values(surfaces()).map((s) => [s.id, s]))
  for (const s of fetched()) byId.set(s.id, s)
  return [...byId.values()].toSorted((a, b) => b.updatedAt - a.updatedAt)
}
export {status}
