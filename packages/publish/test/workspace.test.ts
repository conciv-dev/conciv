import {test, expect} from 'vitest'
import {join} from 'node:path'
import {buildDependencyGraph, readWorkspacePackages, transitiveDependents} from '../src/workspace.ts'
import {scaffoldWorkspaceRoot, writeManifest} from './fixtures.ts'

test('readWorkspacePackages enumerates packages under an apps/ group, not just packages/', async () => {
  const root = await scaffoldWorkspaceRoot('apps-enum-', ['packages/*', 'apps/*'])
  await Promise.all([
    writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'}),
    writeManifest(join(root, 'apps', 'conciv'), {name: '@conciv/app', version: '0.0.14', private: true}),
  ])
  const packages = await readWorkspacePackages(root)
  const names = packages.map((pkg) => pkg.manifest.name).toSorted()
  expect(names).toEqual(['@conciv/app', '@conciv/core'])
})

test('readWorkspacePackages sees a package under a brand-new group dir declared in pnpm-workspace.yaml, driven by the glob not a hardcoded list', async () => {
  const root = await scaffoldWorkspaceRoot('drift-group-', ['packages/*', 'extras/*'])
  await Promise.all([
    writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'}),
    writeManifest(join(root, 'extras', 'novel'), {name: '@conciv/novel', version: '0.0.14'}),
  ])
  const packages = await readWorkspacePackages(root)
  const names = packages.map((pkg) => pkg.manifest.name).toSorted()
  expect(names).toEqual(['@conciv/core', '@conciv/novel'])
})

test('buildDependencyGraph + transitiveDependents trace a workspace:* dependency edge to its dependent', async () => {
  const root = await scaffoldWorkspaceRoot('dep-graph-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'shared'), {name: '@conciv/shared', version: '0.0.14', private: true}),
    writeManifest(join(root, 'packages', 'consumer'), {
      name: '@conciv/consumer',
      version: '0.0.14',
      dependencies: {'@conciv/shared': 'workspace:*'},
    }),
  ])
  const packages = await readWorkspacePackages(root)
  const graph = buildDependencyGraph(packages)
  expect(transitiveDependents(graph, '@conciv/shared')).toEqual(new Set(['@conciv/consumer']))
})

test('buildDependencyGraph ignores an ordinary semver-range dependency, only workspace:* creates an edge', async () => {
  const root = await scaffoldWorkspaceRoot('dep-graph-semver-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'shared'), {name: '@conciv/shared', version: '0.0.14', private: true}),
    writeManifest(join(root, 'packages', 'consumer'), {
      name: '@conciv/consumer',
      version: '0.0.14',
      dependencies: {'@conciv/shared': '^0.0.14'},
    }),
  ])
  const packages = await readWorkspacePackages(root)
  const graph = buildDependencyGraph(packages)
  expect(transitiveDependents(graph, '@conciv/shared')).toEqual(new Set())
})

test('readWorkspacePackages never includes the workspace root itself as a package', async () => {
  const root = await scaffoldWorkspaceRoot('no-root-pkg-')
  await writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'})
  const packages = await readWorkspacePackages(root)
  expect(packages.some((pkg) => pkg.relativeDir === '' || pkg.relativeDir === '.')).toBe(false)
})
