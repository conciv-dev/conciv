import {homedir} from 'node:os'
import {detectProject, type Detected} from './detect.js'
import {execFileOutcome, type CommandOutcome} from './exec.js'
import {detectHarnesses, harnessIds, type FoundHarness} from './harness-detect.js'
import {captureFile, guardBackups, onInterrupt, type FileBackup} from './interrupt.js'
import type {LedgerEntry, ManualCard, StepNote, StepOutcome, StepPlan} from './ledger.js'
import {emitOutro} from './outro.js'
import {preflight} from './preflight.js'
import {fallbackStep} from './steps/framework/fallback.js'
import {nextjsStep} from './steps/framework/nextjs.js'
import {viteStep} from './steps/framework/vite.js'
import {webpackFamilyStep} from './steps/framework/webpack-family.js'
import {agentsMdStep} from './steps/harness/agents-md.js'
import {claudeStep} from './steps/harness/claude.js'
import {consentFile, writeConsent} from './steps/harness/consent.js'
import {addWithNypm, installItStep, type AddDep} from './steps/install-it.js'
import {
  approvePlan,
  clackOutput,
  clackPrompts,
  interactiveTerminal,
  renderPlan,
  type ConfirmedSelections,
  type HarnessRow,
  type InitOutput,
  type PlanPrompts,
  type PlanRow,
} from './wizard.js'

export type RunSettings = {
  cwd: string
  yes: boolean
  dryRun: boolean
  backup: (file: FileBackup) => void
  interrupt: (recover: () => void) => () => void
}

export type InitContext = Omit<RunSettings, 'interrupt'> & {
  report: (line: string) => void
  note: (note: StepNote) => void
}

export type InitStep = {
  id: string
  title: string
  running: string
  completed: string
  detect: (ctx: InitContext) => Promise<'missing' | 'present'>
  plan: (ctx: InitContext) => Promise<StepPlan>
  apply: (ctx: InitContext) => Promise<StepOutcome>
  verify: (ctx: InitContext) => Promise<boolean>
  manualCard: (ctx: InitContext) => ManualCard
}

export type InitOptions = {yes: boolean; dryRun: boolean; force: boolean; cwd: string}

export type InitResult =
  | {outcome: 'refused'; reason: string}
  | {outcome: 'cancelled'; reason: string}
  | {outcome: 'planned'; plan: string}
  | {outcome: 'completed'; steps: LedgerEntry[]; next: string[]}

export type SpawnBin = (bin: string, args: string[], cwd: string) => Promise<{code: number; output: string}>

export type InitRuntime = {
  addDependency: AddDep
  spawn: SpawnBin
  prompts: PlanPrompts
  env: {PATH: string; HOME: string}
  output: InitOutput
  interactive: () => boolean
  exit: (code: number) => void
}

type Emission = {kind: 'line'; text: string} | {kind: 'note'; note: StepNote}

function spawnBin(bin: string, args: string[], cwd: string): Promise<CommandOutcome> {
  return execFileOutcome(bin, args, {cwd})
}

function defaultRuntime(): InitRuntime {
  return {
    addDependency: addWithNypm,
    spawn: spawnBin,
    prompts: clackPrompts,
    env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? homedir()},
    output: clackOutput,
    interactive: interactiveTerminal,
    exit: (code) => process.exit(code),
  }
}

function frameworkStep(detected: Detected): InitStep {
  if (detected.framework === 'vite' || detected.framework === 'astro') return viteStep(detected)
  if (detected.framework === 'nextjs') return nextjsStep(detected)
  if (detected.framework === 'webpack' || detected.framework === 'rspack') return webpackFamilyStep(detected)
  return fallbackStep(detected)
}

function nextSteps(packageManager: string): string[] {
  const dev = packageManager === 'npm' ? 'npm run dev' : `${packageManager} dev`
  return [`start your app: ${dev}`, 'ask your agent to run conciv tools --help']
}

function stepList(detected: Detected, selections: ConfirmedSelections, runtime: InitRuntime): InitStep[] {
  const consented = () => selections.harnesses
  return [
    installItStep(runtime.addDependency, detected.packageManager),
    ...(selections.framework ? [frameworkStep(detected)] : []),
    agentsMdStep(consented),
    claudeStep(consented, {home: runtime.env.HOME, run: runtime.spawn}),
  ]
}

function detectionSummary(detected: Detected, found: FoundHarness[]): string {
  const framework = detected.configFile === null ? detected.framework : `${detected.framework} (${detected.configFile})`
  const harnesses = found.length === 0 ? 'none found' : found.map((one) => one.id).join(', ')
  return `Detected: ${framework} · ${detected.packageManager} · harnesses: ${harnesses}`
}

function harnessRows(found: FoundHarness[], selections: ConfirmedSelections): HarnessRow[] {
  return harnessIds.map((id) => ({
    id,
    found: found.some((one) => one.id === id),
    selected: selections.harnesses.includes(id),
  }))
}

async function planRows(steps: InitStep[], ctx: InitContext): Promise<PlanRow[]> {
  const rows: PlanRow[] = []
  for (const step of steps) {
    const state = await step.detect(ctx).catch(() => 'missing' as const)
    const planned = await step.plan(ctx)
    rows.push({title: step.title, wouldEdit: planned.wouldEdit, already: state === 'present'})
  }
  return rows
}

function quietContext(cwd: string, yes: boolean): InitContext {
  return {cwd, yes, dryRun: true, report: () => {}, note: () => {}, backup: () => {}}
}

