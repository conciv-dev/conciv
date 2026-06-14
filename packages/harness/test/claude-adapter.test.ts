import {describe, it, expect} from 'vitest'
import {claude} from '../src/claude/index.js'
import {getHarness} from '../src/registry.js'

describe('claude harness adapter', () => {
  it('declares the claude capability set', () => {
    expect(claude.id).toBe('claude')
    expect(claude.binName).toBe('claude')
    expect(claude.capabilities).toEqual({
      resume: true,
      permissionGate: 'hook',
      transcriptHistory: true,
      systemPrompt: 'file',
      mcp: 'http',
      imageInput: 'fileRef',
    })
  })

  it('capability presence matches members (transcriptHistory ⇒ history interface)', () => {
    if (claude.capabilities.transcriptHistory) {
      expect(typeof claude.history?.transcriptPath).toBe('function')
      expect(typeof claude.history?.parse).toBe('function')
    }
  })

  it('buildArgs honours resume + permission hook + append-system-prompt-file', () => {
    const args = claude.buildArgs({
      prompt: 'hi',
      cwd: '/w',
      resumeSessionId: 'sess-1',
      systemPrompt: '/state/chat-system-prompt.txt',
      permissionUrl: 'http://x/api/chat/permission',
    })
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-1')
    expect(args).toContain('--settings')
    expect(args).toContain('--add-dir')
  })

  it('is pre-registered in the harness registry', () => {
    expect(getHarness('claude')).toBe(claude)
  })
})
