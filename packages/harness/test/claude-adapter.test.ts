import {describe, it, expect} from 'vitest'
import {claude} from '../src/claude/index.js'
import {getHarness, resolveHarnessModels} from '../src/registry.js'

describe('claude harness adapter', () => {
  it('is a single CLI-transport harness with a tanstack chatConfig', () => {
    expect(claude.id).toBe('claude')
    expect(claude.capabilities).toEqual({
      resume: true,
      permissionGate: 'hook',
      transcriptHistory: true,
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      slashCommands: 'live',
      imageInput: 'fileRef',
    })
    expect(typeof claude.chatConfig).toBe('function')
  })

  it('capability presence matches members (transcriptHistory ⇒ history, compaction ⇒ buildCompactArgs)', () => {
    expect(typeof claude.history?.transcriptPath).toBe('function')
    expect(typeof claude.history?.parse).toBe('function')
    expect(typeof claude.buildCompactArgs).toBe('function')
    expect(typeof claude.commands).toBe('function')
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
      prompt: 'hello',
      cwd: '/w',
      resumeSessionId: 'sess-1',
      systemPrompt: '/tmp/prompt.md',
      permissionUrl: 'http://127.0.0.1:3000/api/chat/permission',
      kind: 'chat',
    })
    expect(args?.[(args?.indexOf('--resume') ?? -1) + 1]).toBe('sess-1')
    expect(args).toContain('--settings')
    expect(args?.[(args?.indexOf('--append-system-prompt-file') ?? -1) + 1]).toBe('/tmp/prompt.md')
  })

  it('is registered and resolves models', async () => {
    expect(getHarness('claude')).toBe(claude)
    const models = await resolveHarnessModels(claude)
    expect(models.map((model) => model.id)).toContain('sonnet')
  })
})
