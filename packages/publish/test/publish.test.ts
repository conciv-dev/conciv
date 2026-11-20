import {test, expect, describe, onTestFinished} from 'vitest'
import {writeFile, mkdir, rm, symlink, readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {
  assertSharedDependenciesCatalogued,
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertChangesetsResolve,
  assertPublicDepsPublic,
  assertPublicSet,
  assertValidPackageName,
  assertValidTag,
  assertWorkspaceRoot,
  assertPublishedChangesCovered,
} from '../src/guards.ts'
import {execa} from 'execa'
import {buildSyncPlan, pushMissingTags, recordFromDocument} from '../src/sync.ts'
import {
  assembleMirrorTree,
  assertBareSemver,
  extractCommitSubtree,
  fingerprintTree,
  readBridgeVersion,
  resolveVersionCommit,
  treesMatch,
} from '../src/swift-mirror.ts'
import {buildDependencyGraph, readWorkspacePackages, transitiveDependents} from '../src/workspace.ts'
import {assertTypecheckCoversTrackedFiles} from '../src/typecheck-coverage.ts'
import {assertBuildDependsOnCoversImports, assertPluginsDrawThroughContextUi} from '../src/workspace-imports.ts'
import {tempDir} from '@conciv/vitest-config/temp-dir'

async function scaffoldWorkspaceRoot(prefix: string, packageGlobs: string[] = ['packages/*']): Promise<string> {
  const root = tempDir(prefix)
  onTestFinished(() => rm(root, {recursive: true, force: true}))
  await writeFile(
    join(root, 'pnpm-workspace.yaml'),
    `packages:\n${packageGlobs.map((glob) => `  - ${glob}`).join('\n')}\n`,
  )
  await writeFile(join(root, 'package.json'), `${JSON.stringify({name: 'workspace-root', private: true}, null, 2)}\n`)
  return root
}

async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function commitFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      await mkdir(dirname(join(root, path)), {recursive: true})
      await writeFile(join(root, path), content)
    }),
  )
  await execa('git', ['init', '-q'], {cwd: root})
  await execa('git', ['add', '.'], {cwd: root})
}

describe('catalog', () => {
  test('assertSharedDependenciesCatalogued accepts catalog deps, single-manifest explicit deps, workspace: references and peer ranges', async () => {
    const root = await scaffoldWorkspaceRoot('catalog-ok-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'a'), {
        name: '@conciv/a',
        dependencies: {zod: 'catalog:', 'only-in-a': '^1.0.0', '@conciv/shared': 'workspace:*'},
        devDependencies: {typescript: 'catalog:'},
        peerDependencies: {'solid-js': '^1.9.13'},
      }),
      writeManifest(join(root, 'packages', 'b'), {
        name: '@conciv/b',
        dependencies: {'@conciv/shared': 'workspace:^'},
        devDependencies: {zod: 'catalog:default', typescript: 'catalog:ts6', 'solid-js': 'catalog:'},
        peerDependencies: {'solid-js': '^1.9.13'},
      }),
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

  test('assertSharedDependenciesCatalogued passes on this repository', async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    await expect(assertSharedDependenciesCatalogued(repoRoot)).resolves.toBeUndefined()
  })
})

