import {dirname, join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const TYPESCRIPT_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts']

const shownConfigSchema = z.object({
  exclude: z.array(z.string()).default([]),
  references: z.array(z.object({path: z.string()})).default([]),
})

type Coverage = {included: Set<string>; excluded: string[]}

type TypecheckRun = {config: string; followReferences: boolean}

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
    `every tracked TypeScript file must be checked by its package's "typecheck" script: add it to the include of a tsconfig that script runs with "tsc -p" or "tsc -b", or exclude it there by its path or its directory (glob excludes do not count):\n${messages.join('\n')}`,
  )
}

async function trackedTypescriptFiles(cwd: string): Promise<string[]> {
  const {stdout} = await execa('git', ['ls-files', '-z', '--', ...TYPESCRIPT_PATHSPECS], {cwd})
  return stdout.split('\0').filter((path) => path.length > 0)
}

async function packageViolations(pkg: WorkspacePackage, files: string[]): Promise<string[]> {
  const script = pkg.manifest.scripts?.typecheck
  if (script === undefined) return [`${pkg.relativeDir}: has TypeScript files but no "typecheck" script`]
  const runs = typecheckRuns(script)
  if (runs.length === 0) return [`${pkg.relativeDir}: "typecheck" script runs neither "tsc -p <tsconfig>" nor "tsc -b"`]
  const seen = new Set<string>()
  const coverages = await Promise.all(
    runs.map((run) => readCoverages(pkg.dir, resolve(pkg.dir, run.config), run.followReferences, seen)),
  )
  return files
    .filter((file) => !coverages.flat().some((coverage) => isCovered(coverage, file)))
    .map((file) => `${pkg.relativeDir}/${file}`)
}

function typecheckRuns(script: string): TypecheckRun[] {
  return script
    .split(/&&|\|\||;/)
    .map((command) => command.trim().split(/\s+/))
    .filter((words) => words[0] === 'tsc')
    .flatMap((words): TypecheckRun[] => {
      const flags = words.slice(1)
      if (flags.includes('-b') || flags.includes('--build')) {
        const projects = flags.filter((word) => !word.startsWith('-'))
        return (projects.length === 0 ? ['.'] : projects).map((project) => ({
          config: configFile(project),
          followReferences: true,
        }))
      }
      const flagIndex = flags.findIndex((word) => word === '-p' || word === '--project')
      const project = flagIndex === -1 ? '.' : (flags[flagIndex + 1] ?? '.')
      return [{config: configFile(project), followReferences: false}]
    })
}

function configFile(project: string): string {
  return project.endsWith('.json') ? project : join(project, 'tsconfig.json')
}

async function readCoverages(
  packageDir: string,
  config: string,
  followReferences: boolean,
  seen: Set<string>,
): Promise<Coverage[]> {
  if (seen.has(config)) return []
  seen.add(config)
  const configDir = dirname(config)
  const [shown, files] = await Promise.all([
    runTsc(packageDir, config, '--showConfig').then((stdout) => shownConfigSchema.parse(JSON.parse(stdout))),
    runTsc(packageDir, config, '--listFilesOnly').then((stdout) =>
      stdout.split('\n').filter((line) => line.length > 0),
    ),
  ])
  const toPackagePath = (path: string) => relative(packageDir, resolve(configDir, path))
  const coverage = {
    included: new Set(files.map(toPackagePath)),
    excluded: shown.exclude.filter((pattern) => !/[*?[{]/.test(pattern)).map(toPackagePath),
  }
  if (!followReferences) return [coverage]
  const referenced = await Promise.all(
    shown.references.map((reference) =>
      readCoverages(packageDir, configFile(resolve(configDir, reference.path)), true, seen),
    ),
  )
  return [coverage, ...referenced.flat()]
}

async function runTsc(packageDir: string, config: string, flag: string): Promise<string> {
  const result = await execa('tsc', ['-p', config, flag], {cwd: packageDir, preferLocal: true, reject: false})
  if (result.exitCode !== 0) throw new Error(`${config}: tsc ${flag} failed\n${result.stdout}${result.stderr}`)
  return result.stdout
}

function isCovered(coverage: Coverage, file: string): boolean {
  if (coverage.included.has(file)) return true
  return coverage.excluded.some((path) => file === path || file.startsWith(`${path}/`))
}
