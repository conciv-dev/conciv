import {type H3, getValidatedQuery} from 'h3'
import {z} from 'zod'
import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import type {ChatSession} from '@aidx/protocol/chat-types'
import {readLock} from '../../store/lock.js'
import {readUsage} from '../../store/usage-store.js'
import {readFileOrEmpty} from '../../fs.js'

// The session/history/stop routes — pure reads + a kill. History only exists for
// transcript-capable harnesses (via harness.history); others hydrate from the live thread.

// Mutable holder shared with the turn route, which updates sessionId as the stream reports it.
export type SessionState = {sessionId: string}

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  initialSessionId: string
  harness: HarnessAdapter
  state: SessionState
}

//   GET  /api/chat/session            → which session + lock state
//   GET  /api/chat/history?sessionId  → filtered prior turns (transcript harnesses)
//   POST /api/chat/stop               → SIGTERM the current lock holder
export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.get('/api/chat/session', () => {
    const lock = readLock(deps.stateRoot)
    const sessionId = deps.state.sessionId || null
    const source: ChatSession['source'] = deps.state.sessionId ? (deps.initialSessionId ? 'agent' : 'chat') : 'new'
    const usage = sessionId ? readUsage(deps.stateRoot, sessionId) : null
    const body: ChatSession = {sessionId, source, cwd: deps.cwd, lock: {held: lock.held, role: lock.role}, usage}
    return body
  })

  app.get('/api/chat/history', async (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const {sessionId} = await getValidatedQuery(event, HistoryQuerySchema)
    if (!sessionId) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, sessionId))
    return jsonl ? deps.harness.history.parse(jsonl) : []
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
