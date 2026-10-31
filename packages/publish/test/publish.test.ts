import {test, expect, describe, onTestFinished} from 'vitest'
import {writeFile, mkdir, mkdtemp, rm, symlink, readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
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
import {scaffoldWorkspaceRoot, writeManifest} from './fixtures.ts'
import {tmpdir} from 'node:os'
import {execa} from 'execa'
import {buildSyncPlan, pushMissingTags} from '../src/sync.ts'
import {recordFromDocument} from '../src/registry.ts'
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

describe('catalog', () => {
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
    const root = await scaffoldWorkspaceRoot('catalog-exempt-', ['packages/*', 'packages/extensions/*'])
    await Promise.all([
      writeManifest(join(root, 'packages', 'a'), {name: '@conciv/a', dependencies: {'drizzle-orm': 'catalog:'}}),
      writeManifest(join(root, 'packages', 'extensions', 'whiteboard'), {
        name: '@conciv/extension-whiteboard',
        dependencies: {'drizzle-orm': '^0.45.4'},
      }),
    ])
    await expect(assertSharedDependenciesCatalogued(root)).resolves.toBeUndefined()
  })

  test('assertSharedDependenciesCatalogued passes on this repository', async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    await expect(assertSharedDependenciesCatalogued(repoRoot)).resolves.toBeUndefined()
  })
})

describe('cli', () => {
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

  test('assertPublicDepsPublic accepts a public package whose private workspace dep appears only under devDependencies', async () => {
    const root = await scaffoldWorkspaceRoot('deps-private-devdep-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'internal-tool'), {
        name: '@conciv/internal-tool',
        version: '0.0.19',
        private: true,
      }),
      writeManifest(join(root, 'packages', 'page'), {
        name: '@conciv/page',
        version: '0.0.19',
        devDependencies: {'@conciv/internal-tool': 'workspace:*'},
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
    await expect(assertChangesetsResolve(root)).rejects.toThrow(/double-entry\.md.*Map keys must be unique/s)
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

  const git = (cwd: string, args: string[]) => execa('git', args, {cwd})

  async function originTags(origin: string): Promise<string[]> {
    const {stdout} = await git(origin, ['tag', '-l'])
    return stdout.split('\n').filter((line) => line.length > 0)
  }

  async function repoWithOrigin(): Promise<{root: string; origin: string}> {
    const root = await scaffoldWorkspaceRoot('sync-tags-')
    await Promise.all([
      writeManifest(join(root, 'packages', 'core'), {name: '@conciv/core', version: '0.0.20'}),
      writeManifest(join(root, 'packages', 'page'), {name: '@conciv/page', version: '0.0.20'}),
      writeManifest(join(root, 'packages', 'grab'), {name: '@conciv/grab', version: '0.0.20'}),
    ])
    const origin = await mkdtemp(join(tmpdir(), 'sync-tags-origin-'))
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
      await pushMissingTags(root, ['@conciv/core', '@conciv/page'])
      expect(await originTags(origin)).toEqual(['@conciv/core@0.0.20', '@conciv/page@0.0.20'])
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
      const plan = await buildSyncPlan(root, [{name: '@conciv/page', state: 'untrusted', versions: ['0.0.19']}])
      expect(plan).toEqual([{name: '@conciv/page', state: 'untrusted', actions: ['trust']}])
    })

    test('an existing local tag drops the tag action, leaving a healthy package out of the plan', async () => {
      const {root} = await repoWithOrigin()
      await git(root, ['tag', '@conciv/core@0.0.20'])
      await git(root, ['tag', '@conciv/page@0.0.20'])
      const plan = await buildSyncPlan(root, [
        {name: '@conciv/core', state: 'trusted', versions: ['0.0.20']},
        {name: '@conciv/page', state: 'untrusted', versions: ['0.0.20']},
      ])
      expect(plan).toEqual([{name: '@conciv/page', state: 'untrusted', actions: ['trust']}])
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
    const repo = await mkdtemp(join(tmpdir(), 'coverage-repo-'))
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

  test('assertPublishedChangesCovered rejects an uncovered published-package code change, naming the package', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await commitAll(git, 'bump core')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )
  })

  test('assertPublishedChangesCovered passes when a changeset naming any published @conciv package exists', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await writeFile(join(repo, '.changeset', 'bump-core.md'), `---\n'@conciv/core': patch\n---\n\nBump core.\n`)
    await commitAll(git, 'bump core with changeset')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered passes for a test-only change', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'test', 'index.test.ts'), 'test.todo("another")\n')
    await commitAll(git, 'edit test only')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered passes for a markdown-only change', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'README.md'), '# core\n\nUpdated docs.\n')
    await commitAll(git, 'edit docs only')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered passes for a private-package-only change with no published dependent', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'internal', 'index.ts'), 'export const internal = 2\n')
    await commitAll(git, 'edit private package only')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered (H1) ignores a changeset already committed at base, only counting ones added by this PR', async () => {
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
  })

  test('assertPublishedChangesCovered (H1) passes once a changeset is added in the PR commits, alongside a pre-existing one', async () => {
    const {repo, git} = await initRepo()
    await scaffoldWorkspace(repo)
    await writeFile(join(repo, '.changeset', 'pre-existing.md'), `---\n'@conciv/core': patch\n---\n\nPre-existing.\n`)
    await commitAll(git, 'base with a pre-existing changeset')
    const base = await baseSha(git)

    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await writeFile(join(repo, '.changeset', 'new-one.md'), `---\n'@conciv/core': patch\n---\n\nNew one.\n`)
    await commitAll(git, 'bump core with a new changeset')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered (H4a) attributes a private dependency change to its published dependent', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'shared', 'index.ts'), 'export const shared = 2\n')
    await commitAll(git, 'edit private shared dependency')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/consumer/s,
    )
  })

  test('assertPublishedChangesCovered (H4b) requires coverage for a non-code file matched by the manifest files allowlist', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'assets', 'skills', 'guide.md'), '# guide\n\nUpdated.\n')
    await commitAll(git, 'edit allowlisted docs')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/assets/s,
    )
  })

  test('(L1) assertPublishedChangesCovered requires coverage for an extensionless file in a published package', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'Dockerfile'), 'FROM node:22\n')
    await commitAll(git, 'add extensionless file')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )
  })

  test('(L2) assertPublishedChangesCovered still requires coverage for a nested (non-top-level) "test" directory', async () => {
    const {repo, git, base} = await scaffoldBase()

    await mkdir(join(repo, 'packages', 'core', 'src', 'test'), {recursive: true})
    await writeFile(join(repo, 'packages', 'core', 'src', 'test', 'helper.ts'), 'export const helper = 1\n')
    await commitAll(git, 'add nested src/test/helper.ts')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )
  })

  test('(L3) assertPublishedChangesCovered rejects a changeset that names only a private @conciv package as insufficient coverage', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
    await writeFile(
      join(repo, '.changeset', 'wrong-target.md'),
      `---\n'@conciv/internal': patch\n---\n\nWrong target.\n`,
    )
    await commitAll(git, 'bump core, changeset names a private package only')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )
  })

  test('(M2) assertPublishedChangesCovered detects a file moved out of a published package under git rename heuristics', async () => {
    const {repo, git, base} = await scaffoldBase()

    await execa('git', ['-C', repo, 'mv', 'packages/core/src/index.ts', 'packages/internal/index-moved.ts'])
    await commitAll(git, 'move a core file into the private package')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/core/s,
    )
  })

  test('assertPublishedChangesCovered passes with zero changesets when only root-level files (lockfile, workflow) and a dependent-less private package change', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n')
    await writeFile(join(repo, '.github', 'workflows', 'ci.yml'), 'name: CI\non:\n  push: {}\n  pull_request: {}\n')
    await writeFile(join(repo, 'packages', 'internal', 'index.ts'), 'export const internal = 2\n')
    await commitAll(git, 'bump lockfile, tweak a workflow, edit a private tool package')

    await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  })

  test('assertPublishedChangesCovered still requires coverage for a private package a published package genuinely depends on (workspace:*), alongside the root/private-tool-only pass case above', async () => {
    const {repo, git, base} = await scaffoldBase()

    await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n')
    await writeFile(join(repo, 'packages', 'shared', 'index.ts'), 'export const shared = 2\n')
    await commitAll(git, 'bump lockfile and edit the private dependency of a published package')

    await expect(assertPublishedChangesCovered(repo, base)).rejects.toThrow(
      /no changeset covers changed published packages.*@conciv\/consumer/s,
    )
  })
})

