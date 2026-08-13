import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {addDependencyCommand, detectPackageManager} from 'nypm'
import {z} from 'zod'
import {captureFile} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitStep} from '../pipeline.js'

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

export type PackageJson = z.infer<typeof manifestSchema>

export type AddDep = (name: string, opts: {cwd: string}) => Promise<void>

export function hasDep(pkg: PackageJson, name: string): boolean {
  return name in (pkg.dependencies ?? {}) || name in (pkg.devDependencies ?? {})
}

function readManifest(cwd: string): PackageJson {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')))
  if (!parsed.success) return {}
  return parsed.data
}

async function installCard(cwd: string, name: string): Promise<ManualCard> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  const command = addDependencyCommand(found?.name ?? 'npm', name, {dev: true})
  return {title: `Install ${name}`, body: 'The automatic install failed. Run this in your project:', snippet: command}
}

export function depInstallStep(opts: {id: string; name: string; add: AddDep; packageManager: string}): InitStep {
  const {id, name, add, packageManager} = opts
  return {
    id,
    title: `Install ${name}`,
    running: `Installing ${name} with ${packageManager}…`,
    completed: `Installed ${name}`,
    detect: async (ctx) => (hasDep(readManifest(ctx.cwd), name) ? 'present' : 'missing'),
    plan: async () => ({summary: `add ${name} as a dev dependency`, wouldEdit: ['package.json']}),
    apply: async (ctx) => {
      ctx.backup(captureFile(join(ctx.cwd, 'package.json')))
      const failure = await add(name, {cwd: ctx.cwd}).then(
        () => null,
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      )
      if (failure === null) return {status: 'done'}
      return {status: 'manual', cards: [await installCard(ctx.cwd, name)], detail: failure}
    },
    verify: async (ctx) => hasDep(readManifest(ctx.cwd), name),
    manualCard: () => ({
      title: `Install ${name}`,
      body: `Add ${name} as a dev dependency with your package manager, then re-run conciv init.`,
    }),
  }
}
