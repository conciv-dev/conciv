import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {buildManifest} from '../scripts/build-source-manifest.mjs'

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url))

function fixtureSite(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-fixture-'))
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture"}')
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path)
    mkdirSync(join(target, '..'), {recursive: true})
    writeFileSync(target, content)
  }
  return dir
}

describe('buildManifest', () => {
  it('collects site source files keyed by relative path', () => {
    const manifest = buildManifest(SITE_DIR)
    expect(manifest['src/components/landing/hero.tsx']).toContain('function Hero')
    expect(manifest['src/lib/pair-text.ts']).toContain('npx @conciv/try')
    expect(manifest['package.json']).toContain('"name": "site"')
  })

  it('includes text source but excludes binary files', () => {
    const dir = fixtureSite({
      'src/keep.ts': 'export const keep = 1\n',
      'src/logo.png': '\x89PNG binary',
      'src/font.woff2': 'binary',
    })
    const manifest = buildManifest(dir)
    expect(manifest['src/keep.ts']).toContain('keep')
    expect(manifest['src/logo.png']).toBeUndefined()
    expect(manifest['src/font.woff2']).toBeUndefined()
  })

  it('excludes secret-looking files even with a text extension', () => {
    const dir = fixtureSite({
      'src/config.ts': 'export const config = 1\n',
      'src/secrets.ts': 'export const apiKey = "sk-live"\n',
      'src/.env.ts': 'export const token = "x"\n',
      'src/service.credentials.json': '{"key":"secret"}',
    })
    const manifest = buildManifest(dir)
    expect(manifest['src/config.ts']).toContain('config')
    expect(manifest['src/secrets.ts']).toBeUndefined()
    expect(manifest['src/.env.ts']).toBeUndefined()
    expect(manifest['src/service.credentials.json']).toBeUndefined()
  })

  it('produces only relative, non-escaping keys for the real site', () => {
    const paths = Object.keys(buildManifest(SITE_DIR))
    expect(paths.every((p) => !p.startsWith('/') && !p.split('/').includes('..'))).toBe(true)
  })
})
