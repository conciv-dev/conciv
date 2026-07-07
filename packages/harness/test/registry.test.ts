import {describe, it, expect} from 'vitest'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {registerHarness, getHarness, listHarnesses} from '../src/registry.js'
import {makeTextAdapter} from '../src/_shared/text-adapter.js'

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
