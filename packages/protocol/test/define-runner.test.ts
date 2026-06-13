import {describe, it, expect} from 'vitest'
import {defineRunner} from '../src/runner-types.js'

const stubManager = {
  list: async () => ({files: []}),
  run: async () => ({summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []}),
  status: () => ({summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []}),
  subscribeRaw: () => () => {},
  emitSnapshot: () => ({
    type: 'snapshot' as const,
    files: [],
    summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
    watching: false,
  }),
  openUiServer: async () => ({available: false}),
  stop: async () => {},
}

describe('defineRunner (generic typed factory + dev invariant)', () => {
  it('returns the adapter unchanged when valid', () => {
    const runner = defineRunner({
      id: 'vitest',
      capabilities: {watch: false, uiServer: false, filterByName: true, failedOnly: false},
      create: () => stubManager,
    })
    expect(runner.id).toBe('vitest')
    expect(typeof runner.create).toBe('function')
  })

  it('throws when uiServer capability is declared without an openUiServer-capable manager factory', () => {
    expect(() =>
      defineRunner({
        id: 'broken',
        capabilities: {watch: false, uiServer: true, filterByName: false, failedOnly: false},
        // factory omitted → invariant fails
        // @ts-expect-error intentionally missing create to prove the runtime guard
        create: undefined,
      }),
    ).toThrow(/runner "broken": uiServer requires a create\(\) factory/)
  })
})
