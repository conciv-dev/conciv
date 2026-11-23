import {homedir} from 'node:os'
import {difference} from 'es-toolkit'
import {concivHome} from '@conciv/db'
import {createHubConnections} from '@conciv/harness-init/hub'
import {initContributions} from '@conciv/harness-init/registry'
import {CONCIV_BIN} from '@conciv/harness-init/agent-guide'
import {detectProject, type Detected} from './detect.js'
import {detectHarnesses, type FoundHarness} from '@conciv/harness-init/detect'
import {harnessFileInits, harnessIds, type HarnessId} from './harness-detect.js'
import {guardBackups, interruptExitCode, onInterrupt, pathExists, type FileBackup} from './interrupt.js'
import type {LedgerEntry, ManualCard, StepNote, StepOutcome, StepPlan, StepStatus} from './ledger.js'
import {docsPackStep} from './steps/docs-pack.js'
import {fallbackStep} from './steps/framework/fallback.js'
import {nextjsStep} from './steps/framework/nextjs.js'
import {viteStep} from './steps/framework/vite.js'
import {webpackFamilyStep} from './steps/framework/webpack-family.js'
import {agentsMdStep} from './steps/harness/agents-md.js'
import {connectAgentStep} from './steps/harness/connect-agent.js'
import {harnessInitStep} from './steps/harness/install-harness.js'
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
import {execFile, spawn} from 'node:child_process'
import {join} from 'node:path'
import {promisify} from 'node:util'

type CommandOutcome = {code: number; output: string}

const interruptGraceMs = 5000

export function execFileOutcome(
  bin: string,
  args: string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    started?: (pid: number) => string | null
    signal?: AbortSignal
  },
  onLine: (line: string) => void,
): Promise<CommandOutcome> {
  return new Promise((settle, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
      killSignal: 'SIGKILL',
      detached: options.signal !== undefined,
    })
    const running = (): boolean => child.exitCode === null && child.signalCode === null
    const signalGroup = (signal: NodeJS.Signals): void => {
      if (child.pid !== undefined && running()) process.kill(-child.pid, signal)
    }
    const killGroup = (): void => signalGroup('SIGKILL')
    const stopGroup = (): void => {
      signalGroup('SIGINT')
      const timer = setTimeout(killGroup, interruptGraceMs)
      const releaseForce = onInterrupt(killGroup)
      child.on('close', () => {
        clearTimeout(timer)
        releaseForce()
      })
    }
    options.signal?.addEventListener('abort', stopGroup, {once: true})
    if (options.signal !== undefined) process.on('exit', killGroup)
    child.on('close', () => {
      options.signal?.removeEventListener('abort', stopGroup)
      process.off('exit', killGroup)
    })
    if (options.signal?.aborted) stopGroup()
    const refused = child.pid === undefined ? null : (options.started?.(child.pid) ?? null)
    if (refused !== null) {
      child.kill('SIGKILL')
      settle({code: 1, output: refused})
      return
    }
    let output = ''
    let pending = ''
    const consume = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    }
    child.stdout?.on('data', consume)
    child.stderr?.on('data', consume)
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (pending.length > 0) onLine(pending)
      if (code === null) {
        const note = signal ? `terminated by ${signal}` : 'terminated without exit code'
        settle({code: 1, output: output.length > 0 ? `${output}\n${note}` : note})
        return
      }
      settle({code, output})
    })
  })
}

const quickStartDocs = 'https://conciv.dev/docs/quick-start'

export function emitOutro(output: InitOutput, entries: LedgerEntry[], next: string[]): void {
  const cards = entries.flatMap((entry) => entry.cards)
  for (const card of cards) output.note({title: card.title, body: cardBody(card)})
  if (cards.length > 0) {
    output.warn(summaryLine(entries))
    output.outro(nextLine([...next, `docs: ${quickStartDocs}`]))
    return
  }
  output.success(summaryLine(entries))
  output.outro(nextLine(next))
}

function cardBody(card: ManualCard): string {
  if (card.snippet === undefined) return card.body
  return `${card.body}\n\n${card.snippet}`
}

