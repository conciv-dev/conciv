import {cancel, confirm, intro, isCancel, log, multiselect, note, outro, select, spinner} from '@clack/prompts'
import pc from 'picocolors'
import type {Framework} from './detect.js'
import type {FoundHarness, HarnessId} from './harness-detect.js'

export type FoundSelections = {framework: Framework; harnesses: FoundHarness[]}
export type ConfirmedSelections = {framework: boolean; harnesses: HarnessId[]}

export type PlanRow = {title: string; wouldEdit: string[]; already: boolean}
export type HarnessRow = {id: HarnessId; found: boolean; selected: boolean}

export type Decision = 'proceed' | 'adjust' | 'cancelled'

export type PlanPrompts = {
  decide: () => Promise<Decision>
  adjust: (found: FoundSelections, current: ConfirmedSelections) => Promise<ConfirmedSelections | 'cancelled'>
}

export type SpinnerHandle = {stop: (summary: string) => void; fail: (summary: string) => void}

export type InitOutput = {
  intro: (title: string) => void
  spinner: (message: string) => SpinnerHandle
  plan: (body: string) => void
  line: (text: string) => void
  error: (message: string) => void
  cancelled: (message: string) => void
  outro: (message: string) => void
  failure: (message: string) => void
}

export type ApprovePlan = {
  yes: boolean
  dryRun: boolean
  found: FoundSelections
  renderSelected: (selections: ConfirmedSelections) => Promise<string>
  prompts: PlanPrompts
  output: InitOutput
}

export function renderPlan(rows: PlanRow[], harnesses: HarnessRow[]): string {
  const width = rows.reduce((widest, row) => Math.max(widest, row.title.length), 0)
  const lines = rows.map((row) => planLine(row, width))
  return [...lines, '', harnessLine(harnesses)].join('\n')
}

export async function approvePlan(args: ApprovePlan): Promise<ConfirmedSelections | 'cancelled' | 'dry-run'> {
  let selections: ConfirmedSelections = {framework: true, harnesses: args.found.harnesses.map((one) => one.id)}
  for (;;) {
    args.output.plan(await args.renderSelected(selections))
    if (args.yes) return selections
    if (args.dryRun) return 'dry-run'
    const decision = await args.prompts.decide()
    if (decision === 'cancelled') return 'cancelled'
    if (decision === 'proceed') return selections
    const adjusted = await args.prompts.adjust(args.found, selections)
    if (adjusted === 'cancelled') return 'cancelled'
    selections = adjusted
  }
}

function planLine(row: PlanRow, width: number): string {
  const line = `${row.title.padEnd(width)}  ${rowDetail(row)}`
  if (row.already) return pc.dim(line)
  return line
}

function rowDetail(row: PlanRow): string {
  if (row.already) return 'already wired'
  if (row.wouldEdit.length === 0) return 'manual — prints instructions'
  return row.wouldEdit.join(', ')
}

function harnessLine(harnesses: HarnessRow[]): string {
  if (harnesses.every((row) => !row.found)) return 'Harnesses: none found'
  return `Harnesses: ${harnesses.map(harnessMark).join('  ')}`
}

function harnessMark(row: HarnessRow): string {
  if (row.selected) return `● ${row.id}`
  if (row.found) return pc.dim(`○ ${row.id} (not selected)`)
  return pc.dim(`○ ${row.id} (not found)`)
}

export const clackOutput: InitOutput = {
  intro: (title) => intro(title),
  spinner: (message) => {
    const active = spinner()
    active.start(message)
    return {stop: (summary) => active.stop(summary), fail: (summary) => active.error(summary)}
  },
  plan: (body) => note(body, 'Plan'),
  line: (text) => log.message(text),
  error: (message) => log.error(message),
  cancelled: (message) => cancel(message),
  outro: (message) => outro(message),
  failure: (message) => outro(pc.red(message)),
}

const decisionOptions: {value: 'proceed' | 'adjust' | 'cancel'; label: string; hint: string}[] = [
  {value: 'proceed', label: 'Proceed', hint: 'run the plan above'},
  {value: 'adjust', label: 'Adjust', hint: 'change harnesses or framework wiring'},
  {value: 'cancel', label: 'Cancel', hint: 'nothing is written'},
]

export const clackPrompts: PlanPrompts = {
  decide: async () => {
    const decision = await select({message: 'Run this plan?', options: decisionOptions})
    if (isCancel(decision) || decision === 'cancel') return 'cancelled'
    return decision
  },
  adjust: async (found, current) => {
    const harnesses = await pickHarnesses(found.harnesses, current.harnesses)
    if (harnesses === 'cancelled') return 'cancelled'
    const framework = await confirm({
      message: frameworkQuestion(found.framework),
      initialValue: current.framework,
    })
    if (isCancel(framework)) return 'cancelled'
    return {framework, harnesses}
  },
}

async function pickHarnesses(found: FoundHarness[], selected: HarnessId[]): Promise<HarnessId[] | 'cancelled'> {
  if (found.length === 0) return []
  const picked = await multiselect({
    message: 'Teach these agent harnesses about conciv?',
    options: found.map((harness) => ({value: harness.id, label: harness.id, hint: `found via ${harness.via}`})),
    initialValues: found.filter((harness) => selected.includes(harness.id)).map((harness) => harness.id),
    required: false,
  })
  if (isCancel(picked)) return 'cancelled'
  return picked
}

function frameworkQuestion(framework: Framework): string {
  if (framework === 'unknown') return 'No known framework detected — show manual wiring instructions?'
  return `Wire the detected ${framework} config for conciv?`
}
