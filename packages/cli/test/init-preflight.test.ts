import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {preflight} from '../src/init/preflight.js'

const dir = (): string => mkdtempSync(join(tmpdir(), 'conciv-init-'))

describe('preflight', () => {
  it('refuses without package.json', async () => {
    expect(await preflight(dir(), false)).toEqual({
      ok: false,
      reason: 'no package.json here — run init from your app directory',
    })
  })
  it('accepts a clean repo (file committed, not just written)', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'package.json'), '{}')
    execFileSync('git', ['init'], {cwd})
    execFileSync('git', ['add', 'package.json'], {cwd})
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
    expect(await preflight(cwd, false)).toEqual({ok: true})
  })
  it('refuses untracked, staged, and unstaged dirt; force overrides each', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'package.json'), '{}')
    execFileSync('git', ['init'], {cwd})
    const refused = {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
    expect(await preflight(cwd, false)).toEqual(refused)
    execFileSync('git', ['add', 'package.json'], {cwd})
    expect(await preflight(cwd, false)).toEqual(refused)
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'seed'], {cwd})
    writeFileSync(join(cwd, 'package.json'), '{"name":"edited"}')
    expect(await preflight(cwd, false)).toEqual(refused)
    expect(await preflight(cwd, true)).toEqual({ok: true})
  })
})
