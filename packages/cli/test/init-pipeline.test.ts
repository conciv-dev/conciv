import {describe, expect, it} from 'vitest'
import {runSteps, type InitContext, type InitStep} from '../src/init/pipeline.js'

const ctx = (over: Partial<InitContext> = {}): InitContext => ({
  cwd: '/tmp/nowhere',
  yes: true,
  dryRun: false,
  report: () => {},
  ...over,
})

const step = (over: Partial<InitStep>): InitStep => ({
  id: 'x',
  title: 'X',
  detect: async () => 'missing',
  plan: async () => ({summary: 'would do x', wouldEdit: []}),
  apply: async () => ({status: 'done'}),
  verify: async () => true,
  manualCard: () => ({title: 'Wire X by hand', body: 'add x to your config'}),
  ...over,
})

describe('runSteps', () => {
  it('skips apply for already-wired steps', async () => {
    let applied = false
    const entries = await runSteps(
      [step({detect: async () => 'present', apply: async () => ((applied = true), {status: 'done'})})],
      ctx(),
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('already')
  })

  it('degrades a throwing step to its manual card and continues', async () => {
    const entries = await runSteps(
      [step({id: 'boom', apply: async () => Promise.reject(new Error('nope'))}), step({id: 'after'})],
      ctx(),
    )
    expect(entries.map((entry) => entry.status)).toEqual(['manual', 'done'])
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('nope')
  })

  it('dry-run plans without applying', async () => {
    let applied = false
    const lines: string[] = []
    const entries = await runSteps(
      [step({apply: async () => ((applied = true), {status: 'done'})})],
      ctx({dryRun: true, report: (line) => lines.push(line)}),
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('skipped')
    expect(lines.join('\n')).toContain('would do x')
  })

  it('degrades to the manual card when verify rejects the result', async () => {
    const entries = await runSteps([step({verify: async () => false})], ctx())
    expect(entries[0]?.status).toBe('manual')
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('verification failed')
  })
})
