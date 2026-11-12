import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const TYPESCRIPT_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts']
const PRESET_PREFIX = '@conciv/tsconfig/'
const PACKAGE_TSCONFIGS = ['tsconfig.json', 'tsconfig.build.json']
const PRESET_OWNED_KEYS = ['include', 'exclude', 'files']

const tsconfigSchema = z.looseObject({extends: z.union([z.string(), z.array(z.string())]).optional()})

type Tsconfig = z.infer<typeof tsconfigSchema>

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
    `every package on the @conciv/tsconfig preset takes its include from the preset, and its "typecheck" script checks every tracked TypeScript file:\n${messages.join('\n')}`,
  )
}

async function trackedTypescriptFiles(cwd: string): Promise<string[]> {
  const {stdout} = await execa('git', ['ls-files', '-z', '--', ...TYPESCRIPT_PATHSPECS], {cwd})
  return stdout.split('\0').filter((path) => path.length > 0)
}

async function packageViolations(pkg: WorkspacePackage, files: string[]): Promise<string[]> {
  const configs = await readPackageTsconfigs(pkg.dir)
  const main = configs.get('tsconfig.json')
  if (main === undefined || !extendsPreset(main)) return []
  const ownedKeys = [...configs].flatMap(([name, config]) =>
    PRESET_OWNED_KEYS.filter((key) => key in config).map(
      (key) => `${pkg.relativeDir}/${name}: sets "${key}", which the @conciv/tsconfig preset owns`,
    ),
  )
  const script = pkg.manifest.scripts?.typecheck
  if (script === undefined) return [...ownedKeys, `${pkg.relativeDir}: has TypeScript files but no "typecheck" script`]
  const projects = typecheckProjects(script)
  if (projects.length === 0) return [...ownedKeys, `${pkg.relativeDir}: "typecheck" script runs no "tsc -p <tsconfig>"`]
  const checked = await Promise.all(projects.map((project) => listCheckedFiles(pkg.dir, resolve(pkg.dir, project))))
  const covered = new Set(checked.flat())
  const unchecked = files.filter((file) => !covered.has(file)).map((file) => `${pkg.relativeDir}/${file}: not checked`)
  return [...ownedKeys, ...unchecked]
}

async function readPackageTsconfigs(packageDir: string): Promise<Map<string, Tsconfig>> {
  const present = PACKAGE_TSCONFIGS.filter((name) => existsSync(join(packageDir, name)))
  const texts = await Promise.all(present.map((name) => readFile(join(packageDir, name), 'utf8')))
  if (present[0] !== 'tsconfig.json' || !texts[0]?.includes(PRESET_PREFIX)) return new Map()
  return new Map(
    present.map((name, index): [string, Tsconfig] => [name, parseTsconfig(join(packageDir, name), texts[index])]),
  )
}

function parseTsconfig(path: string, text: string | undefined): Tsconfig {
  const result = tsconfigSchema.safeParse(JSON.parse(text ?? '{}'))
  if (!result.success) throw new Error(`${path}: invalid tsconfig\n${result.error.message}`)
  return result.data
}

function extendsPreset(config: Tsconfig): boolean {
  const parents = typeof config.extends === 'string' ? [config.extends] : (config.extends ?? [])
  return parents.some((parent) => parent.startsWith(PRESET_PREFIX))
}

function typecheckProjects(script: string): string[] {
  return script
    .split(/&&|\|\||;/)
    .map((command) => command.trim().split(/\s+/))
    .filter((words) => words[0] === 'tsc')
    .map((words) => {
      const flagIndex = words.findIndex((word) => word === '-p' || word === '--project')
      const project = flagIndex === -1 ? '.' : (words[flagIndex + 1] ?? '.')
      return project.endsWith('.json') ? project : join(project, 'tsconfig.json')
    })
}

async function listCheckedFiles(packageDir: string, config: string): Promise<string[]> {
  const result = await execa('tsc', ['-p', config, '--listFilesOnly'], {
    cwd: packageDir,
    preferLocal: true,
    reject: false,
  })
  if (result.exitCode !== 0) throw new Error(`${config}: tsc --listFilesOnly failed\n${result.stdout}${result.stderr}`)
  return result.stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => relative(packageDir, line))
}
