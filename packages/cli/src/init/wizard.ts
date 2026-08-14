import {
  cancel,
  confirm,
  intro,
  isCancel,
  isCI,
  isTTY,
  log,
  multiselect,
  note,
  outro,
  spinner,
  taskLog,
} from '@clack/prompts'
import pc from 'picocolors'
import type {Framework} from './detect.js'
import type {FoundHarness, HarnessId} from './harness-detect.js'
import type {StepNote, StepStatus} from './ledger.js'

export type FoundSelections = {framework: Framework; harnesses: FoundHarness[]}
export type ConfirmedSelections = {framework: boolean; harnesses: HarnessId[]; docsPack: boolean}

export type PlanRow = {title: string; wouldEdit: string[]; already: boolean}
export type HarnessRow = {id: HarnessId; found: boolean; selected: boolean}

export type PlanPrompts = {
  selections: (found: FoundSelections) => Promise<ConfirmedSelections | 'cancelled'>
  confirmRun: () => Promise<boolean | 'cancelled'>
}

export type SpinnerHandle = {stop: (summary: string) => void; fail: (summary: string) => void}

export type StepResult = {status: StepStatus; summary: string}

export type StepHandle = {line: (text: string) => void; settle: (result: StepResult) => void}

export type InitOutput = {
  intro: (title: string) => void
  spinner: (message: string) => SpinnerHandle
  plan: (body: string) => void
  step: (title: string) => StepHandle
  note: (payload: StepNote) => void
  line: (text: string) => void
  success: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  cancelled: (message: string) => void
  outro: (message: string) => void
  failure: (message: string) => void
}

export type PlanApproval =
  | {decision: 'selections'; selections: ConfirmedSelections}
  | {decision: 'cancelled'}
  | {decision: 'dry-run'; plan: string}

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

function defaultSelections(found: FoundSelections): ConfirmedSelections {
  return {framework: true, harnesses: found.harnesses.map((one) => one.id), docsPack: false}
}

export async function approvePlan(args: ApprovePlan): Promise<PlanApproval> {
  if (args.dryRun) {
    const plan = await args.renderSelected(defaultSelections(args.found))
    args.output.plan(plan)
    return {decision: 'dry-run', plan}
  }
  if (args.yes) {
    const selections = defaultSelections(args.found)
    const plan = await args.renderSelected(selections)
    args.output.plan(plan)
    return {decision: 'selections', selections}
  }
  const selections = await args.prompts.selections(args.found)
  if (selections === 'cancelled') return {decision: 'cancelled'}
  const plan = await args.renderSelected(selections)
  args.output.plan(plan)
  const proceed = await args.prompts.confirmRun()
  if (proceed === 'cancelled' || !proceed) return {decision: 'cancelled'}
  return {decision: 'selections', selections}
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

export function interactiveTerminal(): boolean {
  return isTTY(process.stdout) && process.stdin.isTTY === true && !isCI()
}

function settleTaskLog(active: ReturnType<typeof taskLog>, result: StepResult): void {
  if (result.status === 'manual') {
    active.error(result.summary)
    return
  }
  active.success(result.summary)
}

export const clackOutput: InitOutput = {
  intro: (title) => intro(title),
  spinner: (message) => {
    const active = spinner()
    active.start(message)
    return {stop: (summary) => active.stop(summary), fail: (summary) => active.error(summary)}
  },
  plan: (body) => note(body, 'Plan'),
  step: (title) => {
    const active = taskLog({title})
    return {line: (text) => active.message(text), settle: (result) => settleTaskLog(active, result)}
  },
  note: (payload) => note(payload.body, payload.title),
  line: (text) => log.message(text),
  success: (message) => log.success(message),
  warn: (message) => log.warn(message),
  error: (message) => log.error(message),
  cancelled: (message) => cancel(message),
  outro: (message) => outro(message),
  failure: (message) => outro(pc.red(message)),
}

export const clackPrompts: PlanPrompts = {
  selections: async (found) => {
    const harnesses = await pickHarnesses(found.harnesses)
    if (harnesses === 'cancelled') return 'cancelled'
    const framework = await confirm({message: frameworkQuestion(found.framework), initialValue: true})
    if (isCancel(framework)) return 'cancelled'
    const docsPack = await confirm({message: docsPackQuestion, initialValue: false})
    if (isCancel(docsPack)) return 'cancelled'
    return {framework, harnesses, docsPack}
  },
  confirmRun: async () => {
    const proceed = await confirm({message: 'Run this plan?', initialValue: true})
    if (isCancel(proceed)) return 'cancelled'
    return proceed
  },
}

async function pickHarnesses(found: FoundHarness[]): Promise<HarnessId[] | 'cancelled'> {
  if (found.length === 0) return []
  const picked = await multiselect({
    message: 'Teach these agent harnesses about conciv?',
    options: found.map((harness) => ({value: harness.id, label: harness.id, hint: `found via ${harness.via}`})),
    initialValues: found.map((harness) => harness.id),
    required: false,
  })
  if (isCancel(picked)) return 'cancelled'
  return picked
}

const docsPackQuestion =
  'Add the @conciv/skills docs pack (setup/extension-authoring/debugging guides) and TanStack intent skill-loading guidance?'

function frameworkQuestion(framework: Framework): string {
  if (framework === 'unknown') return 'No known framework detected — show manual wiring instructions?'
  return `Wire the detected ${framework} config for conciv?`
}
