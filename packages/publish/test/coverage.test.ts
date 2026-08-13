import {test, expect} from 'vitest'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {assertPublishedChangesCovered} from '../src/guards.ts'

async function initRepo(): Promise<{repo: string; git: (...args: string[]) => Promise<{stdout: string}>}> {
  const repo = await mkdtemp(join(tmpdir(), 'coverage-repo-'))
  const git = (...args: string[]) => execa('git', ['-C', repo, ...args])
  await git('init', '-q')
  await git('config', 'user.email', 'coverage@conciv.dev')
  await git('config', 'user.name', 'coverage-test')
  await git('config', 'commit.gpgsign', 'false')
  return {repo, git}
}

async function scaffoldWorkspace(repo: string): Promise<void> {
  await writeFile(join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await mkdir(join(repo, '.changeset'), {recursive: true})
  await mkdir(join(repo, 'packages', 'extensions'), {recursive: true})
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
  await rm(repo, {recursive: true, force: true})
})

test('assertPublishedChangesCovered passes when a changeset naming any @conciv package exists', async () => {
  const {repo, git, base} = await scaffoldBase()

  await writeFile(join(repo, 'packages', 'core', 'src', 'index.ts'), 'export const version = 2\n')
  await writeFile(join(repo, '.changeset', 'bump-core.md'), `---\n'@conciv/core': patch\n---\n\nBump core.\n`)
  await commitAll(git, 'bump core with changeset')

  await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  await rm(repo, {recursive: true, force: true})
})

test('assertPublishedChangesCovered passes for a test-only change', async () => {
  const {repo, git, base} = await scaffoldBase()

  await writeFile(join(repo, 'packages', 'core', 'test', 'index.test.ts'), 'test.todo("another")\n')
  await commitAll(git, 'edit test only')

  await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  await rm(repo, {recursive: true, force: true})
})

test('assertPublishedChangesCovered passes for a markdown-only change', async () => {
  const {repo, git, base} = await scaffoldBase()

  await writeFile(join(repo, 'packages', 'core', 'README.md'), '# core\n\nUpdated docs.\n')
  await commitAll(git, 'edit docs only')

  await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  await rm(repo, {recursive: true, force: true})
})

test('assertPublishedChangesCovered passes for a private-package-only change', async () => {
  const {repo, git, base} = await scaffoldBase()

  await writeFile(join(repo, 'packages', 'internal', 'index.ts'), 'export const internal = 2\n')
  await commitAll(git, 'edit private package only')

  await expect(assertPublishedChangesCovered(repo, base)).resolves.toBeUndefined()
  await rm(repo, {recursive: true, force: true})
})
