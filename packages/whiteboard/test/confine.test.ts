import {mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {confineToRoot, isSecretPath, redactSnippet, SNIPPET_LIMIT} from '../src/anchor/confine.js'

const state: {root: string; outside: string; outsideSecret: string} = {root: '', outside: '', outsideSecret: ''}

beforeAll(() => {
  state.root = realpathSync(mkdtempSync(join(tmpdir(), 'mx-confine-')))
  state.outside = realpathSync(mkdtempSync(join(tmpdir(), 'mx-outside-')))
  state.outsideSecret = join(state.outside, 'secret.txt')
  writeFileSync(state.outsideSecret, 'top secret')
  mkdirSync(join(state.root, 'src'))
  writeFileSync(join(state.root, 'src', 'A.tsx'), 'export const A = () => null\n')
  symlinkSync(state.outsideSecret, join(state.root, 'escape.tsx'))
})

afterAll(() => {
  rmSync(state.root, {recursive: true, force: true})
  rmSync(state.outside, {recursive: true, force: true})
})

describe('confineToRoot', () => {
  it('returns the absolute realpath for a file inside the root', async () => {
    expect(await confineToRoot(state.root, 'src/A.tsx')).toBe(join(state.root, 'src', 'A.tsx'))
  })

  it('throws on a relative path that escapes the root', async () => {
    await expect(confineToRoot(state.root, '../../etc/passwd')).rejects.toThrow()
  })

  it('throws on a symlink that points outside the root (realpath, not resolve)', async () => {
    await expect(confineToRoot(state.root, 'escape.tsx')).rejects.toThrow()
  })

  it('throws on a file:// URL', async () => {
    await expect(confineToRoot(state.root, 'file:///etc/passwd')).rejects.toThrow()
  })
})

describe('isSecretPath', () => {
  it('flags env files, keys, and certs', () => {
    expect(isSecretPath('.env')).toBe(true)
    expect(isSecretPath('config/.env.local')).toBe(true)
    expect(isSecretPath('id_rsa')).toBe(true)
    expect(isSecretPath('certs/k.pem')).toBe(true)
    expect(isSecretPath('secrets/a.key')).toBe(true)
  })
  it('passes ordinary source files', () => {
    expect(isSecretPath('src/App.tsx')).toBe(false)
    expect(isSecretPath('lib/keyboard.ts')).toBe(false)
  })
})

describe('redactSnippet', () => {
  it('strips KEY=value secrets and known token prefixes', () => {
    const out = redactSnippet('const AWS_SECRET=AKIAIOSFODNN7EXAMPLE\nconst k = "sk_live_abcdef0123456789"')
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE')
    expect(out).not.toContain('sk_live_abcdef0123456789')
  })
  it('strips a JWT and a Bearer token', () => {
    const jwt = 'eyJhbGciOiJIUzI1Ni9.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fw'
    const out = redactSnippet(`auth: Bearer abcdef0123456789\ntoken=${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).not.toContain('Bearer abcdef0123456789')
  })
  it('truncates to the snippet limit', () => {
    expect(redactSnippet('x'.repeat(3_000)).length).toBe(SNIPPET_LIMIT)
  })
})
