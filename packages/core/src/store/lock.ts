import {rmSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {z} from 'zod'
import {readJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

export type LockRole = 'iterate' | 'chat'
export type LockState = {held: boolean; role: LockRole | null; pid: number | null}

const LockFileSchema = z.object({role: z.enum(['iterate', 'chat']).optional(), pid: z.number().optional()}).loose()

export function readLock(stateRoot: string, sessionId: string): LockState {
  const parsed = readJson(statePaths(stateRoot).lockFor(sessionId), LockFileSchema, {})
  if (typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) return {held: false, role: null, pid: null}
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

export function acquireLock(stateRoot: string, sessionId: string, role: LockRole, pid: number): boolean {
  const path = statePaths(stateRoot).lockFor(sessionId)
  const body = JSON.stringify({role, pid, startedTs: Date.now()})
  mkdirSync(dirname(path), {recursive: true})
  try {
    writeFileSync(path, body, {flag: 'wx'})
    return true
  } catch {
    if (readLock(stateRoot, sessionId).held) return false
    try {
      writeFileSync(path, body)
      return true
    } catch {
      return false
    }
  }
}

export function updateLockPid(stateRoot: string, sessionId: string, role: LockRole, pid: number): void {
  writeFileSync(statePaths(stateRoot).lockFor(sessionId), JSON.stringify({role, pid, startedTs: Date.now()}))
}

export function releaseLock(stateRoot: string, sessionId: string): void {
  try {
    rmSync(statePaths(stateRoot).lockFor(sessionId))
  } catch {}
}

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
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