describe('registry', () => {
  const stateFromDocument = (value: unknown) => recordFromDocument(value).state

  const trustedUser = {
    name: 'GitHub Actions',
    email: 'npm-oidc-no-reply@github.com',
    trustedPublisher: {id: 'github', oidcConfigId: 'oidc:5264430c-88ce-42e0-bb20-090669cc97d1'},
  }

  test('latest published via trusted publisher reads as trusted', () => {
    const document = {
      'dist-tags': {latest: '0.0.14'},
      versions: {
        '0.0.9': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
        '0.0.14': {_npmUser: trustedUser},
      },
    }
    expect(stateFromDocument(document)).toBe('trusted')
  })

  test('latest published by a human reads as untrusted', () => {
    const document = {
      'dist-tags': {latest: '0.0.14'},
      versions: {'0.0.14': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}}},
    }
    expect(stateFromDocument(document)).toBe('untrusted')
  })

  test('regression: old versions without trustedPublisher must not fail the parse', () => {
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

  test('documents without dist-tags or versions read as untrusted, not a crash', () => {
    expect(stateFromDocument({})).toBe('untrusted')
    expect(stateFromDocument({'dist-tags': {}})).toBe('untrusted')
    expect(stateFromDocument({'dist-tags': {latest: '1.0.0'}})).toBe('untrusted')
  })

  test('non-object registry responses throw a parse error', () => {
    expect(() => stateFromDocument('nope')).toThrow()
    expect(() => stateFromDocument(null)).toThrow()
  })

  describe('recordFromDocument versions', () => {
    test('lists every published version from the document', () => {
      const document = {
        'dist-tags': {latest: '0.0.20'},
        versions: {'0.0.19': {}, '0.0.20': {_npmUser: trustedUser}},
      }
      expect(recordFromDocument(document)).toEqual({state: 'trusted', versions: ['0.0.19', '0.0.20']})
    })

    test('a document without versions lists none', () => {
      expect(recordFromDocument({'dist-tags': {latest: '1.0.0'}}).versions).toEqual([])
    })
  })
})

