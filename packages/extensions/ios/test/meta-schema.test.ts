import {describe, expect, it} from 'vitest'
import {IosConfigSchema, IOS_SYSTEM_PROMPT} from '../src/shared/meta.js'

function parseIosConfig(config: Record<string, unknown>) {
  return IosConfigSchema.safeParse({projectRoot: '/Users/dev/PayApp', bundleId: 'dev.conciv.pay', ...config})
}

function normalizedConcivUrl(concivUrl: string): string | undefined {
  const parsed = parseIosConfig({concivUrl})
  if (!parsed.success) throw new Error(`expected ${concivUrl} to be accepted`)
  return parsed.data?.concivUrl
}

function concivUrlRejection(concivUrl: string): string {
  const parsed = parseIosConfig({concivUrl})
  if (parsed.success) throw new Error(`expected ${concivUrl} to be rejected`)
  return parsed.error.issues.map((issue) => issue.message).join('\n')
}

describe('ios config concivUrl', () => {
  it('keeps a bare api base unchanged', () => {
    expect(normalizedConcivUrl('http://127.0.0.1:4599')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123')).toBe('http://127.0.0.1:4599/t/abc123')
  })

  it('strips the documented /native foot-gun so the swift sdk appends it once', () => {
    expect(normalizedConcivUrl('http://127.0.0.1:4599/native')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/native/')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123/native')).toBe('http://127.0.0.1:4599/t/abc123')
  })

  it('rejects any other path suffix and points at the readme rule', () => {
    expect(concivUrlRejection('http://127.0.0.1:4599/native/x')).toContain('packages/extensions/ios/README.md')
    expect(concivUrlRejection('http://127.0.0.1:4599/panel')).toContain('appends /native itself')
  })
})

describe('ios config extra source dirs', () => {
  it('accepts extra source roots relative to the project root', () => {
    const parsed = parseIosConfig({buildMode: 'swiftc', extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']})
    if (!parsed.success) throw new Error('expected the config to be accepted')
    expect(parsed.data?.extraSourceDirs).toEqual(['../ConcivWidget/Sources/ConcivWidget'])
  })
})

describe('ios system prompt', () => {
  it('no longer routes the agent around ios.build with the demo build script', () => {
    expect(IOS_SYSTEM_PROMPT).not.toContain('build.sh')
    expect(IOS_SYSTEM_PROMPT).toContain('ios.build')
  })
})
