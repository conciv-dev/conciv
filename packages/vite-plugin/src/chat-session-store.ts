import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// Persists the chat's claude session id keyed by previewId, so the SAME chat thread reopens
// every time the dev server starts — not just across page reloads (which the
// dev server's in-memory state already covered) but across dev-server restarts too. Lives
// next to the lock + system prompt in `<lockDir>/.devgent/chat-sessions.json`.

type SessionMap = Record<string, string>

function storePath(lockDir: string): string {
  return join(lockDir, '.devgent', 'chat-sessions.json')
}

function readMap(lockDir: string): SessionMap {
  const raw = ((): string => {
    try {
      return readFileSync(storePath(lockDir), 'utf8')
    } catch {
      return ''
    }
  })()
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as SessionMap) : {}
  } catch {
    return {}
  }
}

// The persisted session id for this preview, or null if none recorded yet.
export function readSession(lockDir: string, previewId: string): string | null {
  if (!previewId) return null
  const id = readMap(lockDir)[previewId]
  return typeof id === 'string' && id ? id : null
}

// Record (or update) the live session id for this preview. No-op without a previewId.
export function writeSession(lockDir: string, previewId: string, sessionId: string): void {
  if (!previewId || !sessionId) return
  mkdirSync(join(lockDir, '.devgent'), {recursive: true})
  const next = {...readMap(lockDir), [previewId]: sessionId}
  writeFileSync(storePath(lockDir), JSON.stringify(next))
}
