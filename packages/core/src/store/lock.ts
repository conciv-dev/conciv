import {rmSync} from 'node:fs'
import {z} from 'zod'
import {readJson, writeJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// The shared `<stateRoot>/.aidx/agent.lock` that serializes the chat agent and the agent's
// `iterate`: two processes appending to one agent session id at once corrupt its transcript,
// so only one may hold an agent run at a time. The file records the live holder's role +
// pid; a lock whose pid is dead is treated as free (crash recovery). Harness-agnostic.

export type LockRole = 'iterate' | 'chat'
export type LockState = {held: boolean; role: LockRole | null; pid: number | null}

// The on-disk lock-file shape. Validated with Zod (tolerant of extra/missing keys).
const LockFileSchema = z.object({role: z.enum(['iterate', 'chat']).optional(), pid: z.number().optional()}).loose()

export function readLock(stateRoot: string): LockState {
  const parsed = readJson(statePaths(stateRoot).lock, LockFileSchema, {})
  if (typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) return {held: false, role: null, pid: null}
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

// Acquire if free or stale. Returns false if a live holder already owns it.
export function acquireLock(stateRoot: string, role: LockRole, pid: number): boolean {
  if (readLock(stateRoot).held) return false
  writeJson(statePaths(stateRoot).lock, {role, pid, startedTs: Date.now()})
  return true
}

export function releaseLock(stateRoot: string): void {
  try {
    rmSync(statePaths(stateRoot).lock)
  } catch {
    // already gone
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = existence check; throws ESRCH when the pid is gone
    return true
  } catch {
    return false
  }
}
