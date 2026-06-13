import {readFileSync} from 'node:fs'
import {type H3, getQuery} from 'h3'
import type {HarnessAdapter} from '@devgent/protocol/harness-types'
import type {ChatSession} from '@devgent/protocol/chat-types'
import {readLock} from './lock.js'

// The session/history/stop routes — pure reads + a kill. History only exists for
// transcript-capable harnesses (via harness.history); others hydrate from the live thread.

// Mutable holder shared with the turn route, which updates sessionId as the stream reports it.
export type SessionState = {sessionId: string}

export type SessionRouteDeps = {
  cwd: string
  lockDir: string
  initialSessionId: string
  harness: HarnessAdapter
  state: SessionState
}

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

//   GET  /__pw/chat/session            → which session + lock state
//   GET  /__pw/chat/history?sessionId  → filtered prior turns (transcript harnesses)
//   POST /__pw/chat/stop               → SIGTERM the current lock holder
export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.get('/__pw/chat/session', () => {
    const lock = readLock(deps.lockDir)
    const sessionId = deps.state.sessionId || null
    const source: ChatSession['source'] = deps.state.sessionId ? (deps.initialSessionId ? 'agent' : 'chat') : 'new'
    const body: ChatSession = {sessionId, source, cwd: deps.cwd, lock: {held: lock.held, role: lock.role}}
    return body
  })

  app.get('/__pw/chat/history', (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const query = getQuery(event)
    const sessionId = typeof query.sessionId === 'string' ? query.sessionId : ''
    if (!sessionId) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, sessionId))
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  app.post('/__pw/chat/stop', () => {
    const lock = readLock(deps.lockDir)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    return {}
  })
}
