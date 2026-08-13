import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {rewriteLibraryVersionStamps} from '../src/library-version.ts'
import {scaffoldWorkspaceRoot} from './fixtures.ts'

async function writeSkill(root: string, name: string, libraryVersion: string): Promise<string> {
  const dir = join(root, 'packages', 'skills', 'skills', name)
  await mkdir(dir, {recursive: true})
  const file = join(dir, 'SKILL.md')
  await writeFile(
    file,
    [
      '---',
      `name: ${name}`,
      'description: A test skill.',
      'metadata:',
      "  package: '@conciv/skills'",
      `  library_version: '${libraryVersion}'`,
      '---',
      '',
      `# ${name}`,
    ].join('\n'),
  )
  return file
}

async function writeSkillsManifest(root: string, version: string): Promise<void> {
  const dir = join(root, 'packages', 'skills')
  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, 'package.json'), JSON.stringify({name: '@conciv/skills', version}))
}

test('rewrites every skill stamp that lags the released package.json version', async () => {
  const root = await scaffoldWorkspaceRoot('library-version-')
  await writeSkillsManifest(root, '0.0.20')
  const first = await writeSkill(root, 'first', '0.0.19')
  const second = await writeSkill(root, 'second', '0.0.19')

  const rewrites = await rewriteLibraryVersionStamps(root)

  expect(rewrites).toEqual([
    {file: first, from: '0.0.19', to: '0.0.20'},
    {file: second, from: '0.0.19', to: '0.0.20'},
  ])
  expect(await readFile(first, 'utf8')).toContain("library_version: '0.0.20'")
  expect(await readFile(second, 'utf8')).toContain("library_version: '0.0.20'")
})

test('is idempotent: a second run against already-stamped files rewrites nothing', async () => {
  const root = await scaffoldWorkspaceRoot('library-version-idempotent-')
  await writeSkillsManifest(root, '0.0.20')
  await writeSkill(root, 'only', '0.0.19')

  await rewriteLibraryVersionStamps(root)
  const second = await rewriteLibraryVersionStamps(root)

  expect(second).toEqual([])
})

test('fails loud when a skill is missing metadata.library_version', async () => {
  const root = await scaffoldWorkspaceRoot('library-version-missing-')
  await writeSkillsManifest(root, '0.0.20')
  const dir = join(root, 'packages', 'skills', 'skills', 'incomplete')
  await mkdir(dir, {recursive: true})
  const file = join(dir, 'SKILL.md')
  await writeFile(
    file,
    [
      '---',
      'name: incomplete',
      'description: A test skill.',
      'metadata:',
      "  package: '@conciv/skills'",
      '---',
      '',
      '# incomplete',
    ].join('\n'),
  )

  await expect(rewriteLibraryVersionStamps(root)).rejects.toThrow(/missing metadata.library_version/)
})
