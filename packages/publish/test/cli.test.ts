import {test, expect} from 'vitest'
import {mkdir, symlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertChangesetsResolve,
  assertPublicDepsPublic,
  assertPublicSet,
  assertValidPackageName,
  assertValidTag,
  assertWorkspaceRoot,
} from '../src/guards.ts'
import {scaffoldWorkspaceRoot, writeManifest} from './fixtures.ts'

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
  const root = await scaffoldWorkspaceRoot('public-set-')
  await Promise.all(
    names.map((name, index) => writeManifest(join(root, 'packages', `pkg-${index}`), {name, version: '0.0.14'})),
  )
  return root
}

test('assertPublicSet accepts the full public set', async () => {
  const root = await publicWorkspace([...PUBLIC_PACKAGES])
  await expect(assertPublicSet(root)).resolves.toBeUndefined()
})

test('assertPublicSet reports the cli package when the workspace lost it', async () => {
  const root = await publicWorkspace(PUBLIC_PACKAGES.filter((name) => name !== '@conciv/cli'))
  await expect(assertPublicSet(root)).rejects.toThrow(/missing: \[@conciv\/cli\]/)
})

test('assertPublicSet rejects a manifest whose "private" field is a string instead of a boolean, naming the manifest', async () => {
  const root = await scaffoldWorkspaceRoot('bad-manifest-')
  const dir = join(root, 'packages', 'core')
  await writeManifest(dir, {name: '@conciv/core', version: '0.0.14', private: 'false'})
  await expect(assertPublicSet(root)).rejects.toThrow(/package\.json: invalid package manifest/)
})

async function workspaceWith(manifest: object): Promise<string> {
  const root = await scaffoldWorkspaceRoot('bootstrap-')
  await writeManifest(join(root, 'packages', 'thing'), manifest as Record<string, unknown>)
  return root
}

test('assertBootstrappable rejects names missing from PUBLIC_PACKAGES', async () => {
  const root = await workspaceWith({name: '@conciv/not-listed', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/not-listed')).rejects.toThrow(/not in PUBLIC_PACKAGES/)
})

test('assertBootstrappable rejects packages absent from the workspace', async () => {
  const root = await workspaceWith({name: '@conciv/thing', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/core')).rejects.toThrow(/not found in the workspace/)
})

test('assertBootstrappable rejects private and unversioned packages', async () => {
  const privateRoot = await workspaceWith({name: '@conciv/core', version: '0.0.14', private: true})
  await expect(assertBootstrappable(privateRoot, '@conciv/core')).rejects.toThrow(/is private/)

  const unversionedRoot = await workspaceWith({name: '@conciv/core', version: '0.0.0'})
  await expect(assertBootstrappable(unversionedRoot, '@conciv/core')).rejects.toThrow(/still 0\.0\.0/)
})

test('assertBootstrappable accepts a listed, public, versioned package', async () => {
  const root = await workspaceWith({name: '@conciv/core', version: '0.0.14'})
  await expect(assertBootstrappable(root, '@conciv/core')).resolves.toBeUndefined()
})

test('assertPublicDepsPublic accepts a public package whose workspace deps are all public', async () => {
  const root = await scaffoldWorkspaceRoot('deps-public-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'grab'), {name: '@conciv/grab', version: '0.0.19'}),
    writeManifest(join(root, 'packages', 'page'), {
      name: '@conciv/page',
      version: '0.0.19',
      dependencies: {'@conciv/grab': 'workspace:^'},
    }),
  ])
  await expect(assertPublicDepsPublic(root)).resolves.toBeUndefined()
})

test('assertPublicDepsPublic rejects a public package depending on a private workspace package, naming both', async () => {
  const root = await scaffoldWorkspaceRoot('deps-private-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'page'), {name: '@conciv/page', version: '0.0.19', private: true}),
    writeManifest(join(root, 'packages', 'extension-page'), {
      name: '@conciv/extension-page',
      version: '0.0.19',
      dependencies: {'@conciv/page': 'workspace:^'},
    }),
  ])
  await expect(assertPublicDepsPublic(root)).rejects.toThrow(
    /@conciv\/extension-page depends on private workspace package @conciv\/page/,
  )
})

test('assertPublicDepsPublic rejects a public package with the private dep under optionalDependencies, naming both', async () => {
  const root = await scaffoldWorkspaceRoot('deps-private-optional-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'page'), {name: '@conciv/page', version: '0.0.19', private: true}),
    writeManifest(join(root, 'packages', 'extension-page'), {
      name: '@conciv/extension-page',
      version: '0.0.19',
      optionalDependencies: {'@conciv/page': 'workspace:^'},
    }),
  ])
  await expect(assertPublicDepsPublic(root)).rejects.toThrow(
    /@conciv\/extension-page depends on private workspace package @conciv\/page/,
  )
})

test('assertPublicDepsPublic rejects a public package with the private dep under peerDependencies, naming both', async () => {
  const root = await scaffoldWorkspaceRoot('deps-private-peer-')
  await Promise.all([
    writeManifest(join(root, 'packages', 'page'), {name: '@conciv/page', version: '0.0.19', private: true}),
    writeManifest(join(root, 'packages', 'extension-page'), {
      name: '@conciv/extension-page',
      version: '0.0.19',
      peerDependencies: {'@conciv/page': 'workspace:^'},
    }),
  ])
  await expect(assertPublicDepsPublic(root)).rejects.toThrow(
    /@conciv\/extension-page depends on private workspace package @conciv\/page/,
  )
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
})

test('assertChangesetsResolve rejects a changeset naming a non-workspace package, with file and name', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'small-donuts-shave.md': `---\n'conciv': patch\n---\n\nBroken entry.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/small-donuts-shave\.md.*"conciv"/s)
})

test('assertChangesetsResolve ignores README.md and passes with zero changesets', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'README.md': '# Changesets\n\nNot a real changeset.\n',
  })
  await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()

  const emptyRoot = await workspaceWithChangesets(['@conciv/core'], {})
  await expect(assertChangesetsResolve(emptyRoot)).resolves.toBeUndefined()
})

test('assertChangesetsResolve rejects a missing .changeset directory instead of passing vacuously', async () => {
  const root = await publicWorkspace(['@conciv/core'])
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/does not exist/)
})

test('assertChangesetsResolve rejects a symlinked changeset file, naming it', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'harmless.md': 'not a changeset\n',
  })
  const changesetDir = join(root, '.changeset')
  await symlink(join(changesetDir, 'harmless.md'), join(changesetDir, 'evil-link.md'))
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/evil-link\.md.*must not be symlinks/s)
})

test('assertChangesetsResolve rejects a changeset that lists the same package twice, propagating the parser error with the filename', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'double-entry.md': `---\n'@conciv/core': patch\n'@conciv/core': minor\n---\n\nDouble entry.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/double-entry\.md.*duplicated mapping key/s)
})

