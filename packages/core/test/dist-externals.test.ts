import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const chunks = readdirSync(distDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(join(distDir, name), 'utf8'))

const externalized = (specifier: string) =>
  chunks.some((code) => new RegExp(`from\\s*["']${specifier.replace(/\//g, '\\/')}["']`).test(code))

const bundledCapability = () => chunks.some((code) => code.includes('createCapability()('))

describe('core dist shares one @tanstack capability-handle instance with harness adapters', () => {
  it('externalizes @tanstack/ai-sandbox so SandboxCapability identity matches the adapters', () => {
    expect(externalized('@tanstack/ai-sandbox')).toBe(true)
  })

  it('bundles @tanstack/ai-sandbox-local-process so no peer edge on ai-sandbox reaches consumers (#107)', () => {
    expect(externalized('@tanstack/ai-sandbox-local-process')).toBe(false)
  })

  it('bundles no private capability-handle copy (identity mismatch breaks chat() validate)', () => {
    expect(bundledCapability()).toBe(false)
  })
})
