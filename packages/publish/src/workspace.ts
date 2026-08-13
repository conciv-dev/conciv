import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {load} from 'js-yaml'
import {minimatch} from 'minimatch'
import {parseManifest, type Manifest} from './manifest.ts'

export type WorkspacePackage = {
  dir: string
  relativeDir: string
  manifest: Manifest
}

const PACKAGE_JSON = 'package.json'
const WORKSPACE_MANIFEST = 'pnpm-workspace.yaml'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function readWorkspaceGlobs(cwd: string): string[] {
  const manifestPath = join(cwd, WORKSPACE_MANIFEST)
  const content = readFileSync(manifestPath, 'utf8')
  const parsed: unknown = load(content)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${manifestPath}: expected a YAML mapping with a "packages" list`)
  }
  if (!('packages' in parsed) || !isStringArray(parsed.packages)) {
    throw new Error(`${manifestPath}: "packages" must be a list of glob strings`)
  }
  return parsed.packages
}

function* deepFindFiles(directoryPath: string): Generator<string> {
  for (const entry of readdirSync(directoryPath, {withFileTypes: true})) {
    const entryPath = join(directoryPath, entry.name)
    if (entry.isFile() && entry.name === PACKAGE_JSON) {
      yield entryPath
    } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      yield* deepFindFiles(entryPath)
    }
  }
}

function ensureEndsWithPackageJson(glob: string): string {
  if (glob.endsWith(`/${PACKAGE_JSON}`)) return glob
  if (glob.endsWith('/')) return `${glob}${PACKAGE_JSON}`
  return `${glob}/${PACKAGE_JSON}`
}

function readManifestAt(packageJsonPath: string): Manifest {
  const content = readFileSync(packageJsonPath, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch (error: unknown) {
    throw new Error(`${packageJsonPath}: invalid JSON`, {cause: error})
  }
  return parseManifest(raw, packageJsonPath)
}

function resolveWorkspacePackages(cwd: string, globs: string[]): WorkspacePackage[] {
  const packageJsonPaths = [...deepFindFiles(cwd)]
  const matched = new Set<string>()
  for (const glob of globs) {
    const packageJsonGlob = ensureEndsWithPackageJson(glob)
    for (const packageJsonPath of packageJsonPaths) {
      if (minimatch(relative(cwd, packageJsonPath), packageJsonGlob)) {
        matched.add(packageJsonPath)
      }
    }
  }
  return [...matched].map((packageJsonPath) => {
    const dir = dirname(packageJsonPath)
    return {
      dir,
      relativeDir: relative(cwd, dir),
      manifest: readManifestAt(packageJsonPath),
    }
  })
}

export async function readWorkspacePackages(cwd: string): Promise<WorkspacePackage[]> {
  const globs = readWorkspaceGlobs(cwd)
  return resolveWorkspacePackages(cwd, globs)
}

function workspaceDependencyNames(manifest: Manifest): string[] {
  const deps = {...manifest.dependencies, ...manifest.devDependencies}
  return Object.entries(deps)
    .filter(([, version]) => version.startsWith('workspace:'))
    .map(([name]) => name)
}

export function buildDependencyGraph(packages: WorkspacePackage[]): Map<string, string[]> {
  return packages.reduce((graph, pkg) => {
    if (typeof pkg.manifest.name !== 'string') return graph
    graph.set(pkg.manifest.name, workspaceDependencyNames(pkg.manifest))
    return graph
  }, new Map<string, string[]>())
}

function buildReverseGraph(graph: Map<string, string[]>): Map<string, string[]> {
  const edges = [...graph.entries()].flatMap(([name, deps]) => deps.map((dep) => ({dep, name})))
  return edges.reduce((reverse, edge) => {
    const dependents = reverse.get(edge.dep) ?? []
    dependents.push(edge.name)
    reverse.set(edge.dep, dependents)
    return reverse
  }, new Map<string, string[]>())
}

export function transitiveDependents(graph: Map<string, string[]>, target: string): Set<string> {
  const reverse = buildReverseGraph(graph)
  const seen = new Set<string>()
  const queue = [target]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    for (const dependent of reverse.get(current) ?? []) {
      if (!seen.has(dependent)) {
        seen.add(dependent)
        queue.push(dependent)
      }
    }
  }
  return seen
}
