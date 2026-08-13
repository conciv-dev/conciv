import {test, expect} from 'vitest'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertChangesetsResolve,
  assertPublicSet,
  assertValidPackageName,
  assertValidTag,
  assertWorkspaceRoot,
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
  for (const bad of [
    '@evil/pkg',
    'core',
    'rogue',
    'conciv',
    '--registry=https://evil.dev',
    '@conciv/Core',
    '@conciv/a b',
    '',
  ]) {
    expect(() => assertValidPackageName(bad), bad).toThrow(/invalid package name/)
  }
})

async function publicWorkspace(names: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'public-set-'))
  await mkdir(join(root, 'packages', 'extensions'), {recursive: true})
  await Promise.all(
    names.map(async (name, index) => {
      const dir = join(root, 'packages', `pkg-${index}`)
      await mkdir(dir, {recursive: true})
      await writeFile(join(dir, 'package.json'), JSON.stringify({name, version: '0.0.14'}))
    }),
  )
  return root
}

test('assertPublicSet accepts the full public set', async () => {
  const root = await publicWorkspace([...PUBLIC_PACKAGES])
  await expect(assertPublicSet(root)).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})
})

test('assertPublicSet reports the cli package when the workspace lost it', async () => {
  const root = await publicWorkspace(PUBLIC_PACKAGES.filter((name) => name !== '@conciv/cli'))
  await expect(assertPublicSet(root)).rejects.toThrow(/missing: \[@conciv\/cli\]/)
  await rm(root, {recursive: true, force: true})
})

async function workspaceWith(manifest: object): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bootstrap-'))
  const dir = join(root, 'packages', 'thing')
  await mkdir(dir, {recursive: true})
  await mkdir(join(root, 'packages', 'extensions'), {recursive: true})
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

async function workspaceWithChangesets(names: string[], changesets: Record<string, string>): Promise<string> {
  const root = await publicWorkspace(names)
  const changesetDir = join(root, '.changeset')
  await mkdir(changesetDir, {recursive: true})
  await Promise.all(Object.entries(changesets).map(([file, content]) => writeFile(join(changesetDir, file), content)))
  return root
}

test('assertChangesetsResolve accepts a changeset naming a real workspace package', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'brave-lions-fly.md': `---\n'@conciv/core': patch\n---\n\nSomething changed.\n`,
  })
  await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})
})

test('assertChangesetsResolve rejects a changeset naming a non-workspace package, with file and name', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'small-donuts-shave.md': `---\n'conciv': patch\n---\n\nBroken entry.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/small-donuts-shave\.md.*"conciv"/s)
  await rm(root, {recursive: true, force: true})
})

test('assertChangesetsResolve ignores README.md and passes with zero changesets', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'README.md': '# Changesets\n\nNot a real changeset.\n',
  })
  await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})

  const emptyRoot = await workspaceWithChangesets(['@conciv/core'], {})
  await expect(assertChangesetsResolve(emptyRoot)).resolves.toBeUndefined()
  await rm(emptyRoot, {recursive: true, force: true})
})

test('assertChangesetsResolve rejects a missing .changeset directory instead of passing vacuously', async () => {
  const root = await publicWorkspace(['@conciv/core'])
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/does not exist/)
  await rm(root, {recursive: true, force: true})
})

test('assertChangesetsResolve rejects a symlinked changeset file, naming it', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'harmless.md': 'not a changeset\n',
  })
  const changesetDir = join(root, '.changeset')
  await symlink(join(changesetDir, 'harmless.md'), join(changesetDir, 'evil-link.md'))
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/evil-link\.md.*must not be symlinks/s)
  await rm(root, {recursive: true, force: true})
})

test('assertChangesetsResolve rejects a changeset that lists the same package twice, naming file and package', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'double-entry.md': `---\n'@conciv/core': patch\n'@conciv/core': minor\n---\n\nDouble entry.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(
    /double-entry\.md.*"@conciv\/core".*listed more than once/s,
  )
  await rm(root, {recursive: true, force: true})
})

test('assertPublicSet rejects a workspace missing the packages/extensions manifest group', async () => {
  const root = await mkdtemp(join(tmpdir(), 'no-extensions-'))
  await mkdir(join(root, 'packages', 'core'), {recursive: true})
  await writeFile(
    join(root, 'packages', 'core', 'package.json'),
    JSON.stringify({name: '@conciv/core', version: '0.0.14'}),
  )
  await expect(assertPublicSet(root)).rejects.toThrow(join(root, 'packages', 'extensions'))
  await rm(root, {recursive: true, force: true})
})

test('assertWorkspaceRoot accepts a directory that looks like the workspace root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'root-'))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await mkdir(join(root, '.changeset'), {recursive: true})
  await expect(assertWorkspaceRoot(root)).resolves.toBeUndefined()
  await rm(root, {recursive: true, force: true})
})

test('assertWorkspaceRoot rejects a subdirectory of the workspace, naming the cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'root-'))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await mkdir(join(root, '.changeset'), {recursive: true})
  const nested = join(root, 'packages', 'core')
  await mkdir(nested, {recursive: true})
  await expect(assertWorkspaceRoot(nested)).rejects.toThrow(nested)
  await rm(root, {recursive: true, force: true})
})

test('assertWorkspaceRoot rejects a workspace missing the .changeset directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'root-'))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await expect(assertWorkspaceRoot(root)).rejects.toThrow(/workspace root/)
  await rm(root, {recursive: true, force: true})
})
