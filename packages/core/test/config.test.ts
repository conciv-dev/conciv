import {describe, it, expect, afterEach} from 'vitest'
import {resolveConfig, defineConfig} from '../src/config.js'

const saved = {...process.env}
afterEach(() => {
  process.env = {...saved}
})

describe('defineConfig (generic typed factory)', () => {
  it('returns the config unchanged and preserves the literal harness type', () => {
    const cfg = defineConfig({harness: 'codex'})
    expect(cfg).toEqual({harness: 'codex'})
  })
})

describe('resolveConfig (generalized)', () => {
  it('defaults: harness=claude, stateRoot=root', () => {
    const cfg = resolveConfig({}, '/root')
    expect(cfg.harness).toBe('claude')
    expect(cfg.stateRoot).toBe('/root')
    expect(typeof cfg.systemPrompt).toBe('string')
  })

  it('options win over env; new env vars resolve', () => {
    process.env.CONCIV_HARNESS = 'codex'
    process.env.CONCIV_HARNESS_BIN = 'codex-bin'
    process.env.CONCIV_SESSION_ID = 'conciv_env-sess'
    const cfg = resolveConfig({harness: 'claude'}, '/root')
    expect(cfg.harness).toBe('claude')
    expect(cfg.harnessBin).toBe('codex-bin')
    expect(cfg.sessionId).toBe('conciv_env-sess')
  })

  it('a harness session id outside the allowed charset is rejected for what it actually is, not as empty', () => {
    process.env.CONCIV_CLAUDE_SESSION_ID = 'has spaces/and-slashes'
    expect(() => resolveConfig({}, '/root')).toThrowError(/charset|characters|too long|128/i)
    expect(() => resolveConfig({}, '/root')).not.toThrowError(/is empty/)
  })

  it('honours deprecated CONCIV_CLAUDE_* + claudeSessionId aliases for one cycle', () => {
    process.env.CONCIV_CLAUDE_PATH = 'old-claude'
    process.env.CONCIV_CLAUDE_SESSION_ID = 'old-sess'
    const cfg = resolveConfig({}, '/root')
    expect(cfg.harnessBin).toBe('old-claude')
    expect(cfg.harnessSessionId).toBe('old-sess')
  })
})
