import {describe, it, expect} from 'vitest'
import {defineHarness} from '../src/harness-types.js'

const base = {
  id: 'x',
  binName: 'x',
  buildArgs: () => [],
  // a no-op decoder; the invariant under test is capability/method consistency, not decode.
  decode: async function* () {},
}

describe('defineHarness (generic typed factory; history↔transcriptHistory enforced by the type)', () => {
  it('returns the adapter unchanged when capabilities match members', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: false,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        imageInput: false,
      },
    })
    expect(adapter.id).toBe('x')
    // `in` checks key absence against the generic-preserved literal type — no widening, no cast.
    expect('history' in adapter).toBe(false)
  })

  // A transcriptHistory:true adapter without a `history` is now a COMPILE error (the discriminated
  // union requires it), so there is no runtime throw to test — the invalid case is unconstructable.

  it('accepts a transcriptHistory harness that provides a history implementation', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {
        resume: false,
        permissionGate: 'none',
        transcriptHistory: true,
        compaction: false,
        systemPrompt: 'none',
        mcp: 'none',
        imageInput: false,
      },
      history: {transcriptPath: () => '/p', parse: () => []},
    })
    expect(typeof adapter.history?.transcriptPath).toBe('function')
  })
})
