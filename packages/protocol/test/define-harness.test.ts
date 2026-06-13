import {describe, it, expect} from 'vitest'
import {defineHarness} from '../src/harness-types.js'

const base = {
  id: 'x',
  binName: 'x',
  buildArgs: () => [],
  // a no-op decoder; the invariant under test is capability/method consistency, not decode.
  decode: async function* () {},
}

describe('defineHarness (generic typed factory + dev invariant)', () => {
  it('returns the adapter unchanged when capabilities match methods', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'none'},
    })
    expect(adapter.id).toBe('x')
    // `in` checks key absence against the generic-preserved literal type — no widening, no cast.
    expect('transcriptPath' in adapter).toBe(false)
  })

  it('throws when transcriptHistory is true but transcriptPath/parseHistory are missing', () => {
    expect(() =>
      defineHarness({
        ...base,
        capabilities: {resume: false, permissionGate: 'none', transcriptHistory: true, systemPrompt: 'none'},
      }),
    ).toThrow(/transcriptHistory requires transcriptPath \+ parseHistory/)
  })

  it('accepts a transcriptHistory harness that provides both methods', () => {
    const adapter = defineHarness({
      ...base,
      capabilities: {resume: false, permissionGate: 'none', transcriptHistory: true, systemPrompt: 'none'},
      transcriptPath: () => '/p',
      parseHistory: () => [],
    })
    expect(typeof adapter.transcriptPath).toBe('function')
  })
})