function summaryLine(entries: LedgerEntry[]): string {
  const counted = (status: StepStatus) => entries.filter((entry) => entry.status === status).length
  const manual = counted('manual')
  const parts = [
    ...countPart(counted('done'), 'wired'),
    ...countPart(counted('already'), 'already wired'),
    ...countPart(manual, manual === 1 ? 'manual step below' : 'manual steps below'),
    ...countPart(counted('skipped'), 'skipped'),
  ]
  if (parts.length === 0) return 'nothing to do'
  return parts.join(' · ')
}

function countPart(count: number, label: string): string[] {
  if (count === 0) return []
  return [`${count} ${label}`]
}

function nextLine(next: string[]): string {
  if (next.length === 0) return 'conciv init finished.'
  return `Next steps — ${next.join(' · ')}`
}

const run = promisify(execFile)

type PreflightResult = {ok: true} | {ok: false; reason: string}

type TreeState = {kind: 'clean'} | {kind: 'dirty'} | {kind: 'no-repository'} | {kind: 'unreadable'; detail: string}

const NO_REPOSITORY = 'not a git repository'

export async function preflight(cwd: string, force: boolean): Promise<PreflightResult> {
  if (!(await pathExists(join(cwd, 'package.json')))) {
    return {ok: false, reason: 'no package.json here — run init from your app directory'}
  }
  if (force) return {ok: true}
  const tree = await gitTreeState(cwd)
  if (tree.kind === 'dirty') return {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
  if (tree.kind === 'unreadable') {
    return {ok: false, reason: `git status failed here (${tree.detail}) — fix it or pass --force`}
  }
  return {ok: true}
}

async function gitTreeState(cwd: string): Promise<TreeState> {
  try {
    const status = await run('git', ['status', '--porcelain'], {cwd, env: {...process.env, LC_ALL: 'C'}})
    return status.stdout.trim().length > 0 ? {kind: 'dirty'} : {kind: 'clean'}
  } catch (error) {
    const detail = gitFailureDetail(error)
    if (detail.toLowerCase().includes(NO_REPOSITORY)) return {kind: 'no-repository'}
    return {kind: 'unreadable', detail}
  }
}

function gitFailureDetail(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)
  const stderr = 'stderr' in error ? error.stderr : undefined
  if (typeof stderr === 'string' && stderr.trim().length > 0) return firstTrimmedLine(stderr)
  const message = 'message' in error ? error.message : undefined
  if (typeof message === 'string' && message.length > 0) return firstTrimmedLine(message)
  return 'git could not be run'
}

function firstTrimmedLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

export type RunSettings = {
  cwd: string
  yes: boolean
  dryRun: boolean
  backup: (file: FileBackup) => void
  signal: AbortSignal
}

