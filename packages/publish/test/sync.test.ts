import {test, expect, onTestFinished} from 'vitest'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {pushFirstPublishedTags} from '../src/sync.ts'
import {scaffoldWorkspaceRoot, writeManifest} from './fixtures.ts'

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

test('pushFirstPublishedTags creates and pushes nothing when no package was first-published', async () => {
  const {root, origin} = await repoWithOrigin()
  await pushFirstPublishedTags(root, [])
  expect(await originTags(origin)).toEqual([])
  const {stdout} = await git(root, ['tag', '-l'])
  expect(stdout).toBe('')
})

test('pushFirstPublishedTags tags only the given packages at their manifest version, keeping a pre-existing tag', async () => {
  const {root, origin} = await repoWithOrigin()
  await git(root, ['tag', '@conciv/core@0.0.20'])
  await pushFirstPublishedTags(root, ['@conciv/core', '@conciv/page'])
  expect(await originTags(origin)).toEqual(['@conciv/core@0.0.20', '@conciv/page@0.0.20'])
})
