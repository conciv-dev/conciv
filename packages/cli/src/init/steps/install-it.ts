import {join} from 'node:path'
import {addDependencyCommand, addDevDependency, detectPackageManager} from 'nypm'
import {captureFile} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitStep} from '../pipeline.js'
import {hasDependency, readManifest, type PackageJson} from './manifest.js'

const itName = '@conciv/it'

export type AddDep = (name: string, opts: {cwd: string}) => Promise<void>

export function hasIt(pkg: PackageJson): boolean {
  return hasDependency(pkg, itName)
}

async function installCard(cwd: string): Promise<ManualCard> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  const command = addDependencyCommand(found?.name ?? 'npm', itName, {dev: true})
  return {title: `Install ${itName}`, body: 'The automatic install failed. Run this in your project:', snippet: command}
}

export const addWithNypm: AddDep = async (name, opts) => {
  await addDevDependency(name, {cwd: opts.cwd, silent: true})
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
      const failure = await add(itName, {cwd: ctx.cwd}).then(
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