export type InitContext = RunSettings & {
  report: (line: string) => void
  note: (note: StepNote) => void
  feed: (line: string) => void
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

type SpawnOptions = {timeout?: number; started?: (pid: number) => string | null; signal?: AbortSignal}

export type SpawnBin = (
  bin: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
  options?: SpawnOptions,
) => Promise<{code: number; output: string}>

export type InitRuntime = {
  addDependency: AddDep
  spawn: SpawnBin
  prompts: PlanPrompts
  env: {PATH: string; HOME: string}
  concivHome: string
  output: InitOutput
  interactive: () => boolean
  exit: (code: number) => void
}

type Emission = {kind: 'line'; text: string} | {kind: 'note'; note: StepNote}

function spawnBin(
  bin: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void,
  options?: SpawnOptions,
): Promise<CommandOutcome> {
  return execFileOutcome(bin, args, {cwd, ...options}, onLine)
}

function defaultRuntime(): InitRuntime {
  return {
    addDependency: addWithNypm(spawnBin),
    spawn: spawnBin,
    prompts: clackPrompts,
    env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? homedir()},
    concivHome: concivHome({env: process.env}),
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
  return [`start your app: ${dev}`, `ask your agent to run ${CONCIV_BIN} tools --help`]
}

function stepList(
  detected: Detected,
  selections: ConfirmedSelections,
  runtime: InitRuntime,
  agents: HarnessId[],
): InitStep[] {
  const consented = () => selections.harnesses
  return [
    installItStep(runtime.addDependency, detected.packageManager),
    ...(selections.framework ? [frameworkStep(detected)] : []),
    agentsMdStep(consented),
    ...harnessFileInits.map((init) => harnessInitStep(init, consented, {home: runtime.env.HOME, run: runtime.spawn})),
    ...agents.map((agent) =>
      connectAgentStep(agent, () => selections.agents, {concivHome: runtime.concivHome, spawn: runtime.spawn}),
    ),
    ...(selections.docsPack ? [docsPackStep(runtime.addDependency, runtime.spawn)] : []),
  ]
}

function hubAgents(found: FoundHarness[]): HarnessId[] {
  return found.flatMap(({id}) => (initContributions[id].hub === undefined ? [] : [id]))
}

async function connectableAgents(found: FoundHarness[], home: string): Promise<HarnessId[]> {
  return difference(hubAgents(found), await connectedAgents(home))
}

async function connectedAgents(home: string): Promise<HarnessId[]> {
  try {
    return (await createHubConnections(home).list()).map((connection) => connection.harness)
  } catch {
    return []
  }
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
  return {
    cwd,
    yes,
    dryRun: true,
    signal: new AbortController().signal,
    report: () => {},
    note: () => {},
    backup: () => {},
    feed: () => {},
  }
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
  const found = await detectHarnesses(runtime.env)
  const agents = await connectableAgents(found, runtime.concivHome)
  detecting.stop(detectionSummary(detected, found))
  const approved = await approvePlan({
    yes: options.yes,
    dryRun: options.dryRun,
    found: {framework: detected.framework, harnesses: found, agents},
    renderSelected: async (selections) =>
      renderPlan(
        await planRows(
          stepList(detected, selections, runtime, hubAgents(found)),
          quietContext(options.cwd, options.yes),
        ),
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
  const interruption = new AbortController()
  const releaseInterrupt = onInterrupt((signal) => interruption.abort(signal))
  const settings: RunSettings = {
    cwd: options.cwd,
    yes: options.yes,
    dryRun: false,
    backup: backups.remember,
    signal: interruption.signal,
  }
  const entries = await runSteps(
    stepList(detected, approved.selections, runtime, hubAgents(found)),
    settings,
    runtime.output,
  )
  releaseInterrupt()
  if (interruption.signal.aborted) {
    backups.restore()
    runtime.output.cancelled('Interrupted — your config was restored.')
    runtime.exit(interruptExitCode(interruption.signal.reason))
    return {outcome: 'cancelled', reason: 'interrupted, your config was restored'}
  }
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
    if (settings.signal.aborted) break
    entries.push(await runOne(current, settings, output))
  }
  return entries
}

async function runOne(step: InitStep, settings: RunSettings, output: InitOutput): Promise<LedgerEntry> {
  const emissions: Emission[] = []
  const line = output.step(step.running)
  const ctx: InitContext = {
    ...settings,
    report: (text) => {
      emissions.push({kind: 'line', text})
    },
    note: (note) => {
      emissions.push({kind: 'note', note})
    },
    feed: (text) => {
      line.line(text)
    },
  }
  const entry = await settleStep(step, ctx)
  if (settings.signal.aborted) {
    line.settle({status: 'skipped', summary: `${step.title} — interrupted`})
    return entry
  }
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
  const failure = await step.verify(ctx).then(
    (verified) => (verified ? null : 'verification failed'),
    (error: unknown) => `verification failed: ${readMessage(error)}`,
  )
  if (failure !== null)
    return {id: step.id, title: step.title, status: 'manual', cards: [step.manualCard(ctx)], detail: failure}
  return {id: step.id, title: step.title, status: 'done', cards: []}
}

function manualOutcome(step: InitStep, ctx: InitContext, error: unknown): StepOutcome {
  return {status: 'manual', cards: [step.manualCard(ctx)], detail: readMessage(error)}
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
