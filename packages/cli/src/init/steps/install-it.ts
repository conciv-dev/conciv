import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {addDependencyCommand, addDevDependency, detectPackageManager} from 'nypm'
import {z} from 'zod'
import type {InitStep, ManualCard} from '../pipeline.js'

const itName = '@conciv/it'

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

export type PackageJson = z.infer<typeof manifestSchema>

export type AddDep = (name: string, opts: {cwd: string}) => Promise<void>

export function hasIt(pkg: PackageJson): boolean {
  return itName in (pkg.dependencies ?? {}) || itName in (pkg.devDependencies ?? {})
}

function readManifest(cwd: string): PackageJson {
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')))
  if (!parsed.success) return {}
  return parsed.data
}

async function installCard(cwd: string): Promise<ManualCard> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  const command = addDependencyCommand(found?.name ?? 'npm', itName, {dev: true})
  return {title: `Install ${itName}`, body: 'The automatic install failed. Run this in your project:', snippet: command}
}

const nypmAdd: AddDep = async (name, opts) => {
  await addDevDependency(name, {cwd: opts.cwd, silent: true})
}

export function installItStep(add: AddDep = nypmAdd): InitStep {
  return {
    id: 'install',
    title: `Install ${itName}`,
    detect: async (ctx) => (hasIt(readManifest(ctx.cwd)) ? 'present' : 'missing'),
    plan: async () => ({summary: `add ${itName} as a dev dependency`, wouldEdit: ['package.json']}),
    apply: async (ctx) => {
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
