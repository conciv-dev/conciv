import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'

// Persists the chat's agent session id keyed by previewId, so the SAME chat thread reopens
// every time the dev server starts — not just across page reloads (which the
// dev server's in-memory state already covered) but across dev-server restarts too. Lives
// next to the lock + system prompt in `<lockDir>/.devgent/chat-sessions.json`.

// previewId → sessionId. Validated with Zod; a malformed file reads as empty.
const SessionMapSchema = z.record(z.string(), z.string())

function storePath(lockDir: string): string {
  return join(lockDir, '.devgent', 'chat-sessions.json')
}

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function readMap(lockDir: string): Record<string, string> {
  const raw = readFileOrEmpty(storePath(lockDir))
  if (!raw) return {}
  try {
    const result = SessionMapSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : {}
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
