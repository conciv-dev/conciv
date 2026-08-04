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

export async function runInit(options: InitOptions): Promise<LedgerEntry[]> {
  const context: InitContext = {
    cwd: options.cwd,
    yes: options.yes,
    dryRun: options.dryRun,
    report: (line) => console.log(line),
  }
  return runSteps([], context)
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
