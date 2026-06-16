import {type H3, getValidatedQuery} from 'h3'
import {z} from 'zod'
import {resolveHarnessModels} from '@aidx/harness'
import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import type {ChatSession, ChatModels} from '@aidx/protocol/chat-types'
import {readLock} from '../../store/lock.js'
import {readUsage} from '../../store/usage-store.js'
import {clearSession} from '../../store/session-store.js'
import {readFileOrEmpty} from '../../fs.js'

// The session/history/stop routes — pure reads + a kill. History only exists for
// transcript-capable harnesses (via harness.history); others hydrate from the live thread.

// Mutable holder shared with the turn route, which updates sessionId as the stream reports it.
export type SessionState = {sessionId: string}

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  initialSessionId: string
  harness: HarnessAdapter
  state: SessionState
}

//   GET  /api/chat/session            → which session + lock state
//   GET  /api/chat/history?sessionId  → filtered prior turns (transcript harnesses)
//   POST /api/chat/session/new        → forget the session so the next turn starts fresh
//   POST /api/chat/stop               → SIGTERM the current lock holder
export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.get('/api/chat/session', () => {
    const lock = readLock(deps.stateRoot)
    const sessionId = deps.state.sessionId || null
    const source: ChatSession['source'] = deps.state.sessionId ? (deps.initialSessionId ? 'agent' : 'chat') : 'new'
    const usage = sessionId ? readUsage(deps.stateRoot, sessionId) : null
    const harness = {
      id: deps.harness.id,
      name: deps.harness.displayName ?? deps.harness.id,
      canLaunch: Boolean(deps.harness.launch),
    }
    const body: ChatSession = {sessionId, source, cwd: deps.cwd, lock: {held: lock.held, role: lock.role}, usage, harness}
    return body
  })

  app.get('/api/chat/models', async (): Promise<ChatModels> => {
    const models = await resolveHarnessModels(deps.harness)
    const defaultModel = deps.harness.defaultModel ?? models[0]?.id ?? null
    return {models, defaultModel}
  })

  app.get('/api/chat/history', async (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const {sessionId} = await getValidatedQuery(event, HistoryQuerySchema)
    if (!sessionId) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, sessionId))
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  // Start a new session: drop the in-memory + persisted session id. Harness-agnostic — the next
  // POST /api/chat sees no session to resume and spawns fresh for any harness. The widget keeps the
  // prior thread on screen (with a boundary divider); only the resume pointer is forgotten.
  app.post('/api/chat/session/new', () => {
    deps.state.sessionId = ''
    clearSession(deps.stateRoot, deps.previewId)
    return {ok: true}
  })

  app.post('/api/chat/stop', () => {
    const lock = readLock(deps.stateRoot)
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

const HistoryQuerySchema = z.object({sessionId: z.string().optional()})
