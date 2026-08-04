import {describe, expect, it} from 'vitest'
import {runSteps, type InitStep, type RunSettings} from '../src/init/pipeline.js'
import type {InitOutput} from '../src/init/wizard.js'
import {recorderOutput} from './support/init-output.js'

const settings = (over: Partial<RunSettings> = {}): RunSettings => ({
  cwd: '/tmp/nowhere',
  yes: true,
  dryRun: false,
  backup: () => {},
  interrupt: () => () => {},
  ...over,
})

const step = (over: Partial<InitStep>): InitStep => ({
  id: 'x',
  title: 'X',
  running: 'Doing x…',
  completed: 'Did x',
  detect: async () => 'missing',
  plan: async () => ({summary: 'would do x', wouldEdit: []}),
  apply: async () => ({status: 'done'}),
  verify: async () => true,
  manualCard: () => ({title: 'Wire X by hand', body: 'add x to your config'}),
  ...over,
})

function recorded(): {events: string[]; output: InitOutput} {
  const events: string[] = []
  return {events, output: recorderOutput(events)}
}

describe('runSteps', () => {
  it('skips apply for already-wired steps', async () => {
    let applied = false
    const {events, output} = recorded()
    const entries = await runSteps(
      [step({detect: async () => 'present', apply: async () => ((applied = true), {status: 'done'})})],
      settings(),
      output,
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('already')
    expect(events).toEqual(['step:Doing x…', 'settle:already:X — already wired'])
  })

  it('degrades a throwing step to its manual card and continues', async () => {
    const {events, output} = recorded()
    const entries = await runSteps(
      [step({id: 'boom', apply: async () => Promise.reject(new Error('nope'))}), step({id: 'after'})],
      settings(),
      output,
    )
    expect(entries.map((entry) => entry.status)).toEqual(['manual', 'done'])
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('nope')
    expect(events).toContain('settle:manual:X — needs a manual step: nope')
    expect(events).toContain('settle:done:Did x')
  })

  it('dry-run plans without applying', async () => {
    let applied = false
    const {events, output} = recorded()
    const entries = await runSteps(
      [step({apply: async () => ((applied = true), {status: 'done'})})],
      settings({dryRun: true}),
      output,
    )
    expect(applied).toBe(false)
    expect(entries[0]?.status).toBe('skipped')
    expect(events.join('\n')).toContain('would do x')
  })

  it('degrades to the manual card when verify rejects the result', async () => {
    const {events, output} = recorded()
    const entries = await runSteps([step({verify: async () => false})], settings(), output)
    expect(entries[0]?.status).toBe('manual')
    expect(entries[0]?.cards[0]?.title).toBe('Wire X by hand')
    expect(entries[0]?.detail).toBe('verification failed')
    expect(events).toContain('settle:manual:X — needs a manual step: verification failed')
  })

  it('releases the interrupt handler for each step it finishes', async () => {
    const registered: string[] = []
    const {output} = recorded()
    await runSteps(
      [step({id: 'one'}), step({id: 'two'})],
      settings({
        interrupt: () => {
          registered.push('on')
          return () => registered.push('off')
        },
      }),
      output,
    )
    expect(registered).toEqual(['on', 'off', 'on', 'off'])
  })

  it('emits the notes and lines a step reported only after its line resolves', async () => {
    const {events, output} = recorded()
    await runSteps(
      [
        step({
          apply: async (ctx) => {
            ctx.note({title: 'vite.config.ts', body: 'the diff'})
            ctx.report('created instrumentation.ts')
            return {status: 'done'}
          },
        }),
      ],
      settings(),
      output,
    )
    expect(events).toEqual([
      'step:Doing x…',
      'settle:done:Did x',
      'note:vite.config.ts:the diff',
      'line:created instrumentation.ts',
    ])
  })
})
