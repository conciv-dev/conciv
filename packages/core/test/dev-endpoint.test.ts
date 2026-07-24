import {mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {readDevEndpoint, removeDevEndpoint, writeDevEndpoint} from '../src/lib/dev-endpoint.js'

describe('dev endpoint pairing file', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'conciv-dev-endpoint-'))
  })

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true})
  })

  it('writes an owner-only readable file and reads it back', () => {
    writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 4242})
    const endpoint = readDevEndpoint(dir)
    expect(endpoint).toEqual({apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 4242})
    const mode = statSync(join(dir, 'dev-endpoint.json')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('overwrites an existing file and re-applies the owner-only mode', () => {
    writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:1/native', token: null, pid: 1})
    writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599', token: null, pid: 2})
    expect(readDevEndpoint(dir)?.pid).toBe(2)
    const mode = statSync(join(dir, 'dev-endpoint.json')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('returns null for a missing file and for malformed contents', () => {
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(join(dir, 'dev-endpoint.json'), 'not json')
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(join(dir, 'dev-endpoint.json'), JSON.stringify({apiBase: '', token: null, pid: -1}))
    expect(readDevEndpoint(dir)).toBeNull()
  })

  it('removes the file only when the pid matches the owner', () => {
    writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599', token: null, pid: 100})
    removeDevEndpoint(dir, 999)
    expect(readDevEndpoint(dir)?.pid).toBe(100)
    removeDevEndpoint(dir, 100)
    expect(readDevEndpoint(dir)).toBeNull()
  })
})