describe('swift mirror', () => {
  async function scaffold(
    version: string,
  ): Promise<{sourceDir: string; templateDir: string; destDir: string; bridgeManifestPath: string; root: string}> {
    const root = await mkdtemp(join(tmpdir(), 'swift-mirror-'))
    const sourceDir = join(root, 'source')
    const templateDir = join(root, 'template')
    const destDir = join(root, 'dest')
    const bridgeManifestPath = join(root, 'bridge-package.json')
    await mkdir(join(sourceDir, 'Sources', 'ConcivWidget'), {recursive: true})
    await mkdir(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge'), {recursive: true})
    await mkdir(join(sourceDir, '.build'), {recursive: true})
    await mkdir(templateDir, {recursive: true})
    await writeFile(bridgeManifestPath, `${JSON.stringify({name: '@conciv/extension-ios', version}, null, 2)}\n`)
    await writeFile(join(sourceDir, 'Package.swift'), 'let package = 1\n')
    await writeFile(join(sourceDir, 'Sources', 'ConcivWidget', 'ConcivWidget.swift'), 'public struct ConcivWidget {}\n')
    await writeFile(join(sourceDir, 'Tests', 'ConcivWidgetTests', 'Fixtures', 'bridge', 'n2p.open.json'), '{}\n')
    await writeFile(join(sourceDir, '.build', 'build.db'), 'binary-artifact\n')
    await writeFile(join(templateDir, 'README.md'), '# ConcivWidget\n')
    await writeFile(join(templateDir, 'RELEASE_HYGIENE.md'), '# hygiene\n')
    await writeFile(join(templateDir, 'LICENSE'), 'MIT License\n')
    return {sourceDir, templateDir, destDir, bridgeManifestPath, root}
  }

  test('assembleMirrorTree promotes the nested tree, copies templates, and returns the version', async () => {
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
    await rm(root, {recursive: true, force: true})
  })

  test('assembleMirrorTree excludes the .build artifact directory', async () => {
    const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('1.0.0')
    await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
    await expect(readFile(join(destDir, '.build', 'build.db'), 'utf8')).rejects.toThrow()
    await rm(root, {recursive: true, force: true})
  })

  test('assembleMirrorTree is idempotent: a second run leaves no stale files', async () => {
    const {sourceDir, templateDir, destDir, bridgeManifestPath, root} = await scaffold('2.0.1')
    await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
    await writeFile(join(destDir, 'Sources', 'ConcivWidget', 'Stale.swift'), 'stale\n')
    const tree = await assembleMirrorTree({sourceDir, templateDir, destDir, bridgeManifestPath})
    expect(tree.version).toBe('2.0.1')
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

  test('readBridgeVersion reads the manifest version and validates bare semver', async () => {
    const {bridgeManifestPath, root} = await scaffold('3.4.5')
    expect(await readBridgeVersion(bridgeManifestPath)).toBe('3.4.5')
    await rm(root, {recursive: true, force: true})
  })

  test('readBridgeVersion rejects a manifest whose version is not bare semver', async () => {
    const root = await mkdtemp(join(tmpdir(), 'swift-mirror-'))
    const bridgeManifestPath = join(root, 'bridge-package.json')
    await writeFile(
      bridgeManifestPath,
      `${JSON.stringify({name: '@conciv/extension-ios', version: '0.0.15-beta.1'})}\n`,
    )
    await expect(readBridgeVersion(bridgeManifestPath)).rejects.toThrow(/invalid swift sdk version/)
    await rm(root, {recursive: true, force: true})
  })

  const MANIFEST_REL = 'packages/extensions/ios/package.json'
  const SOURCE_REL = 'native/swift/ConcivWidget'

  async function initRepo(): Promise<{repo: string; git: (...args: string[]) => Promise<unknown>}> {
    const repo = await mkdtemp(join(tmpdir(), 'swift-mirror-repo-'))
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
    await mkdir(join(repo, 'packages', 'extensions', 'ios'), {recursive: true})
    await mkdir(join(repo, 'native', 'swift', 'ConcivWidget', 'Sources'), {recursive: true})
    await writeFile(join(repo, MANIFEST_REL), `${JSON.stringify({name: '@conciv/extension-ios', version}, null, 2)}\n`)
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
    for (const bad of ['v1.0.0', '1.0', '1.0.0-beta', '@conciv/extension-ios@0.0.15', '', '1.0.0 ']) {
      expect(() => assertBareSemver(bad), bad).toThrow(/invalid swift sdk version/)
    }
  })
})

describe('workspace', () => {
  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

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
