import {z} from 'zod'
import {command, description, name, toggle} from '@bomb.sh/router'
import type {CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {handler} from './router/handler.js'
import type {InitOptions, InitResult, InitRuntime} from './init/pipeline.js'

export type InitCommandOptions = InitOptions & {json: boolean}

export async function runInitCommand(
  options: InitCommandOptions,
  overrides: Partial<InitRuntime> = {},
): Promise<CliOutcome> {
  const {runInit} = await import('./init/pipeline.js')
  const {silentOutput} = await import('./init/silent.js')
  const quiet: Partial<InitRuntime> = options.json ? {output: silentOutput(), interactive: () => false} : {}
  const result = await runInit(options, {...quiet, ...overrides})
  return initOutcome(result, options.json)
}

function initOutcome(result: InitResult, json: boolean): CliOutcome {
  if (!json) return {report: 'none', code: result.outcome === 'refused' || result.outcome === 'cancelled' ? 1 : 0}
  if (result.outcome === 'completed') return {report: 'json', data: {steps: result.steps, next: result.next}}
  if (result.outcome === 'planned') return {report: 'json', data: {dryRun: true, plan: result.plan}}
  throw userFailure(result.reason, {hint: 'nothing was written'})
}

const InitModelSchema = z.object({yes: z.boolean(), dryRun: z.boolean(), force: z.boolean(), json: z.boolean()})

export const initCommand = command(
  name('init'),
  description('Set this project up for conciv: install, wire the bundler, connect your agents.'),
  toggle(name('yes'), description('accept every detected default (no prompts)')),
  toggle(name('dryRun'), description('print the plan without touching anything')),
  toggle(name('force'), description('run even with uncommitted git changes')),
  toggle(name('json'), description('print one JSON envelope instead of prompting')),
  handler((model) => runInitCommand({...InitModelSchema.parse(model), cwd: process.cwd()})),
)