describe('typecheck coverage', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

  async function presetPackage(
    prefix: string,
    files: Record<string, string>,
    dir = 'packages/a',
  ): Promise<{root: string; pkg: string}> {
    const root = await scaffoldWorkspaceRoot(prefix, ['packages/*', 'e2e/*'])
    const pkg = join(root, dir)
    await writeManifest(pkg, {name: '@conciv/a', scripts: {typecheck: 'tsc -p tsconfig.json --noEmit'}})
    await mkdir(join(pkg, 'node_modules', '@conciv'), {recursive: true})
    await symlink(join(repoRoot, 'node_modules'), join(root, 'node_modules'))
    await symlink(join(repoRoot, 'packages', 'tsconfig'), join(pkg, 'node_modules', '@conciv', 'tsconfig'))
    const tsconfig = {extends: '@conciv/tsconfig/tsconfig.base.json'}
    await Promise.all(
      Object.entries({'tsconfig.json': JSON.stringify(tsconfig), ...files}).map(async ([path, content]) => {
        await mkdir(dirname(join(pkg, path)), {recursive: true})
        await writeFile(join(pkg, path), content)
      }),
    )
    await execa('git', ['init', '-q'], {cwd: root})
    await execa('git', ['add', dir], {cwd: root})
    return {root, pkg}
  }

  test('assertTypecheckCoversTrackedFiles names a tracked file outside the preset include, and passes once it moves under test/', async () => {
    const {root, pkg} = await presetPackage('typecheck-coverage-', {
      'src/index.ts': 'export const a = 1\n',
      'fixtures/stray.ts': 'export const b = 2\n',
    })
    await expect(assertTypecheckCoversTrackedFiles(root)).rejects.toThrow('packages/a/fixtures/stray.ts: not checked')
    await mkdir(join(pkg, 'test'))
    await execa('git', ['mv', 'packages/a/fixtures/stray.ts', 'packages/a/test/stray.ts'], {cwd: root})
    await expect(assertTypecheckCoversTrackedFiles(root)).resolves.toBeUndefined()
  }, 10_000)

  test('assertTypecheckCoversTrackedFiles rejects an include, exclude or files of its own in a preset package tsconfig', async () => {
    const {root} = await presetPackage('typecheck-coverage-owned-', {
      'src/index.ts': 'export const a = 1\n',
      'test/fixtures/broken.ts': 'export const c = = 3\n',
      'tsconfig.json': JSON.stringify({
        extends: '@conciv/tsconfig/tsconfig.base.json',
        exclude: ['${configDir}/test/fixtures/broken.ts'],
      }),
      'tsconfig.build.json': JSON.stringify({extends: ['./tsconfig.json'], include: ['${configDir}/src/**/*']}),
    })
    const rejection = assertTypecheckCoversTrackedFiles(root)
    await expect(rejection).rejects.toThrow('packages/a/tsconfig.json: sets "exclude"')
    await expect(rejection).rejects.toThrow('packages/a/tsconfig.build.json: sets "include"')
    await expect(rejection).rejects.toThrow('packages/a/test/fixtures/broken.ts: not checked')
  }, 10_000)

  test('assertTypecheckCoversTrackedFiles counts the files tsc checks for the preset include, under TypeScript 6 too', async () => {
    const {root, pkg} = await presetPackage('typecheck-coverage-ts6-', {'src/index.ts': 'export const a = 1\n'})
    const typescript6 = dirname(
      createRequire(join(repoRoot, 'apps', 'site-snippets', 'package.json')).resolve('typescript/package.json'),
    )
    await mkdir(join(pkg, 'node_modules', '.bin'))
    await symlink(join(typescript6, 'bin', 'tsc'), join(pkg, 'node_modules', '.bin', 'tsc'))
    await expect(execa('tsc', ['--version'], {cwd: pkg, preferLocal: true})).resolves.toMatchObject({
      stdout: expect.stringMatching(/^Version 6\./),
    })
    await expect(assertTypecheckCoversTrackedFiles(root)).resolves.toBeUndefined()
  }, 10_000)

  test('assertTypecheckCoversTrackedFiles rejects a package off the preset unless the off-preset list names it', async () => {
    const framework = {
      'app/page.ts': 'export const page = 1\n',
      'tsconfig.json': '{\n  // framework-owned\n  "include": ["next-env.d.ts"]\n}\n',
    }
    const unlisted = await presetPackage('typecheck-coverage-unlisted-', framework)
    await expect(assertTypecheckCoversTrackedFiles(unlisted.root)).rejects.toThrow(
      'packages/a/tsconfig.json: extends neither the @conciv/tsconfig preset nor is on the off-preset list',
    )
    const listed = await presetPackage('typecheck-coverage-listed-', framework, 'e2e/vite-react')
    await expect(assertTypecheckCoversTrackedFiles(listed.root)).resolves.toBeUndefined()
  }, 10_000)

  test('assertTypecheckCoversTrackedFiles checks every tsconfig the typecheck script runs', async () => {
    const {root, pkg} = await presetPackage('typecheck-coverage-scripted-', {
      'src/index.ts': 'export const a = 1\n',
      'tsconfig.node.json': JSON.stringify({extends: './tsconfig.json', include: ['${configDir}/src/**/*']}),
    })
    await writeManifest(pkg, {
      name: '@conciv/a',
      scripts: {typecheck: 'tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit'},
    })
    await expect(assertTypecheckCoversTrackedFiles(root)).rejects.toThrow(
      'packages/a/tsconfig.node.json: sets "include"',
    )
  }, 10_000)
})

describe('turbo build dependsOn', () => {
  test('an explicit build list names every workspace build its build sources import, not test-only imports', async () => {
    const root = await scaffoldWorkspaceRoot('turbo-depends-on-')
    const files: Record<string, string> = {
      'packages/a/turbo.json': JSON.stringify({tasks: {build: {dependsOn: ['@conciv/b#build']}}}),
      'packages/a/src/index.ts': "import {b} from '@conciv/b'\nexport const c = await import('@conciv/c/view')\n",
      'packages/a/vite.config.ts': "export const alias = import.meta.resolve('@conciv/d')\n",
      'packages/a/vitest.config.ts': "import '@conciv/e'\n",
      'packages/a/test/a.test.ts': "import '@conciv/e'\n",
      'packages/a/src/a.test.ts': "import '@conciv/e'\nimport '@conciv/plain'\n",
    }
    await Promise.all([
      ...['a', 'b', 'c', 'd', 'e'].map((name) =>
        writeManifest(join(root, 'packages', name), {name: `@conciv/${name}`, scripts: {build: 'tsdown'}}),
      ),
      writeManifest(join(root, 'packages', 'plain'), {name: '@conciv/plain'}),
    ])
    await commitFiles(root, files)
    const failure = await assertBuildDependsOnCoversImports(root).catch((error: unknown) => String(error))
    expect(failure).toContain('packages/a/turbo.json: build imports @conciv/c but does not depend on @conciv/c#build')
    expect(failure).toContain('packages/a/turbo.json: build imports @conciv/d but does not depend on @conciv/d#build')
    expect(failure).not.toContain('@conciv/e')
    const dependsOn = ['@conciv/b#build', '@conciv/c#build', '@conciv/d#build']
    await writeFile(join(root, 'packages/a/turbo.json'), JSON.stringify({tasks: {build: {dependsOn}}}))
    await expect(assertBuildDependsOnCoversImports(root)).resolves.toBeUndefined()
  }, 10_000)
})

