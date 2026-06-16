import {rmSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {z} from 'zod'
import {readJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// A per-session `<stateRoot>/.aidx/agent.<sessionId>.lock` that serializes one session's turns:
// two processes appending to the same harness session at once corrupt its transcript, so only one
// run per session may be live at a time (distinct sessions run in parallel). The file records the
// holder's role + pid; a lock whose pid is dead is treated as free (crash recovery). Harness-agnostic.

export type LockRole = 'iterate' | 'chat'
export type LockState = {held: boolean; role: LockRole | null; pid: number | null}

// The on-disk lock-file shape. Validated with Zod (tolerant of extra/missing keys).
const LockFileSchema = z.object({role: z.enum(['iterate', 'chat']).optional(), pid: z.number().optional()}).loose()

export function readLock(stateRoot: string, sessionId: string): LockState {
  const parsed = readJson(statePaths(stateRoot).lockFor(sessionId), LockFileSchema, {})
  if (typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) return {held: false, role: null, pid: null}
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

// Acquire atomically: O_EXCL create is the mutex. If the file already exists, reclaim it only when
// the recorded pid is dead (crash recovery); a live holder means we lost the race → false.
export function acquireLock(stateRoot: string, sessionId: string, role: LockRole, pid: number): boolean {
  const path = statePaths(stateRoot).lockFor(sessionId)
  const body = JSON.stringify({role, pid, startedTs: Date.now()})
  mkdirSync(dirname(path), {recursive: true})
  try {
    writeFileSync(path, body, {flag: 'wx'}) // wx = create + fail if exists (atomic)
    return true
  } catch {
    // Exists. Reclaim iff the current holder is stale (dead pid); else we lost the race.
    if (readLock(stateRoot, sessionId).held) return false
    try {
      writeFileSync(path, body) // overwrite the stale lock
      return true
    } catch {
      return false
    }
  }
}

// Re-point an already-held lock at a new pid (the spawned child) without releasing it, so the stop
// route's process.kill targets the child rather than the up-front holder (the dev server). The caller
// must already hold the lock; this overwrites in place, it does not contend.
export function updateLockPid(stateRoot: string, sessionId: string, role: LockRole, pid: number): void {
  writeFileSync(statePaths(stateRoot).lockFor(sessionId), JSON.stringify({role, pid, startedTs: Date.now()}))
}

export function releaseLock(stateRoot: string, sessionId: string): void {
  try {
    rmSync(statePaths(stateRoot).lockFor(sessionId))
  } catch {
    // already gone
  }
}

// Enumerate live session locks (header ids) by scanning the `agent.<id>.lock` files — drives the
// selector's running indicator. Dead-pid (stale) locks are filtered out via readLock.
export function readLocks(stateRoot: string): {key: string; role: LockRole | null; pid: number}[] {
  let files: string[]
  try {
    files = readdirSync(statePaths(stateRoot).dir).filter((f) => /^agent\..+\.lock$/.test(f))
  } catch {
    return []
  }
  const out: {key: string; role: LockRole | null; pid: number}[] = []
  for (const f of files) {
    const key = f.replace(/^agent\./, '').replace(/\.lock$/, '')
    const lock = readLock(stateRoot, key)
    if (lock.held && lock.pid) out.push({key, role: lock.role, pid: lock.pid})
  }
  return out
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = existence check; throws ESRCH when the pid is gone
    return true
  } catch {
    return false
  }
}
