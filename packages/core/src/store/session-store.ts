import {z} from 'zod'
import {readJson, writeJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// Persists each chat session's harness resume token, keyed previewId → { ourSessionId:
// harnessToken }, so a session reopens across page reloads and dev-server restarts. Pane
// layout (which sessions, in what order) is client-side localStorage, not here. Lives next to
// the lock + system prompt in `<stateRoot>/.aidx/chat-sessions.json`.

const SessionMapSchema = z.record(z.string(), z.string())
const PreviewMapSchema = z.record(z.string(), SessionMapSchema)

function readAll(stateRoot: string): Record<string, Record<string, string>> {
  return readJson(statePaths(stateRoot).sessions, PreviewMapSchema, {})
}

// All { ourSessionId: harnessToken } for this preview, or {} if none recorded yet.
export function readSessions(stateRoot: string, previewId: string): Record<string, string> {
  if (!previewId) return {}
  return readAll(stateRoot)[previewId] ?? {}
}

// Upsert one session's harness token. No-op without all three values.
export function writeSession(stateRoot: string, previewId: string, sessionId: string, harnessToken: string): void {
  if (!previewId || !sessionId || !harnessToken) return
  const all = readAll(stateRoot)
  all[previewId] = {...(all[previewId] ?? {}), [sessionId]: harnessToken}
  writeJson(statePaths(stateRoot).sessions, all)
}

// Drop one session from a preview (called when a pane closes).
export function removeSession(stateRoot: string, previewId: string, sessionId: string): void {
  if (!previewId || !sessionId) return
  const all = readAll(stateRoot)
  const map = all[previewId]
  if (!map || !(sessionId in map)) return
  delete map[sessionId]
  all[previewId] = map
  writeJson(statePaths(stateRoot).sessions, all)
}
