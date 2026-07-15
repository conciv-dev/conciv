import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {buildManifest} from '../scripts/build-source-manifest.mjs'

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url))

describe('buildManifest', () => {
  it('collects site source files keyed by relative path', () => {
    const manifest = buildManifest(SITE_DIR)
    expect(manifest['src/components/landing/hero.tsx']).toContain('function Hero')
    expect(manifest['src/lib/pair-text.ts']).toContain('npx @conciv/connect')
    expect(manifest['package.json']).toContain('"name": "site"')
  })

  it('holds only text files and no path escapes', () => {
    const manifest = buildManifest(SITE_DIR)
    const paths = Object.keys(manifest)
    expect(paths.every((p) => !p.startsWith('/') && !p.split('/').includes('..'))).toBe(true)
    expect(paths.some((p) => /\.(png|jpg|woff2?|wasm)$/.test(p))).toBe(false)
  })
})
