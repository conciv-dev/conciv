import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {readFileOrEmpty} from '../fs.js'

// The shared `<lockDir>/.aidx/agent.lock` that serializes the chat agent and the agent's
// `iterate`: two processes appending to one agent session id at once corrupt its transcript,
// so only one may hold an agent run at a time. The file records the live holder's role +
// pid; a lock whose pid is dead is treated as free (crash recovery). Harness-agnostic.

export type LockRole = 'iterate' | 'chat'
export type LockState = {held: boolean; role: LockRole | null; pid: number | null}

// The on-disk lock-file shape. Validated with Zod (tolerant of extra/missing keys).
const LockFileSchema = z.object({role: z.enum(['iterate', 'chat']).optional(), pid: z.number().optional()}).loose()

function lockPath(lockDir: string): string {
  return join(lockDir, '.aidx', 'agent.lock')
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = existence check; throws ESRCH when the pid is gone
    return true
  } catch {
    return false
  }
}

// Parse + validate the lock file with Zod — no hand-rolled guards.
function parseLockFile(raw: string): {role?: LockRole; pid?: number} | null {
  try {
    const result = LockFileSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
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
  mkdirSync(join(lockDir, '.aidx'), {recursive: true})
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
