import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {acquireLock, readLock, releaseLock, readLocks} from '../../src/store/lock.js'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-lock-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

describe('per-session lock', () => {
  it('locks are independent per session id', () => {
    const root = tmp()
    expect(acquireLock(root, 'sess-a', 'chat', process.pid)).toBe(true)
    expect(readLock(root, 'sess-a').held).toBe(true)
    // A different session is unaffected.
    expect(readLock(root, 'sess-b').held).toBe(false)
    expect(acquireLock(root, 'sess-b', 'chat', process.pid)).toBe(true)
    releaseLock(root, 'sess-a')
    expect(readLock(root, 'sess-a').held).toBe(false)
    expect(readLock(root, 'sess-b').held).toBe(true)
  })

  it('a second acquire on a held session fails (atomic, no double-acquire)', () => {
    const root = tmp()
    expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
    // process.pid is alive → the lock is genuinely held → second acquire must fail.
    expect(acquireLock(root, 's', 'iterate', process.pid)).toBe(false)
    releaseLock(root, 's')
    expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
  })

  it('reclaims a stale lock whose holder pid is dead', () => {
    const root = tmp()
    const deadPid = 2 ** 31 - 1 // a pid that is virtually certain to be dead
    // Seed a stale lock by acquiring with a dead pid (readLock treats it as free).
    expect(acquireLock(root, 's', 'chat', deadPid)).toBe(true)
    expect(readLock(root, 's').held).toBe(false) // dead pid ⇒ reads as free/stale
    // A live caller can reclaim it.
    expect(acquireLock(root, 's', 'chat', process.pid)).toBe(true)
    expect(readLock(root, 's').held).toBe(true)
  })

  it('enumerates live lock keys (header ids), not the old global name', () => {
    const root = tmp()
    acquireLock(root, 'h-a', 'chat', process.pid)
    acquireLock(root, 'h-b', 'iterate', process.pid)
    expect(
      readLocks(root)
        .map((l) => l.key)
        .sort(),
    ).toEqual(['h-a', 'h-b'])
  })
})
