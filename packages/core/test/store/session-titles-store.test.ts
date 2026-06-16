import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readTitle, writeTitle} from '../../src/store/session-titles-store.js'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aidx-titles-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

describe('session titles store', () => {
  it('writes, reads, clears', async () => {
    const root = tmp()
    expect(readTitle(root, 'a')).toBeNull()
    await writeTitle(root, 'a', 'Checkout bug')
    expect(readTitle(root, 'a')).toBe('Checkout bug')
    await writeTitle(root, 'a', '')
    expect(readTitle(root, 'a')).toBeNull()
  })

  it('no lost update under concurrent writes', async () => {
    const root = tmp()
    await Promise.all([writeTitle(root, 'a', 'X'), writeTitle(root, 'b', 'Y'), writeTitle(root, 'a', 'Z')])
    expect(readTitle(root, 'a')).toBe('Z')
    expect(readTitle(root, 'b')).toBe('Y')
  })
})
