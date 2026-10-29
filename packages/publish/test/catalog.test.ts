import {test, expect} from 'vitest'
import {writeFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {assertSharedDependenciesCatalogued} from '../src/guards.ts'
import {scaffoldWorkspaceRoot, writeManifest} from './fixtures.ts'

test('assertSharedDependenciesCatalogued accepts shared deps taken from the catalog and single-manifest deps kept explicit', async () => {
  const root = await scaffoldWorkspaceRoot('catalog-ok-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'a'), {
      name: '@conciv/a',
      dependencies: {zod: 'catalog:', 'only-in-a': '^1.0.0'},
    }),
    writeManifest(join(root, 'packages', 'b'), {name: '@conciv/b', devDependencies: {zod: 'catalog:default'}}),
  ])
  await expect(assertSharedDependenciesCatalogued(root)).resolves.toBeUndefined()
})

test('assertSharedDependenciesCatalogued rejects a shared dep with an explicit range, naming the manifest, dep and spec', async () => {
  const root = await scaffoldWorkspaceRoot('catalog-drift-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'a'), {name: '@conciv/a', dependencies: {zod: 'catalog:'}}),
    writeManifest(join(root, 'packages', 'b'), {name: '@conciv/b', devDependencies: {zod: '^4.4.3'}}),
  ])
  await expect(assertSharedDependenciesCatalogued(root)).rejects.toThrow('packages/b/package.json: zod "^4.4.3"')
})

test('assertSharedDependenciesCatalogued counts the workspace root manifest as a consumer', async () => {
  const root = await scaffoldWorkspaceRoot('catalog-root-')
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify({name: 'workspace-root', private: true, devDependencies: {typescript: '^6.0.3'}}, null, 2)}\n`,
  )
  await writeManifest(join(root, 'packages', 'a'), {name: '@conciv/a', devDependencies: {typescript: 'catalog:'}})
  await expect(assertSharedDependenciesCatalogued(root)).rejects.toThrow('./package.json: typescript "^6.0.3"')
})

test('assertSharedDependenciesCatalogued ignores workspace: references and peerDependencies ranges', async () => {
  const root = await scaffoldWorkspaceRoot('catalog-peer-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'a'), {
      name: '@conciv/a',
      dependencies: {'@conciv/shared': 'workspace:*'},
      peerDependencies: {'solid-js': '^1.9.13'},
    }),
    writeManifest(join(root, 'packages', 'b'), {
      name: '@conciv/b',
      dependencies: {'@conciv/shared': 'workspace:^'},
      devDependencies: {'solid-js': 'catalog:'},
      peerDependencies: {'solid-js': '^1.9.13'},
    }),
  ])
  await expect(assertSharedDependenciesCatalogued(root)).resolves.toBeUndefined()
})

test('assertSharedDependenciesCatalogued lets an exempt manifest keep its own line of a shared dep', async () => {
  const root = await scaffoldWorkspaceRoot('catalog-exempt-', ['packages/*', 'e2e/*'])
  await Promise.all([
    writeManifest(join(root, 'packages', 'a'), {name: '@conciv/a', devDependencies: {vite: 'catalog:'}}),
    writeManifest(join(root, 'e2e', 'solid-start'), {name: 'conciv-e2e-solid-start', dependencies: {vite: '^7.0.0'}}),
  ])
  await expect(assertSharedDependenciesCatalogued(root)).resolves.toBeUndefined()
})

test('assertSharedDependenciesCatalogued passes on this repository', async () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  await expect(assertSharedDependenciesCatalogued(repoRoot)).resolves.toBeUndefined()
})
