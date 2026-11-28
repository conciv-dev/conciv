import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execa} from 'execa'
import {expect, test} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {assertTestsWithinBudget} from '../../src/test-budget.ts'

test('a package over its budget fails with its count and budget, at budget passes, under budget asks to lower it', async () => {
  const spec = `import {makeMethods} from '@effect/vitest'
import {test as engineTest} from '@conciv/backend-test-utils'
import {describe, expect, it, test} from 'vitest'
// test('a comment never counts', () => {})
const note = "it('a string never counts', () => {})"
const withUser = test.extend({user: async ({}, use) => use('ada')})
const effectWithUser = makeMethods(it.extend({user: async ({}, use) => use('ada')}))
describe('cases', () => {
  test('plain', () => expect(note).toBeTruthy())
  it('it form', () => {})
  test.concurrent('concurrent', () => {})
  test.skip('skipped', () => {})
  it.only('only', () => {})
  test.each([1, 2])('each %i', () => {})
  test.skipIf(false)('skip if', () => {})
  withUser('extended', () => {})
  it.effect('effect', () => {})
  it.live('live', () => {})
  it.scoped('scoped', () => {})
  it.live.each([1, 2])('live each %i', () => {})
  effectWithUser.live('effect extended', () => {})
  engineTest('renamed import', () => {})
  test.describe('a playwright group is not a case', () => {})
  test.use({})
})
`
  const scaffoldWorkspace = async (testBudget: number) => {
    const root = tempDir('test-budget-')
    const source = join(root, 'packages', 'a', 'src')
    await mkdir(join(source, 'fixtures'), {recursive: true})
    await Promise.all([
      writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n'),
      writeFile(join(root, 'package.json'), JSON.stringify({name: 'root', private: true})),
      writeFile(join(root, 'packages', 'a', 'package.json'), JSON.stringify({name: '@conciv/a', conciv: {testBudget}})),
      writeFile(join(source, 'a.test.ts'), spec),
      writeFile(join(source, 'fixtures', 'demo.test.ts'), "test('a fixture', () => {})\n"),
    ])
    await execa('git', ['init', '--quiet'], {cwd: root})
    await execa('git', ['add', '--all'], {cwd: root})
    return root
  }

  await expect(assertTestsWithinBudget(await scaffoldWorkspace(13))).rejects.toThrow(
    '@conciv/a: 14 tests, budget 13 (packages/a/package.json)\n\nThe budget is a review gate, not a counter to bump.',
  )
  await expect(assertTestsWithinBudget(await scaffoldWorkspace(14))).resolves.toEqual([])
  await expect(assertTestsWithinBudget(await scaffoldWorkspace(15))).resolves.toEqual([
    '@conciv/a: 14 tests, budget 15: lower "conciv.testBudget" to 14 in packages/a/package.json',
  ])
})
