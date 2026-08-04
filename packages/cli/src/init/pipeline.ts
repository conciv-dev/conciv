import {execFile} from 'node:child_process'
import {homedir} from 'node:os'
import {detectProject, type Detected} from './detect.js'
import {detectHarnesses, harnessIds, type FoundHarness} from './harness-detect.js'
import {renderOutro} from './outro.js'
import {preflight} from './preflight.js'
import {fallbackStep} from './steps/framework/fallback.js'
import {nextjsStep} from './steps/framework/nextjs.js'
import {viteStep} from './steps/framework/vite.js'
import {webpackFamilyStep} from './steps/framework/webpack-family.js'
import {agentsMdStep} from './steps/harness/agents-md.js'
import {claudeStep} from './steps/harness/claude.js'
import {readConsent, writeConsent} from './steps/harness/consent.js'
import {addWithNypm, installItStep, type AddDep} from './steps/install-it.js'
import {
  approvePlan,
  clackOutput,
  clackPrompts,
  renderPlan,
  type ConfirmedSelections,
  type HarnessRow,
  type InitOutput,
  type PlanPrompts,
  type PlanRow,
} from './wizard.js'

export type StepStatus = 'done' | 'already' | 'manual' | 'skipped'

export type ManualCard = {title: string; body: string; snippet?: string}

export type StepOutcome =
  | {status: 'done'}
  | {status: 'skipped'; detail?: string}
  | {status: 'manual'; cards: ManualCard[]; detail?: string}

export type StepPlan = {summary: string; wouldEdit: string[]}

export type InitStep = {
  id: string
  title: string
  detect: (ctx: InitContext) => Promise<'missing' | 'present'>
  plan: (ctx: InitContext) => Promise<StepPlan>
  apply: (ctx: InitContext) => Promise<StepOutcome>
  verify: (ctx: InitContext) => Promise<boolean>
  manualCard: (ctx: InitContext) => ManualCard
}

export type InitContext = {cwd: string; yes: boolean; dryRun: boolean; report: (line: string) => void}

export type LedgerEntry = {id: string; title: string; status: StepStatus; cards: ManualCard[]; detail?: string}

export type InitOptions = {yes: boolean; dryRun: boolean; force: boolean; cwd: string}

export type SpawnBin = (bin: string, args: string[]) => Promise<{code: number; output: string}>

export type InitRuntime = {
  addDependency: AddDep
  spawn: SpawnBin
  prompts: PlanPrompts
  env: {PATH: string; HOME: string}
  output: InitOutput
}

function spawnBin(bin: string, args: string[]): Promise<{code: number; output: string}> {
  return new Promise((settle, reject) => {
    execFile(bin, args, (error, stdout, stderr) => {
      if (error === null) {
        settle({code: 0, output: `${stdout}${stderr}`})
        return
      }
      if (typeof error.code !== 'number') {
        reject(error)
        return
      }
      settle({code: error.code, output: `${stdout}${stderr}`})
    })
  })
}

function defaultRuntime(): InitRuntime {
  return {
    addDependency: addWithNypm,
    spawn: spawnBin,
    prompts: clackPrompts,
    env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? homedir()},
    output: clackOutput,
  }
}

function frameworkStep(detected: Detected): InitStep {
  if (detected.framework === 'vite') return viteStep(detected)
  if (detected.framework === 'nextjs') return nextjsStep(detected)
  if (detected.framework === 'webpack' || detected.framework === 'rspack') return webpackFamilyStep(detected)
  return fallbackStep(detected)
}

function nextSteps(packageManager: string): string[] {
  const dev = packageManager === 'npm' ? 'npm run dev' : `${packageManager} dev`
  return [`start your app: ${dev}`, 'ask your agent to run conciv tools --help']
}

function stepList(cwd: string, detected: Detected, selections: ConfirmedSelections, runtime: InitRuntime): InitStep[] {
  const consented = () => readConsent(cwd)
  return [
    installItStep(runtime.addDependency),
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

export async function runInit(options: InitOptions, overrides: Partial<InitRuntime> = {}): Promise<LedgerEntry[]> {
  const runtime: InitRuntime = {...defaultRuntime(), ...overrides}
  runtime.output.intro('conciv init')
  const detecting = runtime.output.spinner('Detecting your project…')
  const checked = await preflight(options.cwd, options.force)
  if (!checked.ok) {
    detecting.fail('Cannot run here')
    runtime.output.error(checked.reason)
    runtime.output.failure('conciv init stopped — nothing changed.')
    process.exitCode = 1
    return []
  }
  const detected = await detectProject(options.cwd)
  const found = detectHarnesses(runtime.env)
  detecting.stop(detectionSummary(detected, found))
  const planContext: InitContext = {cwd: options.cwd, yes: options.yes, dryRun: true, report: () => {}}
  const approved = await approvePlan({
    yes: options.yes,
    dryRun: options.dryRun,
    found: {framework: detected.framework, harnesses: found},
    renderSelected: async (selections) =>
      renderPlan(
        await planRows(stepList(options.cwd, detected, selections, runtime), planContext),
        harnessRows(found, selections),
      ),
    prompts: runtime.prompts,
    output: runtime.output,
  })
  if (approved === 'cancelled') {
    runtime.output.cancelled('Nothing changed.')
    return []
  }
  if (approved === 'dry-run') {
    runtime.output.outro('Dry run — nothing changed.')
    return []
  }
  writeConsent(options.cwd, approved.harnesses)
  const context: InitContext = {
    cwd: options.cwd,
    yes: options.yes,
    dryRun: false,
    report: (line) => runtime.output.line(line),
  }
  const entries = await runSteps(stepList(options.cwd, detected, approved, runtime), context)
  runtime.output.line(renderOutro(entries, nextSteps(detected.packageManager)))
  return entries
}

export async function runSteps(steps: InitStep[], ctx: InitContext): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = []
  for (const current of steps) {
    entries.push(await runOne(current, ctx))
  }
  return entries
}

async function runOne(step: InitStep, ctx: InitContext): Promise<LedgerEntry> {
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
