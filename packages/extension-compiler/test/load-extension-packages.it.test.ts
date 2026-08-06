import {test, expect, afterAll} from 'vitest'
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadExtensionPackages, resolvePackageEntry} from '../src/extensions.js'

const here = dirname(fileURLToPath(import.meta.url))
const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, {recursive: true, force: true})
})

function writePackage(dir: string, manifest: object, files: Record<string, string>): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
}

function fixtureRoot(extensionFiles: Record<string, string>): string {
  const root = mkdtempSync(join(here, 'conciv-pkg-'))
  roots.push(root)
  const resolverDir = join(root, 'node_modules/@conciv/fixture-resolver')
  writePackage(
    resolverDir,
    {name: '@conciv/fixture-resolver', type: 'module', exports: {'./entry': {import: './entry.js'}}},
    {'entry.js': 'export const entry = true\n'},
  )
  writePackage(
    join(resolverDir, 'node_modules/@fixture/ext'),
    {
      name: '@fixture/ext',
      type: 'module',
      exports: {'.': {browser: {default: './client.js'}, import: {default: './server.js'}}},
    },
    extensionFiles,
  )
  return root
}

test('loads each package default through the resolver package, using the import condition', async () => {
  const root = fixtureRoot({
    'server.js': "export default {name: 'fixture-server'}\n",
    'client.js': "export default {name: 'fixture-client'}\n",
  })
  const loaded = await loadExtensionPackages(root, '@conciv/fixture-resolver/entry', ['@fixture/ext'])
  expect(loaded.map((extension) => extension.name)).toEqual(['fixture-server'])
})

test('resolves specifiers the app root itself cannot resolve', async () => {
  const root = fixtureRoot({
    'server.js': "export default {name: 'fixture-server'}\n",
    'client.js': "export default {name: 'fixture-client'}\n",
  })
  const rootLevelLoad = loadExtensionPackages(root, '@fixture/ext', ['@fixture/ext'])
  await expect(rootLevelLoad).rejects.toThrow()
  const loaded = await loadExtensionPackages(root, '@conciv/fixture-resolver/entry', ['@fixture/ext'])
  expect(loaded).toHaveLength(1)
})

test('resolvePackageEntry returns the entry file path through the resolver package the root cannot see', () => {
  const root = fixtureRoot({
    'server.js': "export default {name: 'fixture-server'}\n",
    'client.js': "export default {name: 'fixture-client'}\n",
  })
  expect(() => resolvePackageEntry(root, '@fixture/ext', '@fixture/ext')).toThrow()
  expect(resolvePackageEntry(root, '@conciv/fixture-resolver/entry', '@fixture/ext')).toBe(
    join(root, 'node_modules/@conciv/fixture-resolver/node_modules/@fixture/ext/server.js'),
  )
})

test('a package without a default export is fatal and names the specifier', async () => {
  const root = fixtureRoot({
    'server.js': 'export const notDefault = 1\n',
    'client.js': "export default {name: 'fixture-client'}\n",
  })
  await expect(loadExtensionPackages(root, '@conciv/fixture-resolver/entry', ['@fixture/ext'])).rejects.toThrow(
    /@fixture\/ext/,
  )
})
