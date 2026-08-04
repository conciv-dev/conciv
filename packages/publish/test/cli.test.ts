import {test, expect} from 'vitest'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertPublicSet,
  assertValidPackageName,
  assertValidTag,
} from '../src/guards.ts'

test('accepts plain dist-tags', () => {
  expect(() => assertValidTag('beta')).not.toThrow()
  expect(() => assertValidTag('next-11')).not.toThrow()
})

test('rejects flag-like or injecting tags (argument injection)', () => {
  for (const bad of ['--otp=999', '--ignore=@conciv/core', '-rm', '', 'Beta', 'a b', 'a;b']) {
    expect(() => assertValidTag(bad), bad).toThrow(/invalid dist-tag/)
  }
})

test('accepts scoped conciv package names', () => {
  expect(() => assertValidPackageName('@conciv/extension-recorder')).not.toThrow()
  expect(() => assertValidPackageName('@conciv/core')).not.toThrow()
})

test('rejects foreign scopes and flag-like package names (argument injection)', () => {
  for (const bad of ['@evil/pkg', 'core', 'rogue', '--registry=https://evil.dev', '@conciv/Core', '@conciv/a b', '']) {
    expect(() => assertValidPackageName(bad), bad).toThrow(/invalid package name/)
  }
})

test('accepts the bare conciv front-door name', () => {
  expect(() => assertValidPackageName('conciv')).not.toThrow()
})

async function publicWorkspace(names: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'public-set-'))
  await Promise.all(
    names.map(async (name, index) => {
      const dir = join(root, 'packages', `pkg-${index}`)
      await mkdir(dir, {recursive: true})
      await writeFile(join(dir, 'package.json'), JSON.stringify({name, version: '0.0.14'}))
    }),
  )
  return root
}

test('assertPublicSet accepts the full public set including the bare conciv package', async () => {
  const root = await publicWorkspace([...PUBLIC_PACKAGES])
  await expect(assertPublicSet(root)).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})
})

test('assertPublicSet reports the bare conciv package when the workspace lost it', async () => {
  const root = await publicWorkspace(PUBLIC_PACKAGES.filter((name) => name !== 'conciv'))
  await expect(assertPublicSet(root)).rejects.toThrow(/missing: \[conciv\]/)
  await rm(root, {recursive: true, force: true})
})

async function workspaceWith(manifest: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bootstrap-'))
  const dir = join(root, 'packages', 'thing')
  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest))
  return root
}

test('assertBootstrappable rejects names missing from PUBLIC_PACKAGES', async () => {
  const root = await workspaceWith({name: '@conciv/not-listed', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/not-listed')).rejects.toThrow(/not in PUBLIC_PACKAGES/)
  await rm(root, {recursive: true, force: true})
})

test('assertBootstrappable rejects packages absent from the workspace', async () => {
  const root = await workspaceWith({name: '@conciv/thing', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/core')).rejects.toThrow(/not found in the workspace/)
  await rm(root, {recursive: true, force: true})
})

test('assertBootstrappable rejects private and unversioned packages', async () => {
  const privateRoot = await workspaceWith({name: '@conciv/core', version: '0.0.14', private: true})
  await expect(assertBootstrappable(privateRoot, '@conciv/core')).rejects.toThrow(/is private/)
  await rm(privateRoot, {recursive: true, force: true})

  const unversionedRoot = await workspaceWith({name: '@conciv/core', version: '0.0.0'})
  await expect(assertBootstrappable(unversionedRoot, '@conciv/core')).rejects.toThrow(/still 0\.0\.0/)
  await rm(unversionedRoot, {recursive: true, force: true})
})

test('assertBootstrappable accepts a listed, public, versioned package', async () => {
  const root = await workspaceWith({name: '@conciv/core', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/core')).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})
})
