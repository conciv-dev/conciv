import {describe, expect, it} from 'vitest'
import {withConciv, CONCIV_DEFAULT_PORT} from '../src/core/nextjs.js'

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
