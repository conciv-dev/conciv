import {describe, expect, it, vi} from 'vitest'
import * as clack from '@clack/prompts'
import {
  approvePlan,
  clackPrompts,
  renderPlan,
  type ConfirmedSelections,
  type FoundSelections,
  type PlanPrompts,
} from '../src/init/wizard.js'
import {recorderOutput} from './support/init-output.js'

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clack/prompts')>()
  return {
    ...actual,
    multiselect: vi.fn(async () => {
      throw new Error('multiselect must not run when no harnesses were found')
    }),
    confirm: vi.fn(async (options: {initialValue: boolean}) => options.initialValue),
  }
})

const found: FoundSelections = {
  framework: 'vite',
  harnesses: [
    {id: 'claude', via: 'path'},
    {id: 'codex', via: 'config'},
  ],
}

function harness(events: string[], prompts: Partial<PlanPrompts>): PlanPrompts {
  return {
    selections: async (foundSelections) => {
      events.push('selections')
      return {framework: true, harnesses: foundSelections.harnesses.map((one) => one.id), docsPack: false}
    },
    confirmRun: async () => {
      events.push('confirmRun')
      return true
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
        selections: async () => {
          throw new Error('selections must not run under --yes')
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({
      decision: 'selections',
      selections: {framework: true, harnesses: ['claude', 'codex'], docsPack: false},
    })
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
        selections: async () => {
          throw new Error('selections must not run under --dry-run')
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'dry-run', plan: 'the plan'})
    expect(events).toEqual(['plan:the plan'])
  })

  it('dry-run wins when both --yes and --dry-run are passed together', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: true,
      dryRun: true,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {
        selections: async () => {
          throw new Error('selections must not run under --dry-run')
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'dry-run', plan: 'the plan'})
    expect(events).toEqual(['plan:the plan'])
  })

  it('asks the questions once, renders the plan once, then confirms once and proceeds', async () => {
    const events: string[] = []
    const picked: ConfirmedSelections = {framework: false, harnesses: ['codex'], docsPack: true}
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async (selections) => `selected:${selections.harnesses.join('+')}:${selections.framework}`,
      prompts: harness(events, {
        selections: async () => {
          events.push('selections')
          return picked
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'selections', selections: picked})
    expect(events).toEqual(['selections', 'plan:selected:codex:false', 'confirmRun'])
  })

  it('treats a cancel while answering the questions as cancelled', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async () => {
        throw new Error('the plan must not render when the questions are cancelled')
      },
      prompts: harness(events, {selections: async () => 'cancelled'}),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'cancelled'})
  })

  it('treats a cancel at the final confirm as cancelled, with the plan already rendered once', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {confirmRun: async () => 'cancelled'}),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'cancelled'})
    expect(events).toEqual(['selections', 'plan:the plan'])
  })

  it('declining the final confirm cancels — no edit loop, no re-render', async () => {
    const events: string[] = []
    const approved = await approvePlan({
      yes: false,
      dryRun: false,
      found,
      renderSelected: async () => 'the plan',
      prompts: harness(events, {
        confirmRun: async () => {
          events.push('confirmRun')
          return false
        },
      }),
      output: recorderOutput(events),
    })
    expect(approved).toEqual({decision: 'cancelled'})
    expect(events).toEqual(['selections', 'plan:the plan', 'confirmRun'])
    expect(events.filter((event) => event.startsWith('plan:'))).toHaveLength(1)
  })
})

describe('clackPrompts.selections', () => {
  it('skips the harness question entirely when zero harnesses were detected', async () => {
    const selections = await clackPrompts.selections({framework: 'vite', harnesses: []})
    expect(selections).toEqual({framework: true, harnesses: [], docsPack: false})
    expect(clack.multiselect).not.toHaveBeenCalled()
  })
})
