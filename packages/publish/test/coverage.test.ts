import {test, expect, onTestFinished} from 'vitest'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {assertPublishedChangesCovered} from '../src/guards.ts'

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
  await writeFile(join(repo, '.changeset', 'wrong-target.md'), `---\n'@conciv/internal': patch\n---\n\nWrong target.\n`)
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
