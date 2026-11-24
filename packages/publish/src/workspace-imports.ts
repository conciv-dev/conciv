import {readFile, realpath} from 'node:fs/promises'
import {isAbsolute, join, relative, resolve} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {typecheckProjects} from './typecheck-coverage.ts'
import {COMPILER_LIMIT, findOwner, mapInChunks, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/
const BUILD_CONFIG = /^(?:tsdown|vite)\.config\.[cm]?[jt]s$/
const NON_BUILD_FILE = /(?:^|\/)(?:test|__tests__)\/|\.(?:test|spec|stories|fixtures)\.[^/]+$/
const WORKSPACE_IMPORT =
  /(?:\bfrom|\bimport|\bimport\.meta\.resolve\(|\bimport\(|\brequire\()\s*['"](@conciv\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g

const PLUGIN_ROOT = 'packages/plugins/'
const KIT_BUILT_INS = ['@conciv/plugin-page']
const UI_KIT = /^@conciv\/ui-kit(?:-|$)/

type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'
const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

type SourceImports = {path: string; imports: string[]}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`${path}: invalid JSON`, {cause: error})
  }
}

function readName(pkg: WorkspacePackage): string {
  return pkg.manifest.name ?? pkg.relativeDir
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
  const ordered = await readTaskOrder(root, 'typecheck')
  const violations = await mapInChunks(packages, COMPILER_LIMIT, async (pkg) => {
    const task = `${readName(pkg)}#typecheck`
    const before = ordered.get(task) ?? new Set<string>()
    const reads = await readDistReads(root, packages, pkg, pkg.manifest.scripts?.typecheck)
    return reads.flatMap((name) => {
      const read = packages.find((other) => readName(other) === name && other.manifest.scripts?.build !== undefined)
      if (read === undefined) return []
      const needed = `${name}#build`
      return before.has(needed) ? [] : [`${task} reads ${name} dist but does not depend on ${needed}`]
    })
  })
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw new Error(
    `a typecheck depends on the build of every workspace package whose dist its program reads, directly or through a package it reads from source:\n${messages.join('\n')}`,
  )
}

async function readTaskOrder(root: string, taskName: string): Promise<Map<string, Set<string>>> {
  const command = `turbo run ${taskName} --dry=json`
  const {stdout} = await execa('turbo', ['run', taskName, '--dry=json'], {cwd: root, preferLocal: true})
  const result = turboDryRunSchema.safeParse(parseJson(command, stdout))
  if (!result.success) throw new Error(`${command}: invalid output\n${result.error.message}`)
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
  const plugins = packages.filter(
    (pkg) => pkg.relativeDir.startsWith(PLUGIN_ROOT) && !KIT_BUILT_INS.includes(readName(pkg)),
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
  throw new Error(
    `a plugin under packages/plugins draws through ctx.ui (conciv's own plugins read conciv's members with OpaqueUi.toInternal), never with @conciv/ui-kit*; only the built-in ${KIT_BUILT_INS.join(' and ')} draws with the kit directly, like opencode's gui plugins:\n${messages.join('\n')}`,
  )
}
