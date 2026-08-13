import {existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import type {HarnessInit, HarnessInitCommand, HarnessInitPlan} from '@conciv/protocol/harness-types'
import type {HarnessId} from '../../harness-detect.js'
import {captureDir, captureFile} from '../../interrupt.js'
import type {StepOutcome} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'

export type HarnessInitIo = {
  home: string
  run: (bin: string, args: string[], cwd: string) => Promise<{code: number; output: string}>
}

function stateDirOf(cwd: string): string {
  return join(cwd, '.conciv')
}

function projectOf(cwd: string): {cwd: string; stateDir: string} {
  return {cwd, stateDir: stateDirOf(cwd)}
}

function writePlanFiles(ctx: InitContext, plan: HarnessInitPlan): void {
  for (const file of plan.files) {
    const dir = dirname(file.path)
    ctx.backup(captureDir(dir))
    mkdirSync(dir, {recursive: true})
    ctx.backup(captureFile(file.path))
    writeFileSync(file.path, file.contents, {mode: file.mode ?? 0o600})
  }
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const absolute = join(dir, entry)
    return statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute]
  })
}

function sweepOwnedDirs(ctx: InitContext, plan: HarnessInitPlan): void {
  const planned = new Set(plan.files.map((file) => file.path))
  for (const dir of plan.ownedDirs ?? []) {
    for (const file of filesUnder(dir)) {
      if (planned.has(file)) continue
      ctx.backup(captureFile(file))
      rmSync(file, {force: true})
    }
  }
}

async function runCommand(ctx: InitContext, io: HarnessInitIo, command: HarnessInitCommand): Promise<string | null> {
  const rendered = `${command.bin} ${command.args.join(' ')}`
  const outcome = await io.run(command.bin, command.args, ctx.cwd).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error)
    return {code: -1, output: reason}
  })
  if (outcome.code === 0) return null
  const reason = outcome.output.trim()
  return reason.length === 0 ? `${rendered} failed` : `${rendered} failed: ${reason}`
}

async function applyInit(
  ctx: InitContext,
  init: HarnessInit<HarnessId>,
  consented: () => HarnessId[],
  io: HarnessInitIo,
): Promise<StepOutcome> {
  if (!consented().includes(init.harnessId)) return {status: 'skipped', detail: 'not selected'}
  const plan = init.plan(projectOf(ctx.cwd))
  if (plan.unresolved !== undefined) {
    return {status: 'manual', cards: [init.manualCard(plan.root)], detail: plan.unresolved}
  }
  writePlanFiles(ctx, plan)
  sweepOwnedDirs(ctx, plan)
  for (const command of plan.commands) {
    const failed = await runCommand(ctx, io, command)
    if (failed !== null) return {status: 'manual', cards: [init.manualCard(plan.root)], detail: failed}
  }
  return {status: 'done'}
}

function serves(init: HarnessInit<HarnessId>, cwd: string, consented: () => HarnessId[], io: HarnessInitIo): boolean {
  if (!consented().includes(init.harnessId)) return false
  return init.installed({...projectOf(cwd), home: io.home})
}

export function harnessInitStep(
  init: HarnessInit<HarnessId>,
  consented: () => HarnessId[],
  io: HarnessInitIo,
): InitStep {
  return {
    id: init.harnessId,
    title: init.title,
    running: init.running,
    completed: init.completed,
    detect: async (ctx) => (serves(init, ctx.cwd, consented, io) ? 'present' : 'missing'),
    plan: async (ctx) => ({
      summary: init.planSummary,
      wouldEdit: [relative(ctx.cwd, init.plan(projectOf(ctx.cwd)).root)],
    }),
    apply: (ctx) => applyInit(ctx, init, consented, io),
    verify: async (ctx) => serves(init, ctx.cwd, consented, io),
    manualCard: (ctx) => init.manualCard(init.plan(projectOf(ctx.cwd)).root),
  }
}