describe('plugin ui kit', () => {
  test('a plugin draws through ctx.ui: kit imports in build sources or manifests fail, built-ins and tests pass', async () => {
    const root = await scaffoldWorkspaceRoot('plugin-ui-kit-', ['packages/*', 'packages/plugins/*'])
    const manifest = (value: Record<string, unknown>) => JSON.stringify(value)
    const drawn = "import {Button} from '@conciv/ui-kit-system'\nexport const view = Button\n"
    await commitFiles(root, {
      'packages/ui-kit-system/package.json': manifest({name: '@conciv/ui-kit-system'}),
      'packages/plugins/drawn/package.json': manifest({name: '@conciv/plugin-drawn'}),
      'packages/plugins/drawn/src/view.tsx': drawn,
      'packages/plugins/drawn/test/view.test.tsx': "import '@conciv/ui-kit-chat'\n",
      'packages/plugins/listed/package.json': manifest({
        name: '@conciv/plugin-listed',
        devDependencies: {'@conciv/ui-kit-chat': 'workspace:*'},
      }),
      'packages/plugins/terminal/package.json': manifest({
        name: '@conciv/plugin-terminal',
        dependencies: {'@conciv/ui-kit-system': 'workspace:*'},
      }),
      'packages/plugins/terminal/src/pane.tsx': drawn,
    })
    const failure = await assertPluginsDrawThroughContextUi(root).catch((error: unknown) => String(error))
    expect(failure).toContain('packages/plugins/drawn/src/view.tsx: imports @conciv/ui-kit-system')
    expect(failure).toContain('packages/plugins/listed/package.json: devDependencies names @conciv/ui-kit-chat')
    expect(failure).not.toContain('view.test.tsx')
    expect(failure).not.toContain('packages/plugins/terminal')
    await writeFile(join(root, 'packages/plugins/drawn/src/view.tsx'), 'export const view = 1\n')
    await writeManifest(join(root, 'packages/plugins/listed'), {name: '@conciv/plugin-listed'})
    await expect(assertPluginsDrawThroughContextUi(root)).resolves.toBeUndefined()
  }, 10_000)
})

