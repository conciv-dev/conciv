import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import type {HarnessInit, HarnessInitCommand, HarnessInitPlan} from '@conciv/protocol/harness-types'
import type {HarnessId} from '../../harness-detect.js'
import {captureFile} from '../../interrupt.js'
import type {ManualCard, StepOutcome} from '../../ledger.js'
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
    mkdirSync(dirname(file.path), {recursive: true})
    ctx.backup(captureFile(file.path))
    writeFileSync(file.path, file.contents, {mode: file.mode ?? 0o600})
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

function installCard(init: HarnessInit<HarnessId>, root: string): ManualCard {
  return init.manualCard(root)
}

async function applyInit(
  ctx: InitContext,
  init: HarnessInit<HarnessId>,
  consented: () => HarnessId[],
  io: HarnessInitIo,
): Promise<StepOutcome> {
  if (!consented().includes(init.harnessId)) return {status: 'skipped', detail: 'not selected'}
  const plan = init.plan(projectOf(ctx.cwd))
  writePlanFiles(ctx, plan)
  for (const command of plan.commands) {
    const failed = await runCommand(ctx, io, command)
    if (failed !== null) return {status: 'manual', cards: [installCard(init, plan.root)], detail: failed}
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
    manualCard: (ctx) => installCard(init, init.plan(projectOf(ctx.cwd)).root),
  }
}
