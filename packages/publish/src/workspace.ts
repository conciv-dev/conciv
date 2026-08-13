import {join, relative} from 'node:path'
import {getPackages} from '@manypkg/get-packages'
import {parseManifest, type Manifest} from './manifest.ts'

export type WorkspacePackage = {
  dir: string
  relativeDir: string
  manifest: Manifest
}

export async function readWorkspacePackages(cwd: string): Promise<WorkspacePackage[]> {
  const {packages} = await getPackages(cwd)
  return packages.map((pkg) => ({
    dir: pkg.dir,
    relativeDir: relative(cwd, pkg.dir),
    manifest: parseManifest(pkg.packageJson, join(pkg.dir, 'package.json')),
  }))
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