describe('cli', () => {
  test('accepts plain dist-tags and rejects flag-like or injecting ones (argument injection)', () => {
    expect(() => assertValidTag('beta')).not.toThrow()
    expect(() => assertValidTag('next-11')).not.toThrow()
    for (const bad of ['--otp=999', '--ignore=@conciv/core', '-rm', '', 'Beta', 'a b', 'a;b']) {
      expect(() => assertValidTag(bad), bad).toThrow(/invalid dist-tag/)
    }
  })

  test('accepts scoped conciv package names and rejects foreign scopes and flag-like names (argument injection)', () => {
    expect(() => assertValidPackageName('@conciv/extension-recorder')).not.toThrow()
    expect(() => assertValidPackageName('@conciv/core')).not.toThrow()
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

  test('assertPublicSet refuses @conciv/plugin-internal once its manifest is no longer private', async () => {
    const root = await publicWorkspace([...PUBLIC_PACKAGES, '@conciv/plugin-internal'])
    await expect(assertPublicSet(root)).rejects.toThrow(
      '@conciv/plugin-internal must stay private: first-party plugins inline it, it is never published',
    )
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

  test('assertBootstrappable accepts only a listed, present, public, versioned package', async () => {
    const cases: {manifest: object; name: string; error?: RegExp}[] = [
      {
        manifest: {name: '@conciv/not-listed', version: '0.0.14'},
        name: '@conciv/not-listed',
        error: /not in PUBLIC_PACKAGES/,
      },
      {manifest: {name: '@conciv/thing', version: '0.0.14'}, name: '@conciv/core', error: /not found in the workspace/},
      {manifest: {name: '@conciv/core', version: '0.0.14', private: true}, name: '@conciv/core', error: /is private/},
      {manifest: {name: '@conciv/core', version: '0.0.0'}, name: '@conciv/core', error: /still 0\.0\.0/},
      {manifest: {name: '@conciv/core', version: '0.0.14'}, name: '@conciv/core'},
    ]
    for (const {manifest, name, error} of cases) {
      const checked = assertBootstrappable(await workspaceWith(manifest), name)
      await (error ? expect(checked).rejects.toThrow(error) : expect(checked).resolves.toBeUndefined())
    }
  })

  test('assertPublicDepsPublic accepts public workspace deps and a private one under devDependencies only', async () => {
    const root = await scaffoldWorkspaceRoot('deps-public-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'grab'), {name: '@conciv/grab', version: '0.0.19'}),
      writeManifest(join(root, 'packages', 'internal-tool'), {
        name: '@conciv/internal-tool',
        version: '0.0.19',
        private: true,
      }),
      writeManifest(join(root, 'packages', 'page'), {
        name: '@conciv/sample-page',
        version: '0.0.19',
        dependencies: {'@conciv/grab': 'workspace:^'},
        devDependencies: {'@conciv/internal-tool': 'workspace:*'},
      }),
    ])
    await expect(assertPublicDepsPublic(root)).resolves.toBeUndefined()
  })

  test('assertPublicDepsPublic rejects a private workspace dep under dependencies, optionalDependencies or peerDependencies, naming both', async () => {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const root = await scaffoldWorkspaceRoot('deps-private-')
      await Promise.all([
        writeManifest(join(root, 'packages', 'page'), {name: '@conciv/sample-page', version: '0.0.19', private: true}),
        writeManifest(join(root, 'packages', 'public-consumer'), {
          name: '@conciv/public-consumer',
          version: '0.0.19',
          [field]: {'@conciv/sample-page': 'workspace:^'},
        }),
      ])
      await expect(assertPublicDepsPublic(root), field).rejects.toThrow(
        /@conciv\/public-consumer depends on private workspace package @conciv\/sample-page/,
      )
    }
  })

  async function workspaceWithChangesets(names: string[], changesets: Record<string, string>): Promise<string> {
    const root = await publicWorkspace(names)
    const changesetDir = join(root, '.changeset')
    await mkdir(changesetDir, {recursive: true})
    await Promise.all(Object.entries(changesets).map(([file, content]) => writeFile(join(changesetDir, file), content)))
    return root
  }

  test('assertChangesetsResolve accepts single- and double-quoted real packages, ignores README.md, and passes with zero changesets', async () => {
    const root = await workspaceWithChangesets(['@conciv/core'], {
      'brave-lions-fly.md': `---\n'@conciv/core': patch\n---\n\nSomething changed.\n`,
      'double-quoted.md': `---\n"@conciv/core": patch\n---\n\nDouble-quoted entry.\n`,
      'README.md': '# Changesets\n\nNot a real changeset.\n',
    })
    await expect(assertChangesetsResolve(root)).resolves.toBeUndefined()

    const emptyRoot = await workspaceWithChangesets(['@conciv/core'], {})
    await expect(assertChangesetsResolve(emptyRoot)).resolves.toBeUndefined()
  })

  test('assertChangesetsResolve rejects a broken changeset, naming the file and the reason', async () => {
    const cases: [string, string, RegExp][] = [
      ['small-donuts-shave.md', `---\n'conciv': patch\n---\n\nBroken entry.\n`, /small-donuts-shave\.md.*"conciv"/s],
      [
        'double-entry.md',
        `---\n'@conciv/core': patch\n'@conciv/core': minor\n---\n\nDouble entry.\n`,
        /double-entry\.md.*Map keys must be unique/s,
      ],
      ['malformed.md', 'no frontmatter here at all\n', /malformed\.md.*missing or invalid frontmatter/s],
      ['empty-releases.md', `---\n---\n\nNothing to release.\n`, /empty-releases\.md.*no releases/s],
      [
        'unquoted-bogus.md',
        `---\nconciv: patch\n---\n\nUnquoted bogus name.\n`,
        /unquoted-bogus\.md.*"conciv".*not in the workspace/s,
      ],
    ]
    for (const [file, content, error] of cases) {
      const root = await workspaceWithChangesets(['@conciv/core'], {[file]: content})
      await expect(assertChangesetsResolve(root), file).rejects.toThrow(error)
    }
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

  test('assertWorkspaceRoot accepts only the workspace root with its .changeset directory, naming a nested cwd', async () => {
    const root = await scaffoldWorkspaceRoot('root-')
    await expect(assertWorkspaceRoot(root)).rejects.toThrow(/workspace root/)
    await mkdir(join(root, '.changeset'), {recursive: true})
    await expect(assertWorkspaceRoot(root)).resolves.toBeUndefined()
    const nested = join(root, 'packages', 'core')
    await mkdir(nested, {recursive: true})
    await expect(assertWorkspaceRoot(nested)).rejects.toThrow(nested)
  })

  const git = (cwd: string, args: string[]) => execa('git', args, {cwd})

  async function originTags(origin: string): Promise<string[]> {
    const {stdout} = await git(origin, ['tag', '-l'])
    return stdout.split('\n').filter((line) => line.length > 0)
  }

  async function repoWithOrigin(): Promise<{root: string; origin: string}> {
    const root = await scaffoldWorkspaceRoot('sync-tags-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.20'}),
      writeManifest(join(root, 'packages', 'page'), {name: '@conciv/sample-page', version: '0.0.20'}),
      writeManifest(join(root, 'packages', 'grab'), {name: '@conciv/grab', version: '0.0.20'}),
    ])
    const origin = tempDir('sync-tags-origin-')
    onTestFinished(() => rm(origin, {recursive: true, force: true}))
    await git(origin, ['init', '--bare', '--quiet'])
    await git(root, ['init', '--quiet'])
    await git(root, ['add', '.'])
    await git(root, ['-c', 'user.name=test', '-c', 'user.email=test@conciv.dev', 'commit', '--quiet', '-m', 'init'])
    await git(root, ['remote', 'add', 'origin', origin])
    return {root, origin}
  }

  describe('pushMissingTags', () => {
    test('creates and pushes nothing when no package was first-published', async () => {
      const {root, origin} = await repoWithOrigin()
      await pushMissingTags(root, [])
      expect(await originTags(origin)).toEqual([])
      const {stdout} = await git(root, ['tag', '-l'])
      expect(stdout).toBe('')
    })

    test('tags only the given packages at their manifest version, keeping a pre-existing tag', async () => {
      const {root, origin} = await repoWithOrigin()
      await git(root, ['tag', '@conciv/core@0.0.20'])
      await pushMissingTags(root, ['@conciv/core', '@conciv/sample-page'])
      expect(await originTags(origin)).toEqual(['@conciv/core@0.0.20', '@conciv/sample-page@0.0.20'])
    })
  })

  describe('buildSyncPlan', () => {
    test('tags a trusted package whose manifest version is on npm but untagged locally', async () => {
      const {root} = await repoWithOrigin()
      const plan = await buildSyncPlan(root, [{name: '@conciv/core', state: 'trusted', versions: ['0.0.19', '0.0.20']}])
      expect(plan).toEqual([{name: '@conciv/core', state: 'trusted', actions: ['tag']}])
    })

    test('regression: an untrusted package whose manifest version npm never had gets trust only', async () => {
      const {root} = await repoWithOrigin()
      const plan = await buildSyncPlan(root, [{name: '@conciv/sample-page', state: 'untrusted', versions: ['0.0.19']}])
      expect(plan).toEqual([{name: '@conciv/sample-page', state: 'untrusted', actions: ['trust']}])
    })

    test('an existing local tag drops the tag action, leaving a healthy package out of the plan', async () => {
      const {root} = await repoWithOrigin()
      await git(root, ['tag', '@conciv/core@0.0.20'])
      await git(root, ['tag', '@conciv/sample-page@0.0.20'])
      const plan = await buildSyncPlan(root, [
        {name: '@conciv/core', state: 'trusted', versions: ['0.0.20']},
        {name: '@conciv/sample-page', state: 'untrusted', versions: ['0.0.20']},
      ])
      expect(plan).toEqual([{name: '@conciv/sample-page', state: 'untrusted', actions: ['trust']}])
    })

    test('a package missing from npm plans publish, trust and tag', async () => {
      const {root} = await repoWithOrigin()
      const plan = await buildSyncPlan(root, [{name: '@conciv/grab', state: 'missing', versions: []}])
      expect(plan).toEqual([{name: '@conciv/grab', state: 'missing', actions: ['publish', 'trust', 'tag']}])
    })
  })
})

describe('coverage', () => {
  async function initRepo(): Promise<{repo: string; git: (...args: string[]) => Promise<{stdout: string}>}> {
    const repo = tempDir('coverage-repo-')
    onTestFinished(() => rm(repo, {recursive: true, force: true}))
    const git = (...args: string[]) => execa('git', ['-C', repo, ...args])
    await git('init', '-q')
    await git('config', 'user.email', 'coverage@conciv.dev')
    await git('config', 'user.name', 'coverage-test')
    await git('config', 'commit.gpgsign', 'false')
    return {repo, git}
  }

  async function scaffoldWorkspace(repo: string): Promise<void> {
    await writeFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(join(repo, 'package.json'), `${JSON.stringify({name: 'workspace-root', private: true}, null, 2)}\n`)
    await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    await mkdir(join(repo, '.github', 'workflows'), {recursive: true})
    await writeFile(join(repo, '.github', 'workflows', 'ci.yml'), 'name: CI\non:\n  push: {}\n')
    await mkdir(join(repo, '.changeset'), {recursive: true})

    await mkdir(join(repo, 'packages', 'core', 'src'), {recursive: true})
    await mkdir(join(repo, 'packages', 'core', 'test'), {recursive: true})
    await writeFile(
      join(repo, 'packages', 'core', 'package.json'),
      `${JSON.stringify({name: '@conciv/core', version: '0.0.14'}, null, 2)}\n`,
    )
    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 1\n')
    await writeFile(join(repo, 'packages', 'core', 'test', 'index.test.ts'), 'test.todo("placeholder")\n')
    await writeFile(join(repo, 'packages', 'core', 'README.md'), '# core\n')

    await mkdir(join(repo, 'packages', 'internal'), {recursive: true})
    await writeFile(
      join(repo, 'packages', 'internal', 'package.json'),
      `${JSON.stringify({name: '@conciv/internal', version: '0.0.14', private: true}, null, 2)}\n`,
    )
    await writeFile(join(repo, 'packages', 'internal', 'index.ts'), 'export const internal = 1\n')

    await mkdir(join(repo, 'packages', 'shared'), {recursive: true})
    await writeFile(
      join(repo, 'packages', 'shared', 'package.json'),
      `${JSON.stringify({name: '@conciv/shared', version: '0.0.14', private: true}, null, 2)}\n`,
    )
    await writeFile(join(repo, 'packages', 'shared', 'index.ts'), 'export const shared = 1\n')

    await mkdir(join(repo, 'packages', 'consumer'), {recursive: true})
    await writeFile(
      join(repo, 'packages', 'consumer', 'package.json'),
      `${JSON.stringify(
        {name: '@conciv/consumer', version: '0.0.14', dependencies: {'@conciv/shared': 'workspace:*'}},
        null,
        2,
      )}\n`,
    )
    await writeFile(join(repo, 'packages', 'consumer', 'index.ts'), 'export const consumer = 1\n')

    await mkdir(join(repo, 'packages', 'assets', 'skills'), {recursive: true})
    await writeFile(
      join(repo, 'packages', 'assets', 'package.json'),
      `${JSON.stringify({name: '@conciv/assets', version: '0.0.14', files: ['skills']}, null, 2)}\n`,
    )
    await writeFile(join(repo, 'packages', 'assets', 'skills', 'guide.md'), '# guide\n')
    await writeFile(join(repo, 'packages', 'assets', 'index.ts'), 'export const assets = 1\n')
  }

  async function commitAll(git: (...args: string[]) => Promise<unknown>, message: string): Promise<void> {
    await git('add', '-A')
    await git('commit', '-qm', message)
  }

  async function baseSha(git: (...args: string[]) => Promise<{stdout: string}>): Promise<string> {
    const {stdout} = await git('rev-parse', 'HEAD')
    return stdout.trim()
  }

  async function scaffoldBase(): Promise<{
    repo: string
    git: (...args: string[]) => Promise<{stdout: string}>
    base: string
  }> {
    const {repo, git} = await initRepo()
    await scaffoldWorkspace(repo)
    await commitAll(git, 'base')
    const base = await baseSha(git)
    return {repo, git, base}
  }

  const uncovered: {label: string; change: (repo: string) => Promise<unknown>; pkg: string}[] = [
    {
      label: 'a published-package code change',
      change: (repo) => writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n'),
      pkg: '@conciv/core',
    },
    {
      label: 'a code change whose changeset names only a private @conciv package',
      change: async (repo) => {
        await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
        await writeFile(join(repo, '.changeset', 'wrong-target.md'), `---\n'@conciv/internal': patch\n---\n\nWrong.\n`)
      },
      pkg: '@conciv/core',
    },
    {
      label: 'a non-code file matched by the manifest files allowlist',
      change: (repo) => writeFile(join(repo, 'packages', 'assets', 'skills', 'guide.md'), '# guide\n\nUpdated.\n'),
      pkg: '@conciv/assets',
    },
    {
      label: 'an extensionless file',
      change: (repo) => writeFile(join(repo, 'packages', 'core', 'Dockerfile'), 'FROM node:22\n'),
      pkg: '@conciv/core',
    },
    {
      label: 'a file under a nested, non-top-level test directory',
      change: async (repo) => {
        await mkdir(join(repo, 'packages', 'core', 'src', 'test'), {recursive: true})
        await writeFile(join(repo, 'packages', 'core', 'src', 'test', 'helper.ts'), 'export const helper = 1\n')
      },
      pkg: '@conciv/core',
    },
    {
      label: 'a file moved out of a published package',
      change: (repo) =>
        execa('git', ['-C', repo, 'mv', 'packages/core/src/index.ts', 'packages/internal/index-moved.ts']),
      pkg: '@conciv/core',
    },
    {
      label: 'a lockfile bump plus an edit to the private package a published package depends on (workspace:*)',
      change: async (repo) => {
        await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n')
        await writeFile(join(repo, 'packages', 'shared', 'index.ts'), 'export const shared = 2\n')
      },
      pkg: '@conciv/consumer',
    },
  ]

  for (const {label, change, pkg} of uncovered) {
    test(`assertPublishedChangesCovered rejects ${label}, naming ${pkg}`, async () => {
      const {repo, git, base} = await scaffoldBase()
      await change(repo)
      await commitAll(git, label)
      await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
        new RegExp(`no changeset covers changed published packages.*${pkg}`, 's'),
      )
    })
  }

  test('assertPublishedChangesCovered passes when a changeset naming any published @conciv package exists', async () => {
    const {repo, git, base} = await scaffoldBase()
    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await writeFile(join(repo, '.changeset', 'bump-core.md'), `---\n'@conciv/core': patch\n---\n\nBump core.\n`)
    await commitAll(git, 'bump core with changeset')
    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered passes for a test-only and markdown-only change', async () => {
    const {repo, git, base} = await scaffoldBase()
    await writeFile(join(repo, 'packages', 'core', 'test', 'index.test.ts'), 'test.todo("another")\n')
    await writeFile(join(repo, 'packages', 'core', 'README.md'), '# core\n\nUpdated docs.\n')
    await commitAll(git, 'edit test and docs only')
    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered counts only changesets this PR adds, never one already committed at base', async () => {
    const {repo, git} = await initRepo()
    await scaffoldWorkspace(repo)
    await writeFile(join(repo, '.changeset', 'pre-existing.md'), `---\n'@conciv/core': patch\n---\n\nPre-existing.\n`)
    await commitAll(git, 'base with a pre-existing changeset')
    const base = await baseSha(git)

    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await commitAll(git, 'bump core, no new changeset in this PR')
    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )

    await writeFile(join(repo, '.changeset', 'new-one.md'), `---\n'@conciv/core': patch\n---\n\nNew one.\n`)
    await commitAll(git, 'add a changeset in the PR')
    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered passes with zero changesets when only root-level files (lockfile, workflow) and a dependent-less private package change', async () => {
    const {repo, git, base} = await scaffoldBase()
    await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n')
    await writeFile(join(repo, '.github', 'workflows', 'ci.yml'), 'name: CI\non:\n  push: {}\n  pull_request: {}\n')
    await writeFile(join(repo, 'packages', 'internal', 'index.ts'), 'export const internal = 2\n')
    await commitAll(git, 'bump lockfile, tweak a workflow, edit a private tool package')
    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })
})

