import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {withConciv} from '../src/core/nextjs.js'

const SPECIFIER = '@conciv/app-extensions'
const ENV_KEYS = ['NEXT_PUBLIC_CONCIV_PORT', 'CONCIV_OPTIONS'] as const

type WebpackConfig = {resolve?: {alias?: Record<string, string>}}

const savedEnv: Record<string, string | undefined> = {}
let originalCwd = ''
let projectRoot = ''

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  originalCwd = process.cwd()
  projectRoot = mkdtempSync(join(tmpdir(), 'conciv-nextcfg-'))
  process.chdir(projectRoot)
})

afterEach(() => {
  process.chdir(originalCwd)
  rmSync(projectRoot, {recursive: true, force: true})
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function generatedPath(): string {
  return join(process.cwd(), '.conciv', 'extensions-client.gen.tsx')
}

describe('withConciv bundler aliasing', () => {
  it('adds the turbopack resolveAlias while preserving the user turbopack config', () => {
    const cfg = withConciv({turbopack: {resolveAlias: {'user-lib': './user-lib'}, rules: {}}})
    expect(cfg.turbopack?.resolveAlias?.[SPECIFIER]).toBe('./.conciv/extensions-client.gen.tsx')
    expect(cfg.turbopack?.resolveAlias?.['user-lib']).toBe('./user-lib')
    expect(cfg.turbopack?.rules).toEqual({})
  })

  it('composes a webpack hook that aliases the absolute generated path and still runs the user hook on the aliased config', () => {
    const seen: WebpackConfig[] = []
    const userWebpack = (config: WebpackConfig): WebpackConfig => {
      seen.push(config)
      return config
    }
    const cfg = withConciv({webpack: userWebpack})
    const config: WebpackConfig = {resolve: {alias: {}}}
    const out = cfg.webpack?.(config, {})
    const aliasValue = out?.resolve?.alias?.[SPECIFIER]
    expect(aliasValue).toBeDefined()
    expect(isAbsolute(aliasValue ?? '')).toBe(true)
    expect(aliasValue).toBe(generatedPath())
    expect(seen).toHaveLength(1)
    expect(seen[0]?.resolve?.alias?.[SPECIFIER]).toBe(generatedPath())
  })

  it('aliases even when the user supplies no webpack hook', () => {
    const cfg = withConciv({})
    const config: WebpackConfig = {}
    const out = cfg.webpack?.(config, {})
    expect(out?.resolve?.alias?.[SPECIFIER]).toBe(generatedPath())
  })

  it('generates the client entry file when enabled', () => {
    const dir = join(process.cwd(), 'conciv', 'extensions')
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'tanstack.tsx'), 'export default {name: "tanstack"}')
    withConciv({})
    expect(existsSync(generatedPath())).toBe(true)
  })

  it('is a passthrough when disabled: no aliases, no generation', () => {
    const cfg = withConciv({reactStrictMode: true}, {enabled: false})
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.turbopack).toBeUndefined()
    expect(cfg.webpack).toBeUndefined()
    expect(existsSync(generatedPath())).toBe(false)
  })
})
