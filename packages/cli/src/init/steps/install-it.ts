import {join} from 'node:path'
import {addDependencyCommand, addDevDependency} from 'nypm'
import {detectPackageManagerName} from '../detect.js'
import {captureFile} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitStep, SpawnBin} from '../pipeline.js'
import {hasDependency, readManifest, type PackageJson} from './manifest.js'

const itName = '@conciv/it'

export type AddDep = (name: string, opts: {cwd: string; signal: AbortSignal}) => Promise<void>

export function hasIt(pkg: PackageJson): boolean {
  return hasDependency(pkg, itName)
}

async function installCard(cwd: string): Promise<ManualCard> {
  const command = addDependencyCommand(await detectPackageManagerName(cwd), itName, {dev: true})
  return {title: `Install ${itName}`, body: 'The automatic install failed. Run this in your project:', snippet: command}
}

async function corepackAnswers(spawn: SpawnBin, cwd: string): Promise<boolean> {
  const outcome = await spawn('corepack', ['--version'], cwd, () => {}).catch(() => ({code: 1, output: ''}))
  return outcome.code === 0
}

async function resolveInstallCommand(
  spawn: SpawnBin,
  cwd: string,
  planned: {command: string; args: string[]},
): Promise<[string, string[]]> {
  if (planned.command !== 'pnpm' && planned.command !== 'yarn') return [planned.command, planned.args]
  if (!(await corepackAnswers(spawn, cwd))) return [planned.command, planned.args]
  return ['corepack', [planned.command, ...planned.args]]
}

export function addWithNypm(spawn: SpawnBin): AddDep {
  return async (name, opts) => {
    const packageManager = await detectPackageManagerName(opts.cwd)
    const planned = await addDevDependency(name, {cwd: opts.cwd, packageManager, dry: true})
    if (planned.exec === undefined) throw new Error(`nypm planned no command to add ${name}`)
    const [command, args] = await resolveInstallCommand(spawn, opts.cwd, planned.exec)
    const outcome = await spawn(command, args, opts.cwd, () => {}, {signal: opts.signal})
    if (outcome.code !== 0) throw new Error(`\`${[command, ...args].join(' ')}\` failed.\n${outcome.output}`)
  }
}

export function installItStep(add: AddDep, packageManager: string): InitStep {
  return {
    id: 'install',
    title: `Install ${itName}`,
    running: `Installing ${itName} with ${packageManager}…`,
    completed: `Installed ${itName}`,
    detect: async (ctx) => (hasIt(readManifest(ctx.cwd)) ? 'present' : 'missing'),
    plan: async () => ({summary: `add ${itName} as a dev dependency`, wouldEdit: ['package.json']}),
    apply: async (ctx) => {
      ctx.backup(captureFile(join(ctx.cwd, 'package.json')))
      const failure = await add(itName, {cwd: ctx.cwd, signal: ctx.signal}).then(
        () => null,
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      )
      if (failure === null) return {status: 'done'}
      return {status: 'manual', cards: [await installCard(ctx.cwd)], detail: failure}
    },
    verify: async (ctx) => hasIt(readManifest(ctx.cwd)),
    manualCard: () => ({
      title: `Install ${itName}`,
      body: `Add ${itName} as a dev dependency with your package manager, then re-run conciv init.`,
    }),
  }
}