export async function runInit(options: InitOptions, overrides: Partial<InitRuntime> = {}): Promise<InitResult> {
  const runtime: InitRuntime = {...defaultRuntime(), ...overrides}
  runtime.output.intro('conciv init')
  if (!options.yes && !options.dryRun && !runtime.interactive()) {
    return refuse(runtime, 'Non-interactive terminal — re-run with --yes or --dry-run')
  }
  const detecting = runtime.output.spinner('Detecting your project…')
  const checked = await preflight(options.cwd, options.force)
  if (!checked.ok) {
    detecting.fail('Cannot run here')
    return refuse(runtime, checked.reason)
  }
  const detected = await detectProject(options.cwd)
  const found = detectHarnesses(runtime.env)
  detecting.stop(detectionSummary(detected, found))
  const approved = await approvePlan({
    yes: options.yes,
    dryRun: options.dryRun,
    found: {framework: detected.framework, harnesses: found},
    renderSelected: async (selections) =>
      renderPlan(
        await planRows(stepList(detected, selections, runtime), quietContext(options.cwd, options.yes)),
        harnessRows(found, selections),
      ),
    prompts: runtime.prompts,
    output: runtime.output,
  })
  if (approved.decision === 'cancelled') {
    runtime.output.cancelled('Nothing changed.')
    return {outcome: 'cancelled', reason: 'cancelled — nothing changed'}
  }
  if (approved.decision === 'dry-run') {
    runtime.output.outro('Dry run — nothing changed.')
    return {outcome: 'planned', plan: approved.plan}
  }
  const backups = guardBackups()
  backups.remember(captureFile(consentFile(options.cwd)))
  writeConsent(options.cwd, approved.selections.harnesses)
  const settings: RunSettings = {
    cwd: options.cwd,
    yes: options.yes,
    dryRun: false,
    backup: backups.remember,
    interrupt: (recover) =>
      onInterrupt(() => {
        recover()
        backups.restore()
        runtime.output.cancelled('Interrupted — your config was restored.')
        runtime.exit(130)
      }),
  }
  const entries = await runSteps(stepList(detected, approved.selections, runtime), settings, runtime.output)
  backups.release()
  const next = nextSteps(detected.packageManager)
  emitOutro(runtime.output, entries, next)
  return {outcome: 'completed', steps: entries, next}
}

function refuse(runtime: InitRuntime, reason: string): InitResult {
  runtime.output.error(reason)
  runtime.output.failure('conciv init stopped — nothing changed.')
  return {outcome: 'refused', reason}
}

export async function runSteps(steps: InitStep[], settings: RunSettings, output: InitOutput): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = []
  for (const current of steps) {
    entries.push(await runOne(current, settings, output))
  }
  return entries
}

async function runOne(step: InitStep, settings: RunSettings, output: InitOutput): Promise<LedgerEntry> {
  const emissions: Emission[] = []
  const {interrupt, ...base} = settings
  const ctx: InitContext = {
    ...base,
    report: (text) => {
      emissions.push({kind: 'line', text})
    },
    note: (note) => {
      emissions.push({kind: 'note', note})
    },
  }
  const line = output.step(step.running)
  const release = interrupt(() => {
    line.settle({status: 'skipped', summary: `${step.title} — interrupted`})
  })
  const entry = await settleStep(step, ctx).finally(release)
  line.settle({status: entry.status, summary: stepSummary(step, entry)})
  for (const emission of emissions) emit(output, emission)
  return entry
}

function emit(output: InitOutput, emission: Emission): void {
  if (emission.kind === 'note') {
    output.note(emission.note)
    return
  }
  output.line(emission.text)
}

function stepSummary(step: InitStep, entry: LedgerEntry): string {
  if (entry.status === 'done') return step.completed
  if (entry.status === 'already') return `${step.title} — already wired`
  const reason = firstLine(entry.detail)
  if (entry.status === 'skipped') return `${step.title} — skipped${reason === null ? '' : `: ${reason}`}`
  if (reason === null) return `${step.title} — needs a manual step (see the card below)`
  return `${step.title} — needs a manual step: ${reason}`
}

function firstLine(detail: string | undefined): string | null {
  if (detail === undefined) return null
  const [first] = detail.split('\n')
  if (first === undefined || first.trim().length === 0) return null
  return first.trim()
}

async function settleStep(step: InitStep, ctx: InitContext): Promise<LedgerEntry> {
  const found = await step.detect(ctx).catch(() => 'missing' as const)
  if (found === 'present') return {id: step.id, title: step.title, status: 'already', cards: []}
  if (ctx.dryRun) {
    const planned = await step.plan(ctx)
    ctx.report(`${step.title}: ${planned.summary}`)
    return {id: step.id, title: step.title, status: 'skipped', cards: []}
  }
  const outcome = await step.apply(ctx).catch((error: unknown) => manualOutcome(step, ctx, error))
  if (outcome.status === 'skipped')
    return {id: step.id, title: step.title, status: 'skipped', cards: [], detail: outcome.detail}
  if (outcome.status === 'manual')
    return {id: step.id, title: step.title, status: 'manual', cards: outcome.cards, detail: outcome.detail}
  const verified = await step.verify(ctx).catch(() => false)
  if (!verified)
    return {
      id: step.id,
      title: step.title,
      status: 'manual',
      cards: [step.manualCard(ctx)],
      detail: 'verification failed',
    }
  return {id: step.id, title: step.title, status: 'done', cards: []}
}

function manualOutcome(step: InitStep, ctx: InitContext, error: unknown): StepOutcome {
  const detail = error instanceof Error ? error.message : String(error)
  return {status: 'manual', cards: [step.manualCard(ctx)], detail}
}
