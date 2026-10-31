import {describe, it, expect} from 'vitest'
import type {TranscriptHandle} from '@conciv/protocol/harness-types'
import {defineHarness, registerHarness, getHarness, listHarnesses, type HarnessAdapter} from '../src/registry.js'
import {makeTextAdapter} from '@conciv/ai/server'

function stub(id: string): HarnessAdapter {
  return defineHarness({
    id,
    binName: id,
    capabilities: {
      resume: false,
      permissionGate: 'none',
      transcriptHistory: false,
      compaction: false,
      systemPrompt: 'none',
      mcp: 'none',
      slashCommands: 'none',
      imageInput: false,
      init: 'none',
    },
    chatConfig: () => ({adapter: makeTextAdapter(id, async function* () {})}),
  })
}

describe('harness registry', () => {
  it('registers and resolves an adapter by id', () => {
    registerHarness(stub('test-x'))
    expect(getHarness('test-x')?.id).toBe('test-x')
  })

  it('lists registered ids including the bundled adapters', () => {
    const ids = listHarnesses().map((a) => a.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('codex')
    expect(ids).toContain('gemini-cli')
    expect(ids).toContain('opencode')
    expect(ids).toContain('pi')
  })

  it('returns undefined for an unknown id', () => {
    expect(getHarness('nope')).toBeUndefined()
  })
})

describe('defineHarness', () => {
  it('accepts a transcriptHistory harness that provides a history implementation', () => {
    const handle: TranscriptHandle = {
      revision: () => Promise.resolve({rev: '0', changedAt: 0}),
      read: () => Promise.resolve({ok: true, rev: '0', changedAt: 0, messages: [], replaced: false}),
      close: () => {},
    }
    const adapter = defineHarness({
      id: 'x',
      binName: 'x',
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: true,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        slashCommands: 'none',
        imageInput: false,
        init: 'none',
      },
      chatConfig: () => ({adapter: makeTextAdapter('x', async function* () {})}),
      history: {
        messages: () => Promise.resolve([]),
        observe: () => handle,
        list: () => Promise.resolve([]),
      },
    })
    expect(typeof adapter.history?.messages).toBe('function')
  })
})
