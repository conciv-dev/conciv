import {type H3} from 'h3'
import {resolveHarnessModels} from '@aidx/harness'
import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import type {ChatSession, ChatModels} from '@aidx/protocol/chat-types'
import {DEFAULT_SESSION_ID} from '@aidx/protocol/chat-types'
import {readLock} from '../../store/lock.js'
import {readUsage} from '../../store/usage-store.js'
import {removeSession} from '../../store/session-store.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'

// The session/models/history/stop routes — pure reads + a kill. History only exists for
// transcript-capable harnesses (via harness.history); others hydrate from the live thread. Every
// route resolves its target from the AIDX_SESSION_HEADER (the canonical header id).

// Mutable per-session holder, created by chat.ts's sessionFor and shared with the turn route.
export type SessionState = {harnessSessionId: string}
export type SessionLookup = (sessionId: string) => SessionState

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  initialSessionId: string
  harness: HarnessAdapter
  sessionFor: SessionLookup
}

// The harness session name from its transcript, or null (no token / no name hook / no file).
function nameFor(deps: SessionRouteDeps, token: string): string | null {
  const hist = deps.harness.history
  if (!token || !hist?.nameFromTranscript) return null
  const raw = readFileOrEmpty(hist.transcriptPath(deps.cwd, token))
  return raw ? hist.nameFromTranscript(raw) : null
}

//   GET    /api/chat/session      → which session + harness id/name + lock + usage + harness identity
//   GET    /api/chat/models       → the active harness's models + the id to pre-select
//   GET    /api/chat/history      → prior turns for the header session (transcript harnesses)
//   POST   /api/chat/session/new  → forget the header session so its next turn starts fresh
//   DELETE /api/chat/session      → forget a session (pane closed): kill + drop its token
//   POST   /api/chat/stop         → SIGTERM the header session's lock holder
export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.get('/api/chat/session', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const token = deps.sessionFor(sessionId).harnessSessionId
    const lock = readLock(deps.stateRoot, sessionId)
    const adopted = sessionId === DEFAULT_SESSION_ID && Boolean(deps.initialSessionId)
    const source: ChatSession['source'] = token ? (adopted ? 'agent' : 'chat') : 'new'
    const harness = {
      id: deps.harness.id,
      name: deps.harness.displayName ?? deps.harness.id,
      canLaunch: Boolean(deps.harness.launch),
    }
    const body: ChatSession = {
      sessionId,
      harnessId: token || null,
      name: nameFor(deps, token),
      source,
      cwd: deps.cwd,
      lock: {held: lock.held, role: lock.role},
      usage: readUsage(deps.stateRoot, sessionId),
      harness,
    }
    return body
  })

  app.get('/api/chat/models', async (): Promise<ChatModels> => {
    const models = await resolveHarnessModels(deps.harness)
    const defaultModel = deps.harness.defaultModel ?? models[0]?.id ?? null
    return {models, defaultModel}
  })

  app.get('/api/chat/history', (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const token = deps.sessionFor(sessionId).harnessSessionId
    if (!token) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, token))
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  // Start a new session for this header id: drop the in-memory + persisted token. The widget keeps
  // the prior thread on screen (with a boundary divider); only the resume pointer is forgotten.
  app.post('/api/chat/session/new', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    deps.sessionFor(sessionId).harnessSessionId = ''
    removeSession(deps.stateRoot, deps.previewId, sessionId)
    return {ok: true}
  })

  // Forget a session entirely (a pane closed): kill its live turn and drop its persisted token.
  app.delete('/api/chat/session', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const lock = readLock(deps.stateRoot, sessionId)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    removeSession(deps.stateRoot, deps.previewId, sessionId)
    return {ok: true}
  })

  app.post('/api/chat/stop', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const lock = readLock(deps.stateRoot, sessionId)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    return {ok: true}
  })
}
