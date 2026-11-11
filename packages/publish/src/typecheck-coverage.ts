import {dirname, join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const TYPESCRIPT_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts']

const shownConfigSchema = z.object({
  files: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
})

type Coverage = {included: Set<string>; excluded: string[]}

export async function assertTypecheckCoversTrackedFiles(cwd: string): Promise<void> {
  const [packages, tracked] = await Promise.all([readWorkspacePackages(cwd), trackedTypescriptFiles(cwd)])
  const filesByPackage = Map.groupBy(
    tracked.flatMap((path) => {
      const owner = findOwner(packages, path)
      return owner ? [{owner, path: relative(owner.relativeDir, path)}] : []
    }),
    (entry) => entry.owner,
  )
  const violations = await Promise.all(
    [...filesByPackage].map(([pkg, entries]) =>
      packageViolations(
        pkg,
        entries.map((entry) => entry.path),
      ),
    ),
  )
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw new Error(
    `every tracked TypeScript file must be checked by its package's "typecheck" script: add it to the include of a tsconfig that script runs with "tsc -p", or exclude it there by its path or its directory (glob excludes do not count):\n${messages.join('\n')}`,
  )
}

async function trackedTypescriptFiles(cwd: string): Promise<string[]> {
  const {stdout} = await execa('git', ['ls-files', '-z', '--', ...TYPESCRIPT_PATHSPECS], {cwd})
  return stdout.split('\0').filter((path) => path.length > 0)
}

async function packageViolations(pkg: WorkspacePackage, files: string[]): Promise<string[]> {
  const script = pkg.manifest.scripts?.typecheck
  if (script === undefined) return [`${pkg.relativeDir}: has TypeScript files but no "typecheck" script`]
  const configs = typecheckConfigs(script)
  if (configs.length === 0) return [`${pkg.relativeDir}: "typecheck" script runs no "tsc -p <tsconfig>"`]
  const coverages = await Promise.all(configs.map((config) => readCoverage(pkg.dir, config)))
  return files
    .filter((file) => !coverages.some((coverage) => isCovered(coverage, file)))
    .map((file) => `${pkg.relativeDir}/${file}`)
}

function typecheckConfigs(script: string): string[] {
  return script
    .split(/&&|\|\||;/)
    .map((command) => command.trim().split(/\s+/))
    .filter((words) => words[0] === 'tsc')
    .map((words) => {
      const flagIndex = words.findIndex((word) => word === '-p' || word === '--project')
      return flagIndex === -1 ? 'tsconfig.json' : (words[flagIndex + 1] ?? 'tsconfig.json')
    })
}

async function readCoverage(packageDir: string, config: string): Promise<Coverage> {
  const configDir = dirname(join(packageDir, config))
  const result = await execa('tsc', ['-p', config, '--showConfig'], {cwd: packageDir, preferLocal: true, reject: false})
  if (result.exitCode !== 0) {
    throw new Error(`${join(packageDir, config)}: tsc --showConfig failed\n${result.stdout}${result.stderr}`)
  }
  const shown = shownConfigSchema.parse(JSON.parse(result.stdout))
  const toPackagePath = (path: string) => relative(packageDir, resolve(configDir, path))
  return {
    included: new Set(shown.files.map(toPackagePath)),
    excluded: shown.exclude.filter((pattern) => !/[*?[{]/.test(pattern)).map(toPackagePath),
  }
}

function isCovered(coverage: Coverage, file: string): boolean {
  if (coverage.included.has(file)) return true
  return coverage.excluded.some((path) => file === path || file.startsWith(`${path}/`))
}
