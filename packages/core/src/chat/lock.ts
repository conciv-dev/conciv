import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

// The shared `<lockDir>/.devgent/agent.lock` that serializes the chat agent and the agent's
// `iterate`: two processes appending to one agent session id at once corrupt its transcript,
// so only one may hold an agent run at a time. The file records the live holder's role +
// pid; a lock whose pid is dead is treated as free (crash recovery). Harness-agnostic.

export type LockRole = 'iterate' | 'chat'
export type LockState = {held: boolean; role: LockRole | null; pid: number | null}

function lockPath(lockDir: string): string {
  return join(lockDir, '.devgent', 'agent.lock')
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = existence check; throws ESRCH when the pid is gone
    return true
  } catch {
    return false
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

// Parse the lock file into a narrowed shape via guards — no cast, no IIFE.
function parseLockFile(raw: string): {role: LockRole | undefined; pid: number | undefined} | null {
  try {
    const v: unknown = JSON.parse(raw)
    if (!isRecord(v)) return null
    const role = v.role === 'iterate' || v.role === 'chat' ? v.role : undefined
    const pid = typeof v.pid === 'number' ? v.pid : undefined
    return {role, pid}
  } catch {
    return null
  }
}

export function readLock(lockDir: string): LockState {
  const raw = readFileOrEmpty(lockPath(lockDir))
  if (!raw) return {held: false, role: null, pid: null}
  const parsed = parseLockFile(raw)
  if (!parsed || typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) {
    return {held: false, role: null, pid: null}
  }
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

// Acquire if free or stale. Returns false if a live holder already owns it.
export function acquireLock(lockDir: string, role: LockRole, pid: number): boolean {
  if (readLock(lockDir).held) return false
  mkdirSync(join(lockDir, '.devgent'), {recursive: true})
  writeFileSync(lockPath(lockDir), JSON.stringify({role, pid, startedTs: Date.now()}))
  return true
}

export function releaseLock(lockDir: string): void {
  try {
    rmSync(lockPath(lockDir))
  } catch {
    // already gone
  }
}
