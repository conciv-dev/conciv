import {mkdtemp, mkdir, symlink, writeFile} from 'node:fs/promises'
import {realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {SNIPPET_LIMIT, confineToRoot, isSecretPath, redactSnippet} from '../src/anchor/confine.js'

describe('confineToRoot', () => {
  it('resolves a file inside the root to its realpath', async () => {
    const root = await mkdtemp(join(tmpdir(), 'confine-'))
    await writeFile(join(root, 'app.ts'), 'export const x = 1\n')
    const resolved = await confineToRoot(root, 'app.ts')
    expect(resolved).toBe(join(await realpath(root), 'app.ts'))
  })

  it('rejects a path that escapes the root with ..', async () => {
    const base = await mkdtemp(join(tmpdir(), 'confine-'))
    const root = join(base, 'root')
    await mkdir(root)
    await writeFile(join(base, 'outside.ts'), 'leak\n')
    await expect(confineToRoot(root, '../outside.ts')).rejects.toThrow(/escapes project root/)
  })

  it('rejects a symlink whose target sits outside the root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'confine-'))
    const root = join(base, 'root')
    const outside = join(base, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(join(outside, 'secret.ts'), 'leak\n')
    await symlink(join(outside, 'secret.ts'), join(root, 'link.ts'))
    await expect(confineToRoot(root, 'link.ts')).rejects.toThrow(/escapes project root/)
  })

  it('refuses non-filesystem paths (file: and url schemes)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'confine-'))
    await expect(confineToRoot(root, 'file:///etc/passwd')).rejects.toThrow(/non-filesystem/)
    await expect(confineToRoot(root, 'https://evil.test/x')).rejects.toThrow(/non-filesystem/)
  })
})

describe('isSecretPath', () => {
  it('flags dotenv files, private keys, certs', () => {
    expect(isSecretPath('.env')).toBe(true)
    expect(isSecretPath('config/.env.local')).toBe(true)
    expect(isSecretPath('id_rsa')).toBe(true)
    expect(isSecretPath('keys/server.pem')).toBe(true)
    expect(isSecretPath('cert.p12')).toBe(true)
  })

  it('allows ordinary source files', () => {
    expect(isSecretPath('src/app.ts')).toBe(false)
    expect(isSecretPath('README.md')).toBe(false)
    expect(isSecretPath('environment.ts')).toBe(false)
  })
})

describe('redactSnippet', () => {
  it('strips known token shapes and secret assignments', () => {
    const redacted = redactSnippet('const k = sk_live_abcd1234efgh; Bearer abcdef123456; API_KEY=hunter2hunter2')
    expect(redacted).not.toContain('sk_live_abcd1234efgh')
    expect(redacted).not.toContain('hunter2hunter2')
    expect(redacted).toContain('[redacted]')
  })

  it('caps the snippet at SNIPPET_LIMIT', () => {
    const long = 'a'.repeat(SNIPPET_LIMIT + 500)
    expect(redactSnippet(long).length).toBe(SNIPPET_LIMIT)
  })
})
