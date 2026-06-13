import {describe, it, expect} from 'vitest'
import {claudeAdapter} from '../../src/harness/claude/adapter.js'
import {getHarness} from '../../src/harness/registry.js'

describe('claude harness adapter', () => {
  it('declares the claude capability set', () => {
    expect(claudeAdapter.id).toBe('claude')
    expect(claudeAdapter.binName).toBe('claude')
    expect(claudeAdapter.capabilities).toEqual({
      resume: true,
      permissionGate: 'hook',
      transcriptHistory: true,
      systemPrompt: 'file',
    })
  })

  it('capability presence matches members (transcriptHistory ⇒ history interface)', () => {
    if (claudeAdapter.capabilities.transcriptHistory) {
      expect(typeof claudeAdapter.history?.transcriptPath).toBe('function')
      expect(typeof claudeAdapter.history?.parse).toBe('function')
    }
  })

  it('buildArgs honours resume + permission hook + append-system-prompt-file', () => {
    const args = claudeAdapter.buildArgs({
      prompt: 'hi',
      cwd: '/w',
      resumeSessionId: 'sess-1',
      systemPrompt: '/state/chat-system-prompt.txt',
      permissionUrl: 'http://x/__pw/chat/permission',
    })
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-1')
    expect(args).toContain('--settings')
    expect(args).toContain('--add-dir')
  })

  it('is pre-registered in the harness registry', () => {
    expect(getHarness('claude')).toBe(claudeAdapter)
  })
})