describe('registry', () => {
  const stateFromDocument = (value: unknown) => recordFromDocument(value).state

  const trustedUser = {
    name: 'GitHub Actions',
    email: 'npm-oidc-no-reply@github.com',
    trustedPublisher: {id: 'github', oidcConfigId: 'oidc:5264430c-88ce-42e0-bb20-090669cc97d1'},
  }

  test('latest published via trusted publisher reads as trusted; old versions without trustedPublisher do not fail the parse', () => {
    const document = {
      'dist-tags': {latest: '0.0.14'},
      versions: {
        '0.0.9': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
        '0.0.11': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
        '0.0.12': {},
        '0.0.14': {_npmUser: trustedUser},
      },
    }
    expect(stateFromDocument(document)).toBe('trusted')
  })

  test('latest published by a human, and documents without dist-tags or versions, read as untrusted, not a crash', () => {
    const human = {_npmUser: {name: 'omridevk', email: 'x@y.dev'}}
    expect(stateFromDocument({'dist-tags': {latest: '0.0.14'}, versions: {'0.0.14': human}})).toBe('untrusted')
    expect(stateFromDocument({})).toBe('untrusted')
    expect(stateFromDocument({'dist-tags': {}})).toBe('untrusted')
    expect(stateFromDocument({'dist-tags': {latest: '1.0.0'}})).toBe('untrusted')
  })

  test('non-object registry responses throw a parse error', () => {
    expect(() => stateFromDocument('nope')).toThrow()
    expect(() => stateFromDocument(null)).toThrow()
  })

  test('recordFromDocument lists every published version from the document, and none without versions', () => {
    const document = {
      'dist-tags': {latest: '0.0.20'},
      versions: {'0.0.19': {}, '0.0.20': {_npmUser: trustedUser}},
    }
    expect(recordFromDocument(document)).toEqual({state: 'trusted', versions: ['0.0.19', '0.0.20']})
    expect(recordFromDocument({'dist-tags': {latest: '1.0.0'}}).versions).toEqual([])
  })
})

