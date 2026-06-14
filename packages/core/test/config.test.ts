import {describe, it, expect, afterEach} from 'vitest'
import {resolveConfig, defineConfig} from '../src/config.js'

const saved = {...process.env}
afterEach(() => {
  process.env = {...saved}
})

describe('defineConfig (generic typed factory)', () => {
  it('returns the config unchanged and preserves the literal harness type', () => {
    const cfg = defineConfig({harness: 'codex', testRunner: 'jest'})
    expect(cfg).toEqual({harness: 'codex', testRunner: 'jest'})
  })
})

describe('resolveConfig (generalized)', () => {
  it('defaults: harness=claude, testRunner=vitest, previewId=local', () => {
    const cfg = resolveConfig({}, '/root')
    expect(cfg.harness).toBe('claude')
    expect(cfg.testRunner).toBe('vitest')
    expect(cfg.previewId).toBe('local')
    expect(cfg.lockDir).toBe('/root')
    expect(typeof cfg.systemPrompt).toBe('string')
  })

  it('options win over env; new env vars resolve', () => {
    process.env.AIDX_HARNESS = 'codex'
    process.env.AIDX_HARNESS_BIN = 'codex-bin'
    process.env.AIDX_SESSION_ID = 'env-sess'
    process.env.AIDX_TEST_RUNNER = 'jest'
    const cfg = resolveConfig({harness: 'claude'}, '/root')
    expect(cfg.harness).toBe('claude')
    expect(cfg.harnessBin).toBe('codex-bin')
    expect(cfg.sessionId).toBe('env-sess')
    expect(cfg.testRunner).toBe('jest')
  })

  it('honours deprecated AIDX_CLAUDE_* + claudeSessionId aliases for one cycle', () => {
    process.env.AIDX_CLAUDE_PATH = 'old-claude'
    process.env.AIDX_CLAUDE_SESSION_ID = 'old-sess'
    const cfg = resolveConfig({}, '/root')
    expect(cfg.harnessBin).toBe('old-claude')
    expect(cfg.sessionId).toBe('old-sess')
  })
})
