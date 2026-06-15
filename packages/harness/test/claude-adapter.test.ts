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
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      imageInput: 'fileRef',
    })
  })

  it('capability presence matches members (transcriptHistory ⇒ history, compaction ⇒ buildCompactArgs)', () => {
    if (claude.capabilities.transcriptHistory) {
      expect(typeof claude.history?.transcriptPath).toBe('function')
      expect(typeof claude.history?.parse).toBe('function')
    }
    if (claude.capabilities.compaction) {
      expect(typeof claude.buildCompactArgs).toBe('function')
    }
  })

  it('buildCompactArgs sends /compact as the prompt and keeps --resume', () => {
    const args = claude.buildCompactArgs?.({
      prompt: 'this is ignored',
      cwd: '/w',
      resumeSessionId: 'sess-9',
      systemPrompt: '',
      kind: 'compact',
    })
    expect(args).toContain('/compact')
    expect(args).not.toContain('this is ignored')
    expect(args?.[(args?.indexOf('--resume') ?? -1) + 1]).toBe('sess-9')
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

  it('buildArgs maps turn.model to --model, and omits it when absent', () => {
    const base = {prompt: 'hi', cwd: '/w', resumeSessionId: null, systemPrompt: ''}
    const withModel = claude.buildArgs({...base, model: 'haiku'})
    expect(withModel).toContain('--model')
    expect(withModel[withModel.indexOf('--model') + 1]).toBe('haiku')
    expect(claude.buildArgs(base)).not.toContain('--model')
  })

  it('declares selectable models with a default (Fable advertised but disabled)', async () => {
    const models = typeof claude.models === 'function' ? await claude.models() : (claude.models ?? [])
    expect(models.map((m) => m.id)).toContain('sonnet')
    expect(claude.defaultModel).toBe('sonnet')
    expect(models.find((m) => m.id === 'claude-fable-5')?.disabled).toBe(true)
  })

  it('is pre-registered in the harness registry', () => {
    expect(getHarness('claude')).toBe(claude)
  })
})
