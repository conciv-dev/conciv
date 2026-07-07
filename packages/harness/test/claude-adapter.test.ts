import {describe, it, expect} from 'vitest'
import {claude} from '../src/claude/index.js'
import {getHarness, resolveHarnessModels} from '../src/registry.js'

describe('claude harness adapter', () => {
  it('is a single harness on the tanstack chatConfig path', () => {
    expect(claude.id).toBe('claude')
    expect(claude.capabilities).toEqual({
      resume: true,
      permissionGate: 'callback',
      transcriptHistory: true,
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      slashCommands: 'live',
      imageInput: 'fileRef',
    })
    expect(typeof claude.chatConfig).toBe('function')
  })

  it('capability presence matches members (transcriptHistory ⇒ history, slashCommands ⇒ commands)', () => {
    expect(typeof claude.history?.transcriptPath).toBe('function')
    expect(typeof claude.history?.parse).toBe('function')
    expect(typeof claude.commands).toBe('function')
  })

  it('is registered and resolves models', async () => {
    expect(getHarness('claude')).toBe(claude)
    const models = await resolveHarnessModels(claude)
    expect(models.map((model) => model.id)).toContain('sonnet')
  })
})
