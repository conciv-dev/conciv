import {describe, it, expect} from 'vitest'
import {claude, makeClaudeAdapter} from '../src/claude/index.js'
import {getHarness, resolveHarnessModels} from '../src/registry.js'

const cli = makeClaudeAdapter(false)
const sdk = makeClaudeAdapter(true)

describe('claude harness adapter', () => {
  it('defaults to the SDK transport (in-process run, callback gate, no native compaction)', () => {
    expect(claude.id).toBe('claude')
    expect(claude.capabilities).toEqual({
      resume: true,
      permissionGate: 'callback',
      transcriptHistory: true,
      compaction: false,
      systemPrompt: 'flag',
      mcp: 'http',
      imageInput: 'fileRef',
    })
    expect(typeof claude.run).toBe('function')
    expect(typeof claude.shutdown).toBe('function')
  })

  it('the CLI transport keeps the spawn-path capability set', () => {
    expect(cli.capabilities).toEqual({
      resume: true,
      permissionGate: 'hook',
      transcriptHistory: true,
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      imageInput: 'fileRef',
    })
    expect(cli.run).toBeUndefined()
  })

  it('capability presence matches members (transcriptHistory ⇒ history, compaction ⇒ buildCompactArgs)', () => {
    expect(typeof claude.history?.transcriptPath).toBe('function')
    expect(typeof claude.history?.parse).toBe('function')
    expect(typeof cli.buildCompactArgs).toBe('function')
    expect(sdk.buildCompactArgs).toBeUndefined()
  })

  it('CLI buildCompactArgs sends /compact as the prompt and keeps --resume', () => {
    const args = cli.buildCompactArgs?.({
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

  it('CLI buildArgs honours resume + permission hook + append-system-prompt-file', () => {
    const args = cli.buildArgs({
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

  it('CLI buildArgs maps turn.model to --model, and omits it when absent', () => {
    const base = {prompt: 'hi', cwd: '/w', resumeSessionId: null, systemPrompt: ''}
    const withModel = cli.buildArgs({...base, model: 'haiku'})
    expect(withModel).toContain('--model')
    expect(withModel[withModel.indexOf('--model') + 1]).toBe('haiku')
    expect(cli.buildArgs(base)).not.toContain('--model')
  })

  it('declares selectable models with a default (Fable advertised but disabled)', async () => {
    const models = await resolveHarnessModels(claude)
    expect(models.map((m) => m.id)).toContain('sonnet')
    expect(claude.defaultModel).toBe('sonnet')
    expect(models.find((m) => m.id === 'claude-fable-5')?.disabled).toBe(true)
  })

  it('is pre-registered in the harness registry', () => {
    expect(getHarness('claude')).toBe(claude)
  })
})
