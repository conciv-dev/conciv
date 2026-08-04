import {describe, expect, it} from 'vitest'
import {
  approvePlan,
  renderPlan,
  type ConfirmedSelections,
  type FoundSelections,
  type PlanPrompts,
} from '../src/init/wizard.js'
import {recorderOutput} from './support/init-output.js'

const found: FoundSelections = {
  framework: 'vite',
  harnesses: [
    {id: 'claude', via: 'path'},
    {id: 'codex', via: 'config'},
  ],
}

function harness(events: string[], prompts: Partial<PlanPrompts>): PlanPrompts {
  return {
    decide: async () => {
      events.push('decide')
      return 'proceed'
    },
    adjust: async (_foundSelections, current) => {
      events.push('adjust')
      return current
    },
    ...prompts,
  }
}

describe('renderPlan', () => {
  it('renders edit rows, manual rows, already-wired rows, and the harness line', () => {
    const body = renderPlan(
      [
        {title: 'Install @conciv/it', wouldEdit: ['package.json'], already: false},
        {title: 'Framework wiring', wouldEdit: [], already: false},
        {title: 'Teach agents the conciv CLI', wouldEdit: ['AGENTS.md'], already: true},
      ],
      [
        {id: 'claude', found: true, selected: true},
        {id: 'codex', found: true, selected: false},
        {id: 'opencode', found: false, selected: false},
      ],
    )
    expect(body).toContain('Install @conciv/it')
    expect(body).toContain('package.json')
    expect(body).toContain('manual — prints instructions')
    expect(body).toContain('already wired')
    expect(body).toContain('Harnesses:')
    expect(body).toContain('● claude')
    expect(body).toContain('○ codex (not selected)')
    expect(body).toContain('○ opencode (not found)')
  })
})

describe('approvePlan', () => {
  it('renders the plan once and auto-proceeds with every found harness under --yes', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: true,
      dryRun: false,
      found,
      renderSelected: async (selections) => `selected:${selections.harnesses.join('+')}`,
      prompts: harness(events, {
        decide: async () => {
          throw new Error('decide must not run under --yes')
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({framework: true, harnesses: ['claude', 'codex']})
    expect(events).toEqual(['plan:selected:claude+codex'])
  })

  it('renders the plan and stops before any prompt under --dry-run', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: true,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {
        decide: async () => {
          throw new Error('decide must not run under --dry-run')
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toBe('dry-run')
    expect(events).toEqual(['plan:the plan'])
  })

  it('renders the plan before the first prompt and loops adjust with a re-rendered plan', async () => {
    const events: string[] = []
    const decisions = ['adjust', 'proceed'] satisfies ('adjust' | 'proceed')[]
    const adjusted: ConfirmedSelections = {framework: false, harnesses: ['codex']}
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async (selections) => `selected:${selections.harnesses.join('+')}:${selections.framework}`,
      prompts: harness(events, {
        decide: async () => {
          events.push('decide')
          const next = decisions.shift()
          if (next === undefined) throw new Error('ran out of decisions')
          return next
        },
        adjust: async () => {
          events.push('adjust')
          return adjusted
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual(adjusted)
    expect(events).toEqual([
      'plan:selected:claude+codex:true',
      'decide',
      'adjust',
      'plan:selected:codex:false',
      'decide',
    ])
  })

  it('treats a cancel at the decision prompt as cancelled', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {decide: async () => 'cancelled'}),
      output: recorderOutput(events),
    })
    expect(approved).toBe('cancelled')
  })

  it('treats a cancel inside adjust as cancelled', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {
        decide: async () => {
          events.push('decide')
          return 'adjust'
        },
        adjust: async () => 'cancelled',
      }),
      output: recorderOutput(events),
    })
    expect(approved).toBe('cancelled')
  })
})
