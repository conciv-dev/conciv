import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {withConciv, CONCIV_DEFAULT_PORT} from '../src/core/nextjs.js'

const ENV_KEYS = ['NEXT_PUBLIC_CONCIV_PORT', 'CONCIV_OPTIONS'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('withConciv', () => {
  it('inlines the default port and keeps client + server in agreement', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withConciv(userConfig)
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBe(String(CONCIV_DEFAULT_PORT))
    expect(JSON.parse(cfg.env?.CONCIV_OPTIONS ?? '{}').port).toBe(CONCIV_DEFAULT_PORT)
  })

  it('honours an explicit port exactly', () => {
    const cfg = withConciv({}, {port: 5000})
    expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBe('5000')
    expect(JSON.parse(cfg.env?.CONCIV_OPTIONS ?? '{}').port).toBe(5000)
  })

  it('is a passthrough when disabled', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withConciv(userConfig, {enabled: false})
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBeUndefined()
  })
})

describe('withConciv process.env (Turbopack does not apply the next.config env key)', () => {
  it('sets process.env so Turbopack inlines NEXT_PUBLIC_ and register reads CONCIV_OPTIONS at runtime', () => {
    withConciv({}, {port: 6123})
    expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBe('6123')
    expect(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}').port).toBe(6123)
  })

  it('does not overwrite an explicit environment override', () => {
    process.env.NEXT_PUBLIC_CONCIV_PORT = '9999'
    process.env.CONCIV_OPTIONS = JSON.stringify({port: 9999})
    withConciv({}, {port: 6123})
    expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBe('9999')
    expect(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}').port).toBe(9999)
  })

  it('does not touch process.env when disabled', () => {
    withConciv({}, {enabled: false, port: 6123})
    expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBeUndefined()
    expect(process.env.CONCIV_OPTIONS).toBeUndefined()
  })

  it('never assigns to a literal process.env.NEXT_PUBLIC_ member (bundlers inline it, breaking webpack)', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/core/nextjs.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_\w+\s*(\?\?=|=[^=])/)
  })
})
