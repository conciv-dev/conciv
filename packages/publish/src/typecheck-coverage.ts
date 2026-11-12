import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const TYPESCRIPT_PATHSPECS = ['*.ts', '*.tsx', '*.mts', '*.cts']
const PRESET_PREFIX = '@conciv/tsconfig/'
const PRESET_OWNED_KEYS = ['include', 'exclude', 'files']
const OFF_PRESET_PACKAGES = new Set([
  'apps/examples/nextjs-app',
  'apps/examples/tanstack-start',
  'e2e/astro',
  'e2e/harnesses',
  'e2e/nextjs',
  'e2e/nextjs-component',
  'e2e/solid-start',
  'e2e/svelte',
  'e2e/tanstack-start',
  'e2e/tanstack-start-redact',
  'e2e/vite-preact-component',
  'e2e/vite-react',
  'e2e/vite-react-component',
  'e2e/vite-solid',
  'e2e/vite-solid-component',
  'e2e/vite-vanilla',
  'native/swift',
])

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
  const main = await readTsconfig(join(pkg.dir, 'tsconfig.json')).catch(() => undefined)
  const onPreset = main !== undefined && extendsPreset(main)
  if (OFF_PRESET_PACKAGES.has(pkg.relativeDir)) {
    return onPreset ? [`${pkg.relativeDir}: extends the @conciv/tsconfig preset, so it leaves the off-preset list`] : []
  }
  if (!onPreset) {
    return [
      `${pkg.relativeDir}/tsconfig.json: extends neither the @conciv/tsconfig preset nor is on the off-preset list`,
    ]
  }
  const script = pkg.manifest.scripts?.typecheck
  if (script === undefined) return [`${pkg.relativeDir}: has TypeScript files but no "typecheck" script`]
  const projects = typecheckProjects(script)
  if (projects.length === 0) return [`${pkg.relativeDir}: "typecheck" script runs no "tsc -p <tsconfig>"`]
  const configNames = [...new Set(['tsconfig.json', 'tsconfig.build.json', ...projects])]
  const configs = await Promise.all(configNames.map((name) => readTsconfig(join(pkg.dir, name))))
  const ownedKeys = configNames.flatMap((name, index) =>
    PRESET_OWNED_KEYS.filter((key) => key in (configs[index] ?? {})).map(
      (key) => `${pkg.relativeDir}/${name}: sets "${key}", which the @conciv/tsconfig preset owns`,
    ),
  )
  const checked = await Promise.all(projects.map((project) => listCheckedFiles(pkg.dir, resolve(pkg.dir, project))))
  const covered = new Set(checked.flat())
  const unchecked = files.filter((file) => !covered.has(file)).map((file) => `${pkg.relativeDir}/${file}: not checked`)
  return [...ownedKeys, ...unchecked]
}

async function readTsconfig(path: string): Promise<Tsconfig | undefined> {
  if (!existsSync(path)) return undefined
  const text = await readFile(path, 'utf8')
  const result = tsconfigSchema.safeParse(parseJson(path, text))
  if (!result.success) throw new Error(`${path}: invalid tsconfig\n${result.error.message}`)
  return result.data
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`${path}: a tsconfig on the @conciv/tsconfig preset is plain JSON`, {cause: error})
  }
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
