import {z} from 'zod'
import {readJson, writeJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// Persists the chat's agent session id keyed by previewId, so the SAME chat thread reopens
// every time the dev server starts — not just across page reloads (which the dev server's
// in-memory state already covered) but across dev-server restarts too. Lives next to the lock
// + system prompt in `<stateRoot>/.aidx/chat-sessions.json`.

// previewId → sessionId. Validated with Zod; a malformed file reads as empty.
const SessionMapSchema = z.record(z.string(), z.string())

function readMap(stateRoot: string): Record<string, string> {
  return readJson(statePaths(stateRoot).sessions, SessionMapSchema, {})
}

// The persisted session id for this preview, or null if none recorded yet.
export function readSession(stateRoot: string, previewId: string): string | null {
  if (!previewId) return null
  const id = readMap(stateRoot)[previewId]
  return typeof id === 'string' && id ? id : null
}

// Record (or update) the live session id for this preview. No-op without a previewId.
export function writeSession(stateRoot: string, previewId: string, sessionId: string): void {
  if (!previewId || !sessionId) return
  writeJson(statePaths(stateRoot).sessions, {...readMap(stateRoot), [previewId]: sessionId})
}

// Forget this preview's persisted session id (the "new session" reset). The next turn then spawns
// fresh (no resume) and records its own new id. No-op without a previewId.
export function clearSession(stateRoot: string, previewId: string): void {
  if (!previewId) return
  const {[previewId]: _gone, ...rest} = readMap(stateRoot)
  writeJson(statePaths(stateRoot).sessions, rest)
}
