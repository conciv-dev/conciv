import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readSessions, writeSession, removeSession} from '../../src/store/session-store.js'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aidx-sess-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

describe('session store', () => {
  it('writes, reads, and removes per-preview session tokens', () => {
    const root = tmp()
    expect(readSessions(root, 'p1')).toEqual({})
    writeSession(root, 'p1', 'sess-a', 'claude-1')
    writeSession(root, 'p1', 'sess-b', 'claude-2')
    writeSession(root, 'p2', 'sess-a', 'claude-9')
    expect(readSessions(root, 'p1')).toEqual({'sess-a': 'claude-1', 'sess-b': 'claude-2'})
    expect(readSessions(root, 'p2')).toEqual({'sess-a': 'claude-9'})
    removeSession(root, 'p1', 'sess-a')
    expect(readSessions(root, 'p1')).toEqual({'sess-b': 'claude-2'})
  })

  it('ignores empty preview/session/token', () => {
    const root = tmp()
    writeSession(root, '', 'sess-a', 'claude-1')
    writeSession(root, 'p1', 'sess-a', '')
    expect(readSessions(root, 'p1')).toEqual({})
  })
})
