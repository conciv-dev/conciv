import {existsSync} from 'node:fs'
import {readFile, realpath} from 'node:fs/promises'
import {isAbsolute, join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {typecheckProjects} from './typecheck-coverage.ts'
import {COMPILER_LIMIT, findOwner, mapInChunks, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'
import {causeFrom, publishErrors} from './errors/errors.ts'

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/
const BUILD_CONFIG = /^(?:vite|tsdown)\.config\.[cm]?[jt]s$/
const NON_BUILD_FILE = /(?:^|\/)(?:test|__tests__)\/|\.(?:test|spec|stories|fixtures)\.[^/]+$/
const WORKSPACE_IMPORT =
  /(?:\bfrom|\bimport|\bimport\.meta\.resolve\(|\bimport\(|\brequire\()\s*['"](@conciv\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g

const PLUGIN_ROOT = 'packages/plugins/'
const UI_KIT = /^@conciv\/ui-kit(?:-|$)/

type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'
const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

type SourceImports = {path: string; imports: string[]}

const TYPE_TASKS = ['typecheck']

const turboSchema = z.looseObject({
  tasks: z.record(z.string(), z.looseObject({dependsOn: z.array(z.string()).optional()})).optional(),
})

export async function assertTasksDependOnUpstreamBuilds(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const files = [
    {file: 'turbo.json', path: join(cwd, 'turbo.json'), root: true},
    ...packages.map((pkg) => ({file: `${pkg.relativeDir}/turbo.json`, path: join(pkg.dir, 'turbo.json'), root: false})),
  ].filter((entry) => existsSync(entry.path))
  const violations = await Promise.all(
    files.map(async ({file, path, root}) => {
      const tasks = Object.entries((await readTurboConfig(path)).tasks ?? {})
      const edges = tasks.flatMap(([task, config]) =>
        (config.dependsOn ?? [])
          .filter((entry) => entry.includes('#') && !entry.startsWith('//#'))
          .map((entry) => `${file}: ${task} depends on ${entry}, a task of a named package`),
      )
      const build = tasks.find(([task]) => task === 'build')?.[1].dependsOn
      const upstream =
        root || build === undefined || build.includes('^build') ? [] : [`${file}: build.dependsOn leaves out ^build`]
      return [...edges, ...upstream]
    }),
  )
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw publishErrors.TURBO_TASK_EDGES({violations: messages})
}

function readName(pkg: WorkspacePackage): string {
  return pkg.manifest.name ?? pkg.relativeDir
}

async function readTurboConfig(path: string): Promise<z.infer<typeof turboSchema>> {
  const text = await readFile(path, 'utf8')
  const result = turboSchema.safeParse(parseJson(path, text))
  if (!result.success) throw publishErrors.INVALID_TURBO_CONFIG({path, reason: result.error.message})
  return result.data
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    throw publishErrors.INVALID_JSON({path, ...causeFrom(error)})
  }
}

async function readBuildSourceImports(
  cwd: string,
  packages: WorkspacePackage[],
  pkg: WorkspacePackage,
): Promise<SourceImports[]> {
  const {stdout} = await execa('git', ['ls-files', '-z', '--', pkg.relativeDir], {cwd})
  const sources = stdout
    .split('\0')
    .filter((path) => path.length > 0 && findOwner(packages, path) === pkg)
    .filter((path) => isBuildSource(relative(pkg.relativeDir, path)))
  return Promise.all(
    sources.map(async (path) => {
      const text = await readFile(join(cwd, path), 'utf8')
      return {path, imports: [...text.matchAll(WORKSPACE_IMPORT)].flatMap((match) => match[1] ?? [])}
    }),
  )
}

function isBuildSource(path: string): boolean {
  if (!SOURCE_EXTENSION.test(path) || NON_BUILD_FILE.test(path)) return false
  return path.startsWith('src/') || BUILD_CONFIG.test(path)
}

const RESOLVING_MODULE = /^======== Resolving module '([^']+)' from '([^']+)'\. ========$/

const turboDryRunSchema = z.object({
  tasks: z.array(z.looseObject({taskId: z.string(), dependencies: z.array(z.string())})),
})

type ProgramFile = {path: string; owner: WorkspacePackage; built: boolean}

export async function assertTypeTasksDependOnDistReads(cwd: string): Promise<void> {
  const root = await realpath(cwd)
  const packages = await readWorkspacePackages(root)
  const violations = await mapInChunks(TYPE_TASKS, 1, async (taskName) => {
    const ordered = await readTaskOrder(root, taskName)
    const perPackage = await mapInChunks(packages, COMPILER_LIMIT, async (pkg) => {
      const task = `${readName(pkg)}#${taskName}`
      const before = ordered.get(task) ?? new Set<string>()
      const reads = await readDistReads(root, packages, pkg, pkg.manifest.scripts?.[taskName])
      return reads.flatMap((name) => {
        const read = packages.find((other) => readName(other) === name && other.manifest.scripts?.build !== undefined)
        if (read === undefined) return []
        const needed = `${name}#build`
        return before.has(needed) ? [] : [`${task} reads ${name} dist but does not depend on ${needed}`]
      })
    })
    return perPackage.flat()
  })
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw publishErrors.TYPECHECK_MISSES_BUILD({violations: messages})
}

async function readTaskOrder(root: string, taskName: string): Promise<Map<string, Set<string>>> {
  const command = `turbo run ${taskName} --dry=json`
  const {stdout} = await execa('turbo', ['run', taskName, '--dry=json'], {cwd: root, preferLocal: true})
  const result = turboDryRunSchema.safeParse(parseJson(command, stdout))
  if (!result.success) throw publishErrors.INVALID_COMMAND_OUTPUT({command, reason: result.error.message})
  const direct = new Map(result.data.tasks.map((task) => [task.taskId, task.dependencies]))
  return new Map([...direct.keys()].map((task) => [task, collectDependencies(direct, task)]))
}

function collectDependencies(direct: Map<string, string[]>, task: string): Set<string> {
  const seen = new Set<string>()
  const queue = [...(direct.get(task) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || seen.has(current)) continue
    seen.add(current)
    queue.push(...(direct.get(current) ?? []))
  }
  return seen
}

async function readDistReads(
  root: string,
  packages: WorkspacePackage[],
  pkg: WorkspacePackage,
  script: string | undefined,
): Promise<string[]> {
  if (script === undefined) return []
  const traces = await mapInChunks(typecheckProjects(script), 1, (project) =>
    traceProgram(pkg.dir, resolve(pkg.dir, project)),
  )
  const lines = [...new Set(traces.flat())]
  const resolutions = lines.flatMap((line) => {
    const match = RESOLVING_MODULE.exec(line)
    return match?.[1] === undefined || match[2] === undefined ? [] : [{name: readPackageName(match[1]), from: match[2]}]
  })
  const files = lines.filter((line) => isAbsolute(line)).flatMap((file) => readProgramFile(root, packages, file))
  const readFromSource = new Set(files.filter((file) => !file.built).map((file) => readName(file.owner)))
  const fromWorkspace = resolutions.filter((resolution) => readProgramFile(root, packages, resolution.from).length > 0)
  return [...new Set(fromWorkspace.map((resolution) => resolution.name))].filter(
    (name) => name !== readName(pkg) && !readFromSource.has(name),
  )
}

async function traceProgram(packageDir: string, config: string): Promise<string[]> {
  const {stdout} = await execa('tsc', ['-p', config, '--listFilesOnly', '--traceResolution'], {
    cwd: packageDir,
    preferLocal: true,
    lines: true,
    stdout: function* (line: string) {
      if (isAbsolute(line) || RESOLVING_MODULE.test(line)) yield line
    },
  })
  return stdout
}

function readPackageName(specifier: string): string {
  const segments = specifier.split('/')
  return segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

function readProgramFile(root: string, packages: WorkspacePackage[], file: string): ProgramFile[] {
  const path = relative(root, file)
  if (path.startsWith('..') || path.split('/').includes('node_modules')) return []
  const owner = findOwner(packages, path)
  if (owner === undefined) return []
  return [{path, owner, built: relative(owner.relativeDir, path).startsWith('dist/')}]
}

export async function assertPluginsDrawThroughContextUi(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const builtIns = packages.filter((pkg) => pkg.manifest.conciv?.builtin === true).map(readName)
  const plugins = packages.filter(
    (pkg) => pkg.relativeDir.startsWith(PLUGIN_ROOT) && pkg.manifest.conciv?.builtin !== true,
  )
  const violations = await Promise.all(
    plugins.map(async (pkg) => {
      const sources = await readBuildSourceImports(cwd, packages, pkg)
      const imported = sources.flatMap(({path, imports}) =>
        [...new Set(imports)].filter((name) => UI_KIT.test(name)).map((name) => `${path}: imports ${name}`),
      )
      const declared = DEPENDENCY_FIELDS.flatMap((field) =>
        Object.keys(pkg.manifest[field] ?? {})
          .filter((name) => UI_KIT.test(name))
          .map((name) => `${pkg.relativeDir}/package.json: ${field} names ${name}`),
      )
      return [...imported, ...declared]
    }),
  )
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw publishErrors.PLUGIN_USES_UI_KIT({builtIns, violations: messages})
}
