import {describe, expect, it} from 'vitest'
import {withMandarax, MANDARAX_DEFAULT_PORT} from '../src/core/nextjs.js'

// withMandarax is config plumbing: it pins the engine port, inlines it for the client via Next's `env`,
// and carries the resolved options for register(). The real boot+mount path is proven by the
// Next.js example app's browser e2e; here we lock the three config branches.
describe('withMandarax', () => {
  it('inlines the default port and keeps client + server in agreement', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withMandarax(userConfig)
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBe(String(MANDARAX_DEFAULT_PORT))
    expect(JSON.parse(cfg.env?.MANDARAX_OPTIONS ?? '{}').port).toBe(MANDARAX_DEFAULT_PORT)
  })

  it('honours an explicit port exactly', () => {
    const cfg = withMandarax({}, {port: 5000})
    expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBe('5000')
    expect(JSON.parse(cfg.env?.MANDARAX_OPTIONS ?? '{}').port).toBe(5000)
  })

  it('is a passthrough when disabled', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withMandarax(userConfig, {enabled: false})
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_MANDARAX_PORT).toBeUndefined()
  })
})
