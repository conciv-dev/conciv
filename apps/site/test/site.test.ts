import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {buildManifest} from '../scripts/build-source-manifest.mjs'
import {annotateSiteFile} from '../src/lib/source-annotations'

describe('source annotations', () => {
  const ROOT = '/repo/apps/site'
  const FIXTURE = 'export function Hero() {\n  return <h1 className="od-display">hi</h1>\n}\n'

  describe('annotateSiteFile', () => {
    it('stamps data-conciv-source with a root-relative path', () => {
      const out = annotateSiteFile(FIXTURE, `${ROOT}/src/components/landing/hero.tsx`, ROOT)
      expect(out?.code).toContain('data-conciv-source="src/components/landing/hero.tsx:2:10"')
    })

    it('ignores files outside src/', () => {
      const out = annotateSiteFile(FIXTURE, `${ROOT}/node_modules/pkg/thing.tsx`, ROOT)
      expect(out).toBeNull()
    })

    it('ignores non-jsx files', () => {
      const out = annotateSiteFile('export const x = 1\n', `${ROOT}/src/lib/pair-text.ts`, ROOT)
      expect(out).toBeNull()
    })
  })
})

describe('source manifest', () => {
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
})
