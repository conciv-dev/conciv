import {defineCommand} from 'citty'

type InitFlags = {yes: boolean; dryRun: boolean; force: boolean}

type InitOptions = InitFlags & {cwd: string}

type InitResult = {outcome: 'done'; steps: []}

async function runInit(options: InitOptions): Promise<InitResult> {
  void options
  return {outcome: 'done', steps: []}
}

export const initCommand = defineCommand({
  meta: {name: 'init', description: 'Set this project up for conciv: install, wire the bundler, connect your agents.'},
  args: {
    yes: {type: 'boolean', default: false, description: 'accept every detected default (no prompts)'},
    'dry-run': {type: 'boolean', default: false, description: 'print the plan without touching anything'},
    force: {type: 'boolean', default: false, description: 'run even with uncommitted git changes'},
  },
  run: async ({args}) => {
    await runInit({yes: args.yes, dryRun: args['dry-run'], force: args.force, cwd: process.cwd()})
  },
})
