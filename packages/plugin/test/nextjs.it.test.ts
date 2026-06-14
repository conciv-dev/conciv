import {describe, expect, it} from 'vitest'
import {withAidx, AIDX_DEFAULT_PORT} from '../src/core/nextjs.js'

// withAidx is config plumbing: it pins the engine port, inlines it for the client via Next's `env`,
// and carries the resolved options for register(). The real boot+mount path is proven by the
// Next.js example app's browser e2e; here we lock the three config branches.
describe('withAidx', () => {
  it('inlines the default port and keeps client + server in agreement', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withAidx(userConfig)
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_AIDX_PORT).toBe(String(AIDX_DEFAULT_PORT))
    expect(JSON.parse(cfg.env?.AIDX_OPTIONS ?? '{}').port).toBe(AIDX_DEFAULT_PORT)
  })

  it('honours an explicit port exactly', () => {
    const cfg = withAidx({}, {port: 5000})
    expect(cfg.env?.NEXT_PUBLIC_AIDX_PORT).toBe('5000')
    expect(JSON.parse(cfg.env?.AIDX_OPTIONS ?? '{}').port).toBe(5000)
  })

  it('is a passthrough when disabled', () => {
    const userConfig = {reactStrictMode: true}
    const cfg = withAidx(userConfig, {enabled: false})
    expect(cfg.reactStrictMode).toBe(true)
    expect(cfg.env?.NEXT_PUBLIC_AIDX_PORT).toBeUndefined()
  })
})