describe('swift mirror', () => {
  async function scaffold(
    version: string,
  ): Promise<{sourceDir: string; templateDir: string; destDir: string; bridgeManifestPath: string; root: string}> {
    const root = tempDir('swift-mirror-')
    const sourceDir = join(root, 'source')
    const templateDir = join(root, 'template')
    const destDir = join(root, 'dest')
    const bridgeManifestPath = join(root, 'bridge-package.json')
    await mkdir(join(sourceDir, 'Sources', 'ConcivWidget'), {recursive: true})
    await mkdir(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge'), {recursive: true})
    await mkdir(join(sourceDir, '.build'), {recursive: true})
    await mkdir(templateDir, {recursive: true})
    await writeFile(bridgeManifestPath, `${JSON.stringify({name: '@conciv/plugin-ios', version}, null, 2)}\n`)
    await writeFile(join(sourceDir, 'Package.swift'), 'let package = 1\n')
    await writeFile(join(sourceDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'), 'public struct ConcivWidget {}\n')
    await writeFile(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge', 'n2p.open.json'), '{}\n')
    await writeFile(join(sourceDir, '.build', 'build.db'), 'binary-artifact\n')
    await writeFile(join(templateDir, 'README.md'), '# ConcivWidget\n')
    await writeFile(join(templateDir, 'RELEASE_HYGIENE.md'), '# hygiene\n')
    await writeFile(join(templateDir, 'LICENSE'), 'MIT License\n')
    return {sourceDir, templateDir, destDir, bridgeManifestPath, root}
  }

  test('assembleMirrorTree promotes the nested tree, copies templates, skips .build, returns the version, and reruns with no stale files', async () => {
    const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('1.2.3')
    const tree = await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
    expect(tree.version).toBe('1.2.3')
    expect(tree.files).toContain('Package.swift')
    expect(await readFile(join(destDir, 'Package.swift'), 'utf8')).toBe('let package = 1\n')
    expect(await readFile(join(destDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'), 'utf8')).toContain(
      'ConcivWidget',
    )
    expect(
      await readFile(join(destDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge', 'n2p.open.json'), 'utf8'),
    ).toBe('{}\n')
    expect(await readFile(join(destDir, 'README.md'), 'utf8')).toBe('# ConcivWidget\n')
    expect(await readFile(join(destDir, 'RELEASE_HYGIENE.md'), 'utf8')).toBe('# hygiene\n')
    expect(tree.files).toContain('LICENSE')
    expect(await readFile(join(destDir, 'LICENSE'), 'utf8')).toBe('MIT License\n')
    await expect(readFile(join(destDir, '.build', 'build.db'), 'utf8')).rejects.toThrow()
    await writeFile(join(destDir, 'Sources', 'ConcivWidget', 'Stale.swift'), 'stale\n')
    expect((await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})).version).toBe('1.2.3')
    await expect(readFile(join(destDir, 'Sources', 'ConcivWidget', 'Stale.swift'), 'utf8')).rejects.toThrow()
    await rm(root, {recursive: true, force: true})
  })

  test('treesMatch is true for two identical assembled trees and false after a source edit', async () => {
    const first = await scaffold('4.0.0')
    const secondDest = join(first.root, 'dest2')
    await assembleMirrorTree({
      sourceDir: first.sourceDir,
      templateDir: first.templateDir,
      destDir: first.destDir,
      bridgeManifestPath: first.bridgeManifestPath,
    })
    await assembleMirrorTree({
      sourceDir: first.sourceDir,
      templateDir: first.templateDir,
      destDir: secondDest,
      bridgeManifestPath: first.bridgeManifestPath,
    })
    expect(await treesMatch(first.destDir, secondDest)).toBe(true)

    await writeFile(
      join(first.sourceDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'),
      'public struct ConcivWidget { let v = 2 }\n',
    )
    const driftedDest = join(first.root, 'dest3')
    await assembleMirrorTree({
      sourceDir: first.sourceDir,
      templateDir: first.templateDir,
      destDir: driftedDest,
      bridgeManifestPath: first.bridgeManifestPath,
    })
    expect(await treesMatch(first.destDir, driftedDest)).toBe(false)
    await rm(first.root, {recursive: true, force: true})
  })

  test('fingerprintTree ignores a .git directory so a clone compares equal to the assembled tree', async () => {
    const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('4.1.0')
    await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
    const withGit = join(root, 'withGit')
    await assembleMirrorTree({sourceDir, templateDir, destDir: withGit, bridgeManifestPath})
    await mkdir(join(withGit, '.git'), {recursive: true})
    await writeFile(join(withGit, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    expect(await fingerprintTree(destDir)).toBe(await fingerprintTree(withGit))
    await rm(root, {recursive: true, force: true})
  })

  test('readBridgeVersion reads the manifest version and rejects one that is not bare semver', async () => {
    const {bridgeManifestPath, root} = await scaffold('3.4.5')
    expect(await readBridgeVersion(bridgeManifestPath)).toBe('3.4.5')
    await writeFile(bridgeManifestPath, `${JSON.stringify({name: '@conciv/plugin-ios', version: '0.0.15-beta.1'})}\n`)
    await expect(readBridgeVersion(bridgeManifestPath)).rejects.toThrow(/invalid swift sdk version/)
    await rm(root, {recursive: true, force: true})
  })

  const MANIFEST_REL = 'packages/plugins/ios/package.json'
  const SOURCE_REL = 'native/swift/ConcivWidget'

  async function initRepo(): Promise<{repo: string; git: (...args: string[]) => Promise<unknown>}> {
    const repo = tempDir('swift-mirror-repo-')
    const git = (...args: string[]) => execa('git', ['-C', repo, ...args])
    await git('init', '-q')
    await git('config', 'user.email', 'mirror@conciv.dev')
    await git('config', 'user.name', 'mirror-test')
    await git('config', 'commit.gpgsign', 'false')
    return {repo, git}
  }

  async function commitVersion(
    repo: string,
    git: (...args: string[]) => Promise<unknown>,
    version: string,
    swiftBody: string,
    message: string,
  ): Promise<void> {
    await mkdir(join(repo, 'packages', 'plugins', 'ios'), {recursive: true})
    await mkdir(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources'), {recursive: true})
    await writeFile(join(repo, MANIFEST_REL), `${JSON.stringify({name: '@conciv/plugin-ios', version}, null, 2)}\n`)
    await writeFile(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources', 'W.swift'), swiftBody)
    await git('add', '-A')
    await git('commit', '-qm', message)
  }

  test('resolveVersionCommit + extractCommitSubtree anchor the tree to the release commit, not HEAD', async () => {
    const {repo, git} = await initRepo()
    await commitVersion(repo, git, '1.0.0', 'let a = 1\n', 'release 1.0.0')
    await commitVersion(repo, git, '2.0.0', 'let b = 2\n', 'release 2.0.0')
    await writeFile(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources', 'W.swift'), 'let c = 3\n')
    await git('add', '-A')
    await git('commit', '-qm', 'post-release swift edit, manifest still 2.0.0')

    const commit = await resolveVersionCommit(repo, MANIFEST_REL, '2.0.0')
    const head = await execa('git', ['-C', repo, 'rev-parse', 'HEAD'])
    expect(commit).not.toBe(head.stdout.trim())

    const dest = join(repo, '_extract')
    await extractCommitSubtree(repo, commit, SOURCE_REL, dest)
    const extracted = await readFile(join(dest, 'Sources', 'W.swift'), 'utf8')
    expect(extracted).toBe('let b = 2\n')
    expect(extracted).not.toBe('let c = 3\n')
    await rm(repo, {recursive: true, force: true})
  })

  test('resolveVersionCommit throws when the version was never set in history', async () => {
    const {repo, git} = await initRepo()
    await commitVersion(repo, git, '1.0.0', 'let a = 1\n', 'release 1.0.0')
    await expect(resolveVersionCommit(repo, MANIFEST_REL, '9.9.9')).rejects.toThrow(/could not find the commit/)
    await rm(repo, {recursive: true, force: true})
  })

  test('assertBareSemver rejects scoped tags, prefixes, and ranges', () => {
    for (const good of ['1.0.0', '0.0.15', '12.34.56']) {
      expect(() => assertBareSemver(good), good).not.toThrow()
    }
    for (const bad of ['v1.0.0', '1.0', '1.0.0-beta', '@conciv/plugin-ios@0.0.15', '', '1.0.0 ']) {
      expect(() => assertBareSemver(bad), bad).toThrow(/invalid swift sdk version/)
    }
  })
})

describe('workspace', () => {
  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  test('readWorkspacePackages sees packages under every group dir declared in pnpm-workspace.yaml, driven by the glob not a hardcoded list', async () => {
    const root = await scaffoldWorkspaceRoot('drift-group-', ['packages/*', 'apps/*', 'extras/*'])
    await Promise.all([
      writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'}),
      writeManifest(join(root, 'apps', 'conciv'), {name: '@conciv/app', version: '0.0.14', private: true}),
      writeManifest(join(root, 'extras', 'novel'), {name: '@conciv/novel', version: '0.0.14'}),
    ])
    const packages = await readWorkspacePackages(root)
    const names = packages.map((pkg) => pkg.manifest.name).toSorted()
    expect(names).toEqual(['@conciv/app', '@conciv/core', '@conciv/novel'])
  })

  test('buildDependencyGraph + transitiveDependents trace a workspace:* edge to its dependent, and no semver-range edge', async () => {
    const root = await scaffoldWorkspaceRoot('dep-graph-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'shared'), {name: '@conciv/shared', version: '0.0.14', private: true}),
      writeManifest(join(root, 'packages', 'consumer'), {
        name: '@conciv/consumer',
        dependencies: {'@conciv/shared': 'workspace:*'},
      }),
      writeManifest(join(root, 'packages', 'ranged'), {
        name: '@conciv/ranged',
        dependencies: {'@conciv/shared': '^0.0.14'},
      }),
    ])
    const graph = buildDependencyGraph(await readWorkspacePackages(root))
    expect(transitiveDependents(graph, '@conciv/shared')).toEqual(new Set(['@conciv/consumer']))
  })

  test('readWorkspacePackages never includes the workspace root itself as a package', async () => {
    const root = await scaffoldWorkspaceRoot('no-root-pkg-')
    await writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.14'})
    const packages = await readWorkspacePackages(root)
    expect(packages.some((pkg) => pkg.relativeDir === '' || pkg.relativeDir === '.')).toBe(false)
  })

  test('readWorkspacePackages enumerates the same package-name set as the authoritative pnpm ls -r output', async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const packages = await readWorkspacePackages(repoRoot)
    const enumeratedNames = packages
      .map((pkg) => pkg.manifest.name)
      .filter((name): name is string => typeof name === 'string')
      .toSorted()

    const {stdout} = await execa('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {cwd: repoRoot})
    const parsed: unknown = JSON.parse(stdout)
    if (!Array.isArray(parsed)) {
      throw new Error('unexpected "pnpm ls -r --json" output shape: expected an array')
    }
    const rootManifest: unknown = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
    const rootName =
      isPlainObject(rootManifest) && typeof rootManifest.name === 'string' ? rootManifest.name : undefined
    const authoritativeNames = parsed
      .map((entry) => (isPlainObject(entry) && typeof entry.name === 'string' ? entry.name : undefined))
      .filter((name): name is string => typeof name === 'string')
      .filter((name) => name !== rootName)
      .toSorted()

    expect(enumeratedNames).toEqual(authoritativeNames)
  })
})