test('assertChangesetsResolve rejects a changeset with malformed frontmatter, naming the file', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'malformed.md': 'no frontmatter here at all\n',
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/malformed\.md.*missing or invalid frontmatter/s)
})

test('assertChangesetsResolve rejects a changeset with empty frontmatter (zero releases), naming the file', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'empty-releases.md': `---\n---\n\nNothing to release.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/empty-releases\.md.*no releases/s)
})

test('assertChangesetsResolve flows an unquoted entry name through to workspace validation, not parse failure', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'unquoted-bogus.md': `---\nconciv: patch\n---\n\nUnquoted bogus name.\n`,
  })
  await expect(assertChangesetsResolve(root)).rejects.toThrow(/unquoted-bogus\.md.*"conciv".*not in the workspace/s)
})

test('assertChangesetsResolve accepts a double-quoted entry naming a real workspace package', async () => {
  const root = await workspaceWithChangesets(['@conciv/core'], {
    'double-quoted.md': `---\n"@conciv/core": patch\n---\n\nDouble-quoted entry.\n`,
  })
  await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()
})

test('assertChangesetsResolve accepts a changeset naming a package that lives under an apps/ workspace group, not just packages/', async () => {
  const root = await scaffoldWorkspaceRoot('apps-changeset-', ['packages/*', 'apps/*'])
  await mkdir(join(root, '.changeset'), {recursive: true})
  await Promise.all([
    writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'}),
    writeManifest(join(root, 'apps', 'conciv'), {name: '@conciv/app', version: '0.0.14', private: true}),
    writeFile(
      join(root, '.changeset', 'router-owned.md'),
      `---\n'@conciv/app': patch\n---\n\nRouter-owned disposal.\n`,
    ),
  ])
  await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()
})

test('assertWorkspaceRoot accepts a directory that looks like the workspace root', async () => {
  const root = await scaffoldWorkspaceRoot('root-')
  await mkdir(join(root, '.changeset'), {recursive: true})
  await expect(assertWorkspaceRoot(root)).resolves.toBeUndefined()
})

test('assertWorkspaceRoot rejects a subdirectory of the workspace, naming the cwd', async () => {
  const root = await scaffoldWorkspaceRoot('root-')
  await mkdir(join(root, '.changeset'), {recursive: true})
  const nested = join(root, 'packages', 'core')
  await mkdir(nested, {recursive: true})
  await expect(assertWorkspaceRoot(nested)).rejects.toThrow(nested)
})

test('assertWorkspaceRoot rejects a workspace missing the .changeset directory', async () => {
  const root = await scaffoldWorkspaceRoot('root-')
  await expect(assertWorkspaceRoot(root)).rejects.toThrow(/workspace root/)
})
